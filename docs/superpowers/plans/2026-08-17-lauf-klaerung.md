# Laufzustand „Klärung" — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Lauf, der wegen eines Einspruchs nicht freigegeben wird, bekommt den Zustand „Klärung" — er verschwindet aus den laufenden Anzeigen (Livestream, Boards, Kette) und blockiert damit keinen anderen Lauf mehr, bleibt aber für die Schiedsrichter in kompakter Form sichtbar.

**Architecture:** Zwei neue Spalten auf `competition_match` (`clarification_since`, `clarification_reason`) und ein neuer Wert `CLARIFICATION` in der geteilten Aufzählung `LiveDashboardMatchState`. Der Zustand wird wie alle anderen in `LiveDashboardLogic.deriveMatchState` abgeleitet — ein einziger neuer Zweig, ganz oben, damit die Klärung die Aktivierung schlägt. Die öffentlichen Anzeigen verlieren den Lauf über den SQL-Filter in `CompetitionMatchRepo.getRunningMatches`, die Kette über ein neues Feld in `ChainSlot`.

**Tech Stack:** Kotlin + Ktor + jOOQ + KIO (`de.lambda9.tailwind`), Flyway-Migrationen, Postgres; Frontend React + TypeScript + MUI + i18next, Tests mit kotlin.test/Testcontainers bzw. vitest.

**Spec:** `docs/superpowers/specs/2026-08-17-lauf-klaerung-design.md` — Plan und Spec gehören zusammen, beide lesen.

## Global Constraints

- **Die eine Regel:** `in Klärung ⇔ clarification_since is not null`. Aufheben und Beenden leeren **beide** Spalten. Es gibt keine dritte Spalte und keine Historie.
- **Klärung schlägt Aktivierung, Beenden schlägt Klärung.** Die Reihenfolge der Zweige in `deriveMatchState` ist die eigentliche Aussage; sie wird durch Tests festgenagelt.
- **`activated_at` wird nirgends angefasst.** Weder beim Setzen noch beim Aufheben der Klärung.
- **Der SQL-Filter gilt nur für Anzeige-Abfragen.** Die RaceClocker-Zuordnung (`RaceClockerPollRepo`, `RaceClockerPollService`) darf den Lauf weiterhin finden — Zeiten und Strafen laufen während der Klärung weiter ein.
- **`LiveMatchesLogic.notLive` bleibt unverändert.** Der Lauf ist über den Ergebnis-Zweig zu sehen, nicht über den Live-Zweig; er kann dort gar nicht mehr auftauchen, weil beide speisenden Abfragen ihn ausschließen. Wer den neuen Wert dort „der Vollständigkeit halber" einträgt, ändert nichts und verschiebt nur eine getestete Zusicherung.
- **`PublicResultsVisibility` bleibt unverändert.** Ein Lauf in Klärung wird nicht strenger und nicht großzügiger behandelt — nur als vorläufig ausgewiesen.
- **Operation-IDs für die neuen Routen:** `setMatchClarification` (PUT) und `clearMatchClarification` (DELETE). Daraus erzeugt `npm run generate` die gleichnamigen Funktionen in `frontend/src/api/sdk.gen.ts`; Task 10 ruft genau sie auf.
- **Kein neues Privileg.** Die Endpoints nehmen `authenticateAny(Privilege.UpdateLiveDashboardGlobal, Privilege.UpdateEventGlobal)`.
- **Grund ist Pflicht**, im Validator und in der Datenbank: `btrim(clarification_reason) <> ''`.
- **Deutsche Texte mit echten Umlauten** (ä, ö, ü, ß), nie `ae`/`oe`/`ue`/`ss`.
- **`documentation.yaml` ist handgepflegt.** Jede API-Änderung muss dort von Hand eingetragen werden, bevor `npm run generate` läuft.
- **Commits erwähnen Claude nicht** — kein `Co-Authored-By`, keine KI-Hinweise.
- Backend-Tests: `cd backend && ./mvnw test`. Frontend-Tests: `cd frontend && npm test`. jOOQ: `cd backend && ./mvnw jooq:generate` gegen die **eigene** Build-DB, nicht gegen eine geteilte.

---

## Dateiübersicht

**Backend, neu:**
- `backend/src/main/resources/db/migration/V202608171200__match_clarification.sql` — die zwei Spalten
- `backend/src/main/kotlin/.../app/liveDashboard/entity/MatchClarificationRequest.kt` — der Request-Body mit Pflichtgrund

**Backend, geändert:**
- `.../app/liveDashboard/entity/LiveDashboardDto.kt` — Enum-Wert, zwei Felder auf `LiveDashboardMatchDto`
- `.../app/liveDashboard/boundary/LiveDashboardLogic.kt` — der neue Zweig, `selectForScope`
- `.../app/liveDashboard/boundary/LiveDashboardService.kt` — Setzen/Aufheben, Beenden leert
- `.../app/liveDashboard/boundary/liveDashboard.kt` — die zwei Routen
- `.../app/liveDashboard/control/LiveDashboardRepo.kt` — Spalten mitlesen
- `.../app/matchStatus/entity/MatchStatusDto.kt` + `.../boundary/MatchStatusLogic.kt` — Durchreichen, Zähler
- `.../app/competitionExecution/control/CompetitionMatchRepo.kt` — Anzeige-Filter
- `.../app/competitionExecution/control/Conversions.kt` — Durchführungsseite reicht durch
- `.../app/eventSchedule/boundary/ScheduleChain.kt` + `.../control/EventScheduleRepo.kt` + `.../boundary/EventScheduleService.kt` — die Kette
- `.../app/eventInfo/entity/LatestMatchResultInfo.kt`, `.../entity/AthleteBoardDto.kt`, `.../control/Conversions.kt` — das Ergebnis-Flag
- `backend/src/main/resources/openapi/documentation.yaml` — Enum-Wert, Felder, zwei Routen

**Frontend, geändert:**
- `frontend/src/api/types.gen.ts`, `sdk.gen.ts` (generiert, nicht von Hand)
- `frontend/src/components/event/match/matchStatusChip.ts` — Chip
- `frontend/src/components/event/schedule/timelineIndicator.ts` — Zeitstrahl
- `frontend/src/components/event/liveDashboard/common.ts` — `isLiveMatch`, `matchControls`, neue Aufteilung
- `frontend/src/components/event/liveDashboard/LiveDashboardColumns.tsx` — der eingeklappte Abschnitt
- `frontend/src/components/event/liveDashboard/LiveDashboardMatchCard.tsx` — Knopf
- `frontend/src/components/event/liveDashboard/ClarificationDialog.tsx` (neu) — Dialog mit Pflichtgrund
- `frontend/src/pages/event/LiveDashboardPage.tsx` — Handler
- `frontend/src/components/event/competition/excecution/CompetitionExecutionRound.tsx` — Knopf
- `frontend/src/components/event/info/athleteBoard/AthleteBoardResultCard.tsx` + Stream-Panels — „vorläufig"-Badge
- `frontend/src/i18n/de/translations.json`, `frontend/src/i18n/en/translations.json`

---

### Task 1: Migration und jOOQ

**Files:**
- Create: `backend/src/main/resources/db/migration/V202608171200__match_clarification.sql`

**Interfaces:**
- Produces: die Spalten `COMPETITION_MATCH.CLARIFICATION_SINCE` (`LocalDateTime?`) und `COMPETITION_MATCH.CLARIFICATION_REASON` (`String?`) in den generierten jOOQ-Klassen. Alle folgenden Tasks bauen darauf.

- [ ] **Schritt 1: Freien Migrationsslot prüfen**

Run: `ls backend/src/main/resources/db/migration | sort | tail -5`

Erwartet: kein Eintrag `V202608171200__*`. Existiert einer (eine parallele Session war schneller), nimm `V202608171210`, und melde die Abweichung im Abschlussbericht — Migrationsnummern kollidieren zwischen Worktrees.

- [ ] **Schritt 2: Migration schreiben**

```sql
-- Ein Lauf, gegen den ein Einspruch läuft, wird von den Schiedsrichtern nicht freigegeben
-- (finished_at bleibt leer). Weil deriveMatchState die Aktivierung VOR dem Beenden prüft, stand
-- er bis hierher dauerhaft auf RUNNING - und hielt damit Stream-Uhr, Board-Cursor und die Kette
-- an einem einzigen strittigen Rennen fest.
--
-- clarification_since ist der Merker: gesetzt = in Klärung. Aufheben und Beenden leeren BEIDE
-- Spalten; eine Historie führt diese Tabelle bewusst nicht (Entscheidung vom 17.08.2026).
-- activated_at bleibt unangetastet: Der Lauf ist weiter an den Start gerufen, und nach dem
-- Aufheben steht er ohne Zutun wieder auf RUNNING.
alter table competition_match
    add column clarification_since  timestamp,
    add column clarification_reason varchar(255);

-- Eine Klärung ohne Grund darf es nicht geben (der Grund steht auf der eingeklappten Zeile im
-- Schiedsrichter-Dashboard), ein Grund ohne Klärung ebenso wenig - sonst bliebe nach dem
-- Aufheben ein Text stehen, den keine Anzeige mehr einordnen kann. Dieselbe Regel prüft der
-- Validator in MatchClarificationRequest, damit der Server nicht erst an der Datenbank scheitert.
alter table competition_match
    add constraint competition_match_clarification_complete
        check (
            (clarification_since is null and clarification_reason is null)
                or (clarification_since is not null
                    and clarification_reason is not null
                    and btrim(clarification_reason) <> '')
            );
```

- [ ] **Schritt 3: Migration einspielen und jOOQ erzeugen**

Run: `cd backend && docker compose up -d && ./mvnw jooq:generate`
Erwartet: Lauf endet mit BUILD SUCCESS.

- [ ] **Schritt 4: Prüfen, dass die Spalten in den generierten Klassen stehen**

Run: `grep -rn "CLARIFICATION_SINCE\|CLARIFICATION_REASON" backend/src/main/kotlin/de/lambda9/ready2race/backend/database/generated/tables/CompetitionMatch.kt | head`
Erwartet: beide Spalten erscheinen, `CLARIFICATION_SINCE` als `LocalDateTime?`, `CLARIFICATION_REASON` als `String?`.

- [ ] **Schritt 5: Commit**

```bash
git add backend/src/main/resources/db/migration/V202608171200__match_clarification.sql backend/src/main/kotlin/de/lambda9/ready2race/backend/database/generated
git commit -m "Klärung: Spalten auf competition_match"
```

---

### Task 2: Der Zustand `CLARIFICATION`

**Files:**
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/liveDashboard/entity/LiveDashboardDto.kt:31`
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/liveDashboard/boundary/LiveDashboardLogic.kt:74-92`
- Test: `backend/src/test/kotlin/de/lambda9/ready2race/backend/app/liveDashboard/LiveDashboardLogicTest.kt`

**Interfaces:**
- Consumes: nichts aus Task 1 (reine Ableitung, ohne Datenbank).
- Produces: `LiveDashboardMatchState.CLARIFICATION` und die erweiterte Signatur
  `LiveDashboardLogic.deriveMatchState(activatedAt, startedAt, startTime, finishedAt, teamResults, skipped = false, clarificationSince = null)` — der neue Parameter steht **am Ende** und hat einen Vorgabewert, damit die bestehenden Aufrufer unverändert übersetzen.

- [ ] **Schritt 1: Die fehlschlagenden Tests schreiben**

Ans Ende von `LiveDashboardLogicTest.kt` anfügen, vor der schließenden Klammer der Klasse:

```kotlin
    // --- deriveMatchState: Klärung ---

    @Test
    fun clarificationBeatsActivation() {
        // Der Fall, um den es geht: Der Lauf ist gefahren, niemand hat beendet, weil ein Einspruch
        // läuft. Ohne diesen Zweig stünde er dauerhaft auf RUNNING und hielte Stream-Uhr,
        // Board-Cursor und Kette an sich fest.
        assertEquals(
            LiveDashboardMatchState.CLARIFICATION,
            LiveDashboardLogic.deriveMatchState(
                activatedAt = start.minusMinutes(20),
                startedAt = start.minusMinutes(15),
                startTime = start,
                finishedAt = null,
                teamResults = listOf(true, true),
                clarificationSince = start.minusMinutes(2),
            )
        )
    }

    @Test
    fun finishingBeatsClarification() {
        // Freigegeben ist freigegeben. Der Fall entsteht im Betrieb gar nicht (Beenden leert den
        // Merker), aber die Reihenfolge soll auch dann stimmen, wenn jemand direkt in die
        // Datenbank schreibt.
        assertEquals(
            LiveDashboardMatchState.FINISHED,
            LiveDashboardLogic.deriveMatchState(
                activatedAt = null,
                startedAt = start.minusMinutes(15),
                startTime = start,
                finishedAt = start.plusMinutes(5),
                teamResults = listOf(true, true),
                clarificationSince = start.minusMinutes(2),
            )
        )
    }

    @Test
    fun clarificationAlsoCatchesAMatchThatIsNotFullyScoredYet() {
        // Ein Streit kann vor der vollständigen Wertung ausbrechen. Auch dann darf der Lauf nicht
        // als "läuft" stehen bleiben - genau dieser Fall blockierte zusätzlich die Kette.
        assertEquals(
            LiveDashboardMatchState.CLARIFICATION,
            LiveDashboardLogic.deriveMatchState(
                activatedAt = start.minusMinutes(20),
                startedAt = start.minusMinutes(15),
                startTime = start,
                finishedAt = null,
                teamResults = listOf(true, false),
                clarificationSince = start.minusMinutes(2),
            )
        )
    }

    @Test
    fun liftingTheClarificationPutsTheMatchBackOnRunning() {
        // Der Rückweg: Aufheben leert den Merker, activated_at bleibt stehen - der Lauf ist wieder
        // das, was er vorher war. Ohne diesen Test bliebe unbemerkt, wenn jemand beim Aufheben
        // zusätzlich activated_at löscht.
        assertEquals(
            LiveDashboardMatchState.RUNNING,
            LiveDashboardLogic.deriveMatchState(
                activatedAt = start.minusMinutes(20),
                startedAt = start.minusMinutes(15),
                startTime = start,
                finishedAt = null,
                teamResults = listOf(true, true),
                clarificationSince = null,
            )
        )
    }

    @Test
    fun clarificationInTheLiveScope() {
        // Die Schiedsrichter behalten ihn - nur die öffentlichen Anzeigen verlieren ihn.
        val match = LiveDashboardMatchDto(
            matchId = UUID.randomUUID(),
            state = LiveDashboardMatchState.CLARIFICATION,
            competitionId = UUID.randomUUID(),
            competitionName = "CF1x",
            categoryName = null,
            roundName = null,
            matchName = null,
            executionOrder = 0,
            startTime = start,
            startedAt = start,
            teams = emptyList(),
        )
        assertEquals(
            listOf(match),
            LiveDashboardLogic.selectForScope(listOf(match), LiveDashboardScope.LIVE),
        )
    }
```

**Achtung:** `LiveDashboardMatchDto` hat mehr Felder, als hier gesetzt sind — alle übrigen haben Vorgabewerte. Übersetzt der Test nicht, öffne `LiveDashboardDto.kt` und ergänze die Pflichtfelder; erfinde keine.

- [ ] **Schritt 2: Tests laufen lassen und Fehlschlag prüfen**

Run: `cd backend && ./mvnw test -Dtest=LiveDashboardLogicTest`
Erwartet: Übersetzungsfehler — `clarificationSince` ist kein Parameter, `CLARIFICATION` kein Wert.

- [ ] **Schritt 3: Enum erweitern**

In `LiveDashboardDto.kt:31`:

```kotlin
enum class LiveDashboardMatchState { PREPARING, RUNNING, FINISHED, SKIPPED, AWAITING_FINISH, UPCOMING, UNSCHEDULED, CLARIFICATION }
```

- [ ] **Schritt 4: Den Zweig einbauen**

In `LiveDashboardLogic.kt`, Signatur und `when` ersetzen:

```kotlin
    fun deriveMatchState(
        activatedAt: LocalDateTime?,
        startedAt: LocalDateTime?,
        startTime: LocalDateTime?,
        finishedAt: LocalDateTime?,
        teamResults: List<Boolean>,
        skipped: Boolean = false,
        /**
         * `competition_match.clarification_since` - gesetzt heißt "in Klärung" (Einspruch läuft).
         * Aufheben und Beenden leeren die Spalte; es gibt keinen zweiten Zeitstempel, gegen den
         * hier zu prüfen wäre.
         */
        clarificationSince: LocalDateTime? = null,
    ): LiveDashboardMatchState = when {
        // Ganz oben, VOR der Aktivierung: Genau das ist der Zweck dieses Zustands. Ein Lauf, gegen
        // den ein Einspruch läuft, bleibt aktiviert (activated_at wird nicht angefasst) und stand
        // deshalb dauerhaft auf RUNNING - eine einzige strittige Wertung hielt Stream-Uhr,
        // Board-Cursor und Kette fest. Hinter finishedAt steht der Zweig trotzdem nicht: Beenden
        // IST die Freigabe, und ein beendeter Lauf ist beendet.
        clarificationSince != null && finishedAt == null -> LiveDashboardMatchState.CLARIFICATION
        // Aktiviert, aber ohne Ist-Start: der Lauf ist an den Start gerufen und noch nicht
        // unterwegs. Die Trennung trägt erst, seit der RaceClocker-Abruf den echten Start meldet -
        // vorher war "läuft" eine Behauptung, jetzt ist es ein Beleg.
        activatedAt != null && startedAt == null -> LiveDashboardMatchState.PREPARING
        activatedAt != null -> LiveDashboardMatchState.RUNNING
        finishedAt != null -> LiveDashboardMatchState.FINISHED
        skipped -> LiveDashboardMatchState.SKIPPED
        teamResults.isNotEmpty() && teamResults.all { it } -> LiveDashboardMatchState.AWAITING_FINISH
        startTime == null -> LiveDashboardMatchState.UNSCHEDULED
        else -> LiveDashboardMatchState.UPCOMING
    }
```

- [ ] **Schritt 5: `selectForScope` erweitern**

In `LiveDashboardLogic.kt:186-190` die Bedingung ergänzen:

```kotlin
            .filter {
                it.state == LiveDashboardMatchState.PREPARING ||
                    it.state == LiveDashboardMatchState.RUNNING ||
                    it.state == LiveDashboardMatchState.AWAITING_FINISH ||
                    // Die Klärung gehört in die Live-Spalte, auch wenn sie aus den öffentlichen
                    // Anzeigen verschwindet: Auf dem Dashboard steht die Handlung noch aus, und
                    // ohne sie hier hätte niemand mehr einen Knopf, um sie aufzuheben.
                    it.state == LiveDashboardMatchState.CLARIFICATION
            }
```

- [ ] **Schritt 6: Tests laufen lassen**

Run: `cd backend && ./mvnw test -Dtest=LiveDashboardLogicTest`
Erwartet: PASS, alle Tests der Klasse.

- [ ] **Schritt 7: Commit**

```bash
git add backend/src/main/kotlin/de/lambda9/ready2race/backend/app/liveDashboard backend/src/test/kotlin/de/lambda9/ready2race/backend/app/liveDashboard/LiveDashboardLogicTest.kt
git commit -m "Klärung: neuer Laufzustand in der geteilten Ableitung"
```

---

### Task 3: `MatchStatusLogic` reicht durch und zählt

**Files:**
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/matchStatus/entity/MatchStatusDto.kt`
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/matchStatus/boundary/MatchStatusLogic.kt:51-84` und `:176-187`
- Test: `backend/src/test/kotlin/de/lambda9/ready2race/backend/app/matchStatus/MatchStatusLogicTest.kt`

**Interfaces:**
- Consumes: `LiveDashboardLogic.deriveMatchState(..., clarificationSince)` aus Task 2.
- Produces:
  - `MatchStatusLogic.matchStatus(activatedAt, startTime, startedAt, finishedAt, skipped, teams, teamsInArena = null, bye = null, clarificationSince = null, clarificationReason = null)`
  - `MatchStatusDto.clarificationReason: String?`
  - `RoundCountersDto.clarification: Int`

- [ ] **Schritt 1: Die fehlschlagenden Tests schreiben**

Ans Ende von `MatchStatusLogicTest.kt` anfügen:

```kotlin
    @Test
    fun aMatchInClarificationCarriesItsReason() {
        val status = MatchStatusLogic.matchStatus(
            activatedAt = base.minusMinutes(20),
            startTime = base,
            startedAt = base.minusMinutes(15),
            finishedAt = null,
            skipped = false,
            teams = listOf(
                MatchStatusTeam(place = 1, failed = false, deregistered = false),
                MatchStatusTeam(place = 2, failed = false, deregistered = false),
            ),
            clarificationSince = base.minusMinutes(2),
            clarificationReason = "Einspruch RV Hansa, Bahnberührung",
        )
        assertEquals(MatchState.CLARIFICATION, status.state)
        assertEquals("Einspruch RV Hansa, Bahnberührung", status.clarificationReason)
    }

    @Test
    fun clarificationGetsItsOwnCounterAndLeavesTheOthersAlone() {
        // Jeder Lauf zählt in genau einen Topf - das ist die Zusage der Leiste. Ein Lauf in
        // Klärung darf weder unter "läuft" noch unter "offen" mitlaufen, sonst behauptet die
        // Leiste etwas anderes als die Chips darunter.
        val counters = MatchStatusLogic.roundCounters(
            listOf(
                status(MatchState.RUNNING),
                status(MatchState.CLARIFICATION),
                status(MatchState.CLARIFICATION),
                status(MatchState.FINISHED),
            )
        )
        assertEquals(4, counters.total)
        assertEquals(1, counters.running)
        assertEquals(2, counters.clarification)
        assertEquals(0, counters.open)
        assertEquals(1, counters.finished)
    }
```

Beide Tests brauchen Hilfen, die es in der Datei möglicherweise schon gibt (`base`, `status(...)`). Sieh oben in der Datei nach; fehlt eine, ergänze sie im vorhandenen Stil:

```kotlin
    private val base = LocalDateTime.of(2026, 8, 17, 10, 0)

    private fun status(state: MatchState) = MatchStatusDto(
        state = state,
        startedAt = null,
        teamsTotal = 0,
        teamsScored = 0,
    )
```

- [ ] **Schritt 2: Tests laufen lassen und Fehlschlag prüfen**

Run: `cd backend && ./mvnw test -Dtest=MatchStatusLogicTest`
Erwartet: Übersetzungsfehler — `clarificationSince`, `clarificationReason` und `counters.clarification` gibt es noch nicht.

- [ ] **Schritt 3: `MatchStatusDto` erweitern**

In `MatchStatusDto.kt`, in `data class MatchStatusDto` nach `bye`:

```kotlin
    /**
     * Der Grund der Klärung, solange [state] == [MatchState.CLARIFICATION] ist - der Text, den die
     * Schiedsrichter beim Setzen eingetippt haben ("Einspruch RV Hansa, Bahnberührung"). Er ist
     * reiner Ausweis: Über den Zustand entscheidet allein `clarification_since`, nicht dieses Feld.
     */
    val clarificationReason: String? = null,
```

Und in `data class RoundCountersDto` nach `running`:

```kotlin
    /**
     * In Klärung - ein eigener Topf und ausdrücklich nicht Teil von [open]. Ein strittiger Lauf
     * ist keine offene Handlung des Regattabüros, sondern eine der Schiedsrichter; unter "offen"
     * versteckt läse die Leiste sich, als fehlte nur ein Beenden-Klick.
     */
    val clarification: Int,
```

- [ ] **Schritt 4: `matchStatus` und `roundCounters` erweitern**

In `MatchStatusLogic.kt` die Signatur von `matchStatus` um zwei Parameter am Ende ergänzen und beide durchreichen:

```kotlin
        bye: MatchByeDto? = null,
        /** `competition_match.clarification_since` - siehe `LiveDashboardLogic.deriveMatchState`. */
        clarificationSince: LocalDateTime? = null,
        /** `competition_match.clarification_reason` - reiner Ausweis, entscheidet keinen Zustand. */
        clarificationReason: String? = null,
    ): MatchStatusDto {
        val scored = scoredCount(teams)
        return MatchStatusDto(
            state = LiveDashboardLogic.deriveMatchState(
                activatedAt = activatedAt,
                startedAt = startedAt,
                startTime = startTime,
                finishedAt = finishedAt,
                teamResults = teams.map {
                    LiveDashboardLogic.teamIsSettled(it.place, it.failed, it.deregistered)
                },
                skipped = skipped,
                clarificationSince = clarificationSince,
            ),
```

und weiter unten im selben `MatchStatusDto(...)`-Aufruf, nach `bye = bye,`:

```kotlin
            clarificationReason = clarificationReason,
```

In `roundCounters` den neuen Topf ergänzen:

```kotlin
    fun roundCounters(statuses: List<MatchStatusDto>): RoundCountersDto = RoundCountersDto(
        total = statuses.size,
        preparing = statuses.count { it.state == MatchState.PREPARING },
        running = statuses.count { it.state == MatchState.RUNNING },
        clarification = statuses.count { it.state == MatchState.CLARIFICATION },
        open = statuses.count {
            it.state == MatchState.AWAITING_FINISH ||
                it.state == MatchState.UPCOMING ||
                it.state == MatchState.UNSCHEDULED
        },
        finished = statuses.count { it.state == MatchState.FINISHED },
        skipped = statuses.count { it.state == MatchState.SKIPPED },
    )
```

- [ ] **Schritt 5: Tests laufen lassen**

Run: `cd backend && ./mvnw test -Dtest=MatchStatusLogicTest`
Erwartet: PASS.

- [ ] **Schritt 6: Ganzen Backend-Build übersetzen**

Run: `cd backend && ./mvnw -q compile`
Erwartet: BUILD SUCCESS. `RoundCountersDto.clarification` hat **keinen** Vorgabewert — wo der Compiler jetzt meckert, fehlt ein benannter Parameter; ergänze ihn dort mit dem passenden `count`.

- [ ] **Schritt 7: Commit**

```bash
git add backend/src/main/kotlin/de/lambda9/ready2race/backend/app/matchStatus backend/src/test/kotlin/de/lambda9/ready2race/backend/app/matchStatus
git commit -m "Klärung: eigener Zähler und Grund im MatchStatus"
```

---

### Task 4: Die Spalten lesen und ins Dashboard-DTO bringen

**Files:**
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/liveDashboard/control/LiveDashboardRepo.kt:22-30`
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/liveDashboard/boundary/LiveDashboardService.kt:250-300`
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/liveDashboard/entity/LiveDashboardDto.kt` (`LiveDashboardMatchDto`)
- Modify: `backend/src/main/resources/db/migration/afterMigrate.sql` (View `competition_match_with_teams`, ~Zeile 882)
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/competitionExecution/entity/CompetitionMatchWithTeams.kt`
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/competitionExecution/control/Conversions.kt` (zweimal: `CompetitionMatchWithTeams(...)` ~Zeile 194 und `MatchStatusLogic.matchStatus(...)` ~Zeile 135)

**Interfaces:**
- Consumes: die jOOQ-Spalten aus Task 1, `matchStatus(...)` aus Task 3.
- Produces: `LiveDashboardMatchDto.clarificationSince: LocalDateTime?` und `.clarificationReason: String?`; die Durchführungsseite liefert `status.state == CLARIFICATION` samt Grund.

- [ ] **Schritt 1: Felder auf `LiveDashboardMatchDto`**

In `LiveDashboardDto.kt`, in `data class LiveDashboardMatchDto` nach `startedAt`:

```kotlin
    /**
     * Seit wann dieser Lauf in Klärung ist - null, wenn er es nicht ist. Die Karte zeigt daraus
     * das "seit 14:37" der eingeklappten Zeile; über den Zustand entscheidet [state], das
     * dieselbe Spalte bereits verrechnet hat.
     */
    val clarificationSince: LocalDateTime? = null,
    /** Der Grund, den die Schiedsrichter beim Setzen eingetippt haben. */
    val clarificationReason: String? = null,
```

- [ ] **Schritt 2: Spalten in `LiveDashboardRepo.getMatches` mitlesen**

Nach `COMPETITION_MATCH.FINISHED_AT,` einfügen:

```kotlin
            COMPETITION_MATCH.CLARIFICATION_SINCE,
            COMPETITION_MATCH.CLARIFICATION_REASON,
```

- [ ] **Schritt 3: In `buildMatchDto` verwenden**

In `LiveDashboardService.kt`, im Block `buildMatchDto`, nach `val activatedAt = match[COMPETITION_MATCH.ACTIVATED_AT]`:

```kotlin
                val clarificationSince = match[COMPETITION_MATCH.CLARIFICATION_SINCE]
```

Im `deriveMatchState(...)`-Aufruf nach `skipped = matchId in skippedMatchIds,`:

```kotlin
                            clarificationSince = clarificationSince,
```

Und im `LiveDashboardMatchDto(...)`-Aufruf nach `startedAt = startedAt,`:

```kotlin
                        clarificationSince = clarificationSince,
                        clarificationReason = match[COMPETITION_MATCH.CLARIFICATION_REASON],
```

- [ ] **Schritt 4: Durchführungsseite versorgen**

Die Durchführungsseite liest **nicht** über eine Kotlin-Abfrage, sondern über die Datenbank-View
`competition_match_with_teams` in `afterMigrate.sql` (~Zeile 882). Drei Stellen, in dieser
Reihenfolge:

**(a)** In `afterMigrate.sql`, in der View `competition_match_with_teams`, nach
`cm.pairings_recalculated_at,`:

```sql
       -- Klärung (V202608171200): funktional abhängig vom Primärschlüssel
       -- cm.competition_setup_match, deshalb ohne eigenen group-by-Eintrag zulässig - wie
       -- bye_must_race darüber. Die Durchführungsseite leitet daraus denselben Lauf-Zustand ab
       -- wie das Schiedsrichter-Dashboard; ohne diese beiden Spalten stünde dort weiter "Läuft".
       cm.clarification_since,
       cm.clarification_reason,
```

**(b)** In `CompetitionMatchWithTeams.kt` zwei Felder ergänzen, benannt wie überall sonst:

```kotlin
    val clarificationSince: LocalDateTime?,
    val clarificationReason: String?,
```

**(c)** In `Conversions.kt` im `CompetitionMatchWithTeams(...)`-Aufruf (~Zeile 194) nach
`pairingsRecalculatedAt = match.pairingsRecalculatedAt,`:

```kotlin
                clarificationSince = match.clarificationSince,
                clarificationReason = match.clarificationReason,
```

**Nicht** anfassen: `CompetitionMatchRepo.getMatchesByEvent` (~Zeile 480-530). Die Abfrage liefert
`MatchForRunningStatusDto` an den internen Endpunkt `GET /event/{eventId}/matches?activated=`
(Recht `ReadEventGlobal`) und hat mit der Durchführungsseite nichts zu tun.

Danach in `Conversions.kt` im `MatchStatusLogic.matchStatus(...)`-Aufruf (~Zeile 135) nach `bye = byeByMatch[match.second.id],`:

```kotlin
                            clarificationSince = match.first.clarificationSince,
                            clarificationReason = match.first.clarificationReason,
```

- [ ] **Schritt 5: Übersetzen**

Run: `cd backend && ./mvnw -q compile`
Erwartet: BUILD SUCCESS. Meckert der Compiler über `match.first.clarificationSince`, fehlt das Feld im Zwischen-Entity aus Schritt 4 — dort nachtragen, nicht am Aufruf herumbiegen.

- [ ] **Schritt 6: Alle Backend-Tests**

Run: `cd backend && ./mvnw test`
Erwartet: PASS (die DB-Tests brauchen Docker, siehe Task 1 Schritt 3).

- [ ] **Schritt 7: Commit**

```bash
git add backend/src/main/kotlin
git commit -m "Klärung: Spalten in Dashboard und Durchführung durchgereicht"
```

---

### Task 5: Die öffentlichen Anzeigen verlieren den Lauf

**Files:**
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/competitionExecution/control/CompetitionMatchRepo.kt:364` (`getRunningMatches`)
- Test: `backend/src/test/kotlin/de/lambda9/ready2race/backend/app/eventInfo/BoardLogicTest.kt`

**Interfaces:**
- Consumes: die Spalten aus Task 1, den Enum-Wert aus Task 2.
- Produces: nichts Neues — `getRunningMatches` liefert Läufe in Klärung schlicht nicht mehr.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Ans Ende von `BoardLogicTest.kt` anfügen (die Hilfen `match(...)`, `result(...)`, `upcoming`, `results` stehen oben in der Datei; `match(...)` setzt `state = MatchState.RUNNING`):

```kotlin
    @Test
    fun aMatchInClarificationNoLongerHoldsTheCursor() {
        // Der eigentliche Zweck des Zustands: Der strittige Lauf fällt in getRunningMatches per
        // SQL aus dem Running-Block heraus - hier nachgestellt, indem er in der Liste fehlt. Der
        // Cursor rückt auf den nächsten Lauf, und Slot -1 zeigt wieder Ergebnisse statt des
        // hängenden Rennens.
        val ohneStrittigen = listOf(match("R-spät"))
        assertEquals(
            "R-spät",
            BoardLogic.resolveOffset(0, ohneStrittigen, upcoming, results).match?.competitionName,
        )
        assertEquals(
            "E-neu",
            BoardLogic.resolveOffset(-1, ohneStrittigen, upcoming, results).result?.competitionName,
        )
    }

    @Test
    fun withoutAnyRunningMatchSlotZeroStaysEmptyForTheStreamTile() {
        // Ist der strittige Lauf der einzige aktive, bleibt Slot 0 leer - die Stream-Kachel fällt
        // im Auto-Modus auf das jüngste Ergebnis zurück, statt eine Uhr ins Endlose zählen zu
        // lassen. Genau das ist gewollt.
        val slot0 = BoardLogic.resolveOffset(0, emptyList(), upcoming, results)
        assertNull(slot0.match)
    }
```

Fehlt `assertNull` im Import-Block der Datei, ergänze `import kotlin.test.assertNull`.

- [ ] **Schritt 2: Test laufen lassen**

Run: `cd backend && ./mvnw test -Dtest=BoardLogicTest`
Erwartet: PASS oder FAIL — beides ist in Ordnung. Diese beiden Tests halten das gewünschte Verhalten von `resolveOffset` fest, das bereits stimmt; sie sind der Riegel dagegen, dass ein späterer Umbau des Cursors die Klärung wieder blockierend macht. Schlagen sie fehl, stimmt die Annahme aus der Spec nicht — **halte an und melde das**, statt `resolveOffset` umzubauen.

- [ ] **Schritt 3: Den SQL-Filter setzen**

In `CompetitionMatchRepo.getRunningMatches`, direkt nach `.and(COMPETITION_MATCH.ACTIVATED_AT.isNotNull)`:

```kotlin
            // Ein Lauf in Klärung bleibt aktiviert (activated_at wird nicht angefasst), gehört aber
            // nicht mehr in den Running-Block: Sonst hielte er über BoardLogic.cursorIndex den
            // Cursor fest, und Stream-Uhr, Lower-Third und Athleten-Anzeige rückten nicht nach.
            // Aus getUpcomingMatchesForBoard fällt er ohnehin heraus (die Abfrage verlangt
            // activated_at is null) - er kommt also auch nicht als "als nächstes" zurück.
            .and(COMPETITION_MATCH.CLARIFICATION_SINCE.isNull)
```

**Nicht anfassen:**
- die Abfragen in `raceclocker/control/RaceClockerPollRepo.kt` — die Zeitnahme muss den Lauf weiter finden, Zeiten und Strafen laufen während der Klärung weiter ein;
- `CompetitionMatchRepo.getMatchesByEvent` (~480–530). Sie liefert `MatchForRunningStatusDto` an den internen Endpunkt `GET /event/{eventId}/matches?activated=` (Recht `ReadEventGlobal`) und ist keine öffentliche Anzeige. Ein Filter dort änderte still die Bedeutung einer Verwaltungsabfrage.

- [ ] **Schritt 4: Prüfen, dass der Filter nur an einer Stelle steht**

Run: `grep -rn "CLARIFICATION_SINCE" backend/src/main/kotlin/de/lambda9/ready2race/backend/app/competitionExecution/control/CompetitionMatchRepo.kt`
Erwartet: **genau ein** Treffer — die Zeile aus Schritt 3 in `getRunningMatches`. Mehr Treffer heißen, der Filter sitzt auch in einer Abfrage, die ihn nicht bekommen darf.

Run: `grep -rn "CLARIFICATION_SINCE" backend/src/main/kotlin/de/lambda9/ready2race/backend/app/raceclocker/`
Erwartet: kein Treffer.

- [ ] **Schritt 5: Tests**

Run: `cd backend && ./mvnw test -Dtest=BoardLogicTest`
Erwartet: PASS.

- [ ] **Schritt 6: Commit**

```bash
git add backend/src/main/kotlin/de/lambda9/ready2race/backend/app/competitionExecution/control/CompetitionMatchRepo.kt backend/src/test/kotlin/de/lambda9/ready2race/backend/app/eventInfo/BoardLogicTest.kt
git commit -m "Klärung: strittige Läufe fallen aus dem Running-Block"
```

---

### Task 6: Die Kette geht über einen Lauf in Klärung hinweg

**Files:**
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/eventSchedule/boundary/ScheduleChain.kt` (`ChainSlot`, `decideNext`, `buildChainSlots` ~Zeile 186)
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/eventSchedule/control/EventScheduleRepo.kt:307` (Auswahl für die Kette)
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/eventSchedule/boundary/EventScheduleService.kt:78,96`
- Test: `backend/src/test/kotlin/de/lambda9/ready2race/backend/app/eventSchedule/ScheduleChainTest.kt`

**Interfaces:**
- Consumes: die Spalten aus Task 1.
- Produces: `ChainSlot.matchInClarification: Boolean = false` — letzter Parameter mit Vorgabewert, damit die bestehenden Testaufrufe unverändert übersetzen.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

In `ScheduleChainTest.kt` die Hilfe `slot(...)` um einen Parameter erweitern (am Ende, mit Vorgabewert):

```kotlin
    private fun slot(
        min: Long,
        state: de.lambda9.ready2race.backend.app.eventSchedule.entity.EventScheduleSlotState,
        matchId: UUID? = null,
        finished: Boolean = false,
        open: Boolean = true,
        activatedAt: LocalDateTime? = null,
        startedAt: LocalDateTime? = null,
        inClarification: Boolean = false,
    ) = ChainSlot(
        UUID.randomUUID(), base.plusMinutes(min), state, matchId, finished, open, activatedAt, startedAt,
        inClarification,
    )
```

und die Tests anfügen:

```kotlin
    @Test
    fun aMatchInClarificationDoesNotHoldTheNextStartGroup() {
        // Der strittige Lauf ist gefahren (started_at gesetzt) und nicht beendet. Ohne diesen Fall
        // stünde er als "pending" in seiner Gruppe, sein Ist-Start bliebe der Riegel, und die
        // nächste Startgruppe käme nie an die Reihe - ein Einspruch hielte die ganze Regatta an.
        val naechster = UUID.randomUUID()
        val decision = ScheduleChain.decideNext(
            listOf(
                slot(
                    10, LINKED, UUID.randomUUID(),
                    activatedAt = base, startedAt = base.plusMinutes(1), inClarification = true,
                ),
                slot(20, LINKED, naechster),
            )
        )
        assertEquals(ChainDecision.Activate(listOf(naechster)), decision)
    }

    @Test
    fun aMatchInClarificationIsNotActivatedAgain() {
        // Er ist erledigt für die Kette - nicht ihr nächster Auftrag. Ohne die Filterung stünde er
        // als "aktivierbar" da, sobald jemand die Aktivierung zurückgenommen hätte.
        val decision = ScheduleChain.decideNext(
            listOf(slot(10, LINKED, UUID.randomUUID(), inClarification = true))
        )
        assertIs<ChainDecision.NothingToDo>(decision)
    }
```

- [ ] **Schritt 2: Test laufen lassen und Fehlschlag prüfen**

Run: `cd backend && ./mvnw test -Dtest=ScheduleChainTest`
Erwartet: Übersetzungsfehler — `ChainSlot` hat keinen neunten Parameter.

- [ ] **Schritt 3: `ChainSlot` erweitern**

In `ScheduleChain.kt`, in `data class ChainSlot` ans Ende:

```kotlin
    /**
     * `competition_match.clarification_since is not null`: Gegen diesen Lauf läuft ein Einspruch,
     * die Schiedsrichter geben ihn noch nicht frei. Für die Kette zählt er wie ein erledigter -
     * er hält niemanden mehr auf. Ohne diesen Ausweg blockierte ein Streit, der VOR der
     * vollständigen Wertung ausbricht, die ganze folgende Startgruppe: der Lauf bliebe offen
     * ([matchOpen]) und sein Ist-Start ([matchStartedAt]) der Riegel.
     */
    val matchInClarification: Boolean = false,
```

- [ ] **Schritt 4: `decideNext` anpassen**

In `ScheduleChain.decideNext` den `pending`-Filter ergänzen:

```kotlin
            // Alles, was in dieser Gruppe noch aussteht. Ein beendeter, durchgewerteter oder in
            // Klärung stehender Lauf gehört nicht dazu - er hält niemanden mehr auf.
            val pending = group.filter {
                it.state == EventScheduleSlotState.LINKED &&
                    !it.matchFinished &&
                    it.matchOpen &&
                    !it.matchInClarification
            }
```

- [ ] **Schritt 5: Test laufen lassen**

Run: `cd backend && ./mvnw test -Dtest=ScheduleChainTest`
Erwartet: PASS.

- [ ] **Schritt 6: Die Spalte in die Kette einspeisen**

In `EventScheduleRepo.kt` bei der Auswahl mit `COMPETITION_MATCH.ACTIVATED_AT.as("match_activated_at")` (~Zeile 307) ergänzen:

```kotlin
            COMPETITION_MATCH.CLARIFICATION_SINCE.`as`("match_clarification_since"),
```

Dieselbe Spalte in der Auswahl bei Zeile ~203 ergänzen, falls `buildChainSlots` von dort liest — prüfe mit:

Run: `grep -rn "buildChainSlots" -A 25 backend/src/main/kotlin/de/lambda9/ready2race/backend/app/eventSchedule/boundary/ScheduleChain.kt | head -40`

In `ScheduleChain.kt:186` und `EventScheduleService.kt:78` bzw. `:96` beim Bau der `ChainSlot`s ergänzen (die Form richtet sich danach, ob dort mit typisierter Spalte oder mit `r.get("...")` gelesen wird — beide Formen stehen schon nebeneinander in der Datei, nimm die des jeweiligen Blocks):

```kotlin
                    matchInClarification = r[COMPETITION_MATCH.CLARIFICATION_SINCE] != null,
```

bzw.

```kotlin
                    matchInClarification = r.get("match_clarification_since", java.time.LocalDateTime::class.java) != null,
```

- [ ] **Schritt 7: Übersetzen und alle Tests**

Run: `cd backend && ./mvnw test`
Erwartet: BUILD SUCCESS.

- [ ] **Schritt 8: Commit**

```bash
git add backend/src/main/kotlin/de/lambda9/ready2race/backend/app/eventSchedule backend/src/test/kotlin/de/lambda9/ready2race/backend/app/eventSchedule/ScheduleChainTest.kt
git commit -m "Klärung: die Kette geht über strittige Läufe hinweg"
```

---

### Task 7: Setzen, Aufheben, Beenden

**Files:**
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/liveDashboard/entity/MatchClarificationRequest.kt`
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/liveDashboard/boundary/LiveDashboardService.kt`
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/liveDashboard/boundary/liveDashboard.kt`
- Modify: `backend/src/main/resources/openapi/documentation.yaml`
- Create: `backend/src/test/kotlin/de/lambda9/ready2race/backend/app/liveDashboard/MatchClarificationTest.kt`

**Interfaces:**
- Consumes: `LiveDashboardMatchDto.clarificationSince/-Reason` aus Task 4.
- Produces:
  - `LiveDashboardService.setMatchClarification(eventId: UUID, matchId: UUID, request: MatchClarificationRequest, userId: UUID): App<LiveDashboardError, ApiResponse.NoData>`
  - `LiveDashboardService.clearMatchClarification(eventId: UUID, matchId: UUID, userId: UUID): App<LiveDashboardError, ApiResponse.NoData>`
  - Routen `PUT`/`DELETE` auf `/event/{eventId}/live-dashboard/match/{matchId}/clarification`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Neue Datei `backend/src/test/kotlin/de/lambda9/ready2race/backend/app/liveDashboard/MatchClarificationTest.kt`.

**Lies zuerst** `backend/src/test/kotlin/de/lambda9/ready2race/backend/app/liveDashboard/LiveDashboardClubChainTest.kt` (Kopf und ersten Test) und `backend/src/test/kotlin/de/lambda9/ready2race/backend/app/club/ClubChainFixture.kt` — daraus stammen `testComprehension`, `seedClubChain()` und `SeededClubChain` (Felder u. a. `eventId`, `matchId`). Übernimm die Import-Liste von dort; erfinde keine Hilfen.

```kotlin
package de.lambda9.ready2race.backend.app.liveDashboard

import de.lambda9.ready2race.backend.app.club.seedClubChain
import de.lambda9.ready2race.backend.app.liveDashboard.boundary.LiveDashboardService
import de.lambda9.ready2race.backend.app.liveDashboard.entity.LiveDashboardMatchState
import de.lambda9.ready2race.backend.app.liveDashboard.entity.LiveDashboardScope
import de.lambda9.ready2race.backend.app.liveDashboard.entity.MatchClarificationRequest
import de.lambda9.ready2race.testing.testComprehension
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Setzen, Nachschärfen, Aufheben - am echten Postgres, weil genau hier die Regel aus der Spec
 * hängt: `in Klärung ⇔ clarification_since is not null`. Ein Fehler sieht im Review harmlos aus
 * (ein vergessenes `= null` beim Aufheben), steht aber am Regattatag als Lauf da, der für immer
 * "in Klärung" bleibt.
 */
class MatchClarificationTest {

    private val userId = UUID.randomUUID()

    @Test
    fun settingPutsTheMatchIntoClarificationAndKeepsItInTheRefereeScope() = testComprehension {
        val seeded = seedClubChain()

        !LiveDashboardService.setMatchClarification(
            seeded.eventId,
            seeded.matchId,
            MatchClarificationRequest(reason = "Einspruch RV Hansa, Bahnberührung"),
            userId,
        )

        val match = dashboardMatch(seeded.eventId, seeded.matchId)
        assertEquals(LiveDashboardMatchState.CLARIFICATION, match.state)
        assertEquals("Einspruch RV Hansa, Bahnberührung", match.clarificationReason)
        assertTrue(match.clarificationSince != null)
    }

    @Test
    fun settingTwiceSharpensTheReasonAndKeepsTheFirstTimestamp() = testComprehension {
        val seeded = seedClubChain()

        !LiveDashboardService.setMatchClarification(
            seeded.eventId, seeded.matchId, MatchClarificationRequest("Einspruch"), userId,
        )
        val zuerst = dashboardMatch(seeded.eventId, seeded.matchId).clarificationSince

        !LiveDashboardService.setMatchClarification(
            seeded.eventId, seeded.matchId, MatchClarificationRequest("Einspruch, Bahnberührung"), userId,
        )
        val danach = dashboardMatch(seeded.eventId, seeded.matchId)

        assertEquals(zuerst, danach.clarificationSince)
        assertEquals("Einspruch, Bahnberührung", danach.clarificationReason)
    }

    @Test
    fun liftingEmptiesBothColumns() = testComprehension {
        val seeded = seedClubChain()

        !LiveDashboardService.setMatchClarification(
            seeded.eventId, seeded.matchId, MatchClarificationRequest("Einspruch"), userId,
        )
        !LiveDashboardService.clearMatchClarification(seeded.eventId, seeded.matchId, userId)

        val match = dashboardMatch(seeded.eventId, seeded.matchId)
        assertNull(match.clarificationSince)
        assertNull(match.clarificationReason)
    }
}
```

Die Hilfe `dashboardMatch` steht am Ende der Klasse. Sie ist die Entsprechung zu `boardTeam(...)`
in `LiveDashboardClubChainTest.kt:177`, nur eine Ebene höher (Lauf statt Boot) und mit
`LiveDashboardScope.ALL`, weil der Lauf in mehreren Zuständen gefunden werden muss:

```kotlin
    private fun TestComprehensionScope<JEnv>.dashboardMatch(
        eventId: UUID,
        matchId: UUID,
    ): LiveDashboardMatchDto {
        val dashboard = (!LiveDashboardService.getLiveDashboard(eventId, LiveDashboardScope.ALL, false)).dto
        return dashboard.matches.single { it.matchId == matchId }
    }
```

Dafür zusätzlich importieren: `de.lambda9.ready2race.backend.app.liveDashboard.entity.LiveDashboardMatchDto`,
`de.lambda9.ready2race.testing.kio.TestComprehensionScope` und den `JEnv`-Typ, den
`LiveDashboardClubChainTest.kt` in derselben Form importiert.

- [ ] **Schritt 2: Test laufen lassen und Fehlschlag prüfen**

Run: `cd backend && ./mvnw test -Dtest=MatchClarificationTest`
Erwartet: Übersetzungsfehler — `MatchClarificationRequest`, `setMatchClarification`, `clearMatchClarification` gibt es nicht.

- [ ] **Schritt 3: Den Request-Typ anlegen**

```kotlin
package de.lambda9.ready2race.backend.app.liveDashboard.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.backend.validation.validate
import de.lambda9.ready2race.backend.validation.validators.StringValidators.notBlank

/**
 * Ein Lauf wird in Klärung gesetzt. Mehr als den Grund gibt es nicht anzugeben - den Zeitpunkt
 * setzt der Server.
 *
 * [reason] ist Pflicht: hier durch den Validator, in der Datenbank noch einmal durch
 * `check (btrim(clarification_reason) <> '')`. Der Grund steht auf der eingeklappten Zeile im
 * Schiedsrichter-Dashboard - ohne ihn wüsste beim Schichtwechsel niemand mehr, worum gestritten
 * wird.
 */
data class MatchClarificationRequest(
    val reason: String,
) : Validatable {
    override fun validate(): ValidationResult = ValidationResult.allOf(
        this::reason validate notBlank,
    )

    companion object {
        val example
            get() = MatchClarificationRequest(
                reason = "Einspruch RV Hansa, Bahnberührung",
            )
    }
}
```

- [ ] **Schritt 4: Die beiden Service-Funktionen**

In `LiveDashboardService.kt`, neben `markMatchStarted` (dieselbe Bauform: Veranstaltung prüfen, `CompetitionMatchRepo.update`, `EventChangeMarker.bump`):

```kotlin
    /**
     * Setzt einen Lauf in Klärung - der Weg für einen Einspruch, der noch nicht entschieden ist.
     *
     * `activated_at` bleibt ausdrücklich stehen: Der Lauf ist weiter an den Start gerufen, und nach
     * dem Aufheben steht er ohne Zutun wieder auf RUNNING. Was sich ändert, ist allein der Zustand
     * ([LiveDashboardLogic.deriveMatchState] prüft die Klärung VOR der Aktivierung) - und damit,
     * dass die öffentlichen Anzeigen und die Kette ihn loslassen.
     *
     * Ein zweiter Aufruf schärft nur den Grund nach; [clarificationSince] bleibt der erste
     * Zeitpunkt, denn das "seit 14:37" der Zeile meint den Beginn des Streits, nicht die letzte
     * Formulierung.
     */
    fun setMatchClarification(
        eventId: UUID,
        matchId: UUID,
        request: MatchClarificationRequest,
        userId: UUID,
    ): App<LiveDashboardError, ApiResponse.NoData> = KIO.comprehension {
        val exists = !EventRepo.exists(eventId).orDie()
        if (!exists) {
            return@comprehension KIO.fail(LiveDashboardError.EventNotFound(eventId))
        }

        !CompetitionMatchRepo.update(matchId) {
            if (clarificationSince == null) {
                clarificationSince = LocalDateTime.now()
            }
            clarificationReason = request.reason.trim()
            updatedBy = userId
            updatedAt = LocalDateTime.now()
        }.orDie()

        // Der strittige Lauf soll sofort von den Anzeigen verschwinden, nicht erst nach Ablauf der
        // Cache-TTL - genau darauf wartet die Regie am Stream.
        EventChangeMarker.bump(eventId)

        noData
    }

    /**
     * Hebt die Klärung auf: beide Spalten werden geleert, der Lauf ist wieder das, was er vorher
     * war (in aller Regel RUNNING). Es bleibt keine Spur zurück - eine Historie führt diese
     * Tabelle bewusst nicht (Entscheidung vom 17.08.2026); wer den Fall dokumentieren will, nutzt
     * die Schiedsrichter-Notizen am Boot.
     */
    fun clearMatchClarification(
        eventId: UUID,
        matchId: UUID,
        userId: UUID,
    ): App<LiveDashboardError, ApiResponse.NoData> = KIO.comprehension {
        val exists = !EventRepo.exists(eventId).orDie()
        if (!exists) {
            return@comprehension KIO.fail(LiveDashboardError.EventNotFound(eventId))
        }

        !CompetitionMatchRepo.update(matchId) {
            clarificationSince = null
            clarificationReason = null
            updatedBy = userId
            updatedAt = LocalDateTime.now()
        }.orDie()

        EventChangeMarker.bump(eventId)

        noData
    }
```

Der Import `de.lambda9.ready2race.backend.app.liveDashboard.entity.MatchClarificationRequest` muss oben ergänzt werden.

- [ ] **Schritt 5: Beenden leert den Merker**

In `finishMatchInternal` dort, wo `finishedAt` gesetzt wird (suche mit `grep -n "finishedAt = " backend/src/main/kotlin/de/lambda9/ready2race/backend/app/liveDashboard/boundary/LiveDashboardService.kt`), im selben `update`-Block ergänzen:

```kotlin
            // Beenden IST die Freigabe - kein zweiter Klick. Ohne dieses Leeren bliebe der Merker
            // stehen; der Zustand wäre zwar FINISHED (finishedAt schlägt die Klärung), aber jede
            // Abfrage, die auf clarification_since filtert, verlöre den Lauf dauerhaft.
            clarificationSince = null
            clarificationReason = null
```

- [ ] **Schritt 6: Die Routen**

In `liveDashboard.kt`, innerhalb von `route("/match/{matchId}")` neben `/finish`:

```kotlin
        // Ein Lauf in Klärung: Einspruch läuft, die Schiedsrichter geben ihn noch nicht frei. Er
        // verschwindet damit aus den öffentlichen Anzeigen und aus der Kette, bleibt aber auf dem
        // Dashboard.
        //
        // authenticateAny statt authenticate: Dieselbe Handlung gibt es auf zwei Oberflächen mit
        // zwei verschiedenen Rechten - Dashboard (UpdateLiveDashboardGlobal) und
        // Durchführungsseite (UpdateEventGlobal). Ein eigenes Privileg wäre der dritte Schlüssel
        // für dieselbe Tür.
        route("/clarification") {
            put {
                call.respondComprehension {
                    val user = !authenticateAny(
                        Privilege.UpdateLiveDashboardGlobal,
                        Privilege.UpdateEventGlobal,
                    )
                    val eventId = !pathParam("eventId", uuid)
                    val matchId = !pathParam("matchId", uuid)
                    val body = !receiveKIO(MatchClarificationRequest.example)

                    LiveDashboardService.setMatchClarification(eventId, matchId, body, user.id!!)
                }
            }

            delete {
                call.respondComprehension {
                    val user = !authenticateAny(
                        Privilege.UpdateLiveDashboardGlobal,
                        Privilege.UpdateEventGlobal,
                    )
                    val eventId = !pathParam("eventId", uuid)
                    val matchId = !pathParam("matchId", uuid)

                    LiveDashboardService.clearMatchClarification(eventId, matchId, user.id!!)
                }
            }
        }
```

Imports ergänzen: `de.lambda9.ready2race.backend.calls.requests.authenticateAny` und `de.lambda9.ready2race.backend.app.liveDashboard.entity.MatchClarificationRequest`.

- [ ] **Schritt 7: Tests laufen lassen**

Run: `cd backend && ./mvnw test -Dtest=MatchClarificationTest`
Erwartet: PASS, alle drei Tests.

- [ ] **Schritt 8: OpenAPI von Hand pflegen**

In `backend/src/main/resources/openapi/documentation.yaml`:

1. `LiveDashboardMatchState` (Zeile ~16616): `- CLARIFICATION` an die `enum`-Liste anfügen und die Beschreibung um einen Absatz ergänzen:

```yaml
        CLARIFICATION: an objection is being settled. The match stays activated and unfinished, but
        drops out of the public displays and out of the activation chain - a single disputed match
        must not hold the livestream clock or the next start group.
```

2. `MatchStatusDto` (Zeile ~17283 ff.): Feld `clarificationReason` (`type: string`, `nullable: true`) mit einer Zeile Beschreibung.
3. `LiveDashboardMatchDto` (~14102): Felder `clarificationSince` (`type: string`, `format: date-time`, `nullable: true`) und `clarificationReason`.
4. `RoundCountersDto`: Feld `clarification` (`type: integer`), **required** wie die übrigen Zähler.
5. Neues Schema `MatchClarificationRequest` mit Pflichtfeld `reason` (`type: string`).
6. Pfad `/event/{eventId}/live-dashboard/match/{matchId}/clarification` mit `put` (Body `MatchClarificationRequest`, `operationId: setMatchClarification`) und `delete` (`operationId: clearMatchClarification`), beide mit denselben Parametern und Antworten wie der Nachbarpfad `/finish` (dessen `operationId` ist `finishLiveDashboardMatch`, Zeile ~7255) — kopiere dessen Block als Vorlage. Die beiden Operation-IDs sind bindend: Task 10 ruft die gleichnamigen SDK-Funktionen auf.

- [ ] **Schritt 9: Prüfen, dass die YAML gültig ist**

Run: `cd frontend && npm run generate`
Erwartet: Lauf ohne Fehler; `git diff --stat frontend/src/api` zeigt Änderungen an `types.gen.ts` und `sdk.gen.ts`.

Run: `grep -n "CLARIFICATION" frontend/src/api/types.gen.ts | head`
Erwartet: der neue Wert steht in `LiveDashboardMatchState`.

- [ ] **Schritt 10: Commit**

```bash
git add backend/src/main backend/src/test frontend/src/api
git commit -m "Klärung: Setzen und Aufheben über die API"
```

---

### Task 8: Das Ergebnis-Flag „vorläufig"

**Files:**
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/eventInfo/entity/LatestMatchResultInfo.kt`
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/eventInfo/entity/AthleteBoardDto.kt` (`AthleteBoardResult`)
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/eventInfo/control/Conversions.kt` (`toAthleteBoardResult`, ~Zeile 226)
- Modify: die Abfrage hinter `getMatchResults` (suchen, siehe Schritt 2)
- Modify: `backend/src/main/resources/openapi/documentation.yaml`

**Interfaces:**
- Consumes: die Spalte `CLARIFICATION_SINCE` aus Task 1.
- Produces: `AthleteBoardResult.clarification: Boolean = false` — true, solange gegen diesen Lauf ein Einspruch läuft. Task 12 hängt die Anzeige daran.

- [ ] **Schritt 1: Feld auf beiden Typen**

In `LatestMatchResultInfo.kt`, in `data class LatestMatchResultInfo` nach `startedAt`:

```kotlin
    /**
     * Gegen diesen Lauf läuft ein Einspruch (`competition_match.clarification_since` gesetzt). Das
     * Ergebnis geht trotzdem nach der bestehenden Freigaberegel raus - es wird nur als vorläufig
     * ausgewiesen (Entscheidung vom 17.08.2026). `PublicResultsVisibility` bleibt unberührt.
     */
    val clarification: Boolean = false,
```

In `AthleteBoardDto.kt`, in `data class AthleteBoardResult` an dieselbe Stelle dasselbe Feld mit demselben KDoc.

- [ ] **Schritt 2: Die Abfrage erweitern**

Die Abfrage ist `CompetitionMatchRepo.getMatchResults` in
`backend/src/main/kotlin/de/lambda9/ready2race/backend/app/competitionExecution/control/CompetitionMatchRepo.kt:197`
— nicht im `eventInfo`-Paket, wo die Umwandlung liegt.

Dort in der `select(...)`-Liste `COMPETITION_MATCH.CLARIFICATION_SINCE` ergänzen und beim Bau des `LatestMatchResultInfo` durchreichen:

```kotlin
            clarification = record[COMPETITION_MATCH.CLARIFICATION_SINCE] != null,
```

Wird das `LatestMatchResultInfo` an mehreren Stellen gebaut, versorge alle — der Vorgabewert `false` verbirgt sonst still, dass eine Anzeige die Klärung nicht kennt.

- [ ] **Schritt 3: In der Umwandlung durchreichen**

In `eventInfo/control/Conversions.kt`, in `LatestMatchResultInfo.toAthleteBoardResult(...)`:

```kotlin
    clarification = clarification,
```

- [ ] **Schritt 4: Übersetzen und Tests**

Run: `cd backend && ./mvnw clean test`
Erwartet: BUILD SUCCESS. `clean`, weil zwei geteilte data classes ein Feld bekommen — ein
inkrementeller Lauf wirft sonst irreführende `NoSuchMethodError` aus altem Testbytecode.

- [ ] **Schritt 5: OpenAPI und Typen**

In `documentation.yaml` das Feld `clarification` (`type: boolean`) am Schema `AthleteBoardResult` ergänzen, dann:

Run: `cd frontend && npm run generate`
Erwartet: `clarification` erscheint in `frontend/src/api/types.gen.ts` am Typ `AthleteBoardResult`.

- [ ] **Schritt 6: Commit**

```bash
git add backend/src/main frontend/src/api
git commit -m "Klärung: Ergebnisse tragen den Vorbehalt"
```

---

### Task 9: Chip, Zeitstrahl, Knopf-Logik im Frontend

**Files:**
- Modify: `frontend/src/components/event/match/matchStatusChip.ts`
- Modify: `frontend/src/components/event/schedule/timelineIndicator.ts`
- Modify: `frontend/src/components/event/liveDashboard/common.ts`
- Modify: `frontend/src/components/event/competition/excecution/roundDeletion.ts`
- Modify: `frontend/src/i18n/de/translations.json`, `frontend/src/i18n/en/translations.json`
- Test: `frontend/src/components/event/match/matchStatusChip.test.ts`, `frontend/src/components/event/schedule/timelineIndicator.test.ts`, `frontend/src/components/event/liveDashboard/common.test.ts`

**Interfaces:**
- Consumes: `LiveDashboardMatchState` mit `CLARIFICATION` und `MatchStatusDto.clarificationReason` aus den generierten Typen (Task 7).
- Produces:
  - `matchControls(match, mayFinish, mayControl)` liefert zusätzlich `showClarify: boolean` und `showResolveClarification: boolean`
  - `clarificationMatches(matches)` und `liveMatches(matches)` (letztere **ohne** die Läufe in Klärung) — Task 10 baut die Spalten darauf
  - i18n-Schlüssel `event.match.status.clarification`, `event.match.status.counter.clarification`, `event.liveDashboard.clarification.*`

- [ ] **Schritt 1: Die fehlschlagenden Tests schreiben**

In `matchStatusChip.test.ts`:

```typescript
    it('zeigt einen Lauf in Klärung als eigenen Chip', () => {
        // Er darf nicht in den Zweigen darunter landen: "Läuft" wäre falsch (niemand fährt mehr),
        // "Wartet auf Beenden" verschweigt, worauf gewartet wird.
        expect(matchStatusChip(status({state: 'CLARIFICATION'}), null, new Date())).toEqual({
            labelKey: 'event.match.status.clarification',
            color: 'warning',
        })
    })

    it('lässt die Klärung vor dem Freilos-Chip greifen', () => {
        // Auch ein Freilos kann strittig sein - dann ist die Klärung die Aussage, nicht "offen".
        const chip = matchStatusChip(
            status({state: 'CLARIFICATION', bye: {cause: 'NO_OPPONENT', mustRace: false}}),
            null,
            new Date(),
        )
        expect(chip.labelKey).toBe('event.match.status.clarification')
    })
```

Die Hilfe `status({...})` steht oben in der Datei; ihr `bye`-Feld muss ggf. die vollständige Form haben — sieh dir den bestehenden Test `'... bye ...'` in derselben Datei an und übernimm die dortige Objektform.

In `timelineIndicator.test.ts`:

```typescript
    it('gibt der Klärung ein eigenes Aussehen auf dem Balken', () => {
        expect(dashboardMatchState(match({state: 'CLARIFICATION'}))).toBe('clarification')
    })
```

In `common.test.ts`:

```typescript
    it('nimmt einen Lauf in Klärung aus der Live-Liste und sammelt ihn getrennt', () => {
        const strittig = match({matchId: 'strittig', state: 'CLARIFICATION'})
        const laeuft = match({matchId: 'laeuft', state: 'RUNNING'})
        expect(liveMatches([laeuft, strittig])).toEqual([laeuft])
        expect(clarificationMatches([laeuft, strittig])).toEqual([strittig])
    })

    it('bietet bei Klärung Beenden und Aufheben an, aber kein Aktivieren', () => {
        expect(matchControls(match({state: 'CLARIFICATION'}), true, true)).toEqual({
            showFinish: true,
            showActivationToggle: false,
            showMarkStarted: false,
            showClarify: false,
            showResolveClarification: true,
        })
    })

    it('bietet Klärung nur bei einem Lauf an, der auch läuft', () => {
        expect(matchControls(match({state: 'RUNNING'}), true, true).showClarify).toBe(true)
        expect(matchControls(match({state: 'UPCOMING'}), true, true).showClarify).toBe(false)
        // Ohne Steuerungsrecht gar nichts.
        expect(matchControls(match({state: 'RUNNING'}), false, false).showClarify).toBe(false)
    })
```

**Achtung:** Die bestehenden `matchControls`-Tests in dieser Datei vergleichen mit `toEqual` auf das ganze Objekt — sie schlagen durch die zwei neuen Felder fehl. Ergänze in **jedem** dieser Tests die beiden neuen Schlüssel mit dem richtigen Wert; das ist Absicht und kein Kollateralschaden: Der Test soll die vollständige Aussage prüfen.

- [ ] **Schritt 2: Tests laufen lassen und Fehlschlag prüfen**

Run: `cd frontend && npm test`
Erwartet: FAIL in den drei Dateien — `clarificationMatches` gibt es nicht, `showClarify` fehlt, der Chip fällt in einen falschen Zweig.

- [ ] **Schritt 3: Chip**

In `matchStatusChip.ts`, **vor** dem `bye`-Zweig und vor `FINISHED` (also direkt nach dem `RUNNING`-Block):

```typescript
    // Vor dem Freilos-Zweig und vor allen Ablesungen: Läuft gegen den Lauf ein Einspruch, ist das
    // die Aussage - auch bei einem Freilos, das strittig geworden ist. „Läuft" wäre falsch
    // (niemand fährt mehr), „Wartet auf Beenden" verschweigt, worauf gewartet wird.
    if (status.state === 'CLARIFICATION') {
        return {labelKey: 'event.match.status.clarification', color: 'warning'}
    }
```

In `roundCounterChips` (~Zeile 260) einen Topf ergänzen — **direkt hinter dem `RUNNING`-Topf**,
damit die Leiste dieselbe Reihenfolge liest wie `MatchStatusLogic.roundCounters` im Backend. Die
Einträge dieser Liste haben drei Felder, `color` gehört dazu:

```typescript
        {
            n: count(s => s.state === 'CLARIFICATION'),
            labelKey: 'event.match.status.counter.clarification',
            color: 'warning',
        },
```

Töpfe ohne Läufe fallen ohnehin weg (`filter(bucket => bucket.n > 0)`), die Leiste wird also
nicht länger, solange nichts strittig ist.

- [ ] **Schritt 4: Zeitstrahl**

In `timelineIndicator.ts` in `dashboardMatchState` einen Fall ergänzen:

```typescript
        // Eigenes Aussehen, kein "läuft": Auf dem Balken soll ins Auge fallen, dass hier eine
        // Entscheidung aussteht - und zwar eine der Schiedsrichter, nicht des Büros.
        case 'CLARIFICATION':
            return 'clarification'
```

`TimelineEntryState` um `'clarification'` erweitern und dem neuen Wert in der Farbtabelle derselben Datei (der `switch` um Zeile 296) eine Farbe geben — dieselbe Warnfarbe wie `awaitingFinish`, aber unterscheidbar; sieh dir an, wie `awaitingFinish` dort gesetzt ist, und folge der Form.

- [ ] **Schritt 5: `common.ts`**

```typescript
/**
 * Die Läufe, die im Live-Tab stehen: die aktiven und die, die auf ihr Beenden warten.
 *
 * Ein Lauf in Klärung gehört ausdrücklich NICHT dazu, obwohl der Server ihn im LIVE-Ausschnitt
 * mitliefert (`LiveDashboardLogic.selectForScope`): Er steht darunter im eigenen, eingeklappten
 * Abschnitt. In voller Kartenhöhe zwischen den laufenden Rennen wäre er genau das, was dieser
 * Zustand abschaffen soll - ein Rennen, das den Blick festhält, obwohl nichts mehr passiert.
 */
export const isLiveMatch = (match: LiveDashboardMatchDto): boolean =>
    match.state === 'PREPARING' || match.state === 'RUNNING' || match.state === 'AWAITING_FINISH'

export const liveMatches = (matches: LiveDashboardMatchDto[]): LiveDashboardMatchDto[] =>
    matches.filter(isLiveMatch)

/** Die Läufe, gegen die ein Einspruch läuft - der eingeklappte Abschnitt unter der Live-Spalte. */
export const clarificationMatches = (
    matches: LiveDashboardMatchDto[],
): LiveDashboardMatchDto[] => matches.filter(match => match.state === 'CLARIFICATION')
```

und `matchControls`:

```typescript
export const matchControls = (
    match: LiveDashboardMatchDto,
    mayFinish: boolean,
    mayControl: boolean,
): {
    showFinish: boolean
    showActivationToggle: boolean
    showMarkStarted: boolean
    showClarify: boolean
    showResolveClarification: boolean
} => {
    if (match.state === 'SKIPPED') {
        return {
            showFinish: false,
            showActivationToggle: false,
            showMarkStarted: false,
            showClarify: false,
            showResolveClarification: false,
        }
    }
    // In Klärung: Beenden IST die Freigabe und bleibt der Hauptweg; "Aufheben" ist der Rückweg,
    // wenn der Einspruch zurückgezogen wird. Aktivieren wäre sinnlos (der Lauf ist aktiviert) und
    // "Läuft" eine Feststellung über ein Rennen, das längst im Ziel ist.
    if (match.state === 'CLARIFICATION') {
        return {
            showFinish: mayFinish,
            showActivationToggle: false,
            showMarkStarted: false,
            showClarify: false,
            showResolveClarification: mayControl,
        }
    }
    return {
        showFinish: mayFinish && isLiveMatch(match),
        showActivationToggle: mayControl && match.state !== 'AWAITING_FINISH',
        showMarkStarted: mayControl && match.state === 'PREPARING',
        // In Klärung setzen lohnt nur, wo der Lauf sonst die Anzeigen festhielte - also bei einem
        // aktivierten oder durchgewerteten Lauf. Ein anstehender Lauf blockiert niemanden.
        showClarify: mayControl && isLiveMatch(match),
        showResolveClarification: false,
    }
}
```

- [ ] **Schritt 6: `roundDeletion.ts`**

In der Bedingung um Zeile 26 den neuen Zustand aufnehmen:

```typescript
        match.status.state === 'AWAITING_FINISH' ||
        // Auch ein strittiger Lauf stand schon auf Anzeigen - er ist gefahren, nur nicht
        // freigegeben. Für die Warnung vor dem Löschen zählt er wie ein laufender.
        match.status.state === 'CLARIFICATION')
```

- [ ] **Schritt 7: Übersetzungen**

In `frontend/src/i18n/de/translations.json` unter `event.match.status`:

```json
        "clarification": "Klärung",
```

und unter `event.match.status.counter`:

```json
          "clarification": "{{n}} in Klärung",
```

In `frontend/src/i18n/en/translations.json` an denselben Stellen `"clarification": "Under review"` bzw. `"clarification": "{{n}} under review"`.

- [ ] **Schritt 8: Tests laufen lassen**

Run: `cd frontend && npm test`
Erwartet: PASS.

- [ ] **Schritt 9: Lint**

Run: `cd frontend && npm run lint`
Erwartet: keine neuen Fehler.

- [ ] **Schritt 10: Commit**

```bash
git add frontend/src
git commit -m "Klärung: Chip, Zeitstrahl und Knöpfe im Frontend"
```

---

### Task 10: Der eingeklappte Abschnitt im Schiedsrichter-Dashboard

**Files:**
- Create: `frontend/src/components/event/liveDashboard/ClarificationDialog.tsx`
- Create: `frontend/src/components/event/liveDashboard/ClarificationSection.tsx`
- Modify: `frontend/src/components/event/liveDashboard/LiveDashboardColumns.tsx`
- Modify: `frontend/src/components/event/liveDashboard/LiveDashboardMatchCard.tsx`
- Modify: `frontend/src/pages/event/LiveDashboardPage.tsx`
- Modify: `frontend/src/i18n/de/translations.json`, `frontend/src/i18n/en/translations.json`
- Test: `frontend/src/components/event/liveDashboard/common.test.ts`

**Interfaces:**
- Consumes: `clarificationMatches`, `matchControls` aus Task 9; die Endpoints aus Task 7 über den generierten SDK-Client.
- Produces: `LiveDashboardActions.onClarify?: (matchId: string, reason: string) => Promise<void>` und `onResolveClarification?: (matchId: string) => Promise<void>`.

- [ ] **Schritt 1: Der Dialog**

`ClarificationDialog.tsx` — MUI-Dialog mit einem Pflicht-Textfeld. Der Absenden-Knopf ist deaktiviert, solange `canSubmitNote(text)` false ist (die Regel steht schon in `common.ts` und ist dieselbe, die der Server prüft — wiederverwenden, nicht neu schreiben):

```tsx
import {useState} from 'react'
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    TextField,
} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {canSubmitNote} from './common.ts'

/**
 * Der Grund ist Pflicht — hier durch den deaktivierten Knopf, im Server durch den Validator und
 * in der Datenbank durch `check (btrim(clarification_reason) <> '')`. Der Knopf bietet nicht an,
 * was der Server ohnehin ablehnt; dieselbe Regel wie bei den Schiedsrichter-Notizen.
 */
const ClarificationDialog = ({
    open,
    onClose,
    onSubmit,
}: {
    open: boolean
    onClose: () => void
    onSubmit: (reason: string) => Promise<void>
}) => {
    const {t} = useTranslation()
    const [reason, setReason] = useState('')
    const [busy, setBusy] = useState(false)

    const close = () => {
        setReason('')
        onClose()
    }

    return (
        <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
            <DialogTitle>{t('event.liveDashboard.clarification.dialogTitle')}</DialogTitle>
            <DialogContent>
                <TextField
                    autoFocus
                    fullWidth
                    margin="dense"
                    label={t('event.liveDashboard.clarification.reasonLabel')}
                    placeholder={t('event.liveDashboard.clarification.reasonPlaceholder')}
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={close}>{t('common.cancel')}</Button>
                <Button
                    variant="contained"
                    disabled={!canSubmitNote(reason) || busy}
                    onClick={async () => {
                        setBusy(true)
                        try {
                            await onSubmit(reason.trim())
                            close()
                        } finally {
                            setBusy(false)
                        }
                    }}>
                    {t('event.liveDashboard.clarification.submit')}
                </Button>
            </DialogActions>
        </Dialog>
    )
}

export default ClarificationDialog
```

Den Schlüssel `common.cancel` vorher prüfen (`grep -n '"cancel"' frontend/src/i18n/de/translations.json`) und den tatsächlich vorhandenen verwenden.

- [ ] **Schritt 2: Der eingeklappte Abschnitt**

`ClarificationSection.tsx` — standardmäßig zu, Kopfzeile mit Anzahl, aufgeklappt **eine Zeile je Lauf**:

```tsx
import {useState} from 'react'
import {Box, Button, Collapse, Paper, Stack, Typography} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import {useTranslation} from 'react-i18next'
import {LiveDashboardMatchDto} from '@api/types.gen.ts'
import {LiveDashboardActions} from './LiveDashboardColumns.tsx'

/**
 * Läufe, gegen die ein Einspruch läuft — bewusst als Sammelzeile statt als Karten.
 *
 * In voller Kartenhöhe zwischen den laufenden Rennen wäre ein strittiger Lauf genau das, was
 * dieser Zustand abschaffen soll: etwas, das den Blick festhält, obwohl nichts mehr passiert.
 * Boote, Bedingungen und Crew stehen deshalb nicht hier — wer sie braucht, findet den Lauf in der
 * Gesamtliste rechts, wo er an seiner chronologischen Stelle mit dem Klärungs-Chip steht.
 */
const ClarificationSection = ({
    matches,
    actions,
}: {
    matches: LiveDashboardMatchDto[]
    actions: LiveDashboardActions
}) => {
    const {t} = useTranslation()
    const [open, setOpen] = useState(false)

    if (matches.length === 0) return null

    return (
        <Paper variant="outlined" sx={{p: 1}}>
            <Button
                fullWidth
                onClick={() => setOpen(o => !o)}
                endIcon={
                    <ExpandMoreIcon
                        sx={{transform: open ? 'rotate(180deg)' : 'none', transition: '0.2s'}}
                    />
                }
                sx={{justifyContent: 'space-between'}}>
                {t('event.liveDashboard.clarification.sectionTitle', {n: matches.length})}
            </Button>
            <Collapse in={open}>
                <Stack spacing={1} sx={{pt: 1}}>
                    {matches.map(match => (
                        <Box
                            key={match.matchId}
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                                flexWrap: 'wrap',
                            }}>
                            <Typography variant="body2" sx={{fontWeight: 600}}>
                                {[match.matchName, match.competitionShortName ?? match.competitionName]
                                    .filter(Boolean)
                                    .join(' · ')}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{flex: 1}}>
                                {match.clarificationReason}
                            </Typography>
                            {match.clarificationSince && (
                                <Typography variant="caption" color="text.secondary">
                                    {t('event.liveDashboard.clarification.since', {
                                        time: match.clarificationSince.slice(11, 16),
                                    })}
                                </Typography>
                            )}
                            {actions.onResolveClarification && (
                                <Button
                                    size="small"
                                    onClick={() =>
                                        actions.onResolveClarification?.(match.matchId)
                                    }>
                                    {t('event.liveDashboard.clarification.resolve')}
                                </Button>
                            )}
                        </Box>
                    ))}
                </Stack>
            </Collapse>
        </Paper>
    )
}

export default ClarificationSection
```

Das „Lauf beenden" der Zeile kommt aus dem bestehenden Beenden-Weg: Prüfe in `LiveDashboardMatchCard.tsx`, wie `onFinish` dort aufgerufen wird (es nimmt `openResults`), und biete in der Zeile denselben Aufruf mit `null` an, sofern `actions.onFinish` gesetzt ist.

- [ ] **Schritt 3: Handlungen durchreichen**

In `LiveDashboardColumns.tsx` den Typ `LiveDashboardActions` erweitern:

```typescript
    /** Setzt den Lauf in Klärung — der Grund ist Pflicht. */
    onClarify?: (matchId: string, reason: string) => Promise<void>
    /** Hebt die Klärung wieder auf; der Lauf ist danach wieder das, was er vorher war. */
    onResolveClarification?: (matchId: string) => Promise<void>
```

In `LiveColumn` unterhalb der Kartenliste den Abschnitt einhängen:

```tsx
            <ClarificationSection matches={clarificationMatches} actions={actions} />
```

und `clarificationMatches: LiveDashboardMatchDto[]` als Prop zu `LiveColumnProps` ergänzen, mit Kommentar:

```typescript
    /** Läufe mit laufendem Einspruch — eigener, eingeklappter Abschnitt unter den Karten. */
    clarificationMatches: LiveDashboardMatchDto[]
```

- [ ] **Schritt 4: Seite verdrahten**

In `LiveDashboardPage.tsx`:

- `clarificationMatches` aus `common.ts` importieren und neben `currentMatches` berechnen:

```typescript
    const matchesInClarification = clarificationMatches(filteredMatches)
```

- an `<LiveColumn ... clarificationMatches={matchesInClarification} />` durchreichen
- zwei Handler nach dem Muster von `handleMarkStarted` (Zeile ~474) anlegen:

```typescript
    /**
     * Setzt den Lauf in Klärung. Der Grund kommt aus dem Dialog und ist Pflicht — der Knopf dort
     * ist ohne Text deaktiviert, der Server lehnt ihn zusätzlich ab.
     */
    const handleClarify = async (matchId: string, reason: string) => {
        const {error} = await setMatchClarification({path: {eventId, matchId}, body: {reason}})
        if (error) {
            feedback.error(t('event.liveDashboard.control.error'))
        }
        dashboardData.reload()
    }

    /** Hebt die Klärung auf; der Lauf ist danach wieder das, was er vorher war. */
    const handleResolveClarification = async (matchId: string) => {
        const {error} = await clearMatchClarification({path: {eventId, matchId}})
        if (error) {
            feedback.error(t('event.liveDashboard.control.error'))
        }
        dashboardData.reload()
    }
```

`setMatchClarification` und `clearMatchClarification` aus `@api/sdk.gen.ts` importieren — dort, wo `startLiveDashboardMatch` bereits importiert wird.
- die Handler wie die anderen an `actions` hängen, ebenfalls hinter `!staleState.actionsLocked`:

```typescript
        onClarify: mayControl && !staleState.actionsLocked ? handleClarify : undefined,
        onResolveClarification:
            mayControl && !staleState.actionsLocked ? handleResolveClarification : undefined,
```

- den Dialog einmal auf Seitenebene rendern, mit `useState` für den gerade gewählten `matchId` — wie es die Seite für `selectedTeamRef` bereits tut.

- [ ] **Schritt 5: Knopf auf der Karte**

In `LiveDashboardMatchCard.tsx` dort, wo die anderen Knöpfe aus `matchControls` gerendert werden, ergänzen:

```tsx
                {controls.showClarify && onClarify && (
                    <Button size="small" color="warning" onClick={() => onClarify(match.matchId)}>
                        {t('event.liveDashboard.clarification.set')}
                    </Button>
                )}
```

Der Kartenknopf öffnet nur den Dialog (er reicht die `matchId` nach oben); abgeschickt wird auf Seitenebene. Passe die Prop-Signatur der Karte entsprechend an: `onClarify?: (matchId: string) => void`.

- [ ] **Schritt 6: Übersetzungen**

In `frontend/src/i18n/de/translations.json` unter `event.liveDashboard`:

```json
      "clarification": {
        "sectionTitle": "Klärung ({{n}})",
        "set": "In Klärung",
        "resolve": "Klärung aufheben",
        "dialogTitle": "Lauf in Klärung setzen",
        "reasonLabel": "Grund",
        "reasonPlaceholder": "Einspruch RV Hansa, Bahnberührung",
        "submit": "In Klärung setzen",
        "since": "seit {{time}}"
      },
```

Englisch entsprechend: `"Under review ({{n}})"`, `"Mark under review"`, `"Resolve"`, `"Put match under review"`, `"Reason"`, `"Objection, lane contact"`, `"Mark under review"`, `"since {{time}}"`.

- [ ] **Schritt 7: Tests und Lint**

Run: `cd frontend && npm test && npm run lint && npm run build`
Erwartet: alles grün; `npm run build` deckt Typfehler in den neuen Komponenten auf.

- [ ] **Schritt 8: Commit**

```bash
git add frontend/src
git commit -m "Klärung: eingeklappter Abschnitt im Schiedsrichter-Dashboard"
```

---

### Task 11: Der Knopf auf der Durchführungsseite

**Files:**
- Modify: `frontend/src/components/event/competition/excecution/CompetitionExecutionRound.tsx`

**Interfaces:**
- Consumes: `ClarificationDialog` aus Task 10, die Endpoints aus Task 7, `matchStatusChip` aus Task 9.
- Produces: nichts, was ein späterer Task liest.

- [ ] **Schritt 1: Den Knopf einhängen**

Am Laufkopf, dort wo die übrigen Lauf-Handlungen sitzen (suche nach `match.status.state === 'AWAITING_FINISH'`, Zeile ~707):

```tsx
                {match.status.state === 'CLARIFICATION' ? (
                    mayUpdate && (
                        <Button
                            size="small"
                            onClick={async () => {
                                const {error} = await clearMatchClarification({
                                    path: {eventId, matchId: match.id},
                                })
                                if (error) {
                                    feedback.error(t('event.liveDashboard.control.error'))
                                }
                                reload()
                            }}>
                            {t('event.liveDashboard.clarification.resolve')}
                        </Button>
                    )
                ) : (
                    mayUpdate &&
                    (match.status.state === 'RUNNING' ||
                        match.status.state === 'PREPARING' ||
                        match.status.state === 'AWAITING_FINISH') && (
                        <Button
                            size="small"
                            color="warning"
                            onClick={() => setClarifyingMatchId(match.id)}>
                            {t('event.liveDashboard.clarification.set')}
                        </Button>
                    )
                )}
```

Drei Namen musst du an die Datei anpassen, statt sie zu erfinden:

- `mayUpdate` — das Recht, das diese Seite für ihre schreibenden Knöpfe schon verwendet. Finde es mit `grep -n "checkPrivilege" frontend/src/components/event/competition/excecution/*.tsx` und nimm dasselbe (`updateEventGlobal`, passend zum `authenticateAny` aus Task 7).
- `match.id`, `eventId`, `reload()`, `feedback` — die in dieser Komponente vorhandenen Entsprechungen; sieh dir einen benachbarten schreibenden Knopf an.
- `setClarifyingMatchId` — ein `useState<string | null>(null)` in dieser Komponente, das denselben `ClarificationDialog` aus Task 10 speist; der Dialog wird einmal am Ende des Komponenten-JSX gerendert und ruft im `onSubmit` `setMatchClarification({path: {eventId, matchId}, body: {reason}})`.

- [ ] **Schritt 2: Chip prüfen**

Der Chip kommt aus `matchStatusChip` und zeigt nach Task 9 von selbst „Klärung" — hier ist nichts zu tun. Prüfe das, statt es zu wiederholen:

Run: `grep -n "matchStatusChip" frontend/src/components/event/competition/excecution/CompetitionExecutionRound.tsx`
Erwartet: mindestens ein Treffer.

- [ ] **Schritt 3: Bauen und lint**

Run: `cd frontend && npm run build && npm run lint`
Erwartet: grün.

- [ ] **Schritt 4: Commit**

```bash
git add frontend/src/components/event/competition/excecution/CompetitionExecutionRound.tsx
git commit -m "Klärung: Knopf auf der Durchführungsseite"
```

---

### Task 12: „Vorläufig" auf den Ergebnisanzeigen

**Files:**
- Modify: `frontend/src/components/event/info/athleteBoard/AthleteBoardResultCard.tsx`
- Modify: `frontend/src/components/event/board/streamOverlay/` (das Panel, das Ergebnisse zeigt — mit `grep -rn "AthleteBoardResult" frontend/src/components/event/board` finden)
- Modify: `frontend/src/i18n/de/translations.json`, `frontend/src/i18n/en/translations.json`
- Test: `frontend/src/components/event/board/streamOverlay.test.ts`

**Interfaces:**
- Consumes: `AthleteBoardResult.clarification` aus Task 8.
- Produces: nichts.

- [ ] **Schritt 1: Den Test schreiben**

In `streamOverlay.test.ts`:

```typescript
    it('lässt einen Lauf in Klärung das jüngste Ergebnis nicht verdrängen', () => {
        // Der strittige Lauf fällt serverseitig aus dem Running-Block (CompetitionMatchRepo), also
        // sieht die Kachel gar keinen laufenden Lauf mehr - und zeigt das jüngste Ergebnis statt
        // einer Uhr, die auf ein hängendes Rennen zählt.
        expect(autoContent(null, ergebnis)).toEqual({kind: 'result', result: ergebnis})
    })
```

`ergebnis` ist die Ergebnis-Hilfe der Datei — sieh oben nach, wie die bestehenden Tests sie bauen, und nutze dieselbe.

- [ ] **Schritt 2: Test laufen lassen**

Run: `cd frontend && npm test -- streamOverlay`
Erwartet: PASS (das Verhalten steht bereits; der Test ist der Riegel dagegen, dass ein späterer Umbau es wieder verliert).

- [ ] **Schritt 3: Das Badge**

In `AthleteBoardResultCard.tsx` neben dem Titel des Laufs ein leises Kennzeichen rendern, wenn `result.clarification`:

```tsx
                {result.clarification && (
                    <Chip
                        size="small"
                        color="warning"
                        variant="outlined"
                        label={t('event.match.status.provisional')}
                    />
                )}
```

Dasselbe im Stream-Ergebnis-Panel — dort ohne MUI-Chip, sondern in der Bauform, die das Panel für seine übrigen Zusätze verwendet (die Overlays rendern gegen die Key-Fläche und dürfen keine halbdurchsichtigen Farben bekommen; siehe `solidOr` in `streamDisplay.ts`).

- [ ] **Schritt 4: Übersetzung**

Unter `event.match.status`:

```json
        "provisional": "vorläufig · in Klärung",
```

Englisch: `"provisional · under review"`.

- [ ] **Schritt 5: Tests, Lint, Build**

Run: `cd frontend && npm test && npm run lint && npm run build`
Erwartet: grün.

- [ ] **Schritt 6: Commit**

```bash
git add frontend/src
git commit -m "Klärung: vorläufige Ergebnisse sind als solche erkennbar"
```

---

## Abschluss

- [ ] **Alle Tests**

Run: `cd backend && ./mvnw test`
Run: `cd frontend && npm test && npm run lint && npm run build`
Erwartet: alles grün. Rote Backend-Tests ohne erkennbaren Bezug zu dieser Arbeit: prüfe, ob die Build-DB durch fremde Migrationen verdriftet ist (eigene Build-DB je Worktree), bevor du hier suchst.

- [ ] **Von Hand nachklicken** (in den Testkatalog aufnehmen, Block „Klärung"):

1. Lauf aktivieren, Ist-Start setzen, Ergebnisse eintragen — Stream-Uhr zählt.
2. „In Klärung" mit Grund setzen → der Lauf verschwindet aus dem Athleten-Board und der Stream-Kachel; die Kachel zeigt das jüngste Ergebnis.
3. Der nächste Lauf wird von der Kette aktiviert, obwohl der strittige offen ist.
4. Im Dashboard: eingeklappte Zeile mit Grund und „seit"; Gesamtliste rechts zeigt ihn an seiner Stelle mit dem Chip „Klärung".
5. Ergebnis des strittigen Laufs steht (bei `RESULTS_COMPLETE`) mit „vorläufig · in Klärung" auf der Ergebnisanzeige.
6. „Klärung aufheben" → der Lauf steht wieder auf „Läuft" und ist zurück auf den Anzeigen.
7. Erneut setzen und diesmal „Lauf beenden" → Zustand „Beendet", kein Klärungs-Rest, Ergebnis ohne Vorbehalt.
8. Mit einem Konto, das nur `UPDATE EVENT GLOBAL` hat: Knopf auf der Durchführungsseite funktioniert.
9. Während der Klärung eine RaceClocker-Zeit eintreffen lassen → sie wird weiterhin geschrieben.

- [ ] **Beim Ausliefern beachten**

Backend und Frontend müssen **zusammen** raus. Die Migration fügt nur Spalten hinzu und ist für einen alten Server harmlos; ein neuer Server, der `CLARIFICATION` an ein altes Frontend liefert, ist es nicht — dort fiele der Zustand in jeden `default`-Zweig. Beim Abschlussbericht die verwendete Migrationsnummer nennen (Kollisionsgefahr zwischen Worktrees).
