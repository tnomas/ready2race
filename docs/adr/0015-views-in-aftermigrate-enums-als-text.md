# ADR-0015: Lese-Views ausschließlich in afterMigrate.sql; Enums als Text ohne Datenbank-Typ

- Status: angenommen
- Datum: 2025-02-13
- Bereich: datenbank, backend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Listen- und Detailabfragen brauchen aggregierte Sichten: Rollen mit Privilegien, Nutzer mit Rollen, Veranstaltungen mit Zählern, Wettkampf-Setups, später Läufe mit Teams und Ergebnisse. Views in versionierten Migrationen wären bei jeder Spaltenänderung umständlich, weil Postgres `drop column` an abhängigen Views scheitern lässt und die View danach neu angelegt werden muss. Für Aufzählungswerte stellte sich dieselbe Frage: Ein Postgres-Enum-Typ verlangt für jeden neuen Wert eine Migration mit `alter type … add value`.

## Entscheidung

- **Alle Views stehen in `backend/src/main/resources/db/migration/afterMigrate.sql`** (Flyway-Callback nach jedem Migrationslauf). Die Datei setzt den `search_path`, droppt alle Views mit `drop view if exists` in umgekehrter Abhängigkeitsreihenfolge und legt sie neu an (Stand September 2026: 71 `create view`, rund 1.500 Zeilen). Keine `V*`-Datei enthält `create view`.
- **View-Änderungen brauchen keine Migration.** Wer eine Spalte an einer View ändert (z. B. `competition_match_with_teams`), ändert nur `afterMigrate.sql`. Wer eine Tabellenspalte entfernt, von der eine View abhängt, droppt die View in der Migration; `afterMigrate.sql` legt sie danach wieder an.
- **jOOQ erzeugt Records auch für Views.** Sort-Enums (`EventViewSort`, `EventPublicViewSort` …) beziehen sich auf View-Spalten; Reihenfolgefehler beim Drop gelten als Bug (`277695f0`).
- **Aufzählungen sind `text`-Spalten ohne Check-Constraint**, gelesen mit `valueOf` des Kotlin-Enums (Beispiele `ChainProgressionMode`, `event.timing_system`, `privilege.action/resource/scope`). Kein jOOQ-Converter, kein Postgres-Typ. Ein neuer Enum-Wert ist damit eine Codeänderung, keine Migration.
- **`competition_match` hat keine eigene `id`**, sondern wird über `competition_setup_match` identifiziert; Views und Abzüge müssen das berücksichtigen.

## Verworfene Alternativen

- Postgres-Enum-Typen: bestehen aus der Frühphase (`gender` in `V202502140000`, `task_state` in `V202505081430`) und wurden für `info_view_type` (`V202608102000`) noch einmal per `alter type … add value` erweitert, dann mit dem Board-System wieder gedroppt. Für neue Werte werden keine Typen mehr angelegt, weil jeder Wert eine Migration und jeder Wertwechsel eine Typ-Neuanlage verlangt.
- Views in versionierten Migrationen: nicht belegt als Praxis; die Regel „nur in afterMigrate" gilt seit den ersten Views im Februar 2025.
- Materialisierte Views oder Caching in der Datenbank: nicht belegt; Lastprobleme öffentlicher Anzeigen wurden im Backend gelöst ([ADR-0062](0062-oeffentliche-anzeigen-cache-marker-rate-limit.md)).

## Konsequenzen

- `afterMigrate.sql` läuft bei jedem Migrate komplett; ein Fehler darin blockiert den Start, auch wenn alle Migrationen sauber sind. Die Drop-Reihenfolge muss von Hand gepflegt werden.
- Die Datei ist ein Konfliktherd bei parallelen Zweigen; Merges müssen die Drop-Liste und die Create-Liste gemeinsam prüfen.
- Text-Enums schützen nicht vor Tippfehlern in per SQL eingespielten Daten; `valueOf` wirft dann zur Laufzeit. Seeds müssen die Kotlin-Namen exakt treffen.
- Der Laufzustand ist bewusst **keine** Spalte, sondern eine Ableitung in Kotlin ([ADR-0059](0059-laufzustand-eine-ableitung.md)); Views liefern nur die Rohfelder.
- jOOQ typisiert View-Spalten durchgängig nullable; Nullbarkeit muss am Generat und an der Join-Form geprüft werden.

## Quellen

- Commits: `004b286e` (Rollen mit Privilegien als View), `183f00b7`, `9bae2431` (Nutzer-/Rollen-Views), `8fb67481` (Views für die Finalisierung), `277695f0` (Drop-Reihenfolge repariert), `04fbfafc` (afterMigrate erweitert), `1cd635bf` (QR-Code-Duplikate in Views)
- Specs/Pläne: `docs/superpowers/plans/2026-08-05-urkunden-pdf-word.md` („Global Constraints"), `docs/superpowers/plans/2026-08-05-zeitnahme-tab.md` („Enums als Text"), `docs/superpowers/specs/2026-08-07-lauf-status-anzeige-design.md` (§4.1), `docs/superpowers/plans/2026-08-07-raceclocker-polling.md` („Global Constraints")
- Code: `backend/src/main/resources/db/migration/afterMigrate.sql`, `V202502140000__event_registration.sql` (`gender`), `V202608102000__boards.sql` (`info_view_type` gedroppt)
- Verwandte ADRs: [ADR-0001](0001-kotlin-ktor-jooq-flyway-backend.md), [ADR-0014](0014-flyway-migrationskonventionen.md), [ADR-0016](0016-schema-konventionen-uuid-audit-timestamp.md), [ADR-0059](0059-laufzustand-eine-ableitung.md), [ADR-0065](0065-kettenmodus-dreiwertig-regattabuero-beendet-immer.md)
