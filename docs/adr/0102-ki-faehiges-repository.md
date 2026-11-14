# ADR-0102: KI-fähiges Repository: AGENTS.md und CLAUDE.md versioniert, ADR-Ordner als Entscheidungsgedächtnis

- Status: angenommen (ersetzt [ADR-0053](0053-ki-arbeitsdateien-nicht-im-repo.md))
- Datum: 2026-09-07
- Bereich: prozess
- Rekonstruiert: nein, zeitgleich mit der Umsetzung geschrieben

## Kontext

Seit Ende Juli 2026 entsteht der größte Teil der Arbeit in diesem Fork in parallelen,
teils autonomen Entwicklungssitzungen. Das Wissen darüber, **warum** etwas so gebaut ist,
lag verstreut in rund 1.200 ausführlichen Commit-Bodies, gut 80 Design-Specs und Plänen unter
`docs/superpowers/` und in Arbeitsnotizen außerhalb des Repos. Neue Sitzungen und neue
Entwickler mussten dieses Wissen jedes Mal neu zusammensuchen; mehrfach wurden bereits
verworfene Ansätze ein zweites Mal gebaut (Freilos ohne Start, Kettenmodus-Umbenennung,
Kurz/Lang-Schalter je Grafik).

Die Upstream-Entscheidung, `/CLAUDE.md` zu ignorieren (ADR-0053), stammt aus einer Zeit, in der
solche Dateien lokale Notizen waren. Im Fork ist die Arbeitsanleitung Projektbestand:
`AGENTS.md` wurde bereits am 2026-08-09 bewusst versioniert.

## Entscheidung

1. **`AGENTS.md` im Wurzelverzeichnis ist die werkzeugneutrale Arbeitsanleitung** für jeden
   Agenten und jeden Entwickler: Repo-Karte, Befehle, Architekturregeln, API-Änderungsablauf,
   Migrations- und Testkonventionen, Fallen im lokalen Betrieb, Git-Arbeitsweise, Sprachregeln,
   Domänenglossar. Sie beschreibt den **Ist-Zustand** und keine Historie.
2. **`CLAUDE.md` importiert `AGENTS.md`** (`@AGENTS.md`) und enthält nur, was Claude Code
   zusätzlich betrifft: Skill-Reihenfolge, Worktree-Skripte, Browser-Vorschau, Gedächtnisregeln,
   Verbote. Der Eintrag `/CLAUDE.md` wurde aus `.gitignore` entfernt.
3. **`docs/adr/` ist das Entscheidungsgedächtnis.** Jede Architektur- oder Produktentscheidung
   mit Dauerwirkung bekommt ein ADR nach `docs/adr/template.md` mit fortlaufender Nummer.
   ADRs werden nicht umgeschrieben, sondern durch neue ersetzt („ersetzt durch"). Verworfene
   Alternativen und wieder ausgebaute Features gehören ausdrücklich hinein.
4. **Die bestehenden Entscheidungen wurden rekonstruiert** (ADR-0001 bis ADR-0101) aus der
   vollständigen Commit-Historie seit 2024-12-19, den Specs und Plänen unter `docs/superpowers/`
   und den Arbeitsnotizen. Jedes rekonstruierte ADR ist als solches gekennzeichnet und nennt
   seine Belege (Kurz-SHAs, Spec-Pfade). Die Rekonstruktion ist eine Momentaufnahme vom
   2026-09-07; wo Quellen keine Alternativen nannten, steht „Keine belegt".
5. **Pflegeregel:** Wer eine Entscheidung trifft oder revidiert, schreibt im selben Zweig das
   ADR und ergänzt den Index in `docs/adr/README.md`. Wer Befehle, Struktur oder Regeln ändert,
   aktualisiert `AGENTS.md`. Ein Gedächtnis außerhalb des Repos ist Ergänzung; bei Widerspruch
   gilt das Repo.

## Verworfene Alternativen

- **`/CLAUDE.md` weiter ignorieren und nur `AGENTS.md` versionieren.** Claude Code liest
  `CLAUDE.md`, nicht `AGENTS.md`; eine ignorierte Datei driftet auf jedem Rechner anders.
  Der Import `@AGENTS.md` hält beide Dateien ohne Doppelpflege zusammen.
- **Eine große `CLAUDE.md` statt zweier Dateien.** Andere Werkzeuge und Menschen lesen
  `AGENTS.md`; Claude-spezifische Hinweise (Skills, Browser-Pane, Memory) gehören nicht in
  die werkzeugneutrale Anleitung.
- **ADRs nur ab heute, keine Rekonstruktion.** Genau die Entscheidungen der letzten sechs
  Wochen (Laufzustände, Zeitnahmeprofil, Stream-Domäne) werden am häufigsten wieder aufgeworfen;
  ohne Rekonstruktion wäre der Ordner zunächst leer und damit wertlos.
- **Ein einziges großes Architekturdokument statt ADRs.** Es veraltet als Ganzes und hält keine
  verworfenen Alternativen fest; ADRs sind einzeln ersetzbar und datiert.
- **Die alte Upstream-Anleitung `CLAUDE_v01.md` löschen oder umschreiben.** Sie ist eine
  Upstream-Datei; eine Änderung erzeugte Konflikte in jedem Merge-Request an lambda9. Sie bleibt
  liegen und ist in `AGENTS.md` als historisch markiert (veraltete Angaben: JWT, `build.sh`,
  „kein Frontend-Testrunner", nur zwei Sprachen).
- **ADRs in `docs/superpowers/specs/` ablegen.** Specs sind Entwürfe vor der Umsetzung, ADRs
  das, was danach gilt; die Trennung macht beides auffindbar.

## Konsequenzen

- Jeder Merge-Request an das Upstream-Team trägt `CLAUDE.md` und `docs/adr/` mit. Das ist
  gewollt (Transparenz über Entscheidungen), kann aber dort als Rauschen empfunden werden.
- Zwei Dateien mit Verweis aufeinander: `AGENTS.md` darf nichts Claude-spezifisches enthalten,
  `CLAUDE.md` nichts Allgemeines. Verstöße fallen bei der nächsten Sitzung auf, nicht beim Commit.
- Rekonstruierte ADRs tragen die Unsicherheit ihrer Quellen. Kurz-SHAs aus der Zeit vor dem
  2026-08-10 sind nach Historien-Umschreibungen teils nicht mehr auflösbar und wurden weggelassen.
- Die ADR-Nummern sind chronologisch nach Datum der Entscheidung vergeben, nicht nach Thema.
  Wer nach Thema sucht, nutzt den Index in `docs/adr/README.md`.
- Der Ordner ist nur so gut wie seine Pflege: ein neues Feature ohne ADR ist ab jetzt eine
  Lücke, die im Review benannt werden soll.

## Quellen

- Commits: `192a2f58` (AGENTS.md wird getrackt, Sitzungsarbeitsbereich bleibt aus der
  Historie, 2026-08-09); `ec64138e` (Upstream ignoriert `/CLAUDE.md`, 2025-09-10)
- Verwandte ADRs: [ADR-0053](0053-ki-arbeitsdateien-nicht-im-repo.md),
  [ADR-0100](0100-fork-arbeitsweise-worktrees-merge-richtung-build-db.md),
  [ADR-0101](0101-sprach-und-commit-regeln-keine-herkunftsangaben.md)
- Dateien: `AGENTS.md`, `CLAUDE.md`, `docs/adr/template.md`, `docs/adr/README.md`
