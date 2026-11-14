# Delta-Audit: Behebung aller Befunde – Umsetzungsplan

> **Für ausführende Agenten:** Pflicht-Skill `superpowers:subagent-driven-development` (ein Paket je Agent in eigenem Worktree) oder `superpowers:executing-plans`. Jeder Punkt wird testgetrieben umgesetzt: erst der rote Test, dann die kleinste Änderung, dann grün, dann Commit.

**Ziel:** Alle Befunde des Delta-Audits vom 07.09.2026 (lokales `main` gegen `lambda9:main`) schließen, inklusive Hygiene, ohne Verhalten zu verändern, das nicht beanstandet wurde.

**Architektur:** Sechs Arbeitspakete, strikt nach Dateien getrennt (A/B/C Backend, D/E/F Frontend), damit sie parallel in eigenen Worktrees laufen und konfliktfrei gemergt werden. Schnittstellen zwischen Paketen sind unten festgelegt und teilweise bereits im Basis-Commit vorbereitet (`DeviceTokenRevocation`, OpenAPI-Felder `MatchResultTeamInfo.startNumber` und `ErrorCode.LIVE_DASHBOARD_MATCH_ALREADY_FINISHED`, Client regeneriert).

**Tech-Stack:** Kotlin/Ktor + jOOQ + KIO (`de.lambda9.tailwind`), Flyway, PostgreSQL 17; React 18 + TypeScript + MUI + TanStack Router, Vitest; OpenAPI-YAML handgepflegt, Client via `npm run generate`.

**Spec:** Der Auditbericht (Artefakt https://claude.ai/code/artifact/f77211fb-6efa-4e87-b856-f652f348b5eb) und die Prüfberichte; Zeilenangaben unten stammen daraus (Stand 91d6dcf1 + Vorarbeit).

## Globale Regeln

- Commits auf Deutsch, mit echten Umlauten, ohne jede Erwähnung von KI oder Herkunft (weder in Commits noch in Kommentaren; keine Inspirationsquellen nennen). Kein `Co-Authored-By`.
- Nur Dateien des eigenen Pakets anfassen (Liste je Paket). Wer eine fremde Datei ändern müsste, notiert das im Abschlussbericht statt es zu tun. Generierte Dateien `frontend/src/api/*.gen.ts` **nie** anfassen; Regeneration erfolgt zentral nach dem Merge.
- KIO: `KIO.fail(...)` ohne `!` ist ein No-Op. Jede Prüfung muss mit `!KIO.failOn(...)`, `!KIO.fail(...)`, `failIf` oder als Rückgabewert kurzschließen.
- Backend bauen: `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home; export PATH="$JAVA_HOME/bin:$PATH"`. Jedes Paket nutzt eine **eigene** Build-DB (`docker run -d --name r2r-fix-<paket> -e POSTGRES_USER=developer -e POSTGRES_PASSWORD=sql -e POSTGRES_DB=ready2race-build -p <port>:5432 postgres:17`; Ports: A 7741, B 7742, C 7743) und ruft `./mvnw` aus `backend/` **immer** mit `-Ddatabase.url=jdbc:postgresql://localhost:<port>/ready2race-build` auf. Nach Schema-Änderung `clean`. Einzelne Testklassen mit `-Dtest=Klassenname`. Am Ende einmal `./mvnw clean test -Ddatabase.url=…` komplett grün. Container hinterher entfernen.
- Frontend: `cd frontend && npm ci`, dann `npx tsc -b`, `npx vitest run <pfad>`, am Ende `npx vitest run`, `npx eslint <geänderte dateien>`.
- DB-Tests mit echter Datenbank: `de.lambda9.ready2race.testing.testComprehension { … }` (Muster in `backend/src/test/kotlin/de/lambda9/ready2race/testing/TestExamples.kt`), ca. 18 s je Fall. HTTP-Tests: `testApplicationComprehension`, Klassen mit Suffix `IT`.
- Bestehende Migrationen **nie** ändern (Flyway-Prüfsummen laufender Instanzen). Neue Migrationen heißen `V202609071xxx__<thema>.sql`; die Nummer wird im Abschlussbericht gemeldet.
- `// eslint-disable-next-line react-hooks/exhaustive-deps` in Paketdateien: je Vorkommen entweder die Abhängigkeiten korrekt setzen (Ref-Muster, `useCallback`) oder die Unterdrückung mit einer Begründung in der Zeile darüber stehen lassen. Im Bericht je Stelle nennen, was entschieden wurde.
- Abschlussbericht je Paket: geänderte Dateien, neue Migrationen, offen gebliebene Punkte mit Grund, Testlauf-Ergebnis (Zahlen), Stellen, an denen eine fremde Datei betroffen wäre.

---

## Paket A – Backend Zeitnahme

**Dateien (nur diese):** `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing/**`, `backend/src/main/kotlin/de/lambda9/ready2race/backend/Application.kt`, `backend/src/main/resources/openapi/documentation.yaml` (nur Abschnitte der Timing-Routen und Timing-Schemas), neue Migration, `backend/src/test/.../app/timing/**`.

**Schnittstellen:** `DeviceTokenRevocation.notify(tokenId)` wird in `revoke()` bereits aufgerufen (Basis). Paket B registriert die Zuhörer. Paket D liest Token ab jetzt aus dem URL-**Fragment**; Paket A baut die Pfade entsprechend.

### A1 Sequenz-Sperren gegen den Takt
- Datei: `app/timing/boundary/TimingSequenceService.kt` (`abortSequence` 327-353, `pauseSequence` 379-405, `rewindSequence`, `skipEntry` 519-536, `fireSequence` 692-712), `app/timing/control/TimingSequenceRepo.kt`.
- Test zuerst (`TimingSequenceServiceTest`, testComprehension): (1) Sequenz RUNNING mit fälligem Eintrag; in einer Transaktion `getPendingForUpdate` halten, parallel `abortSequence` aufrufen → muss warten, bis die erste Transaktion committet, danach ist der Zustand ABORTED und kein Eintrag STARTED. (2) `fireSequence` auf einer Sequenz, die zwischen Lesen und Schreiben ABORTED wurde → Zustand bleibt ABORTED (Update mit Prädikat `state = 'RUNNING'`). (3) `skipEntry` auf einem Eintrag, der nach dem ersten Lesen gefeuert wurde → `EntryNotPending` (Entscheidung nach der Sperre).
- Umsetzung: In `abortSequence`, `pauseSequence`, `rewindSequence` als erstes `!TimingSequenceEntryRepo.getPendingForUpdate(sequenceId)` (Zeilen sperren), erst dann die Sequenzzeile ändern. Neues `TimingSequenceRepo.updateStateIf(id, expected: SequenceState, new: SequenceState): Int` (jOOQ `update … set state where id = ? and state = ?`); `fireSequence` nutzt es für DONE. `skipEntry`: Entscheidung `PENDING` aus `pendingBefore` nach der Sperre.

### A2 defectDelay des Sequenz-Jobs
- Datei: `Application.kt:177-189`. `scheduleDynamic("Fire due start sequence entries", 1.seconds, defectDelay = 2.seconds) { … }`. Test: `SchedulerTest` falls vorhanden ergänzen, sonst reine Konfigurationsänderung mit Kommentar.

### A3 Posten löschen bei vorhandenen Sequenzen
- Dateien: `TimingService.kt:173-185`, `TimingSequenceRepo.kt` (`existsByStation`), `app/timing/entity/TimingError.kt` (`StationHasSequences` → 409, Fehlercode `TIMING_STATION_HAS_SEQUENCES` in `calls/responses/ErrorCode.kt` **und** YAML-Enum), Test `deleteStationWithSequencesFails`.

### A4 `computeOfficialTimes` nur eigene Teams
- Datei: `TimingOfficialTimeService.kt:488-528`. Vor `recomputeAndApply`: `!checkTeamOfEvent(eventId, teams)` wie in `setOverride`. Test: Team einer fremden Veranstaltung → `EventMismatch`, keine Änderung an fremden Ergebnissen.

### A5 Eingabegrenzen
- `CreateTimeMarkRequest.validate()`: `timestampMillis` muss innerhalb von ±24 h um `System.currentTimeMillis()` liegen (Konstante `MAX_CLOCK_SKEW_MILLIS = 86_400_000L`). `CreateSequenceRequest`: `intervalMillis ≤ 3_600_000`, `leadInMillis ≤ MAX_LEAD_IN_MILLIS` (existiert). Tests je Grenze.

### A6 `createMark`-Idempotenz nur im eigenen Zuschnitt
- `TimingService.kt:330-332`: Existenzprüfung **nach** Posten-/Event-/ANZEIGE-Prüfung und nur mit `TimingTimeMarkRepo.existsForStation(id, stationId)`. Kollidiert die UUID mit einer Marke eines anderen Postens → `TimingError.TimeMarkIdTaken` (409, neuer Fehlercode `TIMING_TIME_MARK_ID_TAKEN`). Test: gleiche UUID, anderer Posten → 409; gleiche UUID, gleicher Posten → 201 ohne zweite Zeile.

### A7 Zuordnung als Upsert
- `TimingAssignmentRepo.create` → `insert … on conflict (time_mark) do update set competition_match_team = excluded.competition_match_team, updated_at/updated_by/updated_by_device` (Muster `CompetitionTimingStationRepo:119`). `TimingService.assign` (657-680) ohne vorheriges Löschen. Test: zwei Zuordnungen derselben Marke nacheinander → eine Zeile, letzte gewinnt, kein Defekt.

### A8 Token-Härtung
- Migration `V202609071000__timing_device_token_haertung.sql`: `alter table timing_device_token add column expires_at timestamp;` `create index on timing_device_token (station); create index on timing_device_token (event);`
- `TimingDeviceTokenService`: Link-Token (`share_link_token`-Pfade für Posten 122/143, Board 180-205, Szene 239-264) erhalten `expires_at = Ende des letzten Veranstaltungstags + 1 Tag` (aus `event_day`, sonst `now + 30 Tage`). Alle `validate*` prüfen `expiresAt == null || expiresAt > now` (sonst `DeviceTokenInvalid`). Pfade bauen `"$path#token=$encoded"` statt `?token=`. `TimingDeviceTokenDto` bekommt `expiresAt: LocalDateTime?` (YAML nachziehen).
- Board-Widerruf: `timing.kt:592-601` `authenticateAny(UpdateEventGlobal, UpdateStreamGlobal, UpdateBoardGlobal)`; `revoke(hasEventPrivilege, hasStreamPrivilege, hasBoardPrivilege)`: Nicht-Event-Rolle darf nur Token ihres Typs (`streamScene != null` bzw. `board != null`). Tests: Board-Rolle widerruft Board-Token ✓, Posten-Token ✗; Stream-Rolle Board-Token ✗.
- `TimingDeviceTokenRepo.getByEvent` (toter Code) entfernen.
- YAML: wiederverwendbarer Header-Parameter `components.parameters.TimingDeviceToken` (`X-Timing-Device-Token`, optional) und Referenz auf allen 13 Routen, die ihn akzeptieren (`/timing/state`, `/timing/matches`, `/timing/teams`, `/timing/stations`, `PUT /timing/stations/{id}/armed`, `POST /timing/timeMarks`, `PUT /timing/timeMarks/{id}/assignment`, `/timing/sequences/active`, `/timing/settings`, `/timing/officialTimes`, `/info/boards`, `/info/board/{boardId}`, `/stream/{sceneId}/view`).

### A9 Socket-Tests
- `TimingSocketTest`: Handshake mit Geräte-Token des Events ✓, mit Board-Token ✗, mit ANZEIGE-Token ✓ (nur lesen), widerrufenes Token nach Verbinden → Verbindung wird geschlossen (setzt B4 voraus; Test hier nur, wenn B4 gemergt ist, sonst als offen melden).

---

## Paket B – Backend Stream, Anzeigen, Live-Dashboard

**Dateien:** `app/stream/**`, `app/eventInfo/**`, `app/liveDashboard/**`, `plugins/Sockets.kt`, `calls/responses/AfterCommit.kt` (nur lesen), YAML (Abschnitte Stream/EventInfo/LiveDashboard), Tests dazu.

### B1 FORCED_ON-Kollision
- `StreamSceneService.setOverride` (Datei `app/stream/boundary/StreamSceneService.kt`): Beim Schreiben von `FORCED_ON` alle anderen `FORCED_ON`-Overrides derselben Szene mit gleichem Platz (`placement` der Grafik) löschen. Test (`StreamSceneServiceTest`): RESULT forced, dann STARTLIST forced auf gleichem Platz → RESULT-Override existiert nicht mehr, DTO zeigt `AUTO`. Resolver-Test „Verlierer bleibt aus, auch nachdem der Sieger abgelaufen ist" bleibt gültig.

### B2 Grafik-Einstellungen validieren
- `StreamSceneDtos.kt:44-52,110-122`: `displaySeconds` ∈ 1..600, `listLength` ∈ 1..50 (`IntValidators.min/max`), `safeAreaPercent` ∈ 0..20 falls vorhanden. `StreamSceneLogic.kt:182-199,236`: `take(scheduleLength.coerceAtLeast(0))`. Tests: Request mit -1 → 400; Resolver mit 0 → leere Liste statt Defekt.

### B3 Streckenbild ausliefern
- Neue Route `GET /event/{eventId}/stream/{sceneId}/courseImage` in `stream.kt`: dieselbe Tür wie `/view` (Sitzung READ STREAM/READ EVENT **oder** Szenen-Token im Header `X-Timing-Device-Token`), liefert die Datei des `imageDocument` der COURSE_IMAGE-Grafik der Szene (Content-Type des Dokuments), 404 ohne Bild. `StreamSceneLogic.kt:358-367` baut `imageUrl = "/api/event/$eventId/stream/$sceneId/courseImage"`. KDoc korrigieren. YAML-Eintrag (`operationId: getStreamSceneCourseImage`, Antwort `application/octet-stream`). Test HTTP: mit Szenen-Token 200, mit fremdem Szenen-Token 401, ohne 401.

### B4 Widerruf schließt offene Kanäle
- `Sockets.kt`: Beim Token-Zweig (Board 184-217, Stream 270-302, Timing 342-367) die Token-ID (`TimingDeviceTokenService.validate*` geben den Record zurück; falls nur Boolean, Rückgabe auf `Record?` erweitern – diese Funktionen liegen in Paket A: **statt Änderung dort** nutzt B `TimingDeviceTokenRepo.getByHash`/`findActiveByPlain` nur lesend) an der Subscription halten. `TimingBroadcaster`, `BoardViewBroadcaster`, `StreamSceneBroadcaster` erhalten `closeByToken(tokenId: UUID)`; in `configureSockets` einmalig `DeviceTokenRevocation.register { id -> …closeByToken(id) }`. Test: `StreamSceneSocketTest`/`BoardSocketTest`: nach `revoke` ist die Verbindung geschlossen (Close-Code 1008).

### B5 Sitzungspfad prüft Zugehörigkeit; Cache-Schlüssel
- `Sockets.kt` Board/Stream-Sitzungszweig: vor dem Abonnieren `BoardRepo.findById(boardId)?.event == eventId` bzw. `StreamSceneService.requireOwnedScene`; sonst `CANNOT_ACCEPT`. `BoardService.kt:152-160`: `boardViewCache` nach `(eventId, boardId)` schlüsseln oder Prüfung vor dem Cache-Zugriff. Tests.

### B6 Klärung an die Veranstaltung binden
- `LiveDashboardService.kt:702-757`: Match-Event über `CompetitionMatchRepo.getEventId(matchId)` (existiert oder neu) auflösen; `!KIO.failOn(matchEvent != eventId) { LiveDashboardError.MatchNotFound }`. Test `MatchClarificationTest`: Match von Event B unter Pfad A → 404, keine Änderung, kein Bump für A.

### B7 Öffentliche Info-Endpunkte
- `eventInfo.kt:55-63`: `includeClarification` nur auswerten, wenn `optionalAuthenticate(ReadBoardGlobal, ReadEventGlobal)` eine Sitzung liefert oder ein Board-Token des Events (Header) gültig ist; anonym immer `false`. Test.
- Veröffentlichungsprüfung: alle Methoden im öffentlichen Block (`upcoming-matches`, `running-matches`, `latest-match-results`, `live-matches`, `program`, `boards`-Liste falls öffentlich) prüfen `EVENT.PUBLISHED`; unveröffentlicht → `EventInfoProblem.EventNotFound`. Auch `eventChangeSocket`: `EventRepo.exists(eventId)` sonst `CANNOT_ACCEPT`. Tests. Felder `year`/`gender` in `UpcomingMatchParticipantInfo`/`ParticipantInfo`: im Frontend suchen (`grep -rn "\.year\b\|\.gender\b" frontend/src/components/event/board frontend/src/components/speaker frontend/src/pages`); werden sie nirgends angezeigt, entfernen (YAML nachziehen), sonst behalten und im Bericht begründen.

### B8 Änderungsmarker nach dem Commit
- `EventChangeMarker.kt:60-67`: `incrementAndGet()` in den `AfterCommit.register`-Block verschieben (Bump und Broadcast zusammen). Alle Tests des Pakets müssen weiter grün sein; Test „Poll zwischen Bump und Commit sieht alten Zähler" (mit `AfterCommit.collect`).

### B9 Altszenen im Probemodus
- `StreamSceneLogic.kt:131-134`: `scene.trialPhaseSince ?: scene.updatedAt` statt `now`. Test: Szene mit `trialPhaseSince = null`, `updatedAt` vor 60 s → STARTLIST nicht mehr sichtbar, kein `nextEvaluationAt` in 15 s.

---

## Paket C – Backend Wettkampf-Kern, Migrationen, WebDAV, TypeSpec

**Dateien:** `app/competitionSetup/**`, `app/competitionExecution/**`, `app/timingProfile/control/TimingProfileRepo.kt` (nur neue Lesefunktion), `app/webDAV/**`, `docs/migration-preflight-lambda9.sql` (neu), `api/src/*.tsp`, Tests dazu.

### C1 Zeitnahmeprofile überleben das Setup-Speichern
- `CompetitionSetupService.kt:95-106`: Vor `deleteByIds(roundIdsToDelete)` alle `timing_profile_assignment`-Zeilen mit `competition_setup_round in roundIdsToDelete` oder `competition_setup_match in (Matches dieser Runden)` laden (`TimingProfileRepo.getAssignmentsForRounds(roundIds)`, neu, liefert Runden-ID, Match-ID, Match-Position innerhalb der Runde, Rennen/Modus). Nach dem Einfügen der neuen Runden/Matches: Runden-Zuordnung über den Index der Runde in der Request-Reihenfolge auf die neue Runden-ID abbilden, Match-Zuordnung über (Rundenindex, Match-Position) auf die neue Match-ID; Zeilen neu einfügen (`TimingProfileRepo.insertAssignments`). Passt eine alte Zuordnung auf keine neue Position (Runde/Partie entfernt), wird sie verworfen und geloggt (`logger.info`). Test (`CompetitionSetupServiceTest`, testComprehension): Setup mit zwei Runden, Runde 2 hat Profil; Setup erneut speichern mit geänderter Bahnenzahl in Runde 1 → Runde 2 (neue ID) trägt weiterhin das Profil.

### C2 Fehlstart beim Zurücksetzen löschen
- `CompetitionExecutionService.kt:1904-1921` und `setMatchActivation(false)` 1992-2005: `falseStartAt = null`. Test in `CompetitionMatchResetTest`: Match mit `false_start_at` → nach Reset `null`; Klärungsspalten ebenfalls (bestehende Erwartung prüfen).

### C3 Gleiche Plätze nur bei gleicher Zeit
- Manueller Ergebnispfad (Service, der `UpdateCompetitionMatchTeamResultRequest` verarbeitet): doppelte `place`-Werte im Request nur zulassen, wenn alle Teams mit diesem Platz dieselbe Zeit (`timeString`/Millis) haben; sonst `CompetitionExecutionError.DuplicatePlaces` (400, Fehlercode `COMPETITION_EXECUTION_DUPLICATE_PLACES`, YAML nachziehen). `TeamPlacement.kt:26`: Tie-Break `compareBy({ matchWeighting }, { place }, { timeMillis ?: Long.MAX_VALUE }, { startNumber })`. Tests für beide.

### C4 Pre-flight-Skript für den Rollout
- Neue Datei `docs/migration-preflight-lambda9.sql` mit den beiden Prüfabfragen (aus den Kommentaren von `V202608242110` und der Kollisionslage `timing_mode_assignment` ↔ `competition.raceclocker_race` aus `V202608242100`) plus Erläuterung, dass die Migrationen selbst nicht mehr änderbar sind und diese Abfragen **vor** dem Deploy gegen den Prod-Dump laufen müssen; Ergebnis leer = sicher. Verweis im Kopf beider Migrationen ist nicht möglich (Prüfsumme), daher Verweis in `docs/README` oder dort, wo Deploy-Hinweise stehen.

### C5 WebDAV
- `WebDAVExportRequest.validate()`: `name` darf kein `/`, `\` enthalten und nicht `.`/`..` sein (Validator `noPathSegmentsOrDots`). Import-Route `webDAV.kt:64-70`: `{folderName}` gleich prüfen → 400. `WebDAVService.getUrl` wirft `IllegalArgumentException`, wenn ein Segment `..` ist (Schutznetz). `WebDAVExportService.kt:772-775`: Fehlermeldung nur `path` + Host ohne `remote.php/dav/files/<user>` (Helfer `redactUserSegment`), volle URL per `logger.debug`. Tests.

### C6 TypeSpec nachziehen
- `api/src/timing.tsp`, `stream.tsp`, `eventInfo.tsp`, neu `timingProfile.tsp`, `paceReference.tsp`, `liveDashboard.tsp`: alle Routen aus der YAML, die dort fehlen (Modi, Tonsätze, `stations/{id}/armed`, `stations/{id}/share-link`, `matches/{id}/retractAttempt`, `matches/{id}/falseStart`, `autoApply`, `timeMarks/{id}/reactivate`, `timing-profile/*`, `competition/{id}/timing-stations`, `liveDashboard/match/{id}/clarification`, `pace-reference`, `boards/{id}/share-link`, `includeClarification`, `stream/{sceneId}/courseImage`). Prüfung: `npx tsp compile .` in `api/` läuft fehlerfrei (Tooling dort vorhanden, sonst nur Syntaxprüfung per Augenmaß und im Bericht vermerken).

---

## Paket D – Frontend Zeitnahme und Helfer-App

**Dateien:** `frontend/src/utils/timing/**`, `frontend/src/components/timing/**`, `frontend/src/pages/app/**`, `frontend/src/components/qrApp/**`, `frontend/src/routes.tsx`, `frontend/index.html`, `frontend/src/pages/ConfigurationPage.tsx`, `frontend/src/contexts/user/sessionToken.ts`, `frontend/src/utils/board/deviceTokenInterceptor.ts`, `frontend/src/utils/board/deviceToken.ts`, `frontend/src/i18n/{de,en}/translations.json` (nur eigene neue Schlüssel).

### D1 Töne nur bei laufendem Context
- `utils/timing/feedback.ts:107-135`: `if (ctx.state !== 'running') return` nach `unlockAudio()`. Test in `feedback.test.ts` mit `RecordingAudioContext` im Zustand `suspended`: kein Oszillator erzeugt.

### D2 Leertaste gehört dem fokussierten Bedienelement
- `utils/timing/shortcutGuards.ts:39-45`: `isSpaceOwnedByFocusedControl` liefert `true` für `BUTTON`, `A`, `INPUT`, `SELECT`, `TEXTAREA`, `[role=button]`, `[role=menuitem]`, `[role=tab]`, `[role=switch]`, `[role=checkbox]` – unabhängig vom Vorfahren. Neue Testdatei `shortcutGuards.test.ts` (jsdom): fokussierter Button außerhalb des Sequenzpanels → Leertaste wird nicht als Erfassung gewertet; Ziffern weiterhin.

### D3 Nur Primärtaste erfasst
- `components/timing/CaptureButton.tsx:60-63,77` und `MatchCaptureView.tsx:335-337`: `if (event.button !== 0) return` (Touch/Pen melden 0). Test mit `fireEvent.pointerDown(el, {button: 2})` → kein Aufruf.

### D4 Uhr-Offset altert
- `utils/timing/serverClock.ts:25-36`: `ClockSync` hält die letzten 8 Proben; `best` = Probe mit geringster Latenz unter den Proben der letzten 10 min; ist der Median der letzten 5 Offsets mehr als 40 ms vom aktuellen `best.offset` entfernt, wird neu verankert. Neue `serverClock.test.ts`: Drift von +180 ms über mehrere Proben wird innerhalb von 5 Proben übernommen; Ausreißer mit hoher Latenz gewinnen nicht.

### D5 Erfassung nach Neustart ohne Netz
- `utils/timing/useServerClock.ts:91-94`: Offset mit `sampledAt` in `localStorage['timing.clockOffset']` persistieren (`try/catch`); beim Start übernehmen mit `quality: 'DEGRADED'`, wenn jünger als 12 h. `components/timing/useCaptureFlow.ts:137-138` und `CaptureButton.tsx:58-63`: Erfassen erlaubt bei `DEGRADED`; Marke erhält `note`/Kennzeichen, falls das Request-DTO ein Feld dafür hat, sonst nur Banner (bestehendes). Test.

### D6 Token im Fragment
- `routes.tsx:456-478,492-514` sowie Board- und Szenen-Routen (`boardDisplayRoute`, `streamSceneRoute`, ca. 924-931): `beforeLoad` liest `token` zuerst aus `window.location.hash` (`#token=…`), dann als Rückfall aus `search.token` (alte Links), speichert und leitet per `replace` ohne Hash/Query weiter. Tests der reinen Parser-Funktion `readTokenFromLocation(hash, search)` (neu in `utils/timing/deviceSession.ts`). Kommentar „nicht im Verlauf" auf die wahre Schutzwirkung korrigieren.
- `frontend/index.html`: `<meta name="referrer" content="same-origin">`.

### D7 Warteschlange fremder Veranstaltung
- `utils/board/deviceTokenInterceptor.ts:13-16` / `utils/timing/offlineQueue.ts`: Beim Drain Einträge, deren `eventId` weder zur Geräte-Sitzung noch zu einer Nutzersitzung passt, als `dead` mit Grund `NO_CREDENTIAL` markieren (kein 401-Retry). Banner zeigt sie wie andere tote Marken. Test in `offlineQueue.test.ts`.

### D8 Kleinigkeiten
- `utils/timing/socketTokens.ts:40-44` → `readSessionToken(false, {migrate: false})` (Option in `contexts/user/sessionToken.ts`), Test mit Legacy-`sessionStorage['session']`: bleibt unangetastet.
- `components/timing/leitstand/LeitstandOverviewTab.tsx:165-171`: `then(success)/catch(error)` wie `DeviceTokenIssueDialog.handleCopy`.
- `utils/timing/useTimingWebSocket.ts:125-132,218-221`: `deferOpenUntilStable` nur zurücksetzen, wenn `rejectedTokens.size === 0`.
- `components/timing/leitstand/useStationSequences.ts:42-59`: Versionszähler je Station; Antwort des initialen GET verwerfen, wenn seit Anfrage ein Push für diese Station kam (Muster `useSequence.ts:128-150`). Test.
- `pages/ConfigurationPage.tsx:58`: `CONFIGURATION_TABS` als `type` oder `as const` verwenden, so dass ESLint sauber ist.

### D9 Zonenlose Zeitstempel
- Neue Funktion `parseServerLocalDateTime(value: string, serverZoneOffsetMs: number | null): number` in `utils/timing/serverTime.ts`: interpretiert `YYYY-MM-DDTHH:mm:ss[.SSS]` als Wanduhrzeit des Servers. `serverZoneOffsetMs` stammt aus `ClockSync`: liefert der Server an einer Stelle Wanduhrzeit **und** Epoch-Millis desselben Augenblicks (prüfen: `TimingStateDto`, `BoardViewDto.serverTime` + `/timing/serverTime`), wird daraus der Zonenversatz bestimmt; sonst `null` → Rückfall auf Gerätezeit (heutiges Verhalten). Verwenden in `overviewData.ts:42-48`, `matchDisplay.tsx:14-20`, `DayScheduleColumn.tsx:58-61`, `utils/timing/matchBoard.ts:265`, `pages/app/TimingStartDisplayPage.tsx:425-431`. Test `overviewData.test.ts` auf das echte Format `2026-08-14T10:30:00` umstellen.

---

## Paket E – Frontend Livestream und Board-System

**Dateien:** `frontend/src/components/event/stream/**`, `frontend/src/components/event/board/**`, `frontend/src/pages/event/StreamDirectorPage.tsx`, `frontend/src/pages/event/StreamScenePage.tsx`, `frontend/src/utils/stream/**`, `frontend/src/utils/usePolledEndpoint.ts`, `frontend/src/utils/staleWatch.ts`, `frontend/src/i18n/{de,en}/translations.json` (nur eigene Schlüssel).

### E1 Zusammenführung nach Serverzeit
- `components/event/board/useBoardViewData.ts:84-88`: `pushIsNewer = Date.parse(pushed.view.serverTime) >= Date.parse(polled.data.serverTime)`. Test mit verspäteter HTTP-Antwort (älterer `serverTime`) → Push bleibt.

### E2 Veraltet-Schwelle der Bühne
- `components/event/stream/streamStale.ts:15`: `45_000` mit Kommentar „mindestens 2 × Server-Herzschlag (20 s)". Test anpassen.

### E3 Rückhaltelogik nur beim Ausblenden
- `components/event/stream/graphics/retainGraphicContent.ts:37-49`: Rückfall nur, wenn `current.visible === false`. `StreamGraphic.tsx:90-98`: `lastWithContentRef` leeren, wenn `GraphicFrame` `hidden` erreicht. Tests: `visible=true` ohne Inhalt mit vorherigem Inhalt → kein Rückfall.

### E4 Ablauf bei Verbindungsverlust
- `components/event/stream/graphics/GraphicFrame.tsx:9-18,54`: Prop `clockOffsetMs`; wenn `stale && visibleUntil != null && Date.parse(visibleUntil) + clockOffsetMs < Date.now()` → als `visible=false` behandeln. Offset aus `serverTime` des letzten Frames (`StreamScenePage`). Uhr und Ticker (ohne `visibleUntil`) unverändert. Test.

### E5 Eingefrorene Uhr neu ableiten
- `components/event/stream/graphics/StreamClock.tsx:79,84-91,115-119` und `components/event/board/streamOverlay/useStreamClockDisplay.ts:119-123`: Latch nur für den Fall ohne parsebare Zielzeit; sonst immer `state.elapsedMs`; Ref zurücksetzen, wenn die Phase `frozen` verlässt. Test: Korrektur 6:06.8 → 6:10.0 wird angezeigt.

### E6 Namenspartikel
- `components/event/stream/graphics/design/streamText.ts:25-32`: Partikel-Liste `van|von|de|der|den|du|da|di|le|la|zu|af|av|ter|ten|op|het|'t` (klein geschrieben) und alles danach zählen zum Nachnamen; bei mehr als zwei Wörtern nur das erste als Vorname kürzen. Tests: „Jan van der Berg" → „J. van der Berg", „Anna Sørensen Lund" → „A. Sørensen Lund".

### E7 Fehlergrenze je Grafik
- Neue `components/event/stream/GraphicErrorBoundary.tsx` (Klassenkomponente, `componentDidCatch` → `console.error`, rendert `null`, `resetKey`-Prop setzt zurück beim nächsten Push). In `StreamStage.tsx` um jede `<StreamGraphic>`. Test: werfende Kindkomponente lässt die Nachbarn stehen.

### E8 Regie-Board
- `pages/event/StreamDirectorPage.tsx:229,272-284,383-386`: nach erfolgreichem Probemodus-/Phasen-PUT `initial.reload()`; `initial.error` anzeigen (404 → `event.stream.director.sceneGone`, sonst `common.error.unexpected`) statt „verbinde…". i18n-Schlüssel de/en ergänzen.
- `components/event/stream/StreamGraphicConfigDialog.tsx:147-178`, `StreamSceneDialog.tsx:121-124`: Zahlenfelder als Rohtext im State, Klemmen/Runden erst bei Blur und Submit; leer = ungültig (Feld markiert). Tests für die Hilfsfunktion `parseBoundedInt(raw, min, max): number | null`.

### E9 Poll-Hook
- `utils/usePolledEndpoint.ts:180-184,243-256` + `utils/staleWatch.ts:60-66`: `StaleWatch.setThreshold(ms)` (behält `freshAt`, plant Timer neu); im `anyPushConnected`-Effekt beim Verbindungsabbruch `setThreshold(baseInterval * missed)`. Bei Wechsel der Deps `data`, `lastUpdated`, `notFound`, `initialLoad` zurücksetzen. Tests in `staleWatch.test.ts` und neue `usePolledEndpoint.test.tsx` (renderHook, fake timers).

### E10 Streckenbild laden
- `components/event/stream/graphics/StreamCourseImage.tsx:46-49`: Bild per `client.get({url: imageUrl, parseAs: 'blob'})` (Client aus `frontend/src/api`, der den Sitzungs-Header und den Szenen-Token-Interceptor trägt) laden, `URL.createObjectURL`, bei Unmount `revokeObjectURL`; bei Fehler `null` wie bisher. `imageUrl` kommt vom Server (Paket B: `/api/event/{e}/stream/{s}/courseImage`); der Interceptor für Szenen-Token muss URLs unter `/event/{e}/stream/` abdecken (prüfen in `utils/stream/*`, ggf. erweitern). Test mit gemocktem Client.

---

## Paket F – Frontend Sprecher, Editoren, Hygiene

**Dateien:** `frontend/src/components/speaker/**`, `frontend/src/pages/speaker/**`, `frontend/src/components/event/liveDashboard/**`, `frontend/src/pages/event/LiveDashboardPage.tsx`, `frontend/src/components/event/competition/**`, `frontend/src/components/event/timing/**`, `frontend/src/pages/event/EventPage.tsx`, `frontend/src/utils/liveDashboardError.ts` (falls dort), `frontend/src/i18n/da/translations.json` (komplett), `frontend/src/i18n/{de,en}/translations.json` (nur eigene Schlüssel).

### F1 Wertungskategorien im Sprecher-Board
- `components/speaker/speakerData.ts:117-130,210`: `SpeakerTeam` erhält `ratingCategory: string | null`, `categoryPlace: number | null`; `fromResultTeam` übernimmt beide; `displayPlace = categoryPlace ?? place`; Medaillen und Siegerzeile auf `displayPlace`. `SpeakerMatchPanel.tsx:329-333`, `SpeakerProgramPanel.tsx:104`, `SpeakerParticipantPanel.tsx:27-29`: Anzeige `displayPlace` und Kategorie-Chip, wenn gesetzt. `speakerData.ts:120`: `startNumber: team.startNumber` (Feld ist seit der Vorarbeit im Typ). Tests in `speakerData.test.ts` (neu oder erweitert).

### F2 Klärungsdialog
- `components/event/liveDashboard/ClarificationDialog.tsx:55-62`: `onSubmit` liefert `Promise<boolean>`, `close()` nur bei `true`; Text bleibt bei Fehler. `pages/event/LiveDashboardPage.tsx:511-517` und `components/event/competition/excecution/CompetitionExecutionRound.tsx:1143-1157`: Fehler über `liveDashboardErrorKey(error)`, dort `LIVE_DASHBOARD_MATCH_ALREADY_FINISHED` → `event.liveDashboard.clarification.error.alreadyFinished` (de: „Der Lauf ist bereits beendet.", en: „The race has already been finished."). Tests.

### F3 Zeitnahmetyp-Dialog
- `components/event/timing/TimingModeDialog.tsx:159-188`: leer → `invalidField`, `Number.isInteger` Pflicht, keine stille Rundung. Validatoren als reine Funktion `validateModeNumbers(intervalRaw, leadInRaw)` extrahieren und testen.

### F4 Zeitnahmeposten des Wettkampfs
- `components/event/competition/timing/CompetitionTimingStations.tsx:66-145`: `checkedEntries` nur aus sichtbaren Stationen; verwaiste Zuordnungen als Warnzeile mit „Entfernen". Test.

### F5 Sprecher-Board Robustheit
- `pages/speaker/SpeakerBoardPage.tsx:106-128,341`: Fehler der drei Feeds anzeigen (Banner `speaker.error.feed`), „alle drei fehlgeschlagen" zählt als geladen. `:160-185`: Debounce-Reload beim ersten Lauf überspringen, `falseStarts.length` aus dem Schlüssel nehmen.
- `components/speaker/speakerSettings.ts:76-89`: `themePreset` gegen `PRESET_PALETTES`-Schlüssel prüfen, Zahlen auf die UI-Bereiche klemmen, je Feld Rückfall auf Default. Test mit Müll-JSON.

### F6 Hygiene
- `components/speaker/speakerData.ts:292`: Kommentar auf „dunkle Standardpalette des Boards" ändern.
- `pages/event/EventPage.tsx:99`: `EVENT_TABS` ESLint-sauber (`as const` + `typeof`).
- `i18n/da/translations.json`: alle Schlüssel ergänzen, die in `de` existieren und in `da` fehlen (Skript: beide Dateien flach vergleichen), auf Dänisch übersetzt, Pluralformen (`_one`/`_other`) beibehalten, Platzhalter `{{…}}` unverändert. Danach `node -e` Prüfung: Schlüsselmengen identisch.

---

## Nach dem Merge (zentral)

1. Alle sechs Zweige nach `main` mergen (Reihenfolge A, B, C, D, E, F), Konflikte in `documentation.yaml`/`translations.json` auflösen.
2. `cd frontend && npm run generate`, Diff prüfen, committen.
3. Backend `./mvnw clean test -Ddatabase.url=…` und Frontend `tsc -b`, `vitest run`, `eslint .`, `vite build` vollständig grün.
4. Migrationsnummern melden; Pre-flight-Skript im Rollout-Ablauf verankern.
