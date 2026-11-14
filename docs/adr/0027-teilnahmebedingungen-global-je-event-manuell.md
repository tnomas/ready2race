# ADR-0027: Teilnahmebedingungen: global definiert, je Veranstaltung aktiviert, manuell geprüft, mit Prüf-Zeitfenster

- Status: angenommen
- Datum: 2025-03-25
- Bereich: domäne, datenbank
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Veranstalter müssen Nachweise je Teilnehmer prüfen: Lizenz, Aktivenpass, Schwimmnachweis, Verwiegung. Die Nachweise sind bei jeder Regatta ähnlich, aber nicht jede Veranstaltung verlangt alle. Manche Prüfungen (Waage) gelten nur in einem Zeitfenster vor dem Start. Im August 2026 zeigte sich, dass „wer hat noch offene Bedingungen" ohne Rollenbezug falsche Listen ergab: „Waage 55 kg" stand für alle 189 Gemeldeten offen statt für 32 Steuerleute.

## Entscheidung

- `participant_requirement` ist global (`V202503201300__event_requirements.sql`). Je Veranstaltung wird eine Auswahl aktiviert (`event_has_participant_requirement`), auch je benannter Rolle (`f6ebcd70`).
- Die Erfüllung wird **manuell** je Teilnehmer und Veranstaltung festgehalten (`participant_has_requirement_for_event`) und in einer Teilnehmer-je-Veranstaltung-Sicht angezeigt. Jede Prüfung kann eine Notiz tragen (`V202508131130__optional_note_on_checked_requirement.sql`); die Verwaltung kann mit Freitext manuell freigeben (`af8a9e33`). Das Aufheben einer Prüfung verlangt eine Bestätigung (`8cf9b62b`). Prüfungen können in der Helfer-App erfolgen (`V202508110946__participant_requirement_check_in_app.sql`).
- **Prüf-Zeitfenster**: `participant_requirement.check_earliest_minutes_before` und `check_latest_minutes_before` (`V202608061201__participant_requirement_check_time_window.sql`), beide optional und unabhängig. Ohne Werte gibt es keine Ampel. Den Status OK/TOO_EARLY/LATE/NOT_CHECKED berechnet das Backend gegen die Startzeit des Laufs; späte Erfüllung ist erlaubt, bleibt aber sichtbar.
- **Export offener Bedingungen** als xlsx, sortiert nach Verein, mit Rennen-Spalte; die Rollenprüfung („betrifft die Person überhaupt") lebt als reine `OpenRequirementLogic`. Privileg `ReadEventGlobal`, weil die Liste Meldende aller Vereine trägt (`efbb2545`).

## Verworfene Alternativen

- Automatische Prüfung (Abgleich gegen Verbandsdaten): nicht belegt; die Nachweise liegen als Papier oder Fremdsystem vor.
- csv-Export der offenen Bedingungen: verworfen, weil Trenner und Kodierung in Excel nicht zuverlässig stimmen; xlsx öffnet per Doppelklick.
- Fester Schweregrad einer Zeitfensterverletzung: das Fenster blieb, der Schweregrad wurde am 2026-08-07 je Wettkampf konfigurierbar ([ADR-0069](0069-pruefungsschweregrad-je-wettkampf.md)).

## Konsequenzen

- Global definierte Bedingungen sind ein Katalog; wer eine Bedingung umbenennt, ändert sie für alle vergangenen Veranstaltungen mit. Das Revisionsprotokoll kam erst 2026-08-15 ([ADR-0084](0084-bedingungen-geltungsbereich-und-protokoll.md)).
- Der Rollenbezug macht die Frage „offen oder nicht" zu einer Rechnung über Meldung, Rolle und Aktivierung; jede Anzeige muss `OpenRequirementLogic` nutzen, sonst zählt sie falsch.
- Das Zeitfenster hängt an der Startzeit des nächsten Laufs; ohne Zeitplan-Slot gibt es keine Ampel.
- Die Migration wurde vor dem Merge von `V202607291400` auf `V202608061201` umbenannt ([ADR-0014](0014-flyway-migrationskonventionen.md)); ältere Notizen nennen die alte Nummer.
- Der Geltungsbereich je Tag und je Wettkampf ist eine spätere Erweiterung ([ADR-0084](0084-bedingungen-geltungsbereich-und-protokoll.md)); dieses ADR beschreibt die Grundform.

## Quellen

- Commits: `1d2ac457` (Teilnahmebedingungen), `99cd5597` (manuelle Prüfung), `0fff1316` (je Event aktivieren), `b391f98e` (Merge #3), `7a9e0e3d` (Prüfung in der App), `f6ebcd70` (je Rolle), `fda724bb`/`af8a9e33` (Notiz, Freigabe mit Freitext), `8cf9b62b` (Bestätigung beim Aufheben), `e3ef1ec8`/`bfb07868`/`90d9a69d` (Zeitfenster), `efbb2545` (Export offener Bedingungen)
- Migrationen: `V202503201300__event_requirements.sql`, `V202508110946__participant_requirement_check_in_app.sql`, `V202508131130__optional_note_on_checked_requirement.sql`, `V202608061201__participant_requirement_check_time_window.sql`
- Specs: `docs/superpowers/specs/2026-07-29-live-dashboard-schiedsrichter-design.md` (§3, §5 „Semantik")
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/participantRequirement/boundary/OpenRequirementLogic.kt`
- Verwandte ADRs: [ADR-0014](0014-flyway-migrationskonventionen.md), [ADR-0025](0025-vereine-teilnehmer-scope-own-stammverein.md), [ADR-0058](0058-schiedsrichter-dashboard-eigene-ressource-nutzlast.md), [ADR-0069](0069-pruefungsschweregrad-je-wettkampf.md), [ADR-0084](0084-bedingungen-geltungsbereich-und-protokoll.md)
