@AGENTS.md

# Claude-spezifische Ergänzungen

`AGENTS.md` ist die werkzeugneutrale Wahrheit über Struktur, Befehle und Regeln. Hier steht nur,
was Claude Code zusätzlich betrifft.

## Arbeitsweise

- Vor Umbauten mit Entscheidungscharakter: Brainstorming-Skill, dann Spec nach
  `docs/superpowers/specs/`, Plan nach `docs/superpowers/plans/`, **und ein ADR** nach `docs/adr/`.
  Kleine, klar umrissene Änderungen brauchen kein Dokument, aber einen sauberen Commit-Body.
- Test-getrieben arbeiten (Backend `testComprehension`, Frontend Vitest für Logik in `utils/`).
  Vor „fertig" den Verifikations-Skill anwenden: Befehle laufen lassen, Ausgabe zitieren.
- Autonome Nachtläufe sind üblich: dann Entscheidungen im Abschlussbericht offenlegen, nichts
  Destruktives ausführen, nicht nach Upstream (`origin`) pushen.

## Worktrees und lokaler Stack

- Jede Session arbeitet in einem eigenen Worktree unter `.claude/worktrees/<name>/` (gitignored).
  `.claude/worktree.sh neu|adopt|weg|zeigen <name>` legt Zweig, Ports (8100+/5140+), eigene
  Datenbank `r2r_<name>` und `launch.json`-Einträge an. `.claude/stack.sh start|stop|status|seed`
  fährt den Stack des Hauptcheckouts (8080/5123).
- Browser-Vorschau über `.claude/launch.json` (`preview_start` mit Konfigurationsnamen), nie Dev-Server
  per Bash im Vordergrund starten. `worktree.sh adopt` schreibt die `launch.json` des Hauptcheckouts;
  die Vorschau liest die des Worktrees, Einträge ggf. von Hand kopieren.
- `backend/.env` und `frontend/.env` sind für Shell-Lesezugriffe gesperrt; kopieren geht. Ohne `.env`
  hilft ein Wegwerf-Stack: Docker-Postgres, eigene Env-Datei im Scratchpad mit allen Pflichtschlüsseln,
  Session per `localStorage` injizieren. Zugangsdaten gibt Claude nie ein, auch nicht bei Drittanbietern.

## Verifikation im Browser-Pane

- Ein verdecktes Dokument drosselt Timer, pausiert `requestAnimationFrame` und friert Transitions ein.
  Vor jedem Befund `document.visibilityState` prüfen; Messungen aus gedrosselten Seiten tragen keine
  Änderung an geteilten Bausteinen.
- Board- und Info-Hooks wenden Pushes im verdeckten Tab nicht an: zum Prüfen neu laden. String-Checks
  gegen ausgelieferte Module lügen (esbuild normalisiert Quotes).
- Klicks per `computer` scheitern im verborgenen Pane; `navigate`, `javascript_tool`, `get_page_text`
  und Screenshots funktionieren. Flüchtige Einblendungen nicht mit Warteschleifen jagen, sondern
  Anzeigedauern hochdrehen oder den Zustand per API prüfen.
- Nichts als verifiziert ausgeben, was nie in der laufenden App zu sehen war; offene Handtests landen
  als Block im jeweiligen Testkatalog.

## Subagenten

- Builds und Tests im Vordergrund mit großzügigem Timeout laufen lassen; ein Agent, der nur einen
  Wartestatus meldet, wird sofort nachgefasst.
- Nach subagent-getriebener Arbeit ist ein Schlussreview über den ganzen Zweig Pflicht: Fehler
  entstehen zwischen den Aufgaben, nicht in ihnen.

## Gedächtnis

- Claude hat ein persistentes Projektgedächtnis (Memory-Dateien außerhalb des Repos). Was dort steht,
  ist Ergänzung; widerspricht es `AGENTS.md` oder einem ADR, gilt das Repo, und das Gedächtnis wird
  korrigiert.
- Erkenntnisse mit Dauerwert gehören ins Repo (AGENTS.md, ADR, Spec), nicht nur ins Gedächtnis.

## Nicht tun

- Keine ClickUp-Aufgaben, -Kommentare oder -Erinnerungen für dieses Projekt.
- Keine KI-Nennung in Commits, PR-Texten oder Dateien; keine `Co-Authored-By`-Zeilen.
- Keine Herkunftsangaben zu fremder Software als Vorbild (siehe AGENTS.md, Abschnitt 10).
- Keine Archiv-Zweige mergen, keine fremden Worktrees oder Prozesse anfassen.
