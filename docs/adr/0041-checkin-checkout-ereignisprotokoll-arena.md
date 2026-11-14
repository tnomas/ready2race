# ADR-0041: Check-in/-out als Ereignisprotokoll auf Teilnehmerebene, ohne Kopplung an die Rennlogik; „Arena" statt „Wasser"; ein Scan genügt

- Status: angenommen
- Datum: 2025-08-07
- Bereich: domäne, backend, datenbank
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Am Steg wird per Bändchen gescannt, wer aufs Wasser geht und wer zurückkommt. Das erste Modell (`team_tracking`) hängte Scans an Teams, aber gescannt werden Personen, und dieselbe Person sitzt je Wettkampf in einem anderen Boot. Im August 2026 sollten Schiedsrichter im Live-Dashboard ([ADR-0058](0058-schiedsrichter-dashboard-eigene-ressource-nutzlast.md)) außerdem sehen, ob ein Boot abgelegt hat. Am Regattatag zeigte sich, dass Scans nie vollständig sind: Boote legen ab, ohne dass jede Person gescannt wurde.

## Entscheidung

- Scans werden je **Person** protokolliert: Tabelle `participant_tracking` (Migration `V202508110950__participant_tracking_table.sql`) mit `participant`, `event`, `scan_type` (`ParticipantScanType`: `ENTRY`, `EXIT`), `scanned_at`, `scanned_by`. Das Paket `teamTracking` wurde vollständig durch `participantTracking` ersetzt; Team-Übersichten werden abgeleitet.
- Die Tabelle ist ein **reines Ereignisprotokoll**: eine Zeile je Scan, nichts wird überschrieben. Lauf-Start und Lauf-Ende prüfen den Scan-Status **nicht**; es gibt keine Sperre „Lauf darf nicht starten, solange Boote nicht ausgecheckt sind".
- Bedeutung: `ENTRY` = die Person ist in der Arena (beim Rudern: auf dem Wasser), `EXIT` = zurück. Die Übersetzung von Scans in eine Aussage über ein Boot passiert an genau einer Stelle, in `LiveDashboardLogic`; die Aussage geht in die bestehende Team-Ampel des Dashboards, nicht in ein zweites Symbol.
- **Ein Scan genügt**: ein Boot gilt als in der Arena, sobald eine Person der Besatzung `ENTRY` gescannt hat (`a32bae0d`, 2026-08-10). Scan-Vollständigkeit ist eine Disziplin-, keine Wahrheitsfrage. Ohne bekannte Besatzung gilt „nicht in der Arena".
- Sportneutrale Sprache: der Prüftyp `NOT_ON_WATER` heißt seit Migration `V202608091410__check_type_not_in_arena.sql` `NOT_IN_ARENA` (`CheckType` in `liveDashboard/entity/CheckSeverity.kt`); Funktions- und DTO-Namen, i18n und Kommentare wurden mit umbenannt. Die Handlung heißt weiterhin An-/Abmeldung.
- Anzeige „Wasser x/y" auf der Ausführungsseite: die Scans werden je Wettkampf über den Index auf `participant_tracking` geholt, nicht je Veranstaltung oder je Mannschaft. Hat kein Team der Runde je einen Scan, bleibt `teamsOnWater` `null`, und der Chip entfällt; `0` wäre eine falsche Aussage über die Boote.

## Verworfene Alternativen

- **Team-basiertes Tracking** (`team_tracking`): mit `04fbfafc` komplett entfernt, weil Personen gescannt werden und Teams je Wettkampf wechseln.
- **„Auf dem Wasser, wenn die ganze bekannte Crew zuletzt EXIT gescannt hat"** (`63c89632`, 2026-08-06): die Lesart war invertiert; am 2026-08-09 korrigiert (`144e6a2c`: Check-in am Steg ist das Ablegen, `ENTRY` zählt, Check-out verlangt vorherigen Check-in), am 2026-08-10 auf „ein `ENTRY` genügt" gelockert (`a32bae0d`). Die Regel wurde damit dreimal geändert.
- **Konfigurierbare Teilnahmevoraussetzung „eingecheckt"**: bewusst nicht gebaut; der Scan-Zustand kommt aus `participant_tracking`, wird aber in derselben Ampel gelesen.
- **Enforcement** (Lauf startet nicht, wenn Boote nicht ausgecheckt sind): Gesprächspunkt mit der Regattaleitung, offen und nicht gebaut.
- **`0` statt `null` ohne Scans**: verworfen, weil bei Veranstaltungen ohne Check-in sonst jeder Lauf dauerhaft „Wasser 0/6" zeigte.

## Konsequenzen

- Das Protokoll ist ehrlich, aber unvollständig: es sagt, was gescannt wurde, nicht, wo ein Boot ist. Jede Anzeige, die daraus einen Zustand ableitet, muss die Lockerung „ein Scan genügt" kennen.
- Da keine Kopplung an die Rennlogik besteht, kann ein Lauf mit „nicht in der Arena"-Booten starten; das Dashboard warnt nur (Schweregrad `CRITICAL` für `NOT_IN_ARENA` in `LiveDashboardLogic`, konfigurierbar je Wettkampf, [ADR-0069](0069-pruefungsschweregrad-je-wettkampf.md)).
- Der QR-Scan versagt genau dort, wo es darauf ankommt; deshalb kam der manuelle Check-in mit Begründung und Änderungsspur ([ADR-0075](0075-manueller-checkin-mit-begruendung-und-spur.md)), der `participant_tracking` um `source` (`QR` | `MANUAL`) und die Tabelle `participant_tracking_change` ergänzt.
- Ein versehentlich mitgeschleppter Alt-Migrationssatz musste vor dem Merge gelöscht werden (`9c4a8c41`); die Tabelle wurde mit `cascade` gedroppt (`3a7efc41`).

## Quellen

- Commits: `04fbfafc` (TeamTracking → ParticipantTracking), `bf35334a`, `3a7efc41` (cascade drop), `9c4a8c41` (unused migration), `63c89632` (Wasserzeit je Boot im Dashboard), `c47be93e` (Anzahl Crews auf dem Wasser), `144e6a2c` (ENTRY statt EXIT), `810a6288`, `a32bae0d` (erster Scan genügt), `d4eb30f9`
- Migrationen: `V202508110950__participant_tracking_table.sql`, `V202608091410__check_type_not_in_arena.sql`, `V202608091600__participant_tracking_manual.sql`
- Specs: `docs/superpowers/specs/2026-08-09-laufzustand-arena-design.md` (§4), `docs/crf-2026-folge-mr.md` (§1.6, §2.6), `docs/testkatalog-11-08.md` (Bug 4)
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/participantTracking/entity/ParticipantScanType.kt`, `app/liveDashboard/boundary/LiveDashboardLogic.kt`, `app/liveDashboard/entity/CheckSeverity.kt`
- Verwandte ADRs: [ADR-0039](0039-helfer-app-eigener-bereich-unter-app.md), [ADR-0058](0058-schiedsrichter-dashboard-eigene-ressource-nutzlast.md), [ADR-0069](0069-pruefungsschweregrad-je-wettkampf.md), [ADR-0075](0075-manueller-checkin-mit-begruendung-und-spur.md), [ADR-0081](0081-kurzbezeichner-kennung-kuerzel-sportneutral.md)
