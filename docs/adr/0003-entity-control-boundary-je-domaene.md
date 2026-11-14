# ADR-0003: Entity-Control-Boundary je Domäne, SQL ausschließlich in Repos

- Status: angenommen
- Datum: 2024-12-19
- Bereich: backend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Die Anwendung besteht aus vielen fachlichen Aggregaten (Nutzer, Veranstaltung, Wettkampf, Meldung, Rechnung, Zeitnahme …), die von mehreren Personen parallel entwickelt werden. Sie sollen gleichförmig aufgebaut sein, damit man sich in jeder Domäne sofort zurechtfindet. Im August 2025 entstand ein Service mit rund 280 Zeilen jOOQ direkt im Ablaufcode; das war der Anlass, die Schichtung ausdrücklich als Regel festzuhalten.

## Entscheidung

Jede Domäne liegt unter `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/<domäne>/` mit genau drei Unterverzeichnissen:

- `boundary/`: die Routen-Datei in camelCase (`event.kt`, `competitionMatch.kt`), das Service-Objekt `XyzService` (Ablauf, Rechteprüfung, Fehlerentscheidung) und, wo vorhanden, `XyzLogic` (reine Entscheidungen ohne Datenbank).
- `control/`: die Repositories `XyzRepo` (jeder jOOQ-Zugriff, gekapselt in `Jooq.query { … }`) und `Conversions.kt` (Record ↔ DTO).
- `entity/`: DTOs, Request-Klassen (`Validatable`), `XyzError` als `sealed interface … : ServiceError`, Sort-Enums.

Regeln:

1. **SQL gehört in Repos.** Services rufen Repos und enthalten keine jOOQ-Abfragen, auch nicht für lesende Sonderansichten (Dashboards, Boards, Exporte).
2. Standardoperationen kommen aus `database/Extensions.kt`: `insert`, `insertReturning`, `select`, `selectAny`, `page`, `metaSearch`. Repos delegieren dorthin und enthalten nur die spezifischen Abfragen.
3. Routen werden in `plugins/Routing.kt` registriert; jede Route ist eine `respondComprehension`, die `authenticate(...)`, `receiveKIO(...)` und den Serviceaufruf verbindet.
4. Fehler einer Domäne bilden sich über `ServiceError.respond()` auf `ApiError` ab (siehe [ADR-0011](0011-http-fehlersemantik-und-errorcode-muster.md)).

Ausnahmen ohne `boundary` sind reine Hilfsdomänen wie `sequence` (nur `SequenceRepo`, `SequenceConsumer`) und `timecode`. Stand September 2026 gibt es 58 Domänenverzeichnisse mit 56 `boundary`-, 55 `control`- und 57 `entity`-Ordnern.

## Verworfene Alternativen

- Abfragen direkt im Service (`EventInfoService`, ~280 Zeilen jOOQ): gebaut und am 2025-08-01 in `CompetitionMatchRepo`/`CompetitionMatchTeamRepo` verschoben, weil der Service sonst Ablauf und Zugriff vermischt und nicht gegen die Datenbank testbar bleibt.
- Handgeschriebene `insert`/`update`/`exists`/`delete` je Repo: bis Februar 2025 üblich, dann als generische Extensions herausgezogen, weil das jOOQ-Boilerplate in jedem Repo identisch war.
- Ein einziges flaches Paket je Schicht (alle Services, alle Repos): nicht belegt; die Umbenennung Race → Competition (`338b6536`) zeigt, dass eine Domäne als Ganzes verschoben wird.

## Konsequenzen

- Ein neues Feature legt drei Ordner an und berührt `Routing.kt`; wer nur einen Ordner anlegt, weicht sichtbar ab.
- Reine Entscheidungen gehören in `XyzLogic`-Objekte, damit sie ohne Datenbank testbar sind ([ADR-0030](0030-tests-testcontainers-und-reine-logik.md)). Beispiele: `LiveDashboardLogic.deriveMatchState` als einzige Stelle, die den Laufzustand ableitet ([ADR-0059](0059-laufzustand-eine-ableitung.md)).
- jOOQ-Kotlin-Typen sagen nichts über Nullbarkeit; die Wahrheit steht in `SQLDataType….nullable(false)` im Generat und in der Join-Form. Wer in `Conversions.kt` ein `!!` setzt, begründet es als Kommentar.
- SQL fasst leicht zu weit; Aufstellungen (Ersatzleute) entscheidet Kotlin in `getActuallyParticipatingParticipants` ([ADR-0038](0038-ersatzleute-als-eigene-entitaet.md)).
- Die Gleichförmigkeit kostet bei kleinen Domänen Dateien, die fast leer sind; das ist bewusst hingenommen.

## Quellen

- Commits: `17822e34` (Initial commit, erste Domänen), `f6f0e09d` (Event anlegen im Muster), `fde0109e` (Restrukturierung), `338b6536` (Race → Competition, Muster über eine ganze Domäne), `d6020d3d` (Standard-Repo-Implementierungen insert/update/exists), `008751ec` (delete), `4c0a2c7b` (fehlende Standard-Deletes), `d28fdc8f` (verschachteltes Jooq.query bereinigt), `15aa5f2b` (Abfragen aus dem Service in Repos verschoben)
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/`, `database/Extensions.kt`, `plugins/Routing.kt`
- Verwandte ADRs: [ADR-0001](0001-kotlin-ktor-jooq-flyway-backend.md), [ADR-0002](0002-kio-effektsystem.md), [ADR-0011](0011-http-fehlersemantik-und-errorcode-muster.md), [ADR-0030](0030-tests-testcontainers-und-reine-logik.md), [ADR-0059](0059-laufzustand-eine-ableitung.md)
