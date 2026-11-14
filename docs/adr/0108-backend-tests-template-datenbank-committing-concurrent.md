# ADR-0108: Backend-Tests: Template-Datenbank statt Neumigration, `testCommittingComprehension` und `ConcurrentTx` für Sperren

- Status: angenommen
- Datum: 2026-11-13
- Bereich: backend
- Rekonstruiert: ja, aus der Commit-Historie des Zweigs

## Kontext

Jeder `testComprehension`-Fall migrierte die Datenbank neu und kostete rund 18 s ([ADR-0014](0014-flyway-migrationskonventionen.md)); die volle Suite lief bei 1893 Tests gut 13 Minuten. Zugleich ließen sich Fehler an Sperren und Nebenläufigkeit (Mail- und Rechnungsjobs, Check-in, Zeitnahme-Sequenzen) nicht testen: `testComprehension` rollt am Ende zurück und läuft in einer Transaktion, also gibt es weder Commit noch eine zweite Transaktion.

## Entscheidung

- **Template-Datenbank:** Der Test-Runner (`backend/src/test/kotlin/de/lambda9/ready2race/testing/testing.kt`) startet einmal einen Postgres-Container (Daten im RAM, `fsync` aus), migriert die Datenbank `r2r_template` und legt die Arbeitsdatenbank `r2r_work` für jeden Reset per `create database … template` neu an. Die Suite lief danach in 4:26 min statt 13:21 min.
- **`testComprehension`** (Service/Repo, Rollback je Test) bleibt der Normalfall. **`testCommittingComprehension`** committet echt und markiert die Datenbank als verschmutzt, damit der nächste Test sie neu aus dem Template bekommt; für Fälle, die den Commit selbst brauchen (Sperren, Trigger, Jobs). **`testApplicationComprehension`** (Ktor-`testApplication`) bleibt langsam und markiert die Datenbank dirty.
- **`ConcurrentTx.runHoldingFirst`** (`testing/ConcurrentTx.kt`) beweist Sperren deterministisch: Transaktion A führt ihre Arbeit aus und bleibt offen, B startet; A committet erst, wenn B fertig ist (keine Sperre – der Fehlerfall) oder in `pg_stat_activity` auf eine Sperre wartet (der korrigierte Fall). Zusammen mit `AdvisoryLock` im Produktionscode.
- **Test-Argon2** mit `TEST_ARGON2_MEMORY_KIB = 64`; die echte Vorgabe prüft `PasswordUtilitiesTest`. Die Test-Zeitzone wird wie beim echten Start über `AppZone.install` gesetzt, damit Tests auf einem UTC-Rechner dasselbe rechnen wie in Berlin.
- **SQL-Log** in Tests nur mit `R2R_TEST_LOG_SQL=true`.

## Verworfene Alternativen

- **Eine Datenbank je Test-Klasse neu migrieren:** spart nichts, die Migration ist der teure Teil.
- **Nebenläufigkeit mit `Thread.sleep` testen:** nicht deterministisch; die Prüfung auf `pg_stat_activity` kennt den Zustand „B wartet".
- **Mocks für Sperren:** prüfen nicht, ob Postgres die Sperre tatsächlich vergibt.
- **`testApplicationComprehension` für alles Nebenläufige:** zu langsam und zu grob.

## Konsequenzen

- Nach Schemaänderungen immer `./mvnw clean test`, sonst `NoSuchMethodError` auf `…Record.<init>` und ein altes Template.
- Eine Testzahl, die nach Aufräumarbeiten sinkt, ist das Erste, was einzeln nachzuverfolgen ist.
- `testCommittingComprehension` ist teurer als der Rollback-Test; sparsam einsetzen.
- Der Stand zum Abschluss: 1897 Tests, 0 Fehler, 0 übersprungen; `*HttpIT` laufen weiter nicht in `./mvnw test` (Surefire nimmt nur `*Test`), einzeln 51 von 51 grün.

## Quellen

- Code: `backend/src/test/kotlin/de/lambda9/ready2race/testing/testing.kt`, `.../testing/ConcurrentTx.kt`, `backend/src/main/kotlin/de/lambda9/ready2race/backend/database/AdvisoryLock.kt`
- Verwandte ADRs: ADR-0014 (Flyway-Konventionen), ADR-0030 (Tests gegen echtes Postgres), ADR-0107
