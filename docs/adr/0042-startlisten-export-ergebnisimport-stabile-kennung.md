# ADR-0042: Konfigurierbarer Startlisten-Export und Ergebnisimport; stabile Team-Kennung statt Startnummer; Sammelexport und Export-Mappe

- Status: angenommen
- Datum: 2025-07-28
- Bereich: domäne, backend, datenbank
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Externe Zeitnahmesysteme erwarten Startlisten als CSV mit jeweils eigenen Spaltennamen und liefern Ergebnisse als Tabellendatei zurück. Feste Exporte reichten nicht, und der Rückweg brauchte einen Schlüssel, der den Roundtrip übersteht. `competition_match_team.start_number` ist dafür ungeeignet: es ist eine Bahn- bzw. Positionsnummer innerhalb eines Laufs, und das Zeitnahmesystem darf sie umsortieren. Am Regattatag 2026 kam hinzu, dass ein Export je Wettkampf zu langsam war und das Regattabüro Aushang und Meldeergebnis als eine gedruckte Mappe wollte.

## Entscheidung

- **Export-Konfiguration als Entität**: `startlist_export_config` (Migration `V202507280730__startlist_export_config.sql`) hat je exportierbarem Feld eine Spalte `col_*` (etwa `col_participant_lastname`, `col_team_start_number`, `col_match_start_time`); der Wert ist der Spaltenkopf in der CSV, `null` bedeutet „nicht exportieren". Zwei Presets für ein externes Zeitnahmesystem („Webscorer Einzelrennen", „Webscorer Teamrennen") werden per Migration gesät. Der Dateiname trägt die Startzeit als Präfix, Vereinsnamen können als tatsächliche Namen ausgegeben werden.
- **Ergebnisimport** spiegelbildlich über `match_result_import_config` mit einem kleinen Leser für Tabellendateien im Backend (`CellParser`, `RowReader`, `XLSReadError`); der Upload validiert und schreibt Plätze und Zeiten, String-Zellen werden „lax" geparst.
- **Stabile Team-Kennung statt Startnummer** (2026-06-18): Export- und Importkonfiguration bekommen `col_team_registration_id` (Pflicht, Bestand mit „Info 1" befüllt); die UUID der `competition_registration` reist als Durchleitungsspalte mit und ist beim Import der Schlüssel. `col_team_start_number` im Import ist optional; ist es gesetzt, werden Startnummern zurückgeschrieben (`V202606181300__optional_import_start_number.sql`). Für den Zeitnahme-Feed kam `col_team_match_id` (die `competition_match_team.id`) hinzu, mit Pflicht „eine von beiden"; außerdem `no_header` und `append_rating_to_short_name` (`V202607231000__raceclocker_feedback.sql`).
- **Sammelexport** (2026-08-11): `GET /event/{eventId}/schedule/startlists` liefert ZIP (eine CSV je Wettkampf), eine große CSV oder PDF, vorbelegt nach Zeitnahmesystem. Der Delta-Modus holt die Feeds serverseitig und exportiert nur Läufe, deren Team-Ids im Feed fehlen; Zeilen ohne Id beweisen nie Anwesenheit. Vorschau und Export teilen die Planlogik (`filterPlanAgainstFeeds` in `CompetitionExecutionService`); `matchIds` kann die Auswahl nur einschränken, nie erweitern. Läufe ohne Startzeit werden alle vorab benannt (`ErrorCode.STARTLIST_MATCHES_WITHOUT_START_TIME`) statt still übersprungen.
- **Export-Mappe** (2026-08-13): `event_export_bundle_item` (Migration `V202608121400__event_export_bundle.sql`) je Veranstaltung mit `position`, `kind` (`DOCUMENT` | `GENERATED_STARTLISTS`) und `document`. Genau ein Startlisten-Platzhalter je Veranstaltung (partieller Unique-Index), verschieb-, aber nicht löschbar; gelöschte Dokumente verlassen die Mappe per Cascade. Der PDF-Sammelexport hängt die Einträge in dieser Reihenfolge zusammen; `withBackground` wirkt nur auf die generierten Startlisten.

## Verworfene Alternativen

- **Startnummer als Importschlüssel**: verworfen, weil das Zeitnahmesystem Startnummern umsortieren darf und die Nummer nur je Lauf eindeutig ist.
- **Wellenname als zweites Delta-Kriterium**: bewusst nicht gebaut; nur Ids beweisen, dass ein Lauf im Zeitnahmesystem ist.
- **Stilles Überspringen von Läufen ohne Startzeit**: verworfen zugunsten eines lauten 409 mit vollständiger Liste.
- **Einschließen fremder Ids per Parameter**: verworfen; die Auswahl kann nur einschränken.
- **Konfigurierbares Startzeit-Format**: „should be configurable later" (`de45a508`) blieb offen; die Startzeit in der Startliste ist ein Delta statt Uhrzeit.

## Konsequenzen

- Jede neue Exportspalte ist eine Schemaänderung an `startlist_export_config` (und ggf. an der Importkonfiguration), keine JSON-Konfiguration; dafür ist die Konfiguration typisiert und in der Datenbank-Sicherung enthalten (`DB_STARTLIST_EXPORT_CONFIGS`, [ADR-0047](0047-webdav-export-jobs-und-datensicherung.md)).
- Die Zeitnahme muss eine Durchleitungsspalte erhalten; beim angebundenen Dienst ist das „Extra info" bzw. „Info 1". Fehlt die Zuordnung dort, greift kein Ergebnisimport ([ADR-0055](0055-feed-schluessel-lauf-team-id-bahn-aus-rank.md)).
- Ein unerreichbares Rennen lässt den ganzen Delta-Export scheitern; das ist gewollt, weil ein halber Delta-Export falsche Sicherheit gäbe.
- Die Geschlechtsreihenfolge F/M/D und das Delta-Startzeitformat sind Vorgaben des ersten angebundenen Systems und stehen ohne Konfiguration im Code.

## Quellen

- Commits: `c201ea16`, `3e461dd6` (konfigurierbarer CSV-Export), `71b5110f` (Presets), `f85bb5c0` (Startzeit-Präfix), `1b39c215`, `f3ba2a25` (tatsächliche Vereinsnamen), `de45a508` (F/M/D, Delta), `11be2362` (match_result_import_config), `66dc542a` (XLS-Reader-DSL), `23813140`, `f7c7f6f0` (xlsx), `44315688` (lax), `c587c5ba`, `08dde117`, `15ba06b5` (stabile Team-Kennung), `dd8d67b8`, `dbf7de25` (col_team_match_id, no_header), `5bbbb1d7`, `3a99ca10` (Sammelexport), `41817208`, `6f612fa6` (Delta-Vorschau), `62331dad` (Läufe ohne Startzeit benennen), `f6cce7e2` (PDF), `4dd9a6c1`, `9448a213`, `d3ae2643`, `85caf4fc` (Export-Mappe)
- Migrationen: `V202507280730__startlist_export_config.sql`, `V202606181200__team_identifier_column.sql`, `V202606181300__optional_import_start_number.sql`, `V202607211200__raceclocker_integration.sql`, `V202607231000__raceclocker_feedback.sql`, `V202608121400__event_export_bundle.sql`
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/startListConfig/`, `app/matchResultImportConfig/`, `app/eventExportBundle/`, `app/competitionExecution/boundary/CompetitionExecutionService.kt` (`filterPlanAgainstFeeds`), `calls/responses/ErrorCode.kt`
- Verwandte ADRs: [ADR-0020](0020-pdf-dsl-auf-pdfbox-mit-dokumentvorlagen.md), [ADR-0029](0029-durchfuehrung-laeufe-startnummern-platzierung.md), [ADR-0047](0047-webdav-export-jobs-und-datensicherung.md), [ADR-0050](0050-csv-import-zwei-leseversuche.md), [ADR-0054](0054-externer-zeitnahmedienst-setzung-bleibt-hier.md), [ADR-0055](0055-feed-schluessel-lauf-team-id-bahn-aus-rank.md), [ADR-0081](0081-kurzbezeichner-kennung-kuerzel-sportneutral.md)
