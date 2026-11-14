# ADR-0014: Flyway-Migrationen mit Zeitstempel-Version, outOfOrder, Umbenennen vor dem Merge, Umbau und Abbau getrennt

- Status: angenommen
- Datum: 2024-12-19
- Bereich: datenbank, prozess
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Mehrere Feature-Zweige erzeugen gleichzeitig Migrationen, ohne dass eine Koordinationsstelle Nummern vergibt. Solange das Produkt nicht ausgeliefert war (bis Frühjahr 2025), änderte das Upstream-Team bestehende Migrationen einfach in place. Mit produktiven Installationen und im Fork mit bis zu zwanzig parallelen Zweigen (August 2026) kamen drei Probleme dazu: Migrationen mit älterer Versionsnummer nach einem Merge, gleiche Nummern aus verschiedenen Zweigen (Kollisionen entstehen am Merge-Tag, `git merge` sieht sie nicht, weil es verschiedene Dateien sind), und Umbauten, bei denen Kotlin und jOOQ jeden Zwischenstand übersetzen müssen.

## Entscheidung

1. **Dateiname `VyyyyMMddHHmm__thema.sql`** unter `backend/src/main/resources/db/migration/` (Stand September 2026: 140 Dateien, alle mit zwölfstelligem Zeitstempel). Erste Zeile in der Regel `set search_path to ready2race, pg_catalog, public;` (50 Dateien setzen ihn nicht selbst; wer Migrationen per `psql` nachspielt, setzt den `search_path` auf der Datenbank).
2. **`outOfOrder(true)` beim Anwendungsstart** (`Application.kt`): eine nach einem Merge älter datierte Migration wird trotzdem angewendet. Gleiche Versionsnummern bleiben verboten.
3. **Nummern sind eine geteilte Ressource.** Vor dem Anlegen die belegten Nummern prüfen (`ls backend/src/main/resources/db/migration/ | tail`) und die gewählte Nummer im Bericht nennen. Kollidierende oder zu früh datierte Dateien werden **vor dem Merge umbenannt**, nicht durch neue Migrationen korrigiert (Beispiele: `V202608091500` → `V202608091600`, `V202608111600` → `V202608211300`, benannte Rennen auf `V202608101100`/`1110`, Ergebnisfreigabe auf `V202608061210`). Ungenutzte Migrationen werden gelöscht, solange sie nie in einer geteilten Datenbank liefen.
4. **Umbau und Abbau getrennt migrieren:** `V…1100` legt an und übernimmt, `V…1110` entfernt die alten Spalten (Beispiele `V202608101100__raceclocker_races.sql`/`V202608101110__drop_raceclocker_urls.sql`, `V202608261200__timing_tone_set.sql`/`V202608261210__event_toene_weg.sql`). Grund: Kotlin übersetzt alle Hauptquellen als Einheit und jOOQ erzeugt aus dem migrierten Schema; ein Löschen im selben Schritt macht den Zweig zwischendurch unübersetzbar.
5. **Ein Revert behält die Migrationsdatei** und droppt die Spalten in einer Folge-Migration mit `if exists` (`V202608121200` → `V202608121300`), weil Flyway den Start verweigert, wenn eine angewandte Version lokal nicht mehr auflösbar ist. Wo das nicht ging, ist `flyway repair` dokumentiert.
6. **Migrationen mit Datenauswirkung tragen die Begründung und die Prüf-Abfrage als SQL-Kommentar** (Beispiel `V202608242110__competition_timing_override_weg.sql`). Vor unumkehrbaren Migrationen in Produktion einen Dump ziehen; Backfill-Heuristiken vorher gegen einen Produktionsabzug prüfen.
7. **Views nie in Migrationen**, sondern in `afterMigrate.sql` ([ADR-0015](0015-views-in-aftermigrate-enums-als-text.md)); `drop column` scheitert an abhängigen Views, die vorher gedroppt werden müssen.

## Verworfene Alternativen

- Migrationen in place ändern (Dezember 2024 bis Frühjahr 2025, z. B. `V202501151000__events_structure.sql` über Wochen): mit der ersten Produktionsmigration (Rechnungen, `191115ce`) aufgegeben; heute verlangt jede Checksummen-Änderung `flyway repair` auf allen lokalen Datenbanken.
- Korrektur-Migrationen anhängen statt umzubenennen: verworfen, weil die Historie dann Schritte enthält, die nie einen Zweck hatten.
- Migrationsdateien beim Revert löschen: nur zulässig, wenn sie nie in einer geteilten Datenbank liefen; sonst „Detected applied migration not resolved locally".
- Streng aufsteigende Versionen ohne `outOfOrder`: bis August 2026; blockierte jeden Merge mit älterer Nummer (`e8734f51`).

## Konsequenzen

- Nach `git mv` einer Migration die alte Kopie in `backend/target/classes/db/migration/` löschen, sonst laufen beide Fassungen und Flyway bricht mit „column already exists" ab.
- Entfernte Migrationen brechen jede Datenbank, die sie schon sah; Datenbanken, die eine höhere Nummer vor einer niedrigeren sahen, melden „resolved migration not applied". Abhilfe: Datenbank neu ziehen, `flyway repair`, oder `flyway_schema_history` per `update` über die unveränderte `description` auf die neuen Nummern ziehen (Tabelle vorher sichern).
- Der Maven-Flyway-Lauf gegen die Build-Datenbank hat `outOfOrder` nicht gesetzt; eine geteilte Build-Datenbank driftet durch fremde Migrationen, deshalb je Worktree eine eigene ([ADR-0100](0100-fork-arbeitsweise-worktrees-merge-richtung-build-db.md)).
- Zwei Dateien je Umbau verdoppeln die Migrationszahl; dafür ist jeder Zwischenstand baubar.
- Kein Rollback in Löschrichtung ohne Dump; die Prüf-Abfrage im Kommentar ist die einzige Vorwarnung.

## Quellen

- Commits: `17822e34` (erste Migrationen), `bc1aa1b9`, `03716545` (Änderungen an älteren Migrationen), `8aa4bf8e`, `e8d2c5ed`, `9688db8f`, `adad6f30` (Umdatieren zur Reihenfolge), `191115ce` (erste Produktionsmigration), `faf977e3`, `0fea2d3f` (Reihenfolge korrigiert), `9c4a8c41` (ungenutzte Migration gelöscht), `3a7efc41`, `04fbfafc`, `15ba06b5`, `1cd635bf` (Upstream 2025/2026), `e8734f51` (outOfOrder), `cd33a4bc` (Umbenennung auf V202608091600), `5da512a8` (umbenannte Migrationen aus origin/main übernommen), `d473eb44` (Merge mit umnummerierten Migrationen), `78582095` (Revert behält die Datei), `bf42075c` (Freilos ausgebaut, flyway repair), `d241f034` (Kollision auf V202608211300), `9f137ef2`, `6c18f88e` (Umbau/Abbau getrennt, Prüf-Abfrage als Kommentar)
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/Application.kt` (Flyway-Konfiguration), `backend/src/main/resources/db/migration/`
- Verwandte ADRs: [ADR-0001](0001-kotlin-ktor-jooq-flyway-backend.md), [ADR-0010](0010-privilegien-action-resource-scope.md) (Privilegien ohne Migration), [ADR-0015](0015-views-in-aftermigrate-enums-als-text.md), [ADR-0016](0016-schema-konventionen-uuid-audit-timestamp.md), [ADR-0100](0100-fork-arbeitsweise-worktrees-merge-richtung-build-db.md)
