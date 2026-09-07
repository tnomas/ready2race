# ADR-0100: Fork-Arbeitsweise: Sammelzweig, Upstream-Merge-Requests, dann fork/main; Merge-Richtung, ein Worktree je Session, eigene Build-Datenbank, Archiv-Tags statt Zweige

- Status: angenommen
- Datum: 2026-08-03
- Bereich: prozess, betrieb
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

ready2race wird vom Upstream-Team lambda9 entwickelt und per Pull Request gepflegt ([ADR-0037](0037-upstream-entwicklungsprozess-pull-requests.md)). Der Projektinhaber Thomas Feddersen betreibt einen Fork ohne Push-Rechte auf das Upstream-Repository und baut dort vor und während der Regatta 2026 in hohem Tempo Funktionen, die als transparenter Vorschlag an lambda9 gehen sollen. Bis zu sechs Arbeitssitzungen liefen gleichzeitig in eigenen Worktrees. Dabei passierten die typischen Unfälle: eine Sitzung griff in fremde ungespeicherte Arbeit, eine andere erzeugte einen unvollständigen Merge-Commit, git meldete Konflikte in generierten Dateien oder gar keine, obwohl sich dieselbe Regel zweimal entwickelt hatte, und die geteilte Build-Datenbank des jOOQ-Codegens trug Migrationen fremder Worktrees, sodass Tests ohne eigenes Verschulden rot wurden.

## Entscheidung

**Zweige und Remotes**
- `fork` ist das eigene Remote (`tnomas/ready2race`), `origin` ist lambda9 und reine Lesequelle. „Mein main" ist `fork/main`; nach `origin` wird ohne ausdrückliche Freigabe des Projektinhabers nichts gepusht, auch fertige grüne Stände bleiben lokal. Vor jedem Push die Upstream-Zuordnung prüfen (`git for-each-ref --format='%(refname:short) -> %(upstream:short)'`).
- Phase 1 (03.08.–20.08.): Themenzweige werden einzeln in den Sammelzweig `feature/crf-2026` gemergt; `main` bleibt unangetastet. Das Sammelergebnis geht gebündelt als Merge-Requests an das Upstream-main (#97–#106); Arbeitsdokumente gehen bei Bedarf als eigener Doku-MR. Der Upstream-Zweig `issue/94` (Zeitnahme-Anbindung) wurde in den Sammelzweig gemergt statt als eigener MR geführt, Konflikte zugunsten des Sammelzweigs.
- Vor jedem weiteren MR wird `origin/main` zuerst in den eigenen Stand gemergt (Konflikte zugunsten main, wo main die Datei zuletzt anfasste); umbenannte Migrationen kommen dann als reine Renames, eigene Nummern weichen nach hinten aus.
- Phase 2 (ab 21.08.): `feature/crf-2026`, `feature/timing-module` und alle Folgearbeiten laufen per Merge direkt in das Fork-main; Einzelthemen gehen weiterhin als kleine MRs upstream (#107–#111). Am 25.08. wurde alles nach `fork/main` konsolidiert; der Sammelzweig ist Geschichte.
- Merge statt Rebase. Kleine Konfliktkorrekturen nach Merges (Schema-Felder am richtigen DTO, Migrationsnummern) sind eigene Commits. Bei `git merge --squash` nie `git stash` dazwischen; vor dem Commit `git add -A`, danach `git show --stat` gegenlesen: null Löschungen bei einem Merge, der bestehende Dateien ändert, sind ein Alarmzeichen. Nach jedem Mehrfach-Merge übersetzen lassen, nicht nur `git status` lesen.
- Alte Zweige leben als Tags `archiv/<datum>-<thema>` weiter und werden gelöscht; vor Aufräumaktionen `git push fork --all --tags`. Archiv-Zweige mit sechsstelligen Löschzahlen in `git diff --shortstat main..<zweig>` werden nie gemergt; ihre Inhalte stecken längst in main.

**Merge-Richtung: Sammelzweig zu mir**
- Der Zielzweig (früher `feature/crf-2026`, heute `main`) wird in den eigenen Zweig gemergt, dort, wo die Arbeit verstanden ist; dort werden Konflikte gelöst und Tests gefahren. Erst ein grüner eigener Zweig geht zurück, dann als Fast-Forward. Der Merge ist als Schleife zu planen: an belebten Tagen zog der Zielzweig sechsmal weiter, bevor ein Fast-Forward möglich war.
- Konflikte nie im geteilten Hauptcheckout lösen; vorab mit `git merge-tree --write-tree --name-only` prüfen.
- Generierte Artefakte (`types.gen.ts`, `sdk.gen.ts`, jOOQ-Klassen) werden nicht dem Auto-Merge überlassen: `npm run generate` und `mvn generate-sources` müssen den Stand byte-gleich reproduzieren; ein Diff nach dem Generator ist das Signal für Drift ([ADR-0004](0004-openapi-first-handgepflegte-yaml.md), [ADR-0052](0052-typespec-als-zweitbeschreibung.md)). Doppelt gewachsene Regeln werden im Merge auf eine Stelle zurückgeführt.

**Ein Worktree je Arbeitssitzung**
- Jede Sitzung arbeitet im eigenen Worktree: keine Branchwechsel im Hauptcheckout, kein Detachen, keine fremden Worktrees anfassen; liegt ein Zweig im Weg, wird das gemeldet, nicht freigeräumt. Vor jedem Schreibzugriff `git worktree list` und `git branch --show-current`.
- Ports je Worktree eigen vergeben (`HTTP_PORT`, `npx vite --port`, `VITE_API_BASE_URL`); fremde Prozesse nie beenden, vorher `lsof -p <pid> -a -d cwd`. Vor einem Backend-Build `pgrep -f classworlds.launcher.Launcher`, weil gleichzeitige Builds im selben `target/` den Kotlin-Inkrementalcache zerlegen.
- Bericht am Ende jeder Aufgabe: Zweig und Commit-Hash, Umfang, Testzahlen wörtlich, eigene Migrationsnummer und ausdrücklich das nicht Verifizierte. Vorbestehende Rotfärbung mit und ohne die eigene Änderung messen und beide Zahlen nennen. Migrationsnummern werden gemeldet, Merge-Commits nennen beanspruchte Nummern („claims no new migration version").

**Eigene Build-Datenbank je Worktree**
- Die geteilte Build-Datenbank `ready2race-build` (Port 7652) wird weder gewiped noch mit `flyway:clean` bereinigt; sie gehört auch den parallelen Sitzungen. Jeder Worktree baut gegen eine eigene Datenbank und gibt sie in jedem Maven-Aufruf mit `-Ddatabase.url=jdbc:postgresql://localhost:<port>/<db>` an (eine weitere DB im selben Container reicht, etwa `create database "r2r-build-<thema>"`). Nach jedem DB-Wechsel und jeder Schema-Änderung `./mvnw clean test`.
- Erkennungsmerkmal für verseuchten Codegen: Flyway-Stand der Build-DB gegen `ls backend/src/main/resources/db/migration/ | tail` halten. DB-Tests brauchen den Schalter nicht (Testcontainers, [ADR-0030](0030-tests-testcontainers-und-reine-logik.md)).

## Verworfene Alternativen

- **Viele kleine MRs je Feature** (Phase 1): der Vorschlag sollte als Ganzes mit Lastenheft-Charakter lesbar sein. Ausnahme am 20.08.: zwei Themen gingen direkt gegen main, weil lambda9 am nächsten Tag deployen wollte.
- **Zeitnahme-Anbindung als separater MR:** der Zeitstrahl brauchte den Ist-Start aus dem Feed; Merge in den Sammelzweig.
- **Feature-Zweig auf den Sammelzweig schieben** (06c42793: „der beides nicht kennt"): Konflikte gehören dorthin, wo die Arbeit verstanden ist.
- **Rebase statt Merge; Zweige behalten:** Historie bleibt nachvollziehbar, Tags reichen.
- **Mergen der Archiv-Zweige:** hätte 83.000 bis 236.000 Zeilen gelöscht.
- **`flyway:clean` auf der geteilten Build-DB:** zerstört parallele Sitzungen. **Ausweich-Migrationsnummer allein:** verschiebt das Problem nur.
- **Fremde Migration in der geteilten DB „nachbauen":** verschlimmert die Verseuchung.
- **Arbeiten im Hauptcheckout; Freiräumen fremder Zweige:** die Unfälle vom 07.08.

## Konsequenzen

- Die Historie ist merge-lastig; `git log --first-parent` liest sich besser als der volle Graph.
- Alte Commit-Hashes in Notizen sind nach den Historien-Umschreibungen ([ADR-0101](0101-sprach-und-commit-regeln-keine-herkunftsangaben.md)) mehrfach stale geworden; Hashes vor dem 10.08.2026 gelten nicht mehr als verlässlich.
- Ein Fix kann nach einem Merge stumm ins Leere laufen, ohne git-Konflikt (früherer Riegel im Zielzweig); nur ein eigener DB-Test fängt das.
- Gitignorierte Artefakte (Seeds, `.env`, `launch.json`) sterben mit dem Worktree; wichtige Dateien vor dem Aufräumen sichern.
- Wegwerf-Datenbanken bleiben stehen (das Worktree-Skript druckt nur den `drop`-Befehl); Dutzende alte Build-DBs sind der Preis.
- Der Bericht mit Migrationsnummer ist die einzige Kollisionsvermeidung; Kollisionen werden nach hinten umnummeriert ([ADR-0014](0014-flyway-migrationskonventionen.md)).
- Ein Push nach `origin` ist nie versehentlich möglich, aber jeder Push nach `fork` braucht die ausdrückliche Freigabe; das kostet Wartezeit und ist gewollt.

## Quellen

- Commits: `06c42793` (Sammelzweig in die Urkunden-Linie), `f513970f` (Catch-up), `72224bef` (Client neu generiert), `08bfe0e4`, `58310aa4` (Merges in Themenzweige), `a564f95e` (Typecheck repariert), `18347b84` (Handtest-Liste nach Merge), `8ce899d3`, `a4c66780` (Testkatalog-Blöcke), `52e7e9e6` (Seeds in den Hauptcheckout), `dab54dcb`, `d6c6a12d`, `c2d6687c` (eigene Build-DB), `27cd66b9` (Upstream benennt Migrationen um), `5da512a8` (Renames übernommen), `a30f2cda`, `004b5e02` (MR-Übersicht korrigiert), `61062548` (search_path-Konvention), `f3f0f77c` (Migrationen über den crf-2026-Stand gehoben), `bcd2c8d1` (Renntag-Merge), `88f13290` (#99), `50edd6d1` (#100), `3ed08156` (#103), `82e8b11b` (#105), `bfdea612` (feature/crf-2026 in main), `f77636ce` (feature/timing-module in main), `638748d1` (Konfliktkorrektur DTO), `d241f034` (Migrationskollision), `fbb7dc09`, `0a5b4a69` (Folge-Merges), `78582095` (Revert lässt Migration stehen), `bf42075c` (Rückbau mit Folge-Migration); Tags `archiv/*`
- Specs: `docs/superpowers/specs/2026-08-03-zeitstrahl-design.md` (§7), `docs/superpowers/plans/2026-08-09-raceclocker-rennen.md`, `docs/superpowers/plans/2026-08-10-boards.md`, `docs/superpowers/plans/2026-08-24-zeitnahmeprofil.md` („Bauumgebung"), `docs/crf-2026-folge-mr.md`
- Verwandte ADRs: [ADR-0004](0004-openapi-first-handgepflegte-yaml.md), [ADR-0014](0014-flyway-migrationskonventionen.md), [ADR-0030](0030-tests-testcontainers-und-reine-logik.md), [ADR-0037](0037-upstream-entwicklungsprozess-pull-requests.md), [ADR-0052](0052-typespec-als-zweitbeschreibung.md), [ADR-0053](0053-ki-arbeitsdateien-nicht-im-repo.md), [ADR-0101](0101-sprach-und-commit-regeln-keine-herkunftsangaben.md), ADR-0102
