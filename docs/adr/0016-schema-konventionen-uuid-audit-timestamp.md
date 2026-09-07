# ADR-0016: Schema-Konventionen: UUID-Schlüssel, Audit-Spalten, Unique-Index statt Constraint, Zeitstempel ohne Zeitzone in Europe/Berlin

- Status: angenommen
- Datum: 2024-12-19
- Bereich: datenbank
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Viele Tabellen sollten gleichförmig aussehen, damit Repos, Views und Konvertierungen demselben Muster folgen. Änderungen müssen einer Person zuordenbar sein, ohne dass jede Domäne eigene Protokolltabellen anlegt. Die Anwendung wird an einem Ort (deutsche Regatten) betrieben; eine Zeitzonenverwaltung wurde nicht eingeplant. Im Fork zeigte sich 2026, dass Postgres in Containern auf UTC läuft, die Anwendung aber in Europe/Berlin rechnet.

## Entscheidung

- **Primärschlüssel sind UUIDs** (`id uuid primary key`), vom Backend erzeugt oder per `gen_random_uuid()`. Fremdschlüssel heißen wie die Zieltabelle (`app_user uuid references app_user`). Ausnahme: `competition_match` hat keine eigene `id` und wird über `competition_setup_match` identifiziert.
- **Audit-Spalten auf fast jeder Tabelle:** `created_at timestamp not null`, `created_by uuid references app_user on delete set null`, `updated_at`, `updated_by` (85 Vorkommen von `created_by` in den Migrationen). Der System-Nutzer ist die Null-UUID; `updated_by = 00000000-…` sagt deshalb nur „Admin oder Hintergrundjob".
- **Eindeutigkeit über `create unique index`**, nicht über `unique constraint` (31 Unique-Indizes; die 12 Unique-Constraints stammen aus einzelnen Migrationen und sind die Ausnahme). Indizes auf Fremdschlüsseln werden explizit angelegt (`create index on … (app_user)`).
- **Zeitstempel sind `timestamp` ohne Zeitzone** (kein `timestamptz` im gesamten Schema) und werden in Kotlin mit `LocalDateTime.now()` erzeugt und verglichen (über 300 Stellen). Die Anwendung läuft in Europe/Berlin; per SQL gesetzte Zeiten rechnen mit `(now() at time zone 'Europe/Berlin')`, Seeds setzen `set time zone 'Europe/Berlin'` (`docs/seeds/seed-dm-coastal-2026.sql`).
- **Aufzählungen als `text`** ([ADR-0015](0015-views-in-aftermigrate-enums-als-text.md)); Postgres-Enum-Typen nur aus der Frühphase (`gender`).
- **Schema `ready2race`**, gesetzt über `search_path` in Migrationen, Flyway und jOOQ-`inputSchema`.
- **Ereignisprotokolle statt Zustandsspalten**, wo Nachvollziehbarkeit zählt (Check-in/-out, Verpflegung, manuelle Änderungen mit Begründung; siehe [ADR-0041](0041-checkin-checkout-ereignisprotokoll-arena.md), [ADR-0075](0075-manueller-checkin-mit-begruendung-und-spur.md)).

## Verworfene Alternativen

- Serielle Integer-Schlüssel: nicht belegt; UUIDs erlauben Erzeugung im Backend vor dem Insert und stabile Kennungen für externe Systeme ([ADR-0042](0042-startlisten-export-ergebnisimport-stabile-kennung.md)).
- `unique constraint`: bis Januar 2025 gemischt, dann „for consistency" auf Unique-Indizes umgestellt (`20d2d282`); partielle Unique-Indizes lassen sich damit ausdrücken, Constraints nicht.
- `timestamptz`: nie eingeführt; ein Wechsel würde jede Migration, jedes DTO und jede Seed-Datei berühren.

## Konsequenzen

- **UTC-Falle:** Postgres läuft auf UTC, die Anwendung auf Berlin. `competition_match.start_time` wird gegen `LocalDateTime.now()` verglichen; Session-Zeilen per SQL mit `now() + interval '2 hours'` sind im Sommer schon abgelaufen (Symptom: stilles `GET /api/login → 204`). Wer per SQL Zeiten setzt, rechnet in Berlin-Zeit.
- Ein Betrieb in einer anderen Zeitzone oder mit Sommerzeitwechsel während einer Veranstaltung ist nicht abgesichert.
- `on delete set null` an den Audit-Spalten: gelöschte Nutzer hinterlassen `null`, keine Spur mehr, wer geändert hat.
- Partielle Unique-Indizes lassen sich nicht in einer Anweisung umsetzen (Postgres prüft zeilenweise, kein `deferrable`).
- `club.name` ist unique; Produktionsabzüge brauchen deshalb eine Temp-Map beim Neuladen.
- Seeds tragen einen UUID-Präfix je Thema (`5eed`, `f0de`, `7e57`, `7e1f`, `71ed`) und einen Cleanup-Block, damit sie idempotent einspielbar sind; neue Seeds rechnen Zeiten relativ zu `now()`.

## Quellen

- Commits: `17822e34` (`V202412161600__users_and_sessions.sql`: UUID, Audit-Spalten, Unique-Index), `29d24fb0` (Indizes ergänzt), `20d2d282` (Unique-Constraint → Unique-Index), `730ca857` (Vereine und Teilnehmer im Muster)
- Code: `backend/src/main/resources/db/migration/V202412161600__users_and_sessions.sql`, `backend/src/main/kotlin/de/lambda9/ready2race/backend/database/static.kt` (`SYSTEM_USER`), `docs/seeds/seed-dm-coastal-2026.sql`
- Verwandte ADRs: [ADR-0008](0008-serverseitige-sessions-header-token.md), [ADR-0014](0014-flyway-migrationskonventionen.md), [ADR-0015](0015-views-in-aftermigrate-enums-als-text.md), [ADR-0018](0018-nummernkreise-sequence-tabelle.md), [ADR-0021](0021-binaerdaten-in-der-datenbank.md), [ADR-0041](0041-checkin-checkout-ereignisprotokoll-arena.md), [ADR-0042](0042-startlisten-export-ergebnisimport-stabile-kennung.md)
