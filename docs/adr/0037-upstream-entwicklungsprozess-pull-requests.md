# ADR-0037: Upstream-Entwicklungsprozess: Ticket-Branches, Review per Pull Request auf GitHub

- Status: angenommen
- Datum: 2025-02-26
- Bereich: prozess
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Beim Upstream-Team lambda9 arbeiteten drei bis vier Entwickelnde parallel an ready2race. Die Arbeit war in einem internen Ticketsystem organisiert; Integration und Review brauchten eine Form, die ohne ständige Abstimmung funktioniert. Bis März 2025 lag das Repository auf einem GitLab, danach öffentlich auf GitHub.

## Entscheidung

- Jede Änderung entsteht auf einem eigenen Zweig, benannt nach dem Ticket: `feature/<ticket>` für neue Funktionen, `fehler/<ticket>` für Fehlerbehebungen (Beispiele: `feature/14334`, `fehler/15449`). Auch zusätzliche Kennungen wie `feature/14334-event-registration` kommen vor.
- Commit-Betreffzeilen tragen die Ticketnummer in eckigen Klammern, etwa `[#16562] Add configurable csv export for start lists`. Die Historie enthält über 180 solcher Commits.
- Integration läuft über Review: bis zum 2025-03-17 als Merge-Requests auf GitLab in den Zweig `master` (`Merge branch 'feature/14334' into 'master'`, insgesamt elf solche Merges), seitdem als Pull Requests im GitHub-Repository `lambda9-gmbh/ready2race` in den Hauptzweig `main` (`Merge pull request #1 from lambda9-gmbh/feature/14334-event-registration`).
- Nacharbeiten aus dem Review landen als eigene Commits auf dem Zweig („Fix notes from Merge Request Review"), nicht als umgeschriebene Historie.
- Der Hauptzweig heißt seit dem Umzug `main`, nicht mehr `master`.

## Verworfene Alternativen

- Keine belegt. Die Historie zeigt weder Trunk-based-Arbeiten direkt auf `main` noch ein Rebase-Regime; Merge-Commits sind der Normalfall.

## Konsequenzen

- Die Upstream-Historie ist nach Tickets lesbar, aber die Tickets selbst liegen in einem internen System, das außerhalb von lambda9 nicht einsehbar ist. Für Außenstehende trägt nur die Betreffzeile Bedeutung; deshalb rekonstruieren die ADRs Entscheidungen aus Commits, nicht aus Tickets.
- Der Fork des Projektinhabers muss diesen Prozess bedienen, wenn Änderungen zurückfließen sollen: Pull Requests gegen `main` auf GitHub, englische Betreffzeilen, keine Ticketnummern (siehe [ADR-0100](0100-fork-arbeitsweise-worktrees-merge-richtung-build-db.md) und [ADR-0101](0101-sprach-und-commit-regeln-keine-herkunftsangaben.md)).
- Parallele Feature-Zweige erzeugen parallele Flyway-Migrationen; die Regel „vor dem Merge umbenennen" in [ADR-0014](0014-flyway-migrationskonventionen.md) ist die direkte Folge dieses Prozesses.
- Review-Nacharbeiten als eigene Commits bedeuten, dass ein Feature in der Historie oft aus WIP-Commit, Hauptcommit und mehreren Fix-Commits besteht; `git blame` führt daher häufig zu einem „Fix notes"-Commit statt zur eigentlichen Entscheidung.

## Quellen

- Commits: `1b805cd5` (Merge branch 'feature/14334' into 'master'), `13ea19b5` (Merge branch '15011' into 'master'), `48daf418` (Fix notes from Merge Request Review), `22af000c` (Merge pull request #1, erster GitHub-PR), `b829c7b8` (Merge pull request #4 from fehler/15449), `072a7da9` (Merge with main)
- Verwandte ADRs: [ADR-0014](0014-flyway-migrationskonventionen.md), [ADR-0036](0036-lizenz-gplv3-publiccode.md), [ADR-0100](0100-fork-arbeitsweise-worktrees-merge-richtung-build-db.md), [ADR-0101](0101-sprach-und-commit-regeln-keine-herkunftsangaben.md)
