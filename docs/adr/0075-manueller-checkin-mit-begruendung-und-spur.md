# ADR-0075: Manueller Check-in/-out mit Pflichtbegründung und Änderungsspur, kein Löschen, kein neues Privileg

- Status: angenommen
- Datum: 2026-08-09
- Bereich: datenbank, backend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Check-in und Check-out sind ein Ereignisprotokoll auf Teilnehmerebene (ADR-0041). `participant_tracking` kannte nur das Anlegen per QR-Scan mit `now()`. Legt ein Boot ohne Scan ab, konnten Regattabüro und Schiedsrichter den Eintrag weder nachtragen noch berichtigen, ohne die Scan-Wahrheit zu verwischen. Ein neues Privileg hätte nach ADR-0010 nur die Admin-Rolle erreicht; Schiedsrichter hätten in der Produktion nachgezogen werden müssen.

## Entscheidung

1. **Der QR-Scan bleibt der Regelweg.** Handeinträge sind der Ausnahmeweg: Ein Dialog, drei Einstiege (Teilnehmertabelle, Statuslog mit Herkunftsspalte, Schiedsrichterdialog je Person).
2. **Herkunft und Spur:** `participant_tracking.source` (`QR` | `MANUAL`) und die Tabelle `participant_tracking_change` (`V202608091600__participant_tracking_manual.sql`) mit Vorher/Nachher, Autor und Pflichtbegründung. Die Begründung ist auf Datenbankebene erzwungen: `reason not null check (length(btrim(reason)) > 0)`. `tracking` steht `on delete set null` mit redundanten Spalten `participant` und `event`, damit die Spur einen gelöschten Eintrag überlebt.
3. **„Bearbeitet" ist ein Aggregat** in der View (`edit_count`), kein denormalisiertes Feld.
4. **`scannedAt` ist frei wählbar** – keine Bindung an `now()`, sonst ließe sich nichts nachtragen.
5. **Die Reihenfolgeregel** (kein zweiter Check-in ohne Check-out usw.) ist eine reine Funktion `ParticipantTrackingLogic.validateSequence` über die ganze Historie und wird auch vom QR-Weg benutzt.
6. **Rechte ohne neues Privileg:** `authenticateAny(UpdateLiveDashboardGlobal, UpdateEventGlobal)`, auch für lesende Routen, weil Begründungen im Klartext stehen.
7. QR, manuell und korrigiert sind in allen Ansichten markiert.

## Verworfene Alternativen

- Löschen von Einträgen: widerspricht der Revisionssicherheit; bleibt als „fehlt bewusst" im Testkatalog K1 vermerkt.
- Massenbearbeitung ganzer Boote: macht den Ausnahmeweg zum Normalweg.
- Eigenes Privileg: landet nur an der Admin-Rolle.
- Validator nur im Service: die Regel muss für beide Wege gelten.
- Zweite Zählspalte für Bearbeitungen: Aggregat genügt.

## Konsequenzen

- Jede Korrektur hinterlässt eine Zeile in `participant_tracking_change`; die Tabelle wächst mit jeder Regatta und wird nie bereinigt.
- Wer die Ereignisse auswertet, muss `source` beachten; ein Handeintrag ist keine Messung.
- Testblock K: K13 (Wirkung eines Handeintrags auf das Dashboard) ist offen; die Rechtefrage steht im Katalog als offen.
- Der Mechanismus wurde später für die Teilnahmebedingungen kopiert (`participant_requirement_log`, ADR-0084): Erfüllungstabelle sagt, was gilt; Protokolltabelle sagt, wer es wann festgelegt hat.

## Quellen

- Commits: `9b70d0da`, `576541a8`, `03d3514b`, `a90fa033`, `52e61db5`
- Migrationen: `V202608091600__participant_tracking_manual.sql`
- Code: `ParticipantTrackingLogic.validateSequence` (`app/participantTracking/boundary`)
- Specs: `docs/superpowers/specs/2026-08-09-manueller-checkin-checkout-design.md`, `docs/superpowers/specs/2026-08-05-testkatalog-crf-2026.md` (Block K)
- Verwandte ADRs: [ADR-0041](0041-checkin-checkout-ereignisprotokoll-arena.md), [ADR-0010](0010-privilegien-action-resource-scope.md), [ADR-0058](0058-schiedsrichter-dashboard-eigene-ressource-nutzlast.md), [ADR-0084](0084-bedingungen-geltungsbereich-und-protokoll.md)
