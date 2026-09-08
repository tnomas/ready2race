# ADR-0063: Zeitstrahl: Zeitplan-Slots mit fester Uhrzeit, geplant vs. real getrennt (started_at/finished_at), Excel-Import als Planungsweg, Verschieben mit Vorschau

- Status: angenommen
- Datum: 2026-08-03
- Bereich: datenbank, domäne, backend, frontend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Startzeiten hingen am erzeugten Lauf (`competition_match.start_time`) und konnten erst nach `createNewRound` gepflegt werden; ein Zeitplan mit Programmpunkten (Pausen, Siegerehrungen) und Verschiebungen war nicht abbildbar, und die Aktivierungskette griff bei Lücken den falschen Lauf. „Beendet" wurde an vier Stellen aus „alle Teams haben ein Ergebnis" zurückgerechnet, `currently_running` trug zwei Bedeutungen, und der geplante Start war vom tatsächlichen nicht zu unterscheiden. Reale Zeitpläne liegen als Excel-Tabelle vor. Am ersten Regattatag fiel außerdem ein Lauf still aus dem Zeitstrahl, weil eine Import-Zeile nicht mehr zum umbenannten Setup passte.

## Entscheidung

1. **Ein Zeitstrahl je Veranstaltung aus Slots mit fester Uhrzeit.** Tabelle `event_schedule_slot` (Migration heute `V202608061205__event_schedule_slot.sql`): `event`, `start_time` (fix), XOR aus `competition_setup_match` (unique) oder `name` (freier Slot), `duration_minutes`, `skipped_at`/`skipped_by`. Slot-Zustände `FREE | WAITING | LINKED | OBSOLETE | SKIPPED` (`EventScheduleSlotState`) werden abgeleitet, nicht gespeichert. `competition_match.start_time` bleibt die geplante Zeit per Write-Through vom Slot; manuelle Startzeit-Änderungen an slot-verwalteten Läufen werden abgelehnt (`updateMatchData`). Renntage gliedern nur die Anzeige.
2. **Geplant und real sind getrennte Spalten:** `competition_match.started_at` (Ist-Start; die externe Zeitnahme überschreibt den manuellen Stempel, `00:00:00.0` aus dem Feed gilt als fehlend) und `finished_at` (gestempelt von `finishMatch`, unabhängig von der Ergebnislage). Ein beendeter Lauf behält seine historische Startzeit; `stampMatchStartTime` überschreibt nicht mehr, sobald `finished_at` gesetzt ist.
3. **Freie Slots (Pausen) sind intern.** Sie erscheinen zeitlich einsortiert auf dem Schiedsrichter-Dashboard; öffentliche Boards sehen sie nur, wenn `event.show_breaks_on_public_boards` eingeschaltet ist (`EventScheduleLogic.freeSlotOrNull` als reine Funktion). Nicht materialisierte Runden erscheinen als Platzhalter auf den öffentlichen Boards.
4. **Excel-Import ist der primäre Planungsweg, der Editor eine schlanke Agenda.** Flache xlsx-Tabelle (Datum, Uhrzeit, Wettkampf, Lauf); `ScheduleImportTemplate` hält die Kopfzeile für Parser und generierte Beispieldatei (eine Quelle für beide). Matching zweistufig: erst Wettkampf über Kurzname/Kennung, dann Lauf im Wettkampf über den Setup-Zeilennamen; eine verfehlte Zeile sagt, auf welcher Stufe sie scheiterte, und nennt die vorhandenen Laufnamen. Der Import ersetzt alle Slots transaktional, meldet echte Excel-Zeilennummern und **blockiert nicht**: nicht zugeordnete Zeilen werden freie Slots, mit Zusammenfassung über der Vorschau und einem bewussten Haken vor „Importieren" (COMPETITION_NOT_FOUND / MATCH_NOT_FOUND / AMBIGUOUS). Unverplante Läufe lassen sich nachträglich auf vorhandene freie Slots legen.
5. **Verschieben mit Vorschau.** `ShiftMode` `PLUS_MINUTES | SET_TIME | COMPRESS_TO_TARGET | PLUS_MINUTES_RANGE` (`ShiftScheduleRequest`); `shift` und `import` nehmen ein `dryRun`-Flag, persistiert wird nur beim Bestätigen; nur innerhalb des Renntags, kein Überholen (`ShiftOvertakesFollower`), Untergrenze `duration_minutes` sonst 5 min. `PLUS_MINUTES_RANGE` verschiebt nur Slots von Start bis „bis"-Slot um ±X Minuten. „Nachrücken nach Ausfall" bietet nach einer bestätigten Absage an, bis einschließlich eines gewählten Slots aufzurücken; das Delta leitet der Server aus der gepflegten Dauer, sonst aus der Lücke zum nächsten echten Slot ab; ohne beides kein Angebot statt einer geratenen Zahl. Rechte wie Verschieben: `UPDATE EVENT` (absagen darf der Schiedsrichter, den Plan umbauen nicht).
6. **Slots entfallen mit Audit** (`setSlotSkipped`), nicht bei bereits gestarteten Läufen (ADR-0066).
7. **Der Zeitstrahl ist eine echte Zeitachse** (ab 12.08.): stundengenaue Achse mit Jetzt-Marker, Spurstapelung nur bei echter Zeitüberlappung, Blöcke zeitgetreu (3-px-Boden nur gegen Unsichtbarkeit), Klick-Komfort über eine unsichtbare Trefferfläche ≥ 24 px; Farben aus einer reinen Appearance-Funktion in Chip-Semantik; Zeitplan und Schiedsrichter-Dashboard rendern dasselbe Bauteil mit Dichte-Prop; Plan vs. Ist als Streifen, „erwartet ~" als globaler Versatz, keine Prognose je Lauf.

## Verworfene Alternativen

- Startzeit auf der Setup-Zeile (`planned_start_time` an `competition_setup_match`): keine freien Slots möglich, Setup-Zeilen sind zugleich Vorlagen.
- Eigene Slot-Zustandsmaschine (PLANNED/READY/…): wäre das vierte parallele Zustandsmodell; die drei bestehenden wurden angepasst.
- Slot-Modell „Dauer + Abstand" oder „Reihenfolge mit abgeleiteten Zeiten": zugunsten fixer Uhrzeit verworfen (Entscheidungstabelle in der Spec).
- Mehrfach-Anlage im Slot-Dialog: „das leistet der Import".
- Statische Beispieldatei im Repo: zweite Wahrheit, die still veraltet; stattdessen aus derselben Kopfzeile generiert.
- Harte Blockade des Imports bei nicht zugeordneten Zeilen: freie Slots sind legitim, und am Regattatag muss man notfalls trotzdem importieren können.
- Geratener Delta-Wert beim Nachrücken: verworfen, lieber kein Angebot.
- Prozentuales Mindestmaß je Block und Prognose je Rennen auf der Zeitachse: erzeugten Phantom-Spuren beziehungsweise falsche Sicherheit.
- Interaktion auf öffentlichen Anzeigen: Kiosk und Athleten-Board zeigen nur; Start-Stempel und Absagen gehören ins Schiedsrichter-Dashboard.
- Später revidiert: `currently_running` wurde am 09.08. durch `activated_at` ersetzt (ADR-0070); der Boolean-Kettenschalter wurde dreiwertig (ADR-0065); der Wellenname-Export mit Startzeit war nur vorbereitet und kam mit ADR-0054.

## Konsequenzen

- Der Zeitplan ist die einzige Quelle für „was ist als Nächstes dran" (ADR-0064). Läufe ohne Slot fallen auf die alte `start_time`-Logik zurück und werden von keiner Kette mehr aktiviert.
- Ein umbenanntes Setup (VF2 → VF1) macht Import-Zeilen still zu freien Slots; das war der Vorfall vom ersten Regattatag und der Grund für die laute Zusammenfassung. Das Matching bleibt strikt.
- `finished_at` ist die einzige Wahrheit für „beendet" und trägt die Kette; alles andere ist Anzeige (ADR-0059).
- Die Migrationsnummer wurde vom Upstream-Team umbenannt (ursprünglich V202608031200, heute V202608061205); Arbeitsnotizen mit der alten Nummer sind stale.
- Slot-Startzeiten werden auf den Lauf durchgeschrieben; wer `competition_match.start_time` direkt ändert, arbeitet gegen den Slot und wird abgewiesen.
- Die Zeitachse rendert beide Flächen aus einem Bauteil; eine Änderung dort trifft Zeitplan und Dashboard gleichzeitig.
- Der Test-Aufwand ist hoch: Ketten-Trigger und Repo-Abfragen laufen als DB-Integrationstests, weil eine aliasierte `coalesce`-Spalte in einer Einzel-Slot-Query jede Aktivierung mit HTTP 500 beendete (ADR-0030).

## Quellen

- Commits: `95471836` (Tabelle und Spalten), `b1f335d7` (Slot-Zustände, Shift-Mathematik), `704eecbb` (CRUD mit Write-Through), `e2979383`, `b5e7bf2f` (Slots entfallen, nicht bei gestarteten), `fc3d3dbe` (`finished_at`), `66323f14` (`started_at`), `e18da52e`, `70a61894` (Kette entlang der Slots), `f65dda3e` (manuelle Startzeit abgelehnt), `9f71d297`, `0db7ed84` (Verschieben mit Vorschau, Renntag), `23d91b88`, `8d97a985` (xlsx-Import, Excel-Zeilennummern), `67d6b2c7`, `aef3de06` (Ist-Start aus dem Feed, Mitternacht = fehlend), `5809fcfb` (Platzhalter auf Boards), `42436c47` (Stempel-Guard, strukturierte Shift-Fehler), `f4c1b710` (Merge), `beba5b33`, `52e211ff` (freie Slots, Opt-in), `5909904d` (Nachrücken), `1bc91bb0`, `c6a537e9` (Beispieldatei, zweistufiges Matching), `a1a7ff75`, `fd39baee`, `6c7694f0` (Import laut, freie Slots als Ziel), `bd111cb8`, `dc529573`, `c77fcec4` (Bereichs-Verschiebung, Minuteneingabe), `ea488ab8`, `a0ced742`, `c1eef65c`, `2b0187f4`, `046f078c`, `f42a399c`, `3a0e2623` (echte Zeitachse)
- Migrationen: `V202608061205__event_schedule_slot.sql`, `V202608061206__event_public_breaks.sql`
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/eventSchedule/` (`EventScheduleService`, `EventScheduleLogic`, `ScheduleImport`, `ScheduleImportTemplate`, `entity/ShiftScheduleRequest.kt`, `entity/EventScheduleSlotState.kt`)
- Specs: `docs/superpowers/specs/2026-08-03-zeitstrahl-design.md` (§2, §3, §4, §5, §6, §8), `docs/superpowers/plans/2026-08-03-zeitstrahl.md`, `docs/crf-2026-folge-mr.md` (§1.2, §1.8, §2.2)
- Verwandte ADRs: [ADR-0028](0028-wettkampf-setup-runden-matches-vorlagen.md), [ADR-0029](0029-durchfuehrung-laeufe-startnummern-platzierung.md), [ADR-0030](0030-tests-testcontainers-und-reine-logik.md), [ADR-0054](0054-externer-zeitnahmedienst-setzung-bleibt-hier.md), [ADR-0058](0058-schiedsrichter-dashboard-eigene-ressource-nutzlast.md), [ADR-0059](0059-laufzustand-eine-ableitung.md), [ADR-0064](0064-aktivierungskette-ganzer-zeitplan.md), [ADR-0065](0065-kettenmodus-dreiwertig-regattabuero-beendet-immer.md), [ADR-0066](0066-entfaellt-statt-ueberspringen-sichtbar-markieren.md), [ADR-0070](0070-laufzustaende-preparing-running-klaerung.md), [ADR-0073](0073-folgerunden-automatik-erstellt-aktiviert-nicht.md)
