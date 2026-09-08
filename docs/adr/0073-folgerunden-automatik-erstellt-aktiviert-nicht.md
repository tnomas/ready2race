# ADR-0073: Folgerunden-Automatik erstellt Runden, aktiviert aber nichts; Korrekturen laufen über Löschen

- Status: angenommen
- Datum: 2026-08-09
- Bereich: domäne, backend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

„Nächste Runde erstellen" war die Stelle, an der die Regatta wartete: Nach dem letzten Ergebnis einer Runde musste jemand im Büro klicken, bevor die Kette (ADR-0064) weitergehen konnte. `createNewRound` war bereits formatunabhängig. Die Automatik durfte weder die Aktivierungskette noch den Aufrufer gefährden, der ein Ergebnis schreibt.

## Entscheidung

1. **Auslöser:** Nach jeder Zustandsänderung eines Laufs (Beenden, Absagen, Handeingabe, Datei, Feed, auch Rundenabsage) prüft `AutoRoundProgressionService`, ob die Runde vollständig ist, und erstellt die nächste. Die Regel steht in `AutoRoundProgressionLogic`: `matchIsSettled` verlangt `finished_at` UND gesetzte Plätze; ein Freilos oder ein abgesagter Lauf gilt als erledigt, `AWAITING_FINISH` nicht. Die Prüfung ist beweisbar eine Verschärfung dessen, was der Knopf zulässt. Der Auslöser sitzt nicht in `deleteCurrentRound`; ein Widerruf einer Absage löst nicht aus.
2. **Es wird nichts aktiviert.** Ob die neue Runde an den Start geht, entscheidet allein die Zeitstrahl-Kette nach `chain_progression_mode` (ADR-0065).
3. **Fehler bleiben still.** Jede Abbruchursache ist ein No-op; ein Fehler wird protokolliert und verschluckt, es gibt keinen `orDie`-Pfad. Ein Beenden darf nie daran scheitern, dass die Folgerunde nicht entsteht.
4. **Konfiguration:** `event.auto_create_following_rounds` (Vorgabe `false`) und `competition.auto_create_following_rounds` nullable (`V202608091501`), gelesen per coalesce Wettkampf-vor-Event (`AutoRoundProgressionLogic.effectiveAutoCreate`).
5. **Vermerke:** `competition_setup_round.materialized_at` („hatte einmal Läufe", überlebt Löschen) und `competition_match.pairings_recalculated_at` als Notiz an neu berechneten Paarungen. Die Notiz verschwindet bei Aktivierung, Start oder Ende – Regel im Backend, nicht in zwei Oberflächen. Öffentliche Anzeigen bekommen das Feld nicht.
6. **Korrektur über Löschen.** Die bestehende Sperre gegen Ergebnisänderungen bei existierender Folgerunde bleibt. Wer Läufe korrigieren will, löscht vor jeder Korrektur die Folgerunde; die Bestätigung nennt die Zahl der bereits sichtbaren Läufe (reine Freilos-Runden warnen nicht).

## Verworfene Alternativen

- Automatik für die erste Runde: hängt an finalisierten Meldungen, bleibt Handarbeit.
- Alte `matchIsDone`-Formel (nur `finishedAt`) übernehmen: als Fußangel entfernt (`fff43b10`).
- Neue Sperre in `deleteCurrentRound` gegen gestartete Läufe: Verhaltensänderung außerhalb des Auftrags.
- Aufheben der Ergebnissperre bei Korrekturen: hätte eine im Entwurf zugesagte Eigenschaft gedreht.
- Eigener Enum statt nullable Boolean; Historie, wer welche Runde erzeugen ließ; Anzeige des Vermerks auf öffentlichen Anzeigen: bewusst weggelassen.

## Konsequenzen

- Mehrfach-Korrektur ist mühsam: Nach dem Löschen des Finales erzeugt die Automatik es nach der ersten Vorlauf-Korrektur sofort neu, die zweite scheitert an der Sperre (Testkatalog E2–E4). Hingenommen, im Betrieb zu bewerten. Schmalster künftiger Eingriff: nur auslösen, wenn die Setup-Runde noch nie materialisiert war (`materialized_at` ist dafür da).
- `materialized_at` („hatte einmal Läufe") und `round_materialized` („hat jetzt Läufe") sind zwei verschiedene Aussagen; nicht verwechseln.
- Wer neue Wege einführt, auf denen ein Lauf ein Ergebnis bekommt (etwa das interne Zeitnahme-Modul, ADR-0087), muss den Auslöser aufrufen.
- Stille Fehler heißen: Wenn keine Folgerunde erscheint, steht der Grund nur im Log.

## Quellen

- Commits: `65505a37`, `22b3f3cf`, `2de9f6f9`, `6755b61d`, `fff43b10`, `1ffd142e`, `406735d5`, `9288d351`, `2b0f3bcd`, `426e948c`, `8f1abbf0`, `6f61a507`, `56e22a8b`, `35d532ae`
- Migrationen: `V202608091501__auto_create_following_rounds.sql`
- Code: `AutoRoundProgressionService.kt`, `AutoRoundProgressionLogic.kt` (`app/competitionExecution/boundary`)
- Specs: `docs/superpowers/specs/2026-08-09-folgerunden-automatik-design.md`, `docs/superpowers/specs/2026-08-10-folgerunden-automatik-testkatalog.md`, `docs/superpowers/plans/2026-08-09-folgerunden-automatik.md`
- Verwandte ADRs: [ADR-0028](0028-wettkampf-setup-runden-matches-vorlagen.md), [ADR-0061](0061-lauf-endet-nur-durch-aktiven-input.md), [ADR-0064](0064-aktivierungskette-ganzer-zeitplan.md), [ADR-0065](0065-kettenmodus-dreiwertig-regattabuero-beendet-immer.md), [ADR-0074](0074-freilos-ableitung-kein-zustand.md), [ADR-0087](0087-eigenes-zeitnahme-modul-append-only.md)
