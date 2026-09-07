# ADR-0065: Kettenmodus dreiwertig statt Boolean; das Regattabüro kann immer beenden; Enum-Werte bleiben, nur Texte ändern sich

- Status: angenommen
- Datum: 2026-08-04
- Bereich: datenbank, domäne, api
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Die Aktivierungskette (ADR-0064) hatte einen Ein/Aus-Schalter `event.auto_activate_next_match`. Der Boolean konnte nicht ausdrücken, wer einen Lauf beenden darf und ob die Kette von allein weiterläuft; das Regattabüro wollte Läufe wahlweise exklusiv über den Zeitplan freigeben, während die Schiedsrichter nur beobachten. Nach dem ersten Merge-Request lag die Spalte frisch im Upstream-main, und das Upstream-Team benannte gerade Migrationen um.

## Entscheidung

- **`event.chain_progression_mode`** mit den Werten `SCHIEDSRICHTER | REGATTABUERO | DEAKTIVIERT` (`ChainProgressionMode`, Text ohne Check-Constraint, Migration heute `V202608061207__chain_progression_mode.sql`) ersetzt den Boolean. Backfill: `false` → `DEAKTIVIERT`, `true` → `SCHIEDSRICHTER`; die abhängige Event-View wird vor dem Spaltenabbau gedroppt.
- **Bedeutung:** `SCHIEDSRICHTER`: Beenden und Kette laufen über das Schiedsrichter-Dashboard. `REGATTABUERO`: exklusiv über den Zeitplan-Tab, der Beenden-Knopf verschwindet vom Dashboard, der Dashboard-Endpunkt lehnt das Beenden mit 409 ab (`LiveDashboardService`). `DEAKTIVIERT`: keine automatische Aktivierung.
- **Das Regattabüro kann immer beenden.** `finishSlot` im Zeitplan ruft `finishMatchInternal` ohne Modus-Gate; die Durchführungsseite beendet in jedem Kettenmodus (`3f09bf91`). Übersteuert das Büro damit den Schiedsrichter-Modus, erscheint eine Warnung (`5ddb8ad9`). Beendete Läufe können nicht reaktiviert werden (409 `MatchAlreadyFinished`).
- **Enum-Werte bleiben, nur Anzeigetexte ändern sich.** Am 07.08. und 10.08. wurden die Beschriftungen in de/en/da umformuliert („Lauf beenden & nächsten aktivieren"), weil die drei Werte zwei Achsen (wer beendet / läuft die Kette selbst) auf einer verwischen. Die Werte in Datenbank, API und Code blieben unangetastet: Eine Umbenennung hätte eine Migration auf einer Spalte verlangt, die das Upstream-main gerade erst bekommen hatte, mit Kollisionsgefahr zur Upstream-Umbenennung.
- Die Veranstaltungs-Einstellung liegt auf dem Einstellungen-Reiter der Veranstaltung, nicht im Popover des Zeitplans oder Dashboards (ADR-0058).

## Verworfene Alternativen

- Beibehalten des Booleans (Zeitstrahl-Design vom 03.08., §4 sah ihn noch als Ein/Aus-Schalter vor): reichte nicht für „wer darf beenden".
- Umbenennung auf `REFEREE | OFFICE | MANUAL`: Flyway-Migration auf frisch gemergter Spalte, Kollision mit der Upstream-Umbenennung; verworfen (`ea7fa490`).
- Aufteilung in zwei Felder (wer beendet, Kette automatisch): API-Änderung mit Migration, nicht in der Regatta-Woche; als mittelfristige Option notiert.

## Konsequenzen

- Anzeigetexte und Enum-Werte stimmen nicht überein; wer die Werte liest, muss die Beschriftung kennen (bewusst belassen, dokumentiert in `docs/crf-2026-folge-mr.md` §4).
- Die zwei Achsen bleiben verwischt: Es gibt keinen Modus „Schiedsrichter beendet, Kette läuft nicht". Wer das braucht, muss die Feldaufteilung nachholen.
- `REGATTABUERO` sperrt nur den Dashboard-Endpunkt; Durchführungsseite und Zeitplan bleiben offen. Das ist gewollt („das Büro darf immer"), aber ein Schiedsrichter mit Zugang zur Durchführungsseite kann den Modus umgehen.
- Der Backfill entschied für Bestandsveranstaltungen: Alle mit eingeschalteter Kette wurden `SCHIEDSRICHTER`.
- Enums als Text ohne Datenbank-Typ (ADR-0015) machten den Wechsel ohne `ALTER TYPE` möglich.

## Quellen

- Commits: `0fc8ff2e` (dreiwertiger Modus), `d346f02c` (View vor Spaltenabbau droppen), `22bd16dc` (Büro fährt Läufe aus dem Zeitplan), `dca1e8ad` (keine Reaktivierung beendeter Läufe), `5ddb8ad9` (Warnung beim Übersteuern), `ea7fa490` (Beschriftung nach dem, was der Modus entscheidet), `3f09bf91` (Beenden in jedem Kettenmodus)
- Migrationen: `V202608061207__chain_progression_mode.sql`
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/event/entity/ChainProgressionMode.kt`, `…/app/liveDashboard/boundary/LiveDashboardService.kt` (409 im Modus REGATTABUERO), `…/app/eventSchedule/boundary/EventScheduleService.kt` (`finishSlot`)
- Specs: `docs/superpowers/specs/2026-07-30-schiedsrichter-dashboard-backlog.md` („C1-Ausgestaltung entschieden"), `docs/superpowers/specs/2026-08-03-zeitstrahl-design.md` (§4 „Rückwärtskompatibilität"), `docs/crf-2026-folge-mr.md` (§1.3, §2.3, §4)
- Verwandte ADRs: [ADR-0014](0014-flyway-migrationskonventionen.md), [ADR-0015](0015-views-in-aftermigrate-enums-als-text.md), [ADR-0058](0058-schiedsrichter-dashboard-eigene-ressource-nutzlast.md), [ADR-0061](0061-lauf-endet-nur-durch-aktiven-input.md), [ADR-0063](0063-zeitstrahl-slots-feste-uhrzeit-import.md), [ADR-0064](0064-aktivierungskette-ganzer-zeitplan.md), [ADR-0073](0073-folgerunden-automatik-erstellt-aktiviert-nicht.md)
