package de.lambda9.ready2race.backend.app.timing.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.app.eventInfo.control.BoardRepo
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardShareLinkDto
import de.lambda9.ready2race.backend.app.eventInfo.entity.EventInfoProblem
import de.lambda9.ready2race.backend.app.timing.control.TimingDeviceTokenRepo
import de.lambda9.ready2race.backend.app.timing.control.TimingStationRepo
import de.lambda9.ready2race.backend.app.timing.control.toDto
import de.lambda9.ready2race.backend.app.timing.entity.TimingDeviceTokenDto
import de.lambda9.ready2race.backend.app.timing.entity.TimingDeviceTokenIssuedDto
import de.lambda9.ready2race.backend.app.timing.entity.TimingDeviceTokenRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingError
import de.lambda9.ready2race.backend.app.timing.entity.TimingShareLinkDto
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.calls.responses.ApiResponse.Companion.noData
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingDeviceTokenRecord
import de.lambda9.ready2race.backend.security.RandomUtilities
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.onNullFail
import de.lambda9.tailwind.core.extensions.kio.orDie
import java.net.URLEncoder
import java.security.MessageDigest
import java.time.LocalDateTime
import java.util.UUID

/**
 * Station-scoped credentials for timing hardware (light barriers, transponder decoders) that cannot
 * log in as an app user.
 *
 * A token is bearer material, so it is treated like one: the plaintext exists only in the issue
 * response, the database keeps a hash, and every rejection - unknown, revoked, wrong event, wrong
 * station - produces the same [TimingError.DeviceTokenInvalid] without echoing anything about the
 * presented value.
 *
 * Seit dem 25.08.2026 (Migration V202608250900) trägt dieselbe Tabelle eine zweite Sorte:
 * BOARD-Tokens für die Kachel-Anzeigen. Deren Endpunkte verlangen jetzt ebenfalls eine
 * Authentifizierung, und ein montierter Bildschirm oder eine OBS-Quelle kann sich nun einmal
 * nicht anmelden - er bekommt denselben geteilten Link mit Geräte-Token wie ein Posten. Bewusst
 * eine Infrastruktur statt zweier: Ausstellen, Wiederverwendung, Widerruf und Hashing gelten
 * unverändert weiter, statt ein zweites Mal geschrieben zu werden.
 *
 * Der Zuschnitt bleibt die Sicherheitsgrenze und wird an genau einer Stelle gezogen, nämlich
 * hier: [validate] und [validateForEvent] lassen ausschließlich Posten-Tokens durch,
 * [validateForBoard] und [validateBoardTokenForEvent] ausschließlich Board-Tokens. Ein
 * Board-Token öffnet also nie einen Zeitnahme-Endpunkt und ein Posten-Token nie eine Anzeige -
 * beides mit derselben opaken Antwort wie jede andere Ablehnung.
 */
object TimingDeviceTokenService {

    /** Long enough that guessing is hopeless, short enough to be typed into a device's config. */
    private const val TOKEN_LENGTH = 48

    /**
     * Issues a new token for a station of [eventId] and returns the plaintext exactly once.
     */
    fun issue(
        eventId: UUID,
        request: TimingDeviceTokenRequest,
        userId: UUID,
    ): App<ServiceError, ApiResponse.Dto<TimingDeviceTokenIssuedDto>> = KIO.comprehension {
        val station = !TimingStationRepo.get(request.station).orDie().onNullFail { TimingError.StationNotFound }
        !KIO.failOn(station.event != eventId) { TimingError.EventMismatch }

        val plain = RandomUtilities.alphanumerical(TOKEN_LENGTH)
        val record = TimingDeviceTokenRecord(
            id = UUID.randomUUID(),
            event = eventId,
            station = request.station,
            name = request.name,
            tokenHash = hash(plain),
            revoked = false,
            createdAt = LocalDateTime.now(),
            createdBy = userId,
        )
        !TimingDeviceTokenRepo.create(record).orDie()

        KIO.ok(ApiResponse.Dto(TimingDeviceTokenIssuedDto(deviceToken = record.toDto(), token = plain)))
    }

    /**
     * "Sobald ich einen Posten-Link anklicke, soll ein Token ausgestellt werden": stellt für
     * [stationId] ein Geräte-Token aus und liefert die fertige Link-Adresse - ohne Handarbeit im
     * Geräte-Reiter.
     *
     * Wiederverwendung statt Inflation: existiert für den Posten schon ein automatisch
     * ausgestelltes, nicht widerrufenes Token, kommt DASSELBE zurück (deshalb speichert die
     * Migration V202608211420 für diese Tokens den Klartext - der Link ist das Credential und
     * muss wieder anzeigbar sein; für manuell ausgestellte Hardware-Tokens bleibt es beim
     * Nur-Hash-Modell). Nach einem Widerruf stellt der nächste Klick ein frisches Token aus.
     */
    fun shareLink(
        eventId: UUID,
        stationId: UUID,
        userId: UUID,
    ): App<ServiceError, ApiResponse.Dto<TimingShareLinkDto>> = KIO.comprehension {
        val station = !TimingStationRepo.get(stationId).orDie().onNullFail { TimingError.StationNotFound }
        !KIO.failOn(station.event != eventId) { TimingError.EventMismatch }

        val existing = !TimingDeviceTokenRepo.getActiveShareLinkByStation(stationId).orDie()
        val record = existing ?: run {
            val plain = RandomUtilities.alphanumerical(TOKEN_LENGTH)
            val created = TimingDeviceTokenRecord(
                id = UUID.randomUUID(),
                event = eventId,
                station = stationId,
                // Der Name erscheint im Geräte-Reiter - er soll den Posten benennen, nicht das
                // Gerät (das kennt beim Link-Teilen niemand).
                name = "${station.name} (Link)",
                tokenHash = hash(plain),
                revoked = false,
                shareLinkToken = plain,
                createdAt = LocalDateTime.now(),
                createdBy = userId,
            )
            !TimingDeviceTokenRepo.create(created).orDie()
            created
        }

        val plain = record.shareLinkToken!!
        // Dieselbe Adressbildung wie die geteilten Posten-Links der Oberfläche: Erfassungsroute
        // je Posten, ANZEIGE-Posten auf der Anzeige-Route. Wurzelrelativ - den Origin kennt nur
        // der Browser.
        val basePath = "/event/$eventId/timing/$stationId"
        val path = if (station.type == TimingStationType.ANZEIGE.name) "$basePath/anzeige" else basePath
        val encoded = URLEncoder.encode(plain, Charsets.UTF_8)

        KIO.ok(
            ApiResponse.Dto(
                TimingShareLinkDto(
                    deviceToken = record.toDto(),
                    token = plain,
                    path = "$path?token=$encoded",
                )
            )
        )
    }

    /**
     * Dasselbe für eine Anzeige: stellt für [boardId] ein Board-Geräte-Token aus und liefert die
     * fertige Anzeigen-Adresse.
     *
     * Wortgleiche Regel wie beim Posten-Link ([shareLink]): Wiederverwendung statt Inflation -
     * solange ein automatisch ausgestelltes, nicht widerrufenes Token für das Board lebt, kommt
     * DASSELBE zurück; erst nach einem Widerruf stellt der nächste Klick ein frisches aus. Der
     * Klartext liegt dafür in der Zeile (Begründung in Migration V202608211420: der Link IST das
     * Credential).
     *
     * Ein Board, das es nicht gibt, und ein Board einer ANDEREN Veranstaltung antworten gleich -
     * sonst verriete der Endpunkt, welche Board-Kennungen existieren.
     */
    fun shareLinkForBoard(
        eventId: UUID,
        boardId: UUID,
        userId: UUID,
    ): App<ServiceError, ApiResponse.Dto<BoardShareLinkDto>> = KIO.comprehension {
        val board = !BoardRepo.findById(boardId).orDie()
            .onNullFail { EventInfoProblem.BoardNotFound(boardId) }
        !KIO.failOn(board.eventId != eventId) { EventInfoProblem.BoardNotFound(boardId) }

        val existing = !TimingDeviceTokenRepo.getActiveShareLinkByBoard(boardId).orDie()
        val record = existing ?: run {
            val plain = RandomUtilities.alphanumerical(TOKEN_LENGTH)
            val created = TimingDeviceTokenRecord(
                id = UUID.randomUUID(),
                event = eventId,
                // Genau eines von beiden ist gesetzt (Check-Constraint der Migration): hier das
                // Board, kein Posten.
                station = null,
                board = boardId,
                // Der Name benennt die Anzeige, nicht das Gerät - welcher Bildschirm den Link
                // am Ende bekommt, weiß beim Teilen niemand.
                name = "${board.name} (Link)",
                tokenHash = hash(plain),
                revoked = false,
                shareLinkToken = plain,
                createdAt = LocalDateTime.now(),
                createdBy = userId,
            )
            !TimingDeviceTokenRepo.create(created).orDie()
            created
        }

        val plain = record.shareLinkToken!!
        // Dieselbe Adressbildung wie die Board-Links der Oberfläche: die Anzeige-Route des
        // Boards. Wurzelrelativ - den Origin kennt nur der Browser.
        val encoded = URLEncoder.encode(plain, Charsets.UTF_8)

        KIO.ok(
            ApiResponse.Dto(
                BoardShareLinkDto(
                    deviceTokenId = record.id,
                    board = boardId,
                    token = plain,
                    path = "/board/$eventId/$boardId?token=$encoded",
                )
            )
        )
    }

    /**
     * Der Geräte-Reiter des Leitstands: die Posten-Tokens der Veranstaltung.
     *
     * Board-Tokens bleiben hier bewusst außen vor - sie haben keinen Posten, und der Reiter führt
     * eine Postenspalte. Widerrufen lassen sie sich über dieselbe Route wie jedes andere Token
     * ([revoke]); ihre Kennung liefert die Share-Link-Antwort.
     */
    fun list(
        eventId: UUID,
    ): App<ServiceError, ApiResponse.ListDto<TimingDeviceTokenDto>> = KIO.comprehension {
        val records = !TimingDeviceTokenRepo.getStationTokensByEvent(eventId).orDie()
        KIO.ok(ApiResponse.ListDto(records.sortedBy { it.createdAt }.map { it.toDto() }))
    }

    /**
     * Revokes a token. Kept as a flag rather than a delete so the Leitstand can still show that a
     * device once existed (and which marks it produced).
     */
    fun revoke(
        eventId: UUID,
        tokenId: UUID,
    ): App<ServiceError, ApiResponse.NoData> = KIO.comprehension {
        val record = !TimingDeviceTokenRepo.get(tokenId).orDie().onNullFail { TimingError.DeviceTokenNotFound }
        !KIO.failOn(record.event != eventId) { TimingError.EventMismatch }

        !TimingDeviceTokenRepo.update(tokenId) {
            revoked = true
            // Hygiene: der gespeicherte Klartext eines Link-Tokens hat nach dem Widerruf keinen
            // Zweck mehr - und ohne ihn ist die Zeile auch nicht mehr "das wiederverwendbare
            // Link-Token des Postens" (der nächste Klick stellt ein frisches aus).
            shareLinkToken = null
        }.orDie().onNullFail { TimingError.DeviceTokenNotFound }
        noData
    }

    /**
     * Resolves a presented plaintext token to its record, requiring it to belong to [eventId] and
     * [stationId] and not to be revoked.
     *
     * The lookup goes through the (indexed, unique) hash column; the digest is compared again with
     * [MessageDigest.isEqual] so the decision itself does not depend on how many leading characters
     * of a hash happen to match.
     */
    fun validate(
        plainToken: String,
        eventId: UUID,
        stationId: UUID,
    ): App<TimingError, TimingDeviceTokenRecord> = KIO.comprehension {
        val expected = hash(plainToken)
        val record = !TimingDeviceTokenRepo.getByHash(expected).orDie()
            .onNullFail { TimingError.DeviceTokenInvalid }

        val valid = MessageDigest.isEqual(
            record.tokenHash.toByteArray(Charsets.UTF_8),
            expected.toByteArray(Charsets.UTF_8),
            // record.station ist seit V202608250900 nullbar (Board-Tokens haben keinen Posten).
            // Der Vergleich mit dem nicht-nullbaren [stationId] schließt sie damit von selbst
            // aus: null ist nie gleich einer Posten-Kennung.
        ) && record.revoked != true && record.event == eventId && record.station == stationId

        !KIO.failOn(!valid) { TimingError.DeviceTokenInvalid }
        KIO.ok(record)
    }

    /**
     * Wie [validate], aber nur an die Veranstaltung gebunden, nicht an einen Posten.
     *
     * Für die Lese-Endpunkte der Zeitnahme (Zustand, Teams, Posten, aktive Sequenz) und den
     * WebSocket: ein geteilter Posten-Link (Erfassung oder Startbildschirm) trägt das Geräte-Token
     * in der URL, und die Boards lesen den Zustand der ganzen Veranstaltung — dieselbe
     * Sichtbarkeit, die jede angemeldete Zeitnahme-Rolle hat.
     *
     * Nur für Lesewege. Schreibend bleibt jedes Token an seinen eigenen Posten gebunden: entweder
     * schon hier über [validate] (Zeitmarken-POST, Scharfschaltung — beide kennen den Posten aus
     * Körper bzw. Pfad), oder im Dienst, wo der Posten des Tokens erst gegen die Marke gehalten
     * werden muss (`assignTimeMarkByDevice`). Alle weiteren Mutationen verlangen weiterhin eine
     * Nutzersitzung. Jede Ablehnung ist auch hier das eine [TimingError.DeviceTokenInvalid], ohne
     * etwas über den präsentierten Wert zu verraten.
     *
     * "Veranstaltung" heißt trotzdem nicht "alles dieser Veranstaltung": ein BOARD-Token
     * (station null, siehe Migration V202608250900) kommt hier nicht durch. Es ist auf seine
     * Anzeige zugeschnitten und darf keinen einzigen Zeitnahme-Endpunkt öffnen — diese eine
     * Zeile ist die Grenze, hinter der alle Lesewege der Zeitnahme liegen.
     */
    fun validateForEvent(
        plainToken: String,
        eventId: UUID,
    ): App<TimingError, TimingDeviceTokenRecord> = KIO.comprehension {
        val expected = hash(plainToken)
        val record = !TimingDeviceTokenRepo.getByHash(expected).orDie()
            .onNullFail { TimingError.DeviceTokenInvalid }

        val valid = MessageDigest.isEqual(
            record.tokenHash.toByteArray(Charsets.UTF_8),
            expected.toByteArray(Charsets.UTF_8),
        ) && record.revoked != true && record.event == eventId && record.station != null

        !KIO.failOn(!valid) { TimingError.DeviceTokenInvalid }
        KIO.ok(record)
    }

    /**
     * Gilt dieses Token für GENAU DIESES Board?
     *
     * Der Zuschnitt eines Board-Tokens ist eng: eine Veranstaltung, ein Board, ausschließlich
     * lesen. Ein Token, das für Board A ausgestellt wurde, öffnet Board B nicht - auch nicht in
     * derselben Veranstaltung -, und ein Posten-Token öffnet gar kein Board (`record.board` ist
     * dort null und nie gleich einer Board-Kennung).
     *
     * Das ist die Funktion, an der jeder weitere Board-Lesezugriff hängt - die Board-Ansicht
     * ebenso wie der Push-Kanal, der die Anzeigen später live nachzieht.
     */
    fun validateForBoard(
        plainToken: String,
        eventId: UUID,
        boardId: UUID,
    ): App<TimingError, TimingDeviceTokenRecord> = KIO.comprehension {
        val expected = hash(plainToken)
        val record = !TimingDeviceTokenRepo.getByHash(expected).orDie()
            .onNullFail { TimingError.DeviceTokenInvalid }

        val valid = MessageDigest.isEqual(
            record.tokenHash.toByteArray(Charsets.UTF_8),
            expected.toByteArray(Charsets.UTF_8),
        ) && record.revoked != true && record.event == eventId && record.board == boardId

        !KIO.failOn(!valid) { TimingError.DeviceTokenInvalid }
        KIO.ok(record)
    }

    /**
     * Wie [validateForBoard], aber ohne Bindung an ein bestimmtes Board - nur "ein gültiges
     * Board-Token dieser Veranstaltung".
     *
     * Ausschließlich für die Kurzliste `/info/boards` gedacht, die nur Kennung und Name der
     * Anzeigen führt: ein geteiltes Gerät muss darin sein eigenes Board wiederfinden können (die
     * Liste trägt auch die Umleitung der alten Athleten-Board-URL), und ein Board-Token auf die
     * Kennung genau des Boards zu binden, dessen Kennung es erst nachschlagen will, wäre ein
     * Zirkelschluss. Inhalte gibt sie keine preis - die stehen hinter [validateForBoard].
     */
    fun validateBoardTokenForEvent(
        plainToken: String,
        eventId: UUID,
    ): App<TimingError, TimingDeviceTokenRecord> = KIO.comprehension {
        val expected = hash(plainToken)
        val record = !TimingDeviceTokenRepo.getByHash(expected).orDie()
            .onNullFail { TimingError.DeviceTokenInvalid }

        val valid = MessageDigest.isEqual(
            record.tokenHash.toByteArray(Charsets.UTF_8),
            expected.toByteArray(Charsets.UTF_8),
        ) && record.revoked != true && record.event == eventId && record.board != null

        !KIO.failOn(!valid) { TimingError.DeviceTokenInvalid }
        KIO.ok(record)
    }

    /**
     * SHA-256, hex encoded.
     *
     * Unlike a user password this is high-entropy machine-generated material, so a fast digest is
     * enough - and it has to be deterministic (unsalted) for the token to be findable by a single
     * indexed lookup on every captured mark.
     */
    private fun hash(plain: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(plain.toByteArray(Charsets.UTF_8))
            .joinToString("") { byte -> "%02x".format(byte) }
}
