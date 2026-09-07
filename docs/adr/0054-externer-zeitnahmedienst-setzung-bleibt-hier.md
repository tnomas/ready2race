# ADR-0054: Anbindung eines externen Zeitnahmedienstes: die Setzung bleibt bei ready2race, Ergebnisse kommen per Feed-Pull, Anbindung rein additiv

- Status: angenommen
- Datum: 2026-07-19
- Bereich: domäne, backend, api
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Für die Coastal-Regatta 2026 sollte ein zweiter Zeitnahmedienst (RaceClocker) neben dem bestehenden Tabellen-Export/-Import angebunden werden (Upstream-Issue #94). Der Dienst hat keine Import-Schnittstelle für Startlisten, liefert aber jede Ergebnisseite als JSON, wenn `?json=1` angehängt wird. Offen war, wer die Progression (Runden, Läufe, Setzung) rechnet, wie Startlisten hinaus- und Ergebnisse zurückkommen und wie beide Seiten ein Boot eindeutig wiederfinden. Randbedingung: Der Zweig sollte als Merge-Request an das Upstream-Team gehen und den bestehenden xlsx-Weg nicht verändern.

## Entscheidung

1. **ready2race rechnet die Setzung, der Dienst ist die Stoppuhr je Lauf.** Runden, Paarungen, Platzberechnung und Weiterkommen entstehen ausschließlich in ready2race. Im Zeitnahmedienst gibt es keine Progression und kein vorab angelegtes Platzhalter-Skelett.
2. **Startlisten gehen Welle für Welle als Datei hinaus** (Insert-only, jede Welle genau einmal). Dafür wurden zwei Export-Presets gesät und die Exportspalten `col_participant_fullname` sowie `col_team_match_id` an `startlist_export_config` ergänzt; die Kopfzeile ist über `no_header` abschaltbar, die Wertungskategorie kann an den Kurznamen angehängt werden (`append_rating_to_short_name`).
3. **Ergebnisse kommen per HTTP-Pull aus dem öffentlichen JSON-Feed.** Der Endpunkt `POST …/competitionExecution/{id}/results/from-raceclocker` liest den Feed und mündet in denselben Schreibpfad wie der Datei-Import (`applyRaceClockerRows` in `CompetitionExecutionService`): Timecode, Platzberechnung aus `Result in seconds`, `failed`/`failed_reason`. Bei Duplikaten wird nichts geschrieben. Der Abruf ist auf `https` und den Host des Dienstes beschränkt (SSRF-Schutz); der Client folgt keinen Weiterleitungen (`RaceClockerFeed.kt`, `followRedirects = false`).
4. **Der Schlüssel zwischen Feed und ready2race ist die Lauf-Team-ID** (`competition_match_team.id`), die in der Spalte „Extra info" des Dienstes mitreist, mit Fallback auf die Registrierungs-UUID. Der Wellenname ist nur Sicherheitsnetz für Altexporte (siehe ADR-0055).
5. **Ein Wellenname-Format für Export und Abruf:** `WaveName.format()` (`competitionExecution/entity/WaveName.kt`) baut `HH:mm | Rennnummer Kürzel | Laufname`, Startzeit vorn, damit die alphabetische Wellenliste des Dienstes chronologisch bleibt. Export (`buildCsv`) und Abruf-Fallback nutzen genau diese Funktion.
6. **Rein additiv:** Der bestehende xlsx-Weg und seine Presets bleiben unverändert. Fällt am Steg das Netz aus, kann die heruntergeladene Ergebnisdatei des Dienstes über `PUT …/results-file/raceclocker` (`RaceClockerResultsXls.kt`) eingespielt werden; auch dieser Weg läuft durch `applyRaceClockerRows`.

Wer die Anbindung erweitert, hält sich an diese Reihenfolge: ready2race entscheidet, der Dienst misst, jeder Rückweg mündet in `applyRaceClockerRows`.

## Verworfene Alternativen

- Progression oder ein einmaliges Platzhalter-Skelett im Zeitnahmedienst: verworfen, „damit die Zuständigkeit für die Setzung eindeutig bei ready2race bleibt" (Spec §4).
- Push von Startlisten in den Dienst: technisch nicht möglich, der Dienst hat keine Import-API.
- Matching über Bib plus Wellenname: Startnummern sind nicht eindeutig über Wellen hinweg; die Lauf-Team-ID ersetzt den Wellennamen als Schlüssel (`dbf7de25`).
- Das Custom-Feld des Dienstes als ID-Träger: der JSON-Schlüssel wandert mit dem Label und kollidiert; es fehlt zudem im Feed, sobald es versteckt wird.
- Strafzeit-Mapping aus dem Feed: das Feld „Result" enthält die Strafe bereits (siehe ADR-0060).
- Konfigurierbare JSON-Import-Konfiguration und ein `raceclocker_wave_name`-Snapshot je Lauf: nicht gebaut, der Feed ist fest verdrahtet, die Welle ist der Laufname.
- Ein eigener Schreibpfad für die Offline-Datei: verworfen, damit Team-Auflösung, Platzberechnung und Duplikatprüfung identisch bleiben (`a2cf0896`).
- Später revidiert: Live-Polling war zunächst als YAGNI ausgeschlossen und kam am 07.08.2026 als Scheduler-Job (ADR-0056); die zwei festen Ergebnisadressen je Wettkampf wurden mehrfach umgebaut (ADR-0067, ADR-0068, ADR-0080).

## Konsequenzen

- Der Feed ist eine öffentliche Seite ohne Vertrag. Jede Änderung der Spaltennamen oder des JSON-Aufbaus durch den Anbieter bricht den Parser (`RaceClockerFeedRow.kt`); es gibt keinen Versionsschutz.
- Die Spalte „Extra info" muss beim Startlisten-Import im Dienst von Hand gemappt werden. Fehlt sie, findet der Pull keine Zuordnung, und die Ergebnisse landen nirgends (Arbeitsnotiz, Testkatalog C39).
- Der Dienst bietet keinen Auto-Refresh der Startliste; K.-o.-Läufe müssen am Renntag neu exportiert werden, sonst greift kein Pull.
- Die R2R-UUID steht öffentlich sichtbar in der Ergebnisliste des Dienstes (geduldeter Behelf).
- `applyRaceClockerRows` ist der Engpass, an dem alle Rückwege zusammenlaufen; sein `NoResults`-Zweig läuft in `.transact()` und rollt zurück (Falle, siehe ADR-0055).
- Die Rollenverteilung hat gehalten: Auch das eigene Zeitnahme-Modul (ADR-0087) schreibt über denselben Ergebnispfad und rechnet keine Progression.

## Quellen

- Commits: `dd8d67b8` (Startlisten-Export und Feed-Anbindung, V202607211200), `dbf7de25` (Lauf-Team-ID als Schlüssel, V202607231000), `ba6a74a7` (Startzeit im Wellennamen), `da013684` (Rennnummer und Kürzel im Wellennamen), `d9ec7654` (Testkatalog C35–C39), `a2cf0896` und `4131e02a` (Offline-Import der Ergebnisdatei)
- Migrationen: `backend/src/main/resources/db/migration/V202607211200__raceclocker_integration.sql`, `V202607231000__raceclocker_feedback.sql`
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/raceclocker/`, `…/app/competitionExecution/entity/WaveName.kt`, `…/app/competitionExecution/boundary/CompetitionExecutionService.kt` (`applyRaceClockerRows`)
- Specs: `docs/superpowers/specs/2026-07-19-raceclocker-integration-design.md` (§1, §4, §5, §6), `docs/superpowers/specs/2026-08-05-zeitnahme-tab-design.md` (§1), `docs/superpowers/specs/2026-08-05-testprotokoll-nachtlauf.md` (C1)
- Verwandte ADRs: [ADR-0042](0042-startlisten-export-ergebnisimport-stabile-kennung.md), [ADR-0055](0055-feed-schluessel-lauf-team-id-bahn-aus-rank.md), [ADR-0056](0056-automatischer-feed-abruf-feed-ist-wahrheit.md), [ADR-0060](0060-teilergebnisse-zeitstrafen-ausweisen.md), [ADR-0067](0067-zeitnahme-konfiguration-je-wettkampf-vererbt.md), [ADR-0068](0068-benannte-zeitnahme-rennen-statt-adressen.md), [ADR-0080](0080-zeitnahmeprofil-baum-vier-ebenen.md), [ADR-0087](0087-eigenes-zeitnahme-modul-append-only.md)
