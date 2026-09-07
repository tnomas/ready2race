# ADR-0057: KIO.fail ohne „!" ist ein No-Op: Bau- und Review-Regel für jeden Fehlerpfad

- Status: angenommen
- Datum: 2026-08-03
- Bereich: backend, prozess
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Das Backend schreibt seine Effekte in KIO-Comprehensions (ADR-0002). Darin bindet nur der `!`-Operator ein KIO in den Ablauf; ein nacktes `KIO.fail(...)` in Statement-Position erzeugt ein Objekt und verwirft es. Am 03.08.2026 stellte sich heraus, dass diese Bug-Klasse an mehr als fünfzehn Stellen lebte: Ein 404 beim Löschen eines unbekannten QR-Codes kam nie (die Route antwortete immer 200), eine zweite Multipart-Datei wurde stumm ignoriert, ein Vereins-Mismatch im OWN-Scope wurde nicht abgelehnt. Kein Compiler-Fehler, kein Test schlug an.

## Entscheidung

- **Jedes `KIO.fail` und jedes `KIO.failOn` in Statement-Position wird mit `!` gebunden.** Idiom: `!KIO.failOn(condition) { error }`. Expression-Positionen (letzter Ausdruck der Comprehension, `?:`, `when`-Zweige, `return@comprehension`) sind unkritisch, weil dort der Wert weitergereicht wird.
- **Suchmuster für Reviews:** `grep -rn "^\s*KIO\.fail" backend/src/main/kotlin`. Ein Treffer ohne `!` ist ein Befund. Der Sweep vom 03.08. fand danach keinen weiteren lebenden Fall.
- **Der `App<Nothing, …>`-Fall entgeht dem Muster:** Dort kompiliert ein `!` gar nicht, weil der Fehlerkanal nicht in der Signatur steht; der Fehlertyp muss erst in die Signatur. Multipart-Empfang gehört innerhalb der `respondComprehension`.
- **Tests pinnen das Verhalten:** Ein Test hält beide QR-Löschpfade fest (404 für den Verwaltungsendpunkt, idempotent für den Scanner), ein HTTP-IT belegt, dass der 404 wirklich auf der Leitung ankommt (`93399cb4`). Die Empfehlung aus den Arbeitsnotizen: Statt „nicht verifiziert" zu berichten, einen `testComprehension`-Fall schreiben und gegenprüfen, dass er auf dem alten Stand rot wird.
- Die Regel steht seither als „Global Constraint" in jedem Umsetzungsplan und war Prüfpunkt der Sicherheits-Durchsicht vor der Regatta (`docs/crf-2026-folge-mr.md` §3).

## Verworfene Alternativen

- Den Scanner-Löschpfad ebenfalls auf 404 umstellen: bewusst nicht, ein Helfer, der ein Band zweimal scannt, soll keinen Fehler sehen; der Pfad bleibt idempotent.
- Ein Lint oder Compiler-Plugin, das nackte `KIO.fail` verbietet: nicht belegt; die Regel lebt als grep-Muster und Review-Pflicht.

## Konsequenzen

- Jeder neue Fehlerpfad im Backend wird an genau dieser Stelle gelesen; frühe Ausstiege in Umbauten (etwa im vierphasigen `pollEvent`) sind der Ort, an dem der Fehler wieder entstehen kann (Spec 2026-08-09-raceclocker-rennen-design §6.3).
- Routen bekommen HTTP-Tests (401 ohne Sitzung, erreichbar mit), weil ein vergessenes `!` an `authenticate` ebenfalls nicht kompiliert-bricht (ADR-0030).
- Die Regel ist unsichtbar für Leser ohne KIO-Erfahrung; sie steht deshalb in `AGENTS.md` (Abschnitt Backend-Architektur) und muss in jedem Onboarding genannt werden.
- Ein Backlog-Fund bleibt: Der Sweep fand nur Statement-Positionen. Fehler, die als Wert gebaut und in einer Variablen geparkt werden, fängt das grep nicht.

## Quellen

- Commits: `ceb4ca9f` (Fix aller verworfenen `KIO.fail`-Werte), `09258d69` (404 beim Löschen eines unbekannten QR-Codes), `d0a790ae` (Test für beide Löschpfade), `93399cb4` (HTTP-IT: 404 erreicht die Leitung)
- Specs: `docs/superpowers/plans/2026-08-03-zeitstrahl.md` („Global Constraints"), `docs/superpowers/specs/2026-08-09-raceclocker-rennen-design.md` (§6.3), `docs/superpowers/specs/2026-08-05-testkatalog-crf-2026.md` (E9), `docs/crf-2026-folge-mr.md` (§3)
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/calls/comprehension/CallComprehension.kt`, `backend/src/test/kotlin/de/lambda9/ready2race/testing/TestExamples.kt`
- Verwandte ADRs: [ADR-0002](0002-kio-effektsystem.md), [ADR-0011](0011-http-fehlersemantik-und-errorcode-muster.md), [ADR-0030](0030-tests-testcontainers-und-reine-logik.md)
