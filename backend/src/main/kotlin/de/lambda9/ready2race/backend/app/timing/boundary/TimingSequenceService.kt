package de.lambda9.ready2race.backend.app.timing.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchTeamRepo
import de.lambda9.ready2race.backend.app.eventInfo.boundary.EventChangeMarker
import de.lambda9.ready2race.backend.app.timing.control.*
import de.lambda9.ready2race.backend.app.timing.entity.*
import de.lambda9.ready2race.backend.app.timingProfile.boundary.TimingProfileResolveLogic
import de.lambda9.ready2race.backend.app.timingProfile.control.TimingProfileRepo
import de.lambda9.ready2race.backend.app.timingProfile.entity.TimingProfileKind
import de.lambda9.ready2race.backend.calls.responses.AfterCommit
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.calls.responses.ApiResponse.Companion.noData
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingAssignmentRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingStartSequenceEntryRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingStartSequenceRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingTimeMarkRecord
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.onNullFail
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.tailwind.core.extensions.kio.traverse
import java.time.Duration
import java.time.LocalDateTime
import java.util.UUID

/**
 * Server-driven start sequences: an ordered list of teams that is started by one operator action and
 * then fires its start marks on the server's clock, so every connected board counts down to the same
 * instant.
 *
 * The mutations here are called from routes and therefore run inside `respondKIO`'s transaction;
 * [fireDueEntries] is called from the scheduler and documents its own transaction/broadcast contract.
 */
object TimingSequenceService {

    /** How long a finished sequence still counts as "active" for [getActiveSequence]'s fallback. */
    private val RECENT_TERMINAL_WINDOW: Duration = Duration.ofMinutes(10)

    fun createSequence(
        request: CreateSequenceRequest,
        userId: UUID,
        eventId: UUID,
    ): App<ServiceError, ApiResponse.Created> = KIO.comprehension {
        val station = !TimingStationRepo.get(request.station).orDie().onNullFail { TimingError.StationNotFound }
        !KIO.failOn(station.event != eventId) { TimingError.EventMismatch }
        !KIO.failOn(station.type != TimingStationType.START.name) { TimingError.StationNotStartType }

        // A station can only fire one start at a time; two live sequences would race for the same
        // physical start line (and produce competing marks on the same station).
        val stationBusy = !TimingSequenceRepo.existsActiveForStation(request.station).orDie()
        !KIO.failOn(stationBusy) { TimingError.SequenceAlreadyActive }

        !request.teams.traverse { teamId ->
            KIO.comprehension {
                val teamEvent = !CompetitionMatchTeamRepo.getEventId(teamId).orDie()
                    .onNullFail { TimingError.TeamNotFound }
                !KIO.failOn(teamEvent != eventId) { TimingError.EventMismatch }
                KIO.ok(Unit)
            }
        }

        // Erst wenn die Teams zur Veranstaltung gehören, lässt sich ihr Zeitnahmetyp herleiten.
        !ensureStartSequenceAllowed(request.teams, eventId)

        val now = LocalDateTime.now()
        val sequenceId = UUID.randomUUID()
        // Unset lead-in defaults to one full cadence for INTERVAL (so the countdown covers exactly
        // the gap the operator already configured between starts) or a flat 10s for MASS.
        // Derived defaults are clamped to the documented bounds to prevent invalid countdown lengths.
        val leadInMillis = request.leadInMillis ?: when (request.mode) {
            SequenceMode.INTERVAL -> (request.intervalMillis ?: CreateSequenceRequest.DEFAULT_MASS_LEAD_IN_MILLIS)
                .coerceIn(CreateSequenceRequest.MIN_LEAD_IN_MILLIS, CreateSequenceRequest.MAX_LEAD_IN_MILLIS)
            SequenceMode.MASS -> CreateSequenceRequest.DEFAULT_MASS_LEAD_IN_MILLIS
        }
        val record = TimingStartSequenceRecord(
            id = sequenceId,
            event = eventId,
            station = request.station,
            mode = request.mode.name,
            // MASS has no cadence - never persist a stray interval that would confuse the DTO.
            intervalMillis = request.intervalMillis.takeIf { request.mode == SequenceMode.INTERVAL },
            leadInMillis = leadInMillis,
            state = SequenceState.ARMED.name,
            startedAtMillis = null,
            createdAt = now,
            createdBy = userId,
            updatedAt = now,
            updatedBy = userId,
        )
        // Backstops the pre-check above against the race where two requests for the same station
        // both pass it: the partial unique index makes the insert a no-op instead of a live
        // second sequence, and that shows up here as a null id.
        val insertedId = !TimingSequenceRepo.create(record).orDie()
        !KIO.failOn(insertedId == null) { TimingError.SequenceAlreadyActive }

        // The request's list order IS the start order: the index becomes the position, and the
        // position is the slot the entry fires in - which is why skipping never shifts anyone.
        val entries = request.teams.mapIndexed { index, teamId ->
            TimingStartSequenceEntryRecord(
                id = UUID.randomUUID(),
                sequence = sequenceId,
                competitionMatchTeam = teamId,
                position = index,
                status = SequenceEntryStatus.PENDING.name,
                timeMark = null,
            )
        }
        !TimingSequenceEntryRepo.create(entries).orDie()

        // Die eingerichtete Sequenz ruft ihre Partien an den Start (activated_at, nur wenn noch
        // nicht gesetzt) - Dashboard und Boards zeigen "In Vorbereitung", sobald der Posten die
        // Sequenz anlegt, nicht erst mit dem ersten Start. Der Bump entwertet die Caches der
        // öffentlichen Anzeigen im selben Request (Broadcast nach Commit).
        val activated = !TimingMatchStampService.activateMatchesOfTeams(request.teams, userId)
        if (activated) {
            EventChangeMarker.bump(eventId)
        }

        broadcastAsync(eventId, sequenceDto(record, entries))
        KIO.ok(ApiResponse.Created(sequenceId))
    }

    /**
     * Startet die App diesen Lauf überhaupt? Der Zeitnahmetyp darf das abschalten
     * ([TimingModeDto.startSequenceEnabled]) - ein Lauf mit Startrichter am Steg hat kein
     * Countdown-Fenster.
     *
     * Die Prüfung sitzt HIER und nicht nur im Start-Board: Das Board sperrt seinen Knopf, aber es
     * ist ein Geräte-Token-Klient und läuft womöglich mit einer Startliste weiter, die den gerade
     * umgestellten Typ noch nicht kennt. Eine Bedienhilfe ist keine Zusicherung. Der zweite
     * Schalter desselben Typs - der Fehlstart-Rückruf - wird seit jeher serverseitig durchgesetzt
     * ([TimingService.falseStart]); zwei Schalter am selben Typ verschieden ernst zu nehmen wäre
     * für den Bediener nicht erklärbar.
     *
     * Der Weg zum Typ ist derselbe wie beim Rückruf, nur um einen Schritt länger: Der Request
     * trägt keine Partie, also führt das erste Team über [COMPETITION_MATCH_TEAM.COMPETITION_MATCH]
     * auf die Setup-Partie. Ein Team genügt - eine Sequenz startet die Boote EINES Laufs, und die
     * Kette ist über die Startliste ohnehin nicht mischbar. Danach die Zeile des
     * Zeitnahmeprofil-Baums auflösen und die Flagge über die DTO-Umwandlung lesen, damit die
     * Rückfallregel der nullbar getippten Spalte an genau einer Stelle steht (die Töne bleiben
     * dabei ungefragt: hier steht nur die eine Frage).
     *
     * **Ist gar kein Typ herleitbar, wird durchgelassen** - kein Team im Request, die Partie nicht
     * in der Startliste (nicht INTERN gezeitet, Freilos, noch nicht materialisiert) oder schlicht
     * kein Typ im Baum. Das ist eine Entscheidung, keine Lücke: Der Vorgabewert der Spalte ist
     * „Startsequenz an", eine Veranstaltung ohne Zeitnahmeprofil hat also nie etwas verboten. Eine
     * Sperre, die im Zweifel sperrt, hielte am Renntag Läufe an, die niemand gesperrt hat - und
     * ein Startposten, dessen Knopf ohne Erklärung nicht mehr geht, hat keinen zweiten Weg. Die
     * Zusicherung bleibt trotzdem tragfähig, weil sie genau das zusichert, was jemand eingestellt
     * hat: Ein Typ, der Nein sagt, kommt nicht durch.
     */
    private fun ensureStartSequenceAllowed(
        teams: List<UUID>,
        eventId: UUID,
    ): App<ServiceError, Unit> = KIO.comprehension {
        val teamId = teams.firstOrNull()
        val setupMatchId = if (teamId == null) {
            null
        } else {
            (!CompetitionMatchTeamRepo.getById(teamId).orDie())?.competitionMatch
        }

        // Über die Startliste statt über eine eigene Abfrage - derselbe Zuschnitt, den die Posten
        // sehen, und dieselbe Quelle für Wettkampf und Runde, die die Auflösung braucht.
        val match = if (setupMatchId == null) {
            null
        } else {
            (!TimingMatchRepo.getMatchesByEvent(eventId).orDie())
                .firstOrNull { it.setupMatchId == setupMatchId }
        }

        val mode = if (match == null) {
            null
        } else {
            val assignments = !TimingProfileRepo.getAssignments(eventId, TimingProfileKind.MODE).orDie()
            val modeId = TimingProfileResolveLogic.resolve(
                assignments.map {
                    TimingProfileResolveLogic.Assignment(it.competition, it.round, it.match, it.profile)
                },
                match.competitionId,
                match.roundId,
                match.setupMatchId,
            )
            modeId?.let { !TimingModeRepo.get(it).orDie() }
        }

        !KIO.failOn(
            mode != null &&
                !mode.toDto(TimingToneResolveLogic.resolve(emptyList(), null)).startSequenceEnabled
        ) {
            TimingError.StartSequenceDisabled
        }
        KIO.ok(Unit)
    }

    /**
     * The sequence a station's board should show right now: the one that is ARMED/RUNNING, or -
     * if there is none - the most recently finished (DONE/ABORTED) one, as long as it finished
     * within [RECENT_TERMINAL_WINDOW]. Without that fallback, a client that reconnects (or simply
     * missed the terminal websocket broadcast) right after a sequence completes would see nothing
     * at all instead of the summary of what just happened.
     */
    fun getActiveSequence(
        eventId: UUID,
        stationId: UUID,
    ): App<ServiceError, ApiResponse> = KIO.comprehension {
        val station = !TimingStationRepo.get(stationId).orDie().onNullFail { TimingError.StationNotFound }
        !KIO.failOn(station.event != eventId) { TimingError.EventMismatch }

        // Eine ANZEIGE hat nie eigene Sequenzen - sie spiegelt: mit linked_station genau diesen
        // START-Posten, ohne alle Startsequenzen der Veranstaltung (dann gewinnt die zuletzt
        // angefasste aktive). Der Vertrag des Endpunkts bleibt derselbe eine Sequenz-Slot.
        val isDisplay = station.type == TimingStationType.ANZEIGE.name
        val since = LocalDateTime.now().minus(RECENT_TERMINAL_WINDOW)
        val sequence = when {
            isDisplay && station.linkedStation == null -> {
                (!TimingSequenceRepo.getMostRecentActiveByEvent(eventId).orDie())
                    ?: !TimingSequenceRepo.getRecentTerminalByEvent(eventId, since).orDie()
            }
            else -> {
                val targetStation = if (isDisplay) station.linkedStation!! else stationId
                (!TimingSequenceRepo.getActiveByStation(targetStation).orDie())
                    ?: !TimingSequenceRepo.getRecentTerminalByStation(targetStation, since).orDie()
            }
        }
        val dto = if (sequence == null) {
            null
        } else {
            val entries = !TimingSequenceEntryRepo.getBySequence(sequence.id).orDie()
            sequenceDto(sequence, entries)
        }
        KIO.ok(ApiResponse.Dto(ActiveSequenceDto(dto)))
    }

    fun startSequence(
        sequenceId: UUID,
        userId: UUID,
        eventId: UUID,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        val sequence = !getSequenceOfEvent(sequenceId, eventId)
        !KIO.failOn(sequence.stateEnum != SequenceState.ARMED) { TimingError.SequenceStateConflict }

        // The server's clock is the record: every board derives its countdown from this instant plus
        // its own measured clock offset, so nobody counts down against their local time.
        val startedAt = System.currentTimeMillis()
        val updated = !TimingSequenceRepo.update(sequenceId) {
            state = SequenceState.RUNNING.name
            startedAtMillis = startedAt
            updatedAt = LocalDateTime.now()
            updatedBy = userId
        }.orDie().onNullFail { TimingError.SequenceNotFound }

        // Auch das Starten stempelt die Aktivierung (nur wenn noch nicht gesetzt): Wurde die
        // Partie zwischen Einrichten und Start vom Schiedsrichter zurückgestellt, ist sie mit dem
        // laufenden Countdown unstrittig wieder am Start.
        val entryTeams = (!TimingSequenceEntryRepo.getBySequence(sequenceId).orDie())
            .mapNotNull { it.competitionMatchTeam }
        val activated = !TimingMatchStampService.activateMatchesOfTeams(entryTeams, userId)
        if (activated) {
            EventChangeMarker.bump(eventId)
        }

        !broadcastSequence(updated)
        noData
    }

    fun abortSequence(
        sequenceId: UUID,
        userId: UUID,
        eventId: UUID,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        val sequence = !getSequenceOfEvent(sequenceId, eventId)
        // Aus jedem aktiven Zustand heraus, ausdrücklich auch aus der Pause: „doch nicht
        // weiterlaufen lassen" ist die zweite Antwort, die der Posten aus der Pause heraus
        // braucht - neben dem Fortsetzen.
        !KIO.failOn(!sequence.stateEnum.isActive) { TimingError.SequenceStateConflict }

        // Leaves already fired entries (and their marks) alone - only the pending ones are called
        // off, which is exactly what an abort means at a start line.
        val updated = !TimingSequenceRepo.update(sequenceId) {
            state = SequenceState.ABORTED.name
            updatedAt = LocalDateTime.now()
            updatedBy = userId
        }.orDie().onNullFail { TimingError.SequenceNotFound }

        !broadcastSequence(updated)
        noData
    }

    /**
     * Hält eine laufende Sequenz an: sie feuert nichts mehr, bleibt aber die Sequenz ihres
     * Postens und steht weiter auf allen Boards.
     *
     * Der Fall am Wasser ist die Kulanz-Entscheidung der Schiedsrichter - eine Athletin kommt
     * unverschuldet zu spät an den Start. Bisher blieb dafür nur das Abbrechen, das die ganze
     * Kette verwarf; jetzt wird angehalten, ggf. der letzte Schritt zurückgesetzt
     * ([rewindSequence]) und anschließend fortgesetzt ([resumeSequence]).
     *
     * Angehalten wird NICHT über einen gestoppten Wecker: gefeuert wird gegen die geplanten
     * Zeitpunkte der Einträge, es gibt also gar keinen laufenden Timer. Die Pause ist deshalb nur
     * dieser Zustand - [TimingSequenceRepo.getRunning] nimmt PAUSED nicht mehr auf, damit hört
     * das Feuern auf - plus der gemerkte Pausenbeginn, aus dem [resumeSequence] die Verschiebung
     * der Kette berechnet.
     *
     * Nur aus RUNNING: eine scharfgestellte Sequenz hat nichts anzuhalten (dort ist "abbrechen"
     * das richtige Werkzeug), eine beendete erst recht nicht.
     *
     * Rennen mit dem Scheduler: ein Tick, der bereits mitten in seiner eigenen Transaktion
     * steckt, kann noch einen fälligen Eintrag feuern, während dieser Aufruf pausiert - ein
     * Fenster von unter einer Sekunde. Das ist bewusst nicht abgedichtet: der Posten drückt die
     * Pause zwischen zwei Starts, und ein in derselben Sekunde ohnehin fälliger Start ist genau
     * der, den [rewindSequence] anschließend zurücknehmen kann.
     */
    fun pauseSequence(
        sequenceId: UUID,
        userId: UUID,
        eventId: UUID,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        val sequence = !getSequenceOfEvent(sequenceId, eventId)
        !KIO.failOn(sequence.stateEnum != SequenceState.RUNNING) { TimingError.SequenceStateConflict }

        // Die Serveruhr ist auch hier das Protokoll: aus DIESEM Zeitpunkt und dem des Fortsetzens
        // ergibt sich die Pausendauer, um die die ganze Kette nach hinten rückt. Die Boards
        // rechnen daran nichts mit, sie bekommen die fertigen geplanten Zeiten.
        val pausedAt = System.currentTimeMillis()
        val updated = !TimingSequenceRepo.update(sequenceId) {
            state = SequenceState.PAUSED.name
            pausedAtMillis = pausedAt
            updatedAt = LocalDateTime.now()
            updatedBy = userId
        }.orDie().onNullFail { TimingError.SequenceNotFound }

        !broadcastSequence(updated)
        noData
    }

    /**
     * Setzt eine angehaltene Sequenz fort und schiebt dabei die ganze Kette um die Pausendauer
     * nach hinten.
     *
     * Die Verschiebung läuft über `pause_shift_millis`, das [plannedStartMillis] auf JEDE Position
     * gleichermaßen aufschlägt. Damit bleibt genau das erhalten, was am Start zählt: der Abstand
     * zwischen zwei Booten ändert sich nicht, die Kette wandert nur als Ganzes. Bewusst nicht in
     * `started_at_millis` hineingerechnet - der tatsächliche Startzeitpunkt der Sequenz bleibt
     * ehrlich, und die Verschiebung steht nachvollziehbar daneben.
     *
     * Mehrfaches Anhalten summiert sich (der bestehende Wert wird erhöht, nicht überschrieben).
     * `paused_at_millis` wird geleert - es beschreibt immer nur die LAUFENDE Pause.
     *
     * Nur aus PAUSED. Ein fehlender Pausenbeginn (theoretisch nur bei von Hand verbogenen Daten)
     * verschiebt nichts, statt mit einem unsinnigen Wert zu rechnen: die Sequenz läuft dann
     * einfach mit ihrem ursprünglichen Plan weiter.
     */
    fun resumeSequence(
        sequenceId: UUID,
        userId: UUID,
        eventId: UUID,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        val sequence = !getSequenceOfEvent(sequenceId, eventId)
        !KIO.failOn(sequence.stateEnum != SequenceState.PAUSED) { TimingError.SequenceStateConflict }

        val pausedAt = sequence.pausedAtMillis
        // coerceAtLeast(0): eine rückwärts gestellte Serveruhr darf die Kette niemals nach VORNE
        // ziehen - dann feuerte sie Starts früher als geplant.
        val pauseDuration = if (pausedAt == null) 0L else (System.currentTimeMillis() - pausedAt).coerceAtLeast(0L)

        val updated = !TimingSequenceRepo.update(sequenceId) {
            state = SequenceState.RUNNING.name
            // Not-null-Spalte mit Default, vom jOOQ-Generator dennoch nullable typisiert.
            pauseShiftMillis = (pauseShiftMillis ?: 0L) + pauseDuration
            pausedAtMillis = null
            updatedAt = LocalDateTime.now()
            updatedBy = userId
        }.orDie().onNullFail { TimingError.SequenceNotFound }

        !broadcastSequence(updated)
        noData
    }

    /**
     * Setzt aus der Pause heraus den letzten Schritt zurück: der zuletzt GESTARTETE Eintrag wird
     * wieder zu einem anstehenden Start, seine Startmarke geht zurück.
     *
     * Das ist der eigentliche Kulanz-Griff: das Boot, dessen Start gerade rausging, obwohl die
     * Athletin noch nicht da war, steht danach wieder auf der Liste und wird beim Fortsetzen
     * erneut gestartet. Weil sein Slot zu diesem Zeitpunkt schon vorbei ist, feuert er direkt
     * nach dem Fortsetzen - die nachfolgenden Boote behalten ihren gewohnten Abstand dazu, weil
     * die Pausen-Verschiebung für alle gleich ist.
     *
     * Für die Marke wird die vorhandene Rücknahme benutzt ([TimingService.retractTimeMark]) statt
     * einer eigenen Mechanik: dort hängt bereits alles dran, was eine zurückgenommene Marke nach
     * sich zieht - die Neuberechnung und Rückschreibung der offiziellen Zeit des Teams und der
     * `timeMarkRetracted`-Broadcast an die Leitstände. Die Zuordnung der Marke bleibt wie immer
     * stehen, die Rücknahme ist also über die Reaktivierung umkehrbar.
     *
     * Bewusst NICHT dabei: der Ist-Start der Partie (`started_at`). Bei einem Einzelstart ist der
     * zurückgesetzte Eintrag in aller Regel nicht das erste Boot seiner Partie - der Stempel
     * gehört dann weiterhin zum Start des ersten Bootes und darf nicht fallen. Wer den ganzen
     * Versuch einer Partie verwerfen will, nimmt „Start zurücknehmen und neu starten" im
     * Partie-Menü ([TimingService.retractMatchAttempt]); das ist die Bündel-Rücknahme mit
     * Laufzustand, diese hier ist die punktgenaue.
     *
     * Nur aus PAUSED (ein Zurücksetzen mitten im laufenden Countdown wäre ein Wettlauf mit dem
     * Scheduler) und nur, wenn es überhaupt einen gestarteten Eintrag gibt.
     */
    fun rewindSequence(
        sequenceId: UUID,
        userId: UUID,
        eventId: UUID,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        val sequence = !getSequenceOfEvent(sequenceId, eventId)
        !KIO.failOn(sequence.stateEnum != SequenceState.PAUSED) { TimingError.SequenceStateConflict }

        val entry = !TimingSequenceEntryRepo.getLastStarted(sequenceId).orDie()
        !KIO.failOn(entry == null) { TimingError.SequenceStateConflict }

        // Erst die Marke zurücknehmen, dann den Eintrag umstellen: solange der Eintrag noch auf
        // seine Marke zeigt, ist der Zusammenhang lückenlos, falls die Rücknahme scheitert und
        // die Transaktion zurückrollt.
        val markId = entry!!.timeMark
        if (markId != null) {
            !TimingService.retractTimeMark(markId, eventId, userId)
        }
        !TimingSequenceEntryRepo.update(entry.id) {
            status = SequenceEntryStatus.PENDING.name
            timeMark = null
        }.orDie().onNullFail { TimingError.SequenceEntryNotFound }

        // Einträge führen keine eigenen Audit-Spalten, die Änderung wird deshalb an der Sequenz
        // protokolliert (dasselbe Muster wie beim Überspringen).
        val updated = !TimingSequenceRepo.update(sequenceId) {
            updatedAt = LocalDateTime.now()
            updatedBy = userId
        }.orDie().onNullFail { TimingError.SequenceNotFound }

        !broadcastSequence(updated)
        noData
    }

    fun skipEntry(
        entryId: UUID,
        userId: UUID,
        eventId: UUID,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        val entry = !TimingSequenceEntryRepo.get(entryId).orDie().onNullFail { TimingError.SequenceEntryNotFound }
        val sequence = !getSequenceOfEvent(entry.sequence, eventId)
        !KIO.failOn(!sequence.stateEnum.isActive) { TimingError.SequenceStateConflict }
        !KIO.failOn(entry.status != SequenceEntryStatus.PENDING.name) { TimingError.SequenceStateConflict }

        !TimingSequenceEntryRepo.update(entryId) {
            status = SequenceEntryStatus.SKIPPED.name
        }.orDie().onNullFail { TimingError.SequenceEntryNotFound }

        // An ARMED sequence with nothing left to fire (everything skipped, nothing ever started)
        // would otherwise sit stuck ARMED forever - the scheduler only resolves RUNNING sequences,
        // and this one never started. Resolving it to ABORTED here is the same terminal state an
        // operator-triggered abort would produce.
        val stillPending = !TimingSequenceEntryRepo.existsPending(entry.sequence).orDie()
        val fullySkipped = sequence.stateEnum == SequenceState.ARMED && !stillPending

        // Entries carry no audit columns of their own, so the change is recorded on the sequence.
        val updated = !TimingSequenceRepo.update(entry.sequence) {
            if (fullySkipped) {
                state = SequenceState.ABORTED.name
            }
            updatedAt = LocalDateTime.now()
            updatedBy = userId
        }.orDie().onNullFail { TimingError.SequenceNotFound }

        // Deliberately does not complete a RUNNING sequence when this was the last pending entry:
        // the scheduler owns that DONE transition and picks it up on its next tick (within a
        // second). An ARMED sequence never reaches the scheduler though, which is why it is
        // resolved above instead.
        !broadcastSequence(updated)
        noData
    }

    /**
     * Fires every start entry that has come due and completes sequences that have nothing left to
     * fire. This is the scheduler's job body.
     *
     * Transactionality: this function does NOT open a transaction of its own - the caller wraps it
     * (see `Application.scheduleJobs`, which calls `.transact()`). That makes one run atomic: mark,
     * assignment and the entry's status flip either all land or none do, so a crash mid-run can
     * never leave an entry marked STARTED without its mark, or vice versa.
     *
     * Idempotency: pending entries are row-locked for the transaction
     * ([TimingSequenceEntryRepo.getPendingForUpdate]), and only PENDING entries are ever considered,
     * so a re-run after a rollback re-fires exactly what is still due, and a concurrent runner sees
     * no work left. [TimingTimeMarkRepo.createIfAbsent] is the same race-safe insert the manual
     * capture path uses.
     *
     * Broadcasts: none happen here - see [FireResult] and [broadcastFireResult].
     *
     * Pause: eine angehaltene Sequenz feuert nichts. Das entscheidet allein
     * [TimingSequenceRepo.getRunning] - der Filter nimmt ausschließlich RUNNING auf, PAUSED
     * kommt hier also gar nicht erst an. Deshalb braucht es unten keine zweite Prüfung, und
     * deshalb darf der Filter nie auf „alle aktiven Zustände" aufgeweicht werden.
     */
    fun fireDueEntries(): App<Nothing, FireResult> = KIO.comprehension {
        val now = System.currentTimeMillis()
        val running = !TimingSequenceRepo.getRunning().orDie()
        if (running.isEmpty()) return@comprehension KIO.ok(FireResult.empty)

        val outcomes = !running.traverse { sequence -> fireSequence(sequence, now) }
        KIO.ok(
            FireResult(
                fired = outcomes.flatMap { it.fired },
                changedSequences = outcomes.mapNotNull { it.changed },
            )
        )
    }

    /**
     * Sends the websocket messages for a finished [fireDueEntries] run.
     *
     * Must be called only after the transaction that ran it committed. The scheduler runs outside
     * `respondKIO`, so `AfterCommit` has no buffer installed and would fire its effect immediately -
     * i.e. mid-transaction. Calling the broadcaster here, from the job body after `transact`
     * returned successfully, reproduces the after-commit guarantee by hand.
     *
     * Sequence-level messages are not sent yet; [FireResult.changedSequences] already carries the
     * fully built DTOs for them, so adding that message type only means adding one broadcast line
     * here.
     */
    fun broadcastFireResult(result: FireResult) {
        result.fired.forEach { entry ->
            val eventId = entry.mark.event
            TimingBroadcaster.broadcast(eventId, TimingWsMessage.TimeMarkCreated(entry.mark))
            TimingBroadcaster.broadcast(
                eventId,
                TimingWsMessage.AssignmentChanged(entry.mark.id, entry.mark.assignedTeam),
            )
        }
        result.changedSequences.forEach { sequence ->
            TimingBroadcaster.broadcast(sequence.event, TimingWsMessage.SequenceChanged(sequence))
        }
        // Offizielle Zeiten, die die Echtzeit-Übernahme beim Feuern geändert hat, gebündelt je
        // Veranstaltung - dieselbe Nachricht, die auch die HTTP-Mutationen senden.
        result.fired
            .filter { it.changedOfficialTimes.isNotEmpty() }
            .groupBy { it.mark.event }
            .forEach { (eventId, entries) ->
                TimingBroadcaster.broadcast(
                    eventId,
                    TimingWsMessage.OfficialTimeChanged(entries.flatMap { it.changedOfficialTimes }),
                )
            }
        // Laufzustands-Stempel (started_at/activated_at) UND geschriebene Ergebnisse des Laufs:
        // erst hier, nach dem Commit, die Caches der öffentlichen Anzeigen entwerten - ein Bump
        // aus der Scheduler-Transaktion heraus ginge vor dem Commit raus (AfterCommit hat dort
        // keinen Puffer) und ließe die Anzeigen den alten Stand nachladen und bis zum TTL-Ablauf
        // festhalten. Beide Änderungsarten derselben Veranstaltung bündeln sich zu EINEM Bump.
        result.fired
            .filter { it.matchStamped || it.resultsWritten }
            .map { it.mark.event }
            .distinct()
            .forEach { eventId -> EventChangeMarker.bump(eventId) }
    }

    private data class SequenceOutcome(
        val fired: List<FiredEntry>,
        val changed: TimingSequenceDto?,
    )

    private fun fireSequence(
        sequence: TimingStartSequenceRecord,
        now: Long,
    ): App<Nothing, SequenceOutcome> = KIO.comprehension {
        val pending = !TimingSequenceEntryRepo.getPendingForUpdate(sequence.id).orDie()
        val due = pending.filter { entry ->
            val planned = plannedStartMillis(sequence, entry.position)
            planned != null && planned <= now
        }

        val fired = !due.traverse { entry -> fireEntry(sequence, entry) }

        // Everything that was pending and did not just fire is what remains; a sequence with
        // nothing left (all started or skipped) is finished.
        val completed = pending.size == due.size
        if (completed) {
            !TimingSequenceRepo.update(sequence.id) {
                state = SequenceState.DONE.name
                updatedAt = LocalDateTime.now()
            }.orDie()
        }

        if (fired.isEmpty() && !completed) {
            KIO.ok(SequenceOutcome(emptyList(), null))
        } else {
            // Re-read so the broadcast payload reflects the post-run truth rather than the record
            // this run started from.
            val updated = !TimingSequenceRepo.get(sequence.id).orDie()
            val entries = !TimingSequenceEntryRepo.getBySequence(sequence.id).orDie()
            KIO.ok(SequenceOutcome(fired, sequenceDto(updated ?: sequence, entries)))
        }
    }

    private fun fireEntry(
        sequence: TimingStartSequenceRecord,
        entry: TimingStartSequenceEntryRecord,
    ): App<Nothing, FiredEntry> = KIO.comprehension {
        val now = LocalDateTime.now()
        val markId = UUID.randomUUID()
        // The mark carries the PLANNED instant, not the moment the job happened to run: a scheduler
        // tick that is late by a few hundred milliseconds must not distort the recorded start.
        val plannedAt = plannedStartMillis(sequence, entry.position)!!

        val mark = TimingTimeMarkRecord(
            id = markId,
            event = sequence.event,
            station = sequence.station,
            timestampMillis = plannedAt,
            source = "APP_USER",
            status = "ACTIVE",
            createdAt = now,
            createdBy = sequence.createdBy,
        )
        !TimingTimeMarkRepo.createIfAbsent(mark).orDie()
        !TimingAssignmentRepo.create(
            TimingAssignmentRecord(
                id = UUID.randomUUID(),
                timeMark = markId,
                competitionMatchTeam = entry.competitionMatchTeam,
                createdAt = now,
                createdBy = sequence.createdBy,
                updatedAt = now,
                updatedBy = sequence.createdBy,
            )
        ).orDie()
        !TimingSequenceEntryRepo.update(entry.id) {
            status = SequenceEntryStatus.STARTED.name
            timeMark = markId
        }.orDie()

        // Die soeben gefeuerte Startmarke ist ggf. die erste ihrer Partie: dann trägt sie den
        // Ist-Start (started_at = Markenzeit) - in derselben Transaktion wie die Marke, damit
        // Stempel und Marke nie auseinanderlaufen. Ein bestehender Ist-Start (Schiedsrichter!)
        // wird nie verschoben (TimingMatchStampLogic.startStampFor). Der EventChangeMarker-Bump
        // dazu darf hier NICHT laufen (Scheduler-Transaktion ohne AfterCommit-Puffer - der Push
        // ginge vor dem Commit raus); das Flag wandert stattdessen im FireResult nach draußen.
        val matchStamped = !TimingMatchStampService.stampStartFromMarks(
            sequence.event,
            listOfNotNull(entry.competitionMatchTeam),
            sequence.createdBy,
        )

        // A fired mark is assigned to its team from the moment it is created, so - exactly like
        // TimingService.assignTimeMark's freshly created marks are documented not to need - it can
        // change what the team's official time would compute to. Die Echtzeit-Übernahme rechnet
        // deshalb in derselben Transaktion nach und schreibt ggf. zurück.
        //
        // Bewusst recomputeAndApply statt recomputeApplyAndBroadcast: dies läuft in der
        // Scheduler-Transaktion, wo kein AfterCommit-Puffer installiert ist (siehe FireResult) -
        // ein dort registrierter Broadcast ginge VOR dem Commit raus. Die geänderten Zeilen wandern
        // stattdessen im FireResult nach draußen und werden von broadcastFireResult gesendet.
        val applyOutcome = !TimingOfficialTimeService.recomputeAndApply(
            sequence.event,
            listOf(entry.competitionMatchTeam),
            sequence.createdBy,
        )

        // Die gefeuerte Startmarke ist der Bezugspunkt aller Zwischenzeiten ihres Bootes - hat ein
        // verworfener Versuch noch welche stehen lassen, räumt die Übernahme sie hier ab. Ihr
        // Rückgabewert wird bewusst verworfen: Der EventChangeMarker-Bump darf in dieser
        // Scheduler-Transaktion nicht laufen (siehe oben), und die Anzeigen holen die Zeilen
        // spätestens mit dem nächsten Bump - vor dem Start hat ohnehin kein Boot eine
        // Zwischenzeit.
        !TimingSplitService.recomputeEvent(sequence.event, sequence.createdBy)

        KIO.ok(
            FiredEntry(
                sequenceId = sequence.id,
                entryId = entry.id,
                mark = timeMarkDto(mark, entry.competitionMatchTeam),
                changedOfficialTimes = applyOutcome.officialTimes,
                matchStamped = matchStamped,
                resultsWritten = applyOutcome.resultsWritten,
            )
        )
    }

    private fun getSequenceOfEvent(
        sequenceId: UUID,
        eventId: UUID,
    ): App<TimingError, TimingStartSequenceRecord> = KIO.comprehension {
        val sequence = !TimingSequenceRepo.get(sequenceId).orDie().onNullFail { TimingError.SequenceNotFound }
        !KIO.failOn(sequence.event != eventId) { TimingError.EventMismatch }
        KIO.ok(sequence)
    }

    private val TimingStartSequenceRecord.stateEnum: SequenceState
        get() = SequenceState.valueOf(state!!)

    /** Re-reads [record]'s entries and broadcasts the resulting DTO after commit. */
    private fun broadcastSequence(record: TimingStartSequenceRecord): App<Nothing, Unit> = KIO.comprehension {
        val entries = !TimingSequenceEntryRepo.getBySequence(record.id).orDie()
        broadcastAsync(record.event, sequenceDto(record, entries))
        KIO.ok(Unit)
    }

    // Mirrors TimingService.broadcastAsync: the mutation runs inside respondKIO's transaction, so
    // the broadcast must wait until that transaction has committed - AfterCommit buffers it there
    // (and runs it immediately for non-HTTP callers).
    private fun broadcastAsync(eventId: UUID, sequence: TimingSequenceDto) {
        AfterCommit.register {
            TimingBroadcaster.broadcast(eventId, TimingWsMessage.SequenceChanged(sequence))
        }
    }
}
