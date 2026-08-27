package de.lambda9.ready2race.backend.app.stream.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.stream.control.StreamOverrideRepo
import de.lambda9.ready2race.backend.app.stream.control.StreamSceneRepo
import de.lambda9.ready2race.backend.app.stream.control.toDto
import de.lambda9.ready2race.backend.app.stream.control.toJsonb
import de.lambda9.ready2race.backend.app.stream.entity.StreamError
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicType
import de.lambda9.ready2race.backend.app.stream.entity.StreamOverrideRequest
import de.lambda9.ready2race.backend.app.stream.entity.StreamOverrideState
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneDto
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneGraphicDto
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneRequest
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneShareLinkDto
import de.lambda9.ready2race.backend.app.stream.entity.allowedPlacements
import de.lambda9.ready2race.backend.app.timing.boundary.TimingDeviceTokenService
import de.lambda9.ready2race.backend.calls.responses.AfterCommit
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.calls.responses.ApiResponse.Companion.noData
import de.lambda9.ready2race.backend.database.generated.tables.records.StreamOverrideRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.StreamSceneGraphicRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.StreamSceneRecord
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.onNullFail
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.tailwind.core.extensions.kio.traverse
import java.time.LocalDateTime
import java.util.UUID

/**
 * Verwaltung der Livestream-Szenen (Task 5 der Domäne `app/stream`, Muster `liveDashboard` /
 * `BoardService`): Szenen-CRUD, Grafik-Konfiguration, Regie-Eingriffe (Override), Probemodus und
 * Szenen-Token. Rechteprüfung ist bewusst NICHT hier - die kommt an den Routen (Task 6).
 *
 * Anders als [de.lambda9.ready2race.backend.app.eventInfo.boundary.BoardService] (dessen
 * `updateBoard`/`deleteBoard` bewusst KEINE Veranstaltung entgegennehmen und die Zugehörigkeit
 * folglich nicht prüfen) verlangt hier jede szenen-adressierte Funktion die `eventId` aus dem
 * Pfad und prüft sie über [requireOwnedScene] - Task-6-Vorgabe: eine fremde `sceneId` darf sich
 * nicht in eine andere Veranstaltung hineinreichen lassen.
 *
 * Jeder schreibende Weg löst am Ende einen Broadcast auf den Szenen-Kanal aus
 * ([StreamSceneBroadcaster.broadcastScene]) - und zwar über [AfterCommit], genau wie die
 * Board-Konfiguration ihren `broadcastBoard` (siehe [de.lambda9.ready2race.backend.app.eventInfo.boundary.BoardService.updateBoard]):
 * Ein Push VOR dem Commit ließe die Bühne den alten Stand aufbauen. `EventChangeMarker.bump`
 * bleibt hier bewusst außen vor - eine Regie-Entscheidung betrifft eine einzelne Szene und darf
 * nicht die Zwischenspeicher aller öffentlichen Anzeigen entwerten.
 */
object StreamSceneService {

    /**
     * Meldet dem Szenen-Kanal, dass diese eine Szene neu aufzulösen ist - nach dem Commit, aus
     * demselben Grund wie im Zeitnahme-Kanal: Eine Bühne, die den Push sofort beantwortet, läse
     * sonst über eine andere Verbindung den Stand VOR dem Schreiben, und ein Rollback erzeugte
     * einen Push über eine Änderung, die es nie gab. [AfterCommit] puffert bis `respondKIO`
     * committet hat und feuert für Nicht-HTTP-Aufrufer (Jobs, Tests) unmittelbar.
     *
     * Kostet nichts, wenn niemand zusieht: Ohne Abonnenten kehrt `broadcastScene` sofort zurück.
     */
    private fun notifyScene(sceneId: UUID) {
        AfterCommit.register { StreamSceneBroadcaster.broadcastScene(sceneId) }
    }

    /**
     * Lädt die Szene und prüft ihre Zugehörigkeit zu [eventId] - EINE Stelle für die Prüfung,
     * an der jede szenen-adressierte Funktion dieses Objekts hängt. Auch die Route des
     * Szenenstands (`GET .../view`, Task 6) ruft das für ihren Sitzungszweig auf; der
     * Token-Zweig bekommt dieselbe Prüfung schon über
     * [de.lambda9.ready2race.backend.app.timing.boundary.TimingDeviceTokenService.validateForStreamScene].
     * Eine Szene, die es nicht gibt, und eine Szene einer ANDEREN Veranstaltung antworten
     * gleich - sonst verriete der Aufruf, welche Szenen-Kennungen existieren.
     */
    fun requireOwnedScene(eventId: UUID, sceneId: UUID): App<StreamError, StreamSceneRecord> = KIO.comprehension {
        val scene = !StreamSceneRepo.findById(sceneId).orDie().onNullFail { StreamError.SceneNotFound(sceneId) }
        !KIO.failOn(scene.event != eventId) { StreamError.SceneNotFound(sceneId) }

        KIO.ok(scene)
    }

    /**
     * Die Szenen einer Veranstaltung samt ihrer Grafik-Konfiguration - eine Abfrage für die
     * Grafikzeilen aller Szenen statt einer je Szene (Muster [de.lambda9.ready2race.backend.app.liveDashboard.boundary.LiveDashboardService]).
     */
    fun getScenes(eventId: UUID): App<Nothing, ApiResponse.ListDto<StreamSceneDto>> = KIO.comprehension {
        val scenes = !StreamSceneRepo.findByEvent(eventId).orDie()
        val graphicsByScene = !StreamSceneRepo.getGraphicsByScenes(scenes.mapNotNull { it.id }).orDie()
            .map { rows -> rows.groupBy { it.scene } }

        KIO.ok(
            ApiResponse.ListDto(
                scenes.map { scene ->
                    scene.toDto(graphicsByScene[scene.id].orEmpty().map { it.toDto() })
                }
            )
        )
    }

    /**
     * Ohne [notifyScene]: An einer eben erst entstandenen Szene kann noch niemand hängen - es
     * gibt keinen Kanal, den man wecken könnte. Der erste Abonnent bekommt seinen Stand als
     * Begrüßungsrahmen (`StreamSceneBroadcaster.currentView`).
     */
    fun createScene(eventId: UUID, request: StreamSceneRequest): App<Nothing, ApiResponse.Dto<StreamSceneDto>> =
        KIO.comprehension {
            val now = LocalDateTime.now()
            val record = StreamSceneRecord(
                id = UUID.randomUUID(),
                event = eventId,
                name = request.name,
                background = request.background.name,
                chromaColor = request.chromaColor,
                safeAreaPercent = request.safeAreaPercent,
                trialMode = false,
                createdAt = now,
                updatedAt = now,
            )
            val created = !StreamSceneRepo.create(record).orDie()

            KIO.ok(ApiResponse.Dto(created.toDto()))
        }

    fun updateScene(
        eventId: UUID,
        sceneId: UUID,
        request: StreamSceneRequest,
    ): App<StreamError, ApiResponse.Dto<StreamSceneDto>> =
        KIO.comprehension {
            !requireOwnedScene(eventId, sceneId)

            val updated = !StreamSceneRepo.update(sceneId) {
                name = request.name
                background = request.background.name
                chromaColor = request.chromaColor
                safeAreaPercent = request.safeAreaPercent
                updatedAt = LocalDateTime.now()
            }.orDie().onNullFail { StreamError.SceneNotFound(sceneId) }

            val graphics = !StreamSceneRepo.getGraphics(sceneId).orDie().map { rows -> rows.map { it.toDto() } }

            // Hintergrund, Chroma-Farbe und Sicherheitsrand stehen im Szenenstand - die Bühne
            // soll sie sofort übernehmen, nicht erst beim nächsten Renn-Ereignis.
            notifyScene(sceneId)

            KIO.ok(ApiResponse.Dto(updated.toDto(graphics)))
        }

    /**
     * Löscht die Szene - Grafik-Konfiguration, Regie-Zeilen und ihr Token hängen per
     * `on delete cascade` daran (Migration V202608271000).
     *
     * Bewusst OHNE [notifyScene]: Für eine gelöschte Szene gibt es keinen Stand mehr zu bauen.
     * Ein Aufbau scheiterte an `SceneNotFound`, der Kanal verwürfe ihn, und die Bühne behielte
     * ohnehin ihr letztes Bild. Der Kanal verschwindet, sobald die verbundenen Clients die
     * Verbindung verlieren (Teardown beim letzten Abonnenten).
     */
    fun deleteScene(eventId: UUID, sceneId: UUID): App<StreamError, ApiResponse.NoData> = KIO.comprehension {
        !requireOwnedScene(eventId, sceneId)

        val deleted = !StreamSceneRepo.delete(sceneId).orDie()
        if (deleted < 1) {
            !KIO.fail<StreamError>(StreamError.SceneNotFound(sceneId))
        }

        noData
    }

    /**
     * Ersetzt die Grafik-Konfiguration der übergebenen Typen (Muster BoardConfig-Editor: pro
     * Aufruf die geänderten Zeilen, nicht zwingend alle acht Typen). Validiert JEDE Zeile gegen
     * [allowedPlacements], BEVOR irgendetwas geschrieben wird - eine einzige unerlaubte
     * Platzierung lehnt den ganzen Aufruf ab, statt die anderen Zeilen trotzdem zu übernehmen.
     */
    fun updateGraphics(
        eventId: UUID,
        sceneId: UUID,
        graphics: List<StreamSceneGraphicDto>,
    ): App<StreamError, ApiResponse.Dto<StreamSceneDto>> = KIO.comprehension {
        val scene = !requireOwnedScene(eventId, sceneId)

        val invalid = graphics.firstOrNull { allowedPlacements[it.type]?.contains(it.placement) != true }
        if (invalid != null) {
            !KIO.fail<StreamError>(StreamError.PlacementNotAllowed(invalid.type, invalid.placement))
        }

        !graphics.traverse { graphic ->
            StreamSceneRepo.upsertGraphic(
                StreamSceneGraphicRecord(
                    id = UUID.randomUUID(),
                    scene = sceneId,
                    type = graphic.type.name,
                    enabled = graphic.enabled,
                    placement = graphic.placement.name,
                    size = graphic.size.name,
                    settings = graphic.settings.toJsonb(),
                )
            ).orDie()
        }

        !StreamSceneRepo.update(sceneId) { updatedAt = LocalDateTime.now() }.orDie()

        val updatedGraphics = !StreamSceneRepo.getGraphics(sceneId).orDie().map { rows -> rows.map { it.toDto() } }

        notifyScene(sceneId)

        KIO.ok(ApiResponse.Dto(scene.toDto(updatedGraphics)))
    }

    /**
     * Regie-Eingriff für einen Grafiktyp: AUTO im Request heißt "Eingriff zurücknehmen" und läuft
     * auf denselben Weg wie [clearOverride] hinaus (keine Zeile = AUTO, siehe [StreamOverrideState]).
     * Bei FORCED_ON/FORCED_OFF ersetzt [StreamOverrideRepo.setOverride] die Zeile komplett - jeder
     * Aufruf ist damit "der jüngste Eingriff", was die Platz-Priorität im Resolver braucht.
     */
    fun setOverride(
        eventId: UUID,
        sceneId: UUID,
        type: StreamGraphicType,
        request: StreamOverrideRequest,
    ): App<StreamError, ApiResponse.NoData> = KIO.comprehension {
        !requireOwnedScene(eventId, sceneId)

        if (request.state == StreamOverrideState.AUTO) {
            !StreamOverrideRepo.delete(sceneId, type).orDie()
        } else {
            val now = LocalDateTime.now()
            !StreamOverrideRepo.setOverride(
                StreamOverrideRecord(
                    id = UUID.randomUUID(),
                    scene = sceneId,
                    graphicType = type.name,
                    state = request.state.name,
                    match = request.match,
                    expiresAt = request.seconds?.let { now.plusSeconds(it.toLong()) },
                    createdAt = now,
                )
            ).orDie()
        }

        // Der Eingriff der Regie ist genau der Fall, für den es diesen Kanal gibt: Was das Panel
        // schaltet, muss auf der Bühne sofort passieren, nicht beim nächsten Renn-Ereignis.
        notifyScene(sceneId)

        noData
    }

    /** Nimmt einen Regie-Eingriff zurück - keine Zeile heißt AUTO, ein fehlender Eingriff ist deshalb kein Fehler. */
    fun clearOverride(eventId: UUID, sceneId: UUID, type: StreamGraphicType): App<StreamError, ApiResponse.NoData> =
        KIO.comprehension {
            !requireOwnedScene(eventId, sceneId)
            !StreamOverrideRepo.delete(sceneId, type).orDie()

            notifyScene(sceneId)

            noData
        }

    fun setTrialMode(eventId: UUID, sceneId: UUID, trialMode: Boolean): App<StreamError, ApiResponse.NoData> =
        KIO.comprehension {
            !requireOwnedScene(eventId, sceneId)
            !StreamSceneRepo.update(sceneId) {
                this.trialMode = trialMode
                updatedAt = LocalDateTime.now()
            }.orDie().onNullFail { StreamError.SceneNotFound(sceneId) }

            // Der Probemodus wechselt die ganze Datenquelle - die Bühne muss sofort umschalten,
            // sonst zeigte sie bis zum nächsten Ereignis noch die andere Welt.
            notifyScene(sceneId)

            noData
        }

    /**
     * Stellt (bzw. gibt erneut) den geteilten Link samt Geräte-Token für die Szene aus - reiner
     * Durchgriff auf [TimingDeviceTokenService.shareLinkForStreamScene], das die eigentliche
     * Token-Infrastruktur trägt (Muster Board: dieselbe Aufteilung zwischen Fach- und
     * Token-Dienst).
     */
    fun createShareLink(
        eventId: UUID,
        sceneId: UUID,
        userId: UUID,
    ): App<StreamError, ApiResponse.Dto<StreamSceneShareLinkDto>> =
        TimingDeviceTokenService.shareLinkForStreamScene(eventId, sceneId, userId)
}
