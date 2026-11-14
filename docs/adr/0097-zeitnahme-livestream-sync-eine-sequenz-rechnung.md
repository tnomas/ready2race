# ADR-0097: Zeitnahme und Livestream: jede Sequenz-Mutation bumpt den Marker, Pause friert die Uhr, eine geteilte Sequenz-Rechnung für Stream, Boards und Schiedsrichter-Dashboard

- Status: angenommen
- Datum: 2026-08-29
- Bereich: backend, api, frontend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Beim Handtest mit dem Startbildschirm und dem Mischer daneben lief der Stream-Countdown bei Pause oder Abbruch der Startsequenz weiter, weil nur Aktivierung und Feuern den Änderungsmarker der Veranstaltung ([ADR-0062](0062-oeffentliche-anzeigen-cache-marker-rate-limit.md)) bumpten. Der Countdown zählte vom Sequenzstart weg statt auf den Start hin; die Laufuhr fror auf der Poll-Zeit ein, nicht auf der letzten Zielzeit. Boards und Stream rechneten die Sequenz doppelt, und das Schiedsrichter-Dashboard sah sie gar nicht, weil der Timing-WebSocket Rechte verlangt, die eine Schiedsrichter-Rolle nicht zwingend hat. Punkt 9 der Zeitnahme-Testrunde war deshalb bewusst zurückgestellt worden: „ein neuer Datenweg ist nötig".

## Entscheidung

- **Jede Sequenz-Mutation bumpt.** `EventChangeMarker.bump` (`app/eventInfo/boundary/EventChangeMarker.kt`) läuft in allen Sequenz-Mutationen (Anlegen, Start, Pause, Fortsetzen, Zurücksetzen, Abbruch, Überspringen, Fehlstart); der Scheduler bumpt für `changedSequences` nach dem Commit über das `FireResult` ([ADR-0089](0089-startsequenzen-serverseitig-fehlstart.md)).
- **Eine Sequenz-Rechnung.** `TimingSequenceService.activeTiming(eventId)` liefert `ActiveSequenceTiming` und ist die einzige Stelle, die aus Sequenz und Einträgen Anker, Feuerzeitpunkt und Pausenbeginn ableitet. Sie speist die Stream-Uhr (`StreamGraphicViewDto.sequenceFiresAt`, `sequencePausedAt`), die Board-Sicht (`BoardViewDto.sequence`, über den öffentlichen gecachten Endpunkt) und das Schiedsrichter-Dashboard (`LiveDashboardMatchDto.sequence`, `LiveDashboardTeamDto.sequenceEntry`, gerechnet in `LiveDashboardSequenceLogic`). Preisgegeben werden nur Zeitpunkte und Lauf-Ids.
- **Countdown auf den Feuerzeitpunkt.** `sequenceFiresAt` ist Anker plus `leadInMillis`; die Uhr zählt darauf herunter, geklemmt auf 0, und zeigt lieber keine Uhr als eine mit falschem Vorzeichen. Sie zählt auf den ersten noch anstehenden Start, nicht stur auf Position 0. Die Laufuhr auf Board und Dashboard zählt von minus hoch.
- **Pause friert die Uhr.** Der Pausenbeginn reist bis in die `CLOCK`-Grafik; die Bühne friert auf `firesAt − pausedAt` in Serverzeit (ohne Client-Offset) ein und zeigt Orange mit Pause-Symbol. Fortsetzen verschiebt die geplanten Starts serverseitig exakt um die Pausendauer, die Uhr läuft nahtlos weiter. Eine Pause nach dem Startschuss stoppt keinen laufenden Lauf. Abbruch blendet über die Ausblendanimation aus; Fehlstart bricht die Sequenz ab und setzt den Lauf auf „In Vorbereitung" zurück.
- **Einfrieren der Laufuhr auf der größten gewerteten Bootszeit**, nicht auf der Poll-Zeit.
- **Fehlstart persistent.** `competition_match.false_start_at` (V202609021000) macht den Grund auch Anzeigen ohne Timing-Kanal sichtbar.
- Bei zwei aktiven Sequenzen zeigt die Szene die zuletzt angefasste. Überspringen gibt dem nächsten Boot die volle Zeit; die Welle listet alle wartenden Boote.

## Verworfene Alternativen

- **Zwei Ableitungen derselben Frage** (Boards und Stream getrennt): liefen „unweigerlich auseinander".
- **Timing-WebSocket als Datenweg für das Schiedsrichter-Dashboard:** verlangt Rechte, die die Rolle nicht hat; der Poll hängt ohnehin am Event-Push ([ADR-0082](0082-hintergrundaktualisierung-etag-polling-und-push.md)).
- **Fehlstart nur als WebSocket-Nachricht:** Anzeigen ohne Kanal sähen den Grund nie.
- **`rewind` nimmt `started_at` zurück:** bewusst nicht; die Bündel-Rücknahme ist `retractMatchAttempt`.
- **Demo-Schleife ohne Pause-Phase:** durch den Phasen-Probemodus abgelöst ([ADR-0096](0096-livestream-grafiken-designsystem-regie-board.md)).

## Konsequenzen

- Wer eine neue Sequenz-Mutation baut, muss bumpen; die Regel „jede Mutation bumpt" gilt ohne Ausnahme und ist nur durch Handtest mit Stream daneben zu belegen.
- Die geteilte Rechnung ist eine Abhängigkeit von drei Modulen (`stream`, `eventInfo`, `liveDashboard`) auf `timing`; Änderungen an `ActiveSequenceTiming` betreffen alle drei.
- Die Stream-Uhr zeigt im Zweifel nichts; ein fehlender Countdown ist ein Hinweis auf eine unklare Sequenzlage, kein Anzeigefehler.
- Bewusst offen: Streckenbild-Auslieferung für Token-Szenen; der Lauf-Picker zeigt übersprungene Läufe. Der Wirecast-Handtest Block 7 stand aus.

## Quellen

- Commits: `3aca17ff` (Countdown-Richtung), `c04e21cd` (Laufuhr friert auf letzter Zielzeit), `2af994d3` (Ausnahmen erreichen den Livestream), `9e55283c` (Überspringen), `5ff17d2d` (Schiedsrichter-Dashboard, V202609021000), `b1f02001` (Kachel-Dashboard, Laufuhr von minus hoch)
- Migrationen: `V202609021000__competition_match_false_start.sql`
- Specs: `docs/stream-handtests-wirecast.md` (Punkt 7), `docs/zeitnahme-testrunde-24-08.md` („Nachtrag 02.09.2026")
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing/boundary/TimingSequenceService.kt` (`activeTiming`), `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/eventInfo/boundary/EventChangeMarker.kt`
- Verwandte ADRs: [ADR-0058](0058-schiedsrichter-dashboard-eigene-ressource-nutzlast.md), [ADR-0062](0062-oeffentliche-anzeigen-cache-marker-rate-limit.md), [ADR-0082](0082-hintergrundaktualisierung-etag-polling-und-push.md), [ADR-0089](0089-startsequenzen-serverseitig-fehlstart.md), [ADR-0095](0095-eigene-stream-domaene-server-entscheidet-on-air.md)
