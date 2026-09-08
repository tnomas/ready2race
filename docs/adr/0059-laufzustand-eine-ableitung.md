# ADR-0059: Der Laufzustand wird an genau einer Stelle abgeleitet; Ablesungen sind Felder, neue Enum-Werte nur mit Begründung

- Status: angenommen
- Datum: 2026-07-29
- Bereich: backend, domäne
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Schiedsrichter-Dashboard, Durchführung, Zeitplan und öffentliche Anzeigen müssen denselben Zustand eines Laufs zeigen. Sonderfälle führten zu Widersprüchen: Ein Lauf mit DNF/DSQ-Booten galt mal als bewertet, mal nicht; ein vollständig bewerteter, aber nicht beendeter Lauf hieß auf einer Anzeige „Beendet" und verschwand aus dem Live-Reiter. Jede Oberfläche hatte ihre eigene Ad-hoc-Ableitung.

## Entscheidung

- **`LiveDashboardLogic.deriveMatchState` ist die einzige Stelle, die den Zustand eines Laufs bestimmt.** Sie liefert `LiveDashboardMatchState` (per `typealias MatchState` in `matchStatus/entity/MatchStatusDto.kt`). Eingaben: `activated_at`, `started_at`, `start_time`, `finished_at`, die Ergebnisliste der Teams, `skipped` (aus dem Zeitplan-Slot) und `clarification_since`.
- **Die Reihenfolge der Zweige ist die Aussage** und steht als Kommentar im Code: CLARIFICATION → PREPARING → RUNNING → FINISHED → SKIPPED → AWAITING_FINISH → UNSCHEDULED → UPCOMING. „Was tatsächlich passiert, schlägt den Plan": ein abgesagter, aber aktiver Lauf zeigt RUNNING. Ausgefallene Boote (DNF/DSQ) zählen als „hat Ergebnis".
- **Das Modul `app/matchStatus` (`MatchStatusDto`, `MatchStatusLogic`) ruft diese Ableitung und liefert sie an alle Oberflächen.** Die View `competition_match_with_teams` trägt `started_at`, `finished_at` und ein abgeleitetes `skipped`; Views liegen in `afterMigrate.sql` (ADR-0015).
- **Ablesungen sind Felder, keine Zustände.** „Überfällig" (mehr als 5 min nach Plan, im Frontend gegen die Browseruhr), „Teilweise gewertet" (`teamsScored`/`teamsTotal`), „in der Arena" (`teamsOnWater`, `null` ohne jeden Scan) und „Freilos" (`MatchStatusDto.bye`, ADR-0074) werden aus Feldern gelesen.
- **Ein neuer Enum-Wert braucht eine Begründung**, weil er stumm in jeden `else`-Zweig fällt. Bekannte Verzweigungsstellen: `selectForScope`, `matchControls`, `dashboardMatchState`, `matchStatusChip`, `roundCounterChips`, `slotMatchStatus`, `scheduleSlotState`. Wer eine Zustands-Dimension einführt, zählt diese Stellen auf und nagelt mit einem Test fest, dass SQL-Filter wirklich greifen.
- **Die Aktivierungskette kennt diese Aufzählung nicht.** Sie hängt an `finished_at` (`ScheduleChain.decideNext` über `ChainSlot`), ADR-0064.

Zwei begründete Ausnahmen gab es: `PREPARING` (Aktivierung ohne Ist-Start, 09.08.) und `CLARIFICATION` (strittiger Lauf, 17.08.), beide in ADR-0070. Bei `CLARIFICATION` ist das Durchfallen in `else`-Zweige ausdrücklich erwünscht: Der Lauf soll aus allen laufenden Anzeigen verschwinden.

## Verworfene Alternativen

- „Überfällig" und „teilweise bewertet" als Enum-Werte (`b5e21846`): aus `teamsScored`/`teamsTotal` und `startedAt` gelesen.
- Ein eigener Zustand für Freilose (`5abe933e`): stattdessen `MatchStatusDto.bye`.
- „Boote auf dem Wasser" als Zustand: Ablesung über `teamsOnWater`.
- Umbenennung von `LiveDashboardMatchState`: Namenskosmetik auf getestetem Code; `typealias MatchState` statt Rename.
- Eigene Zustandsableitungen je Oberfläche: das war der Ausgangszustand und der Grund für die Regel.
- Später revidiert: Die Regel „keine neuen Enum-Werte" vom 07.08. wurde am 09.08. für `PREPARING` und am 17.08. für `CLARIFICATION` bewusst durchbrochen (ADR-0070).

## Konsequenzen

- Jede neue Oberfläche liest `MatchState` und baut keine eigene Ableitung; Kopien der Regel driften sonst (belegt am doppelten `clubWorn`, ADR-0071).
- Eine Änderung an der Zweig-Reihenfolge ändert alle Anzeigen gleichzeitig; das ist gewollt, macht aber jeden Eingriff zu einer Produktentscheidung.
- Öffentliche Anzeigen kennen nur vier grobe Zustände; Teilwertung bleibt intern. Das Zeitnahme-Modul nutzt bewusst eine gröbere Phase (`TimingTeamDto.matchPhase` ACTIVE/OPEN/DONE) in derselben Zweig-Reihenfolge (ADR-0087).
- `teamIsSettled` (Abmeldung zählt mit, trägt Kette und AWAITING_FINISH) und `teamHasRaced` (sportliches Ergebnis, trägt nur „Teilweise gewertet") sind seit 14.08. zwei Prädikate; wer eine der Stellen anfasst, muss wissen, welche Frage sie stellt (ADR-0044).
- Die Verzweigungsliste im Kommentar muss gepflegt werden; sie ist keine Compiler-Prüfung.

## Quellen

- Commits: `2beeac54` (ausgefallene Boote zählen als Ergebnis), `2f100244` (reiner Helfer), `af5465a3` (AWAITING_FINISH), `b5e21846` (Ableitung in einem Modul), `b1fdabd2` (ein Statuschip für alle Oberflächen), `701bc555` (Chips in Durchführung, Zeitplan, öffentlich), `5abe933e` (Freilos als Feld), `d4eb30f9` (PREPARING)
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/liveDashboard/boundary/LiveDashboardLogic.kt` (`deriveMatchState`, `teamIsSettled`, `teamHasRaced`), `…/app/matchStatus/`, `backend/src/main/resources/db/afterMigrate.sql` (`competition_match_with_teams`)
- Specs: `docs/superpowers/specs/2026-08-07-lauf-status-anzeige-design.md` (§2, §3.1, §3.2), `docs/superpowers/specs/2026-08-09-laufzustand-arena-design.md` (§1.2), `docs/superpowers/specs/2026-08-17-lauf-klaerung-design.md` (§2)
- Verwandte ADRs: [ADR-0015](0015-views-in-aftermigrate-enums-als-text.md), [ADR-0044](0044-abmeldung-dns-dnf-dq-im-freitext.md), [ADR-0058](0058-schiedsrichter-dashboard-eigene-ressource-nutzlast.md), [ADR-0061](0061-lauf-endet-nur-durch-aktiven-input.md), [ADR-0064](0064-aktivierungskette-ganzer-zeitplan.md), [ADR-0070](0070-laufzustaende-preparing-running-klaerung.md), [ADR-0074](0074-freilos-ableitung-kein-zustand.md), [ADR-0087](0087-eigenes-zeitnahme-modul-append-only.md)
