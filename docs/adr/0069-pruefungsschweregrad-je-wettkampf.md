# ADR-0069: Prüfungsschweregrad je Wettkampf als Abweichungstabelle; Check-in-Pflicht als Eigenschaft des Rennformats; keine optimistische Sperre

- Status: angenommen
- Datum: 2026-08-07
- Bereich: domäne, datenbank, backend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Die Team-Ampel im Schiedsrichter-Dashboard (ADR-0058) war fest verdrahtet: offene Rechnung, fehlende Teilnahmebedingung, Zeitfenster verletzt, nicht in der Arena. Schiedsrichter ahnden am Renntag anders als geplant; eine offene Rechnung soll an einem Tag bewusst nicht gegen ein Boot zählen. Nicht jede Prüfung gilt für jedes Rennformat: Ein Beach Sprint kennt keinen Steg-Check, eine Langstrecke schon. Eine Ampel, auf die niemand reagiert, ist keine. Die Regel „im Wasser" wurde außerdem dreimal geändert (ganze Crew EXIT → ganze Crew ENTRY → ein einziger ENTRY-Scan genügt).

## Entscheidung

Zwei getrennte Fragen mit zwei getrennten Orten:

1. **„Gilt die Prüfung überhaupt?"** ist eine Eigenschaft des Rennformats: `competition_properties.check_in_out_required` (boolean, Default `true`, vorlagefähig; in der OpenAPI `required`, Kotlin-Default `true`). Sie schaltet die Arena-Bewertung ab. Bearbeitet wird sie im Wettkampf-Dialog, nicht im Schweregrad-Dialog (zwei Stellen für ein Feld vermieden).
2. **„Wie hart wird geahndet?"** liegt in `competition_check_severity` je Wettkampf und Prüfungstyp (`check_type`, optional `participant_requirement`), Werte `CheckSeverity` OK | WARNING | CRITICAL. Die Tabelle hält **nur Abweichungen** vom Standard; ohne Zeile gilt der eingebaute Default, der das alte Verhalten exakt reproduziert (kein Datenmigrationsschritt). Unique-Index über `(competition, check_type, participant_requirement)` mit `nulls not distinct`; ein Check-Constraint koppelt `participant_requirement` an die Prüfungstypen REQUIREMENT und REQUIREMENT_TIME_WINDOW. Migration `V202608071200__referee_check_severity.sql`.
3. **Bewertung im Backend** (`EffectiveSeverity` NEUTRAL | OK | WARNING | CRITICAL wird ausgeliefert), damit eine Änderung mit dem nächsten Poll auf jedem Gerät wirkt und nicht jedes Tablet am Steg andere Farben zeigt. Grün kommt ausschließlich aus erfüllten Teilnahmebedingungen; Rechnung und Arena können nur verschlechtern (Paritätstest über den ganzen Kombinationsraum).
4. **Pflege:** ein Verwaltungsdialog nach Prüfung gegliedert, ein `PUT /event/{eventId}/checkSeverity` für alles. Bewusst **keine optimistische Sperre**: Zwei gleichzeitig offene Dialoge überschreiben sich kommentarlos; die Regel ist organisatorisch „einer pflegt".
5. Die QR-App blendet den Check-Button aus, wenn keine Meldung ihn braucht; Scans bleiben je Person und Veranstaltung ein Ereignisprotokoll (ADR-0041), es gibt keine serverseitige Sperre für Scans.
6. **Arena-Regel** (einzige Übersetzungsstelle `LiveDashboardLogic.teamInArenaAt`): Ein Boot gilt als „in der Arena", sobald mindestens eine Person der Crew zuletzt ENTRY gescannt hat; Scan-Vollständigkeit ist eine Disziplin-, keine Wahrheitsfrage. `NOT_ON_WATER` wurde zu `NOT_IN_ARENA` (`V202608091410`, ADR-0070); ohne jeden Scan bleibt `teamsOnWater` `null`, nicht `0`.

## Verworfene Alternativen

- Geerbte Veranstaltungs- oder globale Ebene über dem Wettkampf: eine Sammelaktion im Dialog ersetzt sie.
- Bewertung im Frontend: Geräte mit verschiedenen Farben am Steg.
- Bearbeitung von `check_in_out_required` im Schweregrad-Dialog: zwei Stellen für ein Feld.
- Serverseitige Sperre für Scans: der Scan ist Ereignisprotokoll, keine Freigabe.
- Zwei partielle Indizes statt `nulls not distinct`: verworfen.
- Optimistisches Sperren auf dem PUT: bewusst offen gelassen, vor der Regatta zu entscheiden; im Zweifel „einer pflegt" (Testkatalog I8).
- Konfigurierbare Teilnahmebedingung „im Wasser": bewusst nicht; der Scan-Zustand kommt aus `participant_tracking` und wird in derselben Ampel gelesen (`63c89632`).
- Strenge Arena-Regel „jede bekannte Person zuletzt ENTRY" (`63c89632`, `144e6a2c`): am Steg nicht bewährt, ein Fünfer-Boot mit einem Scan stand auf Rot; gelockert (`a32bae0d`).
- `0` als Aussage über Boote ohne jeden Scan: bei Veranstaltungen ohne Check-in stünde dauerhaft „Arena 0/6"; `null` lässt den Chip entfallen.

## Konsequenzen

- Eine Regatta ohne Konfiguration sieht aus wie vorher; die Tabelle ist dünn besetzt, und niemand muss sie vor dem ersten Einsatz füllen.
- Wer den eingebauten Default ändert, ändert das Verhalten aller Wettkämpfe ohne Zeile; Defaults sind damit Produktentscheidungen, keine Konstanten.
- Der letzte Schreiber gewinnt am PUT; bei zwei Pflegenden gehen Änderungen still verloren. Der Testkatalog hält das als offenen Punkt.
- `check_in_out_required` steht auf Properties und reist mit Vorlagen (ADR-0023); ein Prod-Abzug setzt es hart auf `false` (Arbeitsnotiz zum Abzug-Generator).
- Die Handtests des Dialogs standen am 07.08. aus und wurden nie in der laufenden App belegt (Arbeitsnotiz „Prüfungsschweregrad: Handtests offen", fünf Punkte).
- Die Arena-Regel hat sich dreimal geändert; wer sie wieder verschärft, sollte den Grund der Lockerung (Steg-Praxis) kennen.

## Quellen

- Commits: `f9d34869` (Prüfungen je Wettkampf konfigurierbar, V202608071200), `63c89632` (Arena-Zeit je Boot im Dashboard), `144e6a2c` (ENTRY statt EXIT), `a32bae0d` (erster Scan genügt)
- Migrationen: `V202608071200__referee_check_severity.sql`, `V202608091410__check_type_not_in_arena.sql`
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/liveDashboard/entity/CheckSeverity.kt`, `…/app/liveDashboard/control/CheckSeverityRepo.kt`, `…/app/liveDashboard/boundary/liveDashboard.kt` (`/event/{eventId}/checkSeverity`), `…/app/liveDashboard/boundary/LiveDashboardLogic.kt` (`teamInArenaAt`), `…/app/competitionProperties/entity/CompetitionPropertiesDto.kt` (`checkInOutRequired`)
- Specs: `docs/superpowers/specs/2026-08-07-schiedsrichter-pruefungsschweregrad-design.md` („Entscheidungen", „Datenmodell", „Bewertung", „Nicht Teil dieses Entwurfs"), `docs/superpowers/plans/2026-08-07-schiedsrichter-pruefungsschweregrad.md`, `docs/superpowers/specs/2026-08-05-testkatalog-crf-2026.md` (I8), `docs/crf-2026-folge-mr.md` (§1.6, §2.6), `docs/testkatalog-11-08.md` (Bug 4)
- Verwandte ADRs: [ADR-0016](0016-schema-konventionen-uuid-audit-timestamp.md), [ADR-0023](0023-wettkampfvorlagen-kopieren-nicht-referenzieren.md), [ADR-0027](0027-teilnahmebedingungen-global-je-event-manuell.md), [ADR-0041](0041-checkin-checkout-ereignisprotokoll-arena.md), [ADR-0058](0058-schiedsrichter-dashboard-eigene-ressource-nutzlast.md), [ADR-0070](0070-laufzustaende-preparing-running-klaerung.md), [ADR-0075](0075-manueller-checkin-mit-begruendung-und-spur.md), [ADR-0084](0084-bedingungen-geltungsbereich-und-protokoll.md)
