# ADR-0053: KI-Arbeitsdateien gehören nicht ins Repository (CLAUDE.md ignoriert)

- Status: ersetzt durch [ADR-0102](0102-ki-faehiges-repository.md)
- Datum: 2025-09-10
- Bereich: prozess
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Im Herbst 2025 tauchten beim Upstream-Team lokale KI-Assistenz-Anweisungen und Planungsnotizen in Commits auf. Solche Dateien waren als persönliche Arbeitsmittel gedacht, nicht als Teil des Produkts, und sie beschrieben den Stand einzelner Arbeitsplätze statt des Projekts. Das Team wollte verhindern, dass sie in Reviews und in die Historie geraten.

## Entscheidung

- Die Datei `/CLAUDE.md` im Wurzelverzeichnis steht seit dem 2025-09-10 in `.gitignore` (Commit `ec64138e`, als Beifang des WebDAV-Datenexports). Die Regel blieb bis zur Ablösung durch [ADR-0102](0102-ki-faehiges-repository.md) in Kraft; der Fork hat daneben `/.claude/` (Arbeitsverzeichnis mit Hilfsskripten, Screenshots und Worktrees) und `.superpowers/` (Mockups aus dem Brainstorming) ergänzt.
- Die Regel erfasste nur den Dateinamen `CLAUDE.md`. Andere Arbeitsdateien blieben ungeregelt: `CLAUDE_v01.md` (eine Projektbeschreibung) wurde am 2025-12-02 eingecheckt (`de0de3eb`) und liegt weiterhin im Repository; `THEME_IMPLEMENTATION_PLAN.md` (`5db6ee5b`) und `ISSUE-94-KOMMENTAR.md` (`dd8d67b8`) wurden committet und am 2026-07-21 als „obsolete md files" wieder entfernt (`0ac21916`).

## Verworfene Alternativen

- **Konsequente Einhaltung** für alle Arbeitsdateien: nicht umgesetzt; die Regel wurde nur für den einen Dateinamen erzwungen, und Planungsdateien gelangten trotzdem ins Repo.
- **Versionierte Projektanweisungen** als Alternative zur Ignorierregel: zu diesem Zeitpunkt nicht erwogen; genau das führt [ADR-0102](0102-ki-faehiges-repository.md) ein.

## Konsequenzen

- Wissen über das Projekt, das in solchen Dateien stand, lebte außerhalb der Historie und ging mit dem Arbeitsplatz verloren; für Außenstehende und für den Fork war der Stand der Anweisungen nicht rekonstruierbar.
- Die Regel widersprach der späteren Praxis im Fork, Specs und Pläne unter `docs/superpowers/` sowie Testkataloge unter `docs/` zu versionieren: dieselbe Art von Arbeitsdokument war einmal ignoriert und einmal eingecheckt, je nach Dateiname.
- `CLAUDE_v01.md` ist ein eingechecktes Relikt, das weder gepflegt noch ignoriert wird.
- Die Aufhebung: [ADR-0102](0102-ki-faehiges-repository.md) versioniert `AGENTS.md`, `CLAUDE.md` und den ADR-Ordner `docs/adr/` als Teil des Repositories, weil Projektanweisungen und Entscheidungen zum Projekt gehören und nicht zum Arbeitsplatz. Die Ignorierregel für `/.claude/` (Arbeitsverzeichnis, Worktrees) bleibt davon unberührt.

## Quellen

- Commits: `ec64138e` (`.gitignore`: `/CLAUDE.md`), `de0de3eb` (`CLAUDE_v01.md` eingecheckt), `5db6ee5b` (`THEME_IMPLEMENTATION_PLAN.md`), `dd8d67b8` (`ISSUE-94-KOMMENTAR.md`), `0ac21916` (Remove obsolete md files)
- Dateien: `.gitignore`, `CLAUDE_v01.md`
- Verwandte ADRs: [ADR-0037](0037-upstream-entwicklungsprozess-pull-requests.md), [ADR-0100](0100-fork-arbeitsweise-worktrees-merge-richtung-build-db.md), [ADR-0101](0101-sprach-und-commit-regeln-keine-herkunftsangaben.md), [ADR-0102](0102-ki-faehiges-repository.md)
