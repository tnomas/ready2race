# ADR-0030: Tests gegen echtes Postgres via Testcontainers; Entscheidungen in reinen Logik-Objekten; Frontend nur reine Logik mit Vitest

- Status: angenommen
- Datum: 2025-03-14
- Bereich: prozess, backend, frontend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Services sollen mit echter Datenbank getestet werden, ohne jOOQ zu mocken. Das Upstream-Team lambda9 legte dafür im März 2025 ein Test-Harness an. Im Fork zeigte sich im August 2026 zweimal dieselbe Lücke: Ein Fehler saß genau dort, wo kein Test hinsah, einmal in einer jOOQ-Abfrage mit aliasiertem `coalesce` im WHERE (jede Aktivierung über den Zeitplan endete mit HTTP 500), einmal in einer Bedingung im Render eines React-Hooks (ein Warnhinweis erschien nie). Das Frontend hatte bis zum 2026-08-02 keinen Testlauf.

## Entscheidung

**Backend**
- `backend/src/test/kotlin/de/lambda9/ready2race/testing/testing.kt` stellt `testComprehension { … }` bereit: ein `PostgreSQLContainer("postgres:17")` je JVM, Flyway migriert, `initializeDatabase` sät; jeder Fall läuft in einer Transaktion mit Rollback am Ende. `testApplicationComprehension { … }` fährt die ganze Ktor-Anwendung, markiert die Datenbank als `dirty` und erzwingt vor dem nächsten Lauf `clean` + `migrate`. Scope-Helfer: `!`, `assertKIOSucceeds`, `assertKIOFails`, `assertKIODies`.
- **Entscheidungen leben in reinen `*Logic`-Objekten** (`LiveDashboardLogic`, `CompetitionDeregistrationLogic`, `OpenRequirementLogic`, `EventScheduleLogic`, `TimingProfileResolveLogic`, `RequirementScopeLogic`, `TimingSplitLogic` …) und werden per Unit-Test ohne Datenbank geprüft.
- **Alles, was nicht rein ist, wird gegen Testcontainers belegt**: Repo-Abfragen, Ketten-Trigger, Vereinsketten in den Anzeigen, Vorlagen-Export/-Import, Migrationen (Flyway wird vor der Migration angehalten, der Altzustand von Hand eingelegt, dann migriert). Gemeinsame Fixtures (z. B. `ClubChainFixture`) beweisen, dass mehrere Anzeigen aus denselben Daten dasselbe bauen.
- Tests laufen durch den Service, an dem der Fehler entstand, nicht am Repo vorbei. Ein Wächter, der nur „gültig" prüft, ist kein Wächter: Der Negativfall gehört dazu.
- Routen bekommen HTTP-Tests (401 ohne Sitzung, erreichbar mit), weil ein vergessenes `!` an `authenticate` nicht kompiliert-bricht ([ADR-0057](0057-kio-fail-ohne-bang-ist-no-op.md)). Klassen mit Suffix `IT` (`*HttpIT`) laufen nur auf Abruf (`-Dtest=<Klasse> -DfailIfNoSpecifiedTests=false`); Surefire nimmt nur `*Test`.
- Unerwartetes Verhalten wird als Testfall gesammelt (`220d501d`).

**Frontend**
- Vitest im Node-Umfeld; `frontend/vite.config.ts` sammelt `src/**/*.test.ts`, nicht `.tsx`. Alles Prüfbare wird in reine `.ts`-Module gezogen (`polling.ts`, `matchStatusChip.ts`, `boardLayout.ts`, `eventOperations.ts`, `scanDecision.ts`, `createStaleWatch` …). Speicherzugriffe werden als `WebStorageLike` injiziert. Layouts werden im laufenden Dev-Server geprüft, nicht getestet.

## Verworfene Alternativen

- Mocks für jOOQ-Repos: nie gebaut; die Alias-Falle wäre damit unsichtbar geblieben.
- Dauerhaftes Auslassen eines Tests wegen veraltetem Testcontainers (`bd3e8ee1`): nach zwei Tagen Versionsanhebung und Reaktivierung (`68474eb4`).
- `*IT`-Konvention für DB-zurücksetzende Service-Tests: für `MyEventService` zurückgenommen (`8d945137`), weil ein Zugriffsguard-Test unter `IT` nie lief.
- jsdom/testing-library und Komponententests im Frontend: bewusst nicht eingeführt; Logik in Hooks und Komponenten zu belassen wurde als Ursache erkannt, nicht als Testgegenstand.

## Konsequenzen

- Docker muss laufen; ein `testComprehension`-Fall kostet 6–19 Sekunden, ein Dutzend DB-Fälle sind Minuten CI-Zeit. Das ist kein Fehler im Test, sondern der Preis für echte Abfragen.
- Jeder Worktree braucht eine eigene Build-Datenbank für den jOOQ-Codegen, sonst driften Tests durch fremde Migrationen ([ADR-0100](0100-fork-arbeitsweise-worktrees-merge-richtung-build-db.md)). Nach Schemaänderungen `./mvnw clean test`, sonst `NoSuchMethodError` in fremden Tests.
- Die Regel „reine Logik zuerst" verändert den Code-Schnitt: Neue Funktionen bringen ein `*Logic`-Objekt bzw. ein `.ts`-Modul mit, die Komponente oder der Service ruft es nur.
- HttpIT-Tests laufen nicht automatisch; wer eine Route absichert, muss sie bewusst aufrufen.
- Frontend-Layoutfehler findet kein Test; die Prüfung im Browser bleibt Handarbeit.

## Quellen

- Commits: `58eaa063` (Test für KIO und DB-Umgebung), `cb7c5e79` (Testing-Interface, Beispiele), `6d16d568`/`30509885` (Query-Printer), `220d501d` (unerwartetes Verhalten als Testfälle), `cdbb6807` (Sandbox-Rollback), `4716debd` (Jackson-Null-Test), `bd3e8ee1`/`68474eb4` (Testcontainers deaktiviert/reaktiviert), `42436c47` (Stand „nur pure Logic"), `6e52bbc4` (getCandidates gegen Postgres), `489db085`/`9e406ea8`/`03fb4311`/`d2b893ba`/`f288bedf` (DB-Tests), `97739481`/`93399cb4` (Routen unter Test), `8d945137` (IT-Konvention zurückgenommen), `41ece476` (Stale-Watch ohne Re-Render), `6133a12f` (Test durch den Service), `0481c909` (Migrationstest mit eigenem Container), `83ee9da8` (Wächter bekommt Wächter), `1e0343c1` (Sperre als prüfbare Regel)
- Specs: `docs/superpowers/specs/2026-07-30-schiedsrichter-dashboard-backlog.md` (Anlass C6), `docs/superpowers/specs/2026-08-07-raceclocker-polling-design.md` („Tests"), `docs/superpowers/specs/2026-08-09-einheitlicher-laufstatus-oeffentlich-design.md` (§3.1), `docs/superpowers/plans/2026-08-09-pwa-helfer-app.md`, `docs/superpowers/plans/2026-09-02-helfer-app-ablauf.md`, `docs/superpowers/specs/2026-08-02-result-status-dns-dq-design.md`
- Code: `backend/src/test/kotlin/de/lambda9/ready2race/testing/testing.kt`, `backend/src/test/kotlin/de/lambda9/ready2race/testing/TestExamples.kt`, `frontend/vite.config.ts`
- Verwandte ADRs: [ADR-0002](0002-kio-effektsystem.md), [ADR-0003](0003-entity-control-boundary-je-domaene.md), [ADR-0057](0057-kio-fail-ohne-bang-ist-no-op.md), [ADR-0100](0100-fork-arbeitsweise-worktrees-merge-richtung-build-db.md)
