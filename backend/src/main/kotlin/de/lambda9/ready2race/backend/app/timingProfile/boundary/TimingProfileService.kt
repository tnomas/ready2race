package de.lambda9.ready2race.backend.app.timingProfile.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.app.event.control.EventRepo
import de.lambda9.ready2race.backend.app.event.entity.EventError
import de.lambda9.ready2race.backend.app.raceclocker.control.RaceClockerRaceRepo
import de.lambda9.ready2race.backend.app.timing.boundary.TimingStartOrderLogic
import de.lambda9.ready2race.backend.app.timing.control.TimingModeRepo
import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingSystem
import de.lambda9.ready2race.backend.app.timingProfile.control.TimingProfileRepo
import de.lambda9.ready2race.backend.app.timingProfile.entity.TimingProfileAssignmentRequest
import de.lambda9.ready2race.backend.app.timingProfile.entity.TimingProfileCompetitionDto
import de.lambda9.ready2race.backend.app.timingProfile.entity.TimingProfileError
import de.lambda9.ready2race.backend.app.timingProfile.entity.TimingProfileKind
import de.lambda9.ready2race.backend.app.timingProfile.entity.TimingProfileMatchDto
import de.lambda9.ready2race.backend.app.timingProfile.entity.TimingProfileOptionDto
import de.lambda9.ready2race.backend.app.timingProfile.entity.TimingProfileRoundDto
import de.lambda9.ready2race.backend.app.timingProfile.entity.TimingProfileTreeDto
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.calls.responses.ApiResponse.Companion.noData
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.onNullFail
import de.lambda9.tailwind.core.extensions.kio.orDie
import java.util.UUID

/**
 * Das Zeitnahmeprofil einer Partie — bei RaceClocker ein Rennen, bei interner Zeitnahme ein
 * Zeitnahmetyp — über vier Ebenen vererbt: Veranstaltung, Wettkampf, Runde, Partie.
 *
 * Die Art des Profils ist nicht wählbar, sie folgt `event.timing_system`. Aufgelöst wird an genau
 * einer Stelle ([TimingProfileResolveLogic]); dieser Dienst liest die Zuordnungen, setzt sie
 * zusammen und schreibt sie zurück.
 */
object TimingProfileService {

    fun getTree(
        eventId: UUID,
    ): App<ServiceError, ApiResponse.Dto<TimingProfileTreeDto>> = KIO.comprehension {

        val event = !EventRepo.get(eventId).orDie().onNullFail { EventError.NotFound }
        val timingSystem = event.timingSystem?.let { TimingSystem.valueOf(it) }
        val kind = kindOf(timingSystem)

        // Ohne Art gibt es keine Profile: weder etwas zu wählen noch etwas zu vererben. Der Baum
        // bleibt leer, damit die Oberfläche nichts anbietet, was hinterher nicht auflösbar wäre.
        if (kind == null) {
            return@comprehension KIO.ok(
                ApiResponse.Dto(
                    TimingProfileTreeDto(
                        timingSystem = timingSystem,
                        kind = null,
                        options = emptyList(),
                        ownProfile = null,
                        competitions = emptyList(),
                    )
                )
            )
        }

        val options = !options(eventId, kind)
        val structure = !TimingProfileRepo.getStructure(eventId).orDie()

        // Der Zuschnitt auf die geltende Art steckt in der Abfrage - siehe die Begründung an
        // TimingProfileRepo.getAssignments.
        val assignments = (!TimingProfileRepo.getAssignments(eventId, kind).orDie())
            .map {
                TimingProfileResolveLogic.Assignment(
                    competition = it.competition,
                    round = it.round,
                    match = it.match,
                    profile = it.profile,
                )
            }

        KIO.ok(
            ApiResponse.Dto(
                TimingProfileTreeDto(
                    timingSystem = timingSystem,
                    kind = kind,
                    options = options,
                    ownProfile = TimingProfileResolveLogic.resolve(assignments, null, null, null),
                    competitions = competitions(structure, assignments),
                )
            )
        )
    }

    fun upsertAssignment(
        eventId: UUID,
        userId: UUID,
        request: TimingProfileAssignmentRequest,
    ): App<ServiceError, ApiResponse.NoData> = KIO.comprehension {

        val event = !EventRepo.get(eventId).orDie().onNullFail { EventError.NotFound }
        val kind = kindOf(event.timingSystem?.let { TimingSystem.valueOf(it) })

        // Ohne Art der Veranstaltung passt kein Profil. Das Abräumen (profile == null) bleibt
        // erlaubt: Zeilen aus der Zeit vor einer Umstellung müssen sich wegräumen lassen.
        !KIO.failOn(kind == null && request.profile != null) { TimingProfileError.KindMismatch }

        !ensureScopeIsValid(eventId, request)

        val profile = request.profile
        if (profile != null && kind != null) {
            !ensureProfileFits(eventId, kind, profile)
        }

        !TimingProfileRepo.upsert(
            eventId = eventId,
            competitionId = request.competition,
            roundId = request.competitionSetupRound,
            matchId = request.competitionSetupMatch,
            raceId = if (kind == TimingProfileKind.RACE) profile else null,
            modeId = if (kind == TimingProfileKind.MODE) profile else null,
            userId = userId,
        ).orDie()

        noData
    }

    /**
     * Räumt alle Ebenen unterhalb der angegebenen ab — ohne [competitionId] die ganze
     * Veranstaltung außer ihrer Wurzel, mit [competitionId] die Runden und Partien dieses
     * Wettkampfs. Was übrig bleibt, vererbt sich wieder nach unten.
     *
     * Ein Wettkampf einer FREMDEN Veranstaltung endet als [TimingProfileError.ScopeInvalid] und
     * nicht in einem stillen 204: Die Löschbedingung filtert ohnehin über die Veranstaltung, es
     * verschwände also nichts — nur würde die Oberfläche einen Fehlgriff als Erfolg vermelden.
     * Derselbe Fehler wie beim Schreiben, weil es dieselbe Frage ist.
     */
    fun resetAssignments(
        eventId: UUID,
        competitionId: UUID?,
    ): App<ServiceError, ApiResponse.NoData> = KIO.comprehension {

        !EventRepo.get(eventId).orDie().onNullFail { EventError.NotFound }

        if (competitionId != null) {
            val belongs = !TimingProfileRepo.competitionBelongsToEvent(competitionId, eventId).orDie()
            !KIO.failOn(!belongs) { TimingProfileError.ScopeInvalid }
        }

        !TimingProfileRepo.deleteBelow(eventId, competitionId).orDie()

        noData
    }

    /** Die Art des Profils folgt zwingend dem System der Veranstaltung, sie ist nicht wählbar. */
    private fun kindOf(timingSystem: TimingSystem?): TimingProfileKind? = when (timingSystem) {
        TimingSystem.RACECLOCKER -> TimingProfileKind.RACE
        TimingSystem.INTERN -> TimingProfileKind.MODE
        else -> null
    }

    private fun options(
        eventId: UUID,
        kind: TimingProfileKind,
    ): App<ServiceError, List<TimingProfileOptionDto>> = when (kind) {
        TimingProfileKind.RACE -> RaceClockerRaceRepo.getForEvent(eventId).orDie().map { races ->
            // Die Ergebnis-Adresse ist die zweite Zeile im Auswahlfeld - zwei Rennen einer
            // Veranstaltung unterscheiden sich für die Sprecherin oft nur daran.
            races.map { TimingProfileOptionDto(id = it.id, name = it.name, detail = it.resultsUrl) }
        }

        TimingProfileKind.MODE -> TimingModeRepo.getByEvent(eventId).orDie().map { modes ->
            modes.sortedBy { it.name }.map {
                TimingProfileOptionDto(
                    id = it.id,
                    name = it.name,
                    // Was den Typ im Auswahlfeld unterscheidbar macht: der Startabstand, sonst
                    // die Startart.
                    detail = it.intervalSeconds?.let { seconds -> "Intervall $seconds s" } ?: it.startGrouping,
                )
            }
        }
    }

    /**
     * Das Profil muss zur Veranstaltung UND zu ihrer Art passen.
     *
     * Zwei Fehler statt einem, weil die beiden Lagen fachlich verschieden sind: Ein Rennen an
     * einer intern gezeiteten Veranstaltung existiert sehr wohl, es ist nur die falsche Art
     * ([TimingProfileError.KindMismatch]) — da hilft nur, das System der Veranstaltung zu
     * ändern. Ein Profil, das es hier gar nicht gibt, ist schlicht nicht gefunden.
     */
    private fun ensureProfileFits(
        eventId: UUID,
        kind: TimingProfileKind,
        profile: UUID,
    ): App<ServiceError, Unit> = KIO.comprehension {
        val isRace = !RaceClockerRaceRepo.belongsToEvent(profile, eventId).orDie()
        // Ein Zeitnahmetyp gehört einer Veranstaltung; der Fremdschlüssel allein hindert
        // niemanden, den Typ einer fremden anzuwählen.
        val isMode = (!TimingModeRepo.get(profile).orDie())?.event == eventId

        val fits = if (kind == TimingProfileKind.RACE) isRace else isMode
        val fitsOtherKind = if (kind == TimingProfileKind.RACE) isMode else isRace

        !KIO.failOn(!fits && fitsOtherKind) { TimingProfileError.KindMismatch }
        !KIO.failOn(!fits) { TimingProfileError.ProfileNotFound }

        KIO.ok(Unit)
    }

    /**
     * Der Pfad muss vollständig und echt sein: eine Partie ohne ihre Runde (oder eine Runde ohne
     * ihren Wettkampf) hätte keine Ebene, von der sie erben könnte — und der Check-Constraint der
     * Tabelle würde sie ohnehin abweisen, dann aber als roher Defekt statt als Domänenfehler.
     * Anschließend je gesetzter Ebene die Frage, ob sie wirklich zur darüberliegenden gehört.
     */
    private fun ensureScopeIsValid(
        eventId: UUID,
        request: TimingProfileAssignmentRequest,
    ): App<ServiceError, Unit> = KIO.comprehension {
        val competitionId = request.competition
        val roundId = request.competitionSetupRound
        val matchId = request.competitionSetupMatch

        !KIO.failOn(matchId != null && roundId == null) { TimingProfileError.ScopeInvalid }
        !KIO.failOn(roundId != null && competitionId == null) { TimingProfileError.ScopeInvalid }

        if (competitionId != null) {
            val belongs = !TimingProfileRepo.competitionBelongsToEvent(competitionId, eventId).orDie()
            !KIO.failOn(!belongs) { TimingProfileError.ScopeInvalid }
        }
        if (roundId != null) {
            val belongs = !TimingProfileRepo.roundBelongsToCompetition(roundId, competitionId!!).orDie()
            !KIO.failOn(!belongs) { TimingProfileError.ScopeInvalid }
        }
        if (matchId != null) {
            val belongs = !TimingProfileRepo.matchBelongsToRound(matchId, roundId!!).orDie()
            !KIO.failOn(!belongs) { TimingProfileError.ScopeInvalid }
        }

        KIO.ok(Unit)
    }

    /**
     * Setzt die flachen Strukturzeilen zum Baum zusammen. Die Reihenfolge der Wettkämpfe bringt
     * die Abfrage mit (Rennnummer), die der Runden die `next_round`-Kette — alphabetisch wären
     * "Vorlauf" und "Finale" vertauscht.
     */
    private fun competitions(
        structure: List<TimingProfileRepo.StructureRow>,
        assignments: List<TimingProfileResolveLogic.Assignment>,
    ): List<TimingProfileCompetitionDto> =
        structure.groupBy { it.competitionId }.map { (competitionId, rows) ->
            val head = rows.first()
            val roundRefs = rows.filter { it.roundId != null }
                .distinctBy { it.roundId }
                .map { TimingStartOrderLogic.RoundRef(it.roundId!!, it.nextRound) }
            val roundOrder = TimingStartOrderLogic.roundOrder(roundRefs)

            TimingProfileCompetitionDto(
                competitionId = competitionId,
                identifier = head.identifier,
                name = head.competitionName,
                ownProfile = assignments.firstOrNull {
                    it.competition == competitionId && it.round == null && it.match == null
                }?.profile,
                effectiveProfile = TimingProfileResolveLogic.resolve(assignments, competitionId, null, null),
                rounds = rows.filter { it.roundId != null }
                    .groupBy { it.roundId!! }
                    .map { (roundId, roundRows) -> round(competitionId, roundId, roundRows, assignments) }
                    .sortedBy { roundOrder[it.roundId] ?: Int.MAX_VALUE },
            )
        }

    private fun round(
        competitionId: UUID,
        roundId: UUID,
        rows: List<TimingProfileRepo.StructureRow>,
        assignments: List<TimingProfileResolveLogic.Assignment>,
    ): TimingProfileRoundDto = TimingProfileRoundDto(
        roundId = roundId,
        name = rows.first().roundName!!,
        ownProfile = assignments.firstOrNull { it.round == roundId && it.match == null }?.profile,
        effectiveProfile = TimingProfileResolveLogic.resolve(assignments, competitionId, roundId, null),
        matches = rows.filter { it.matchId != null }
            .distinctBy { it.matchId }
            .sortedBy { it.executionOrder }
            .map { row ->
                TimingProfileMatchDto(
                    matchId = row.matchId!!,
                    // Ein Lauf ohne eigenen Namen heißt nach seiner Position in der Runde -
                    // dieselbe Beschriftung wie in der Durchführung.
                    name = row.matchName ?: "Lauf ${row.executionOrder}",
                    ownProfile = assignments.firstOrNull { it.match == row.matchId }?.profile,
                    effectiveProfile = TimingProfileResolveLogic.resolve(
                        assignments,
                        competitionId,
                        roundId,
                        row.matchId,
                    ),
                )
            },
    )
}
