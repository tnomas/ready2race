# ADR-0044: Abmeldung als eigene Entität; DNS/DNF/DQ im Freitextfeld statt neuer Spalte; Abmelden bis zum ersten Ergebnis; „erledigt" und „gefahren" getrennt

- Status: angenommen
- Datum: 2025-07-23
- Bereich: domäne, backend, frontend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Teams scheiden vor oder während eines Wettkampfs aus, ohne dass Meldung oder Rechnung verschwinden dürfen. Ergebnislisten brauchen dafür einen Status, und Schiedsrichter müssen „nie gestartet" (DNS), „aufgegeben" (DNF) und „disqualifiziert" (DQ/DSQ) unterscheiden. Der Status kommt aus drei Quellen: Handeingabe, Ergebnisdatei und Zeitnahme-Feed. Am Regattatag 2026 zeigte sich außerdem, dass eine invertierte Prüfung jede Abmeldung ab Materialisierung der Runde blockierte, und dass ein Lauf mit einer abgemeldeten von fünf Mannschaften als „Teilweise gewertet 1/5" stand, obwohl niemand gefahren war.

## Entscheidung

- **Abmeldung ist eine eigene Entität**: Tabelle `competition_deregistration` (Migration `V202508061200__deregistration.sql`) mit `competition_registration` als Primärschlüssel, `competition_setup_round` (ab welcher Runde, `on delete cascade`), `reason` und Audit-Spalten; Paket `competitionDeregistration`. Die Meldung bleibt bestehen.
- **Ausscheiden im Lauf** steht an `competition_match_team`: `out` (schon vorher weg, nur mitgeführt), `failed` (Boolean) und `failed_reason` (Freitext; Migration `V202508121045__mark_match_team_as_out.sql`). Ein Team hat entweder einen `place` oder `failed = true`.
- **DNS/DNF/DQ ohne Schemawechsel**: Das Ergebnisformular bietet eine Auswahl DNS/DNF/DSQ neben der Notiz; beides landet als führendes Kürzel plus Text im bestehenden `failed_reason`. Der Parser `frontend/src/utils/matchResultStatus.ts` liest nur ein führendes Kürzel (`DNS`, `DNF`, `DSQ`, `DQ`, `DISQ`; `DQ`/`DISQ` werden als `DSQ` angezeigt) und lässt den gespeicherten Text unverändert; „DNS beantragt, Wertung strittig" ist eine Notiz, kein Status. Mit diesem Parser kam Vitest ins Frontend (`matchResultStatus.test.ts`).
- **Abmelden bleibt erlaubt, bis das erste Boot bewertet ist**: `CompetitionDeregistrationLogic.teamIsScored(place, failed)` und `scoringHasStarted(teamsScored)` fragen über **alle** Boote des Laufs, weil Plätze relativ 1..n vergeben werden und ein späteres Entfernen sie hinter dem Rücken des Schiedsrichters verschieben würde. `out` und `deregistered` zählen nicht als Wertung, sonst würde eine frühere Abmeldung jede weitere blockieren. Ab der ersten Wertung gehört die Abmeldung ins Ergebnis, als Ausscheidung.
- **„Erledigt" und „gefahren" sind zwei Prädikate** (`LiveDashboardLogic`, 2026-08-14): `teamIsSettled(place, failed, deregistered)` beantwortet „wartet noch jemand auf ein Ergebnis?" und trägt Kette, `AWAITING_FINISH` und Beenden-Dürfen; `teamHasRaced` beantwortet „liegt ein sportliches Ergebnis vor?" und trägt nur die Ablesung „Teilweise gewertet" mit bereinigtem Nenner. Ein abgemeldetes Boot bleibt durchgestrichen in der Aufstellung und bekommt einen zweiten leisen Chip, keinen eigenen Laufzustand.

## Verworfene Alternativen

- **Eigene Statusspalte oder Enum neben `failed`**: nur gerechtfertigt, wenn der Status auswertbar sein müsste (Filter, Statistik, abweichende Wertung); DNS zählt weiterhin wie DNF (Spec `2026-08-02-result-status-dns-dq-design.md`, „Nicht Teil dieser Änderung").
- **Freitext durchsuchen** statt führendes Kürzel: verworfen, weil „Boot gedreht, DNS-Wertung strittig" kein DNS ist.
- **Prüfung nur für das abzumeldende Boot**: verworfen, weil die relative Platzvergabe alle Boote betrifft.
- **Abmeldung als eigener Laufzustand** und **Boot aus der Liste entfernen**: verworfen; eine Crew kann ein spurlos verschwundenes Boot nicht von einem Anzeigefehler unterscheiden.

## Konsequenzen

- Der Status ist nur zur Anzeige geparst; wer DNS und DNF unterschiedlich werten oder filtern will, muss dann doch eine Spalte einführen und die drei Schreibquellen (Formular, Datei-Import, Feed-Allowlist in [ADR-0056](0056-automatischer-feed-abruf-feed-ist-wahrheit.md)) umstellen.
- Ältere Daten ohne Kürzel fallen auf die bisherige Wortwahl zurück; der Parser gibt dann `status = null` und die Notiz zurück.
- Die Abmelde-Regel lebt als reine Logik neben dem Service und ist ohne Datenbank testbar; die Kette bleibt bewusst an `teamIsSettled`, sonst bliebe sie an einem Lauf stehen, dessen Boote alle abgemeldet sind ([ADR-0064](0064-aktivierungskette-ganzer-zeitplan.md)).
- Vier Stellen nutzten vor `eecbe3c9` ein Prädikat für zwei Fragen; wer eine weitere Ablesung baut, muss sich entscheiden, ob sie „erledigt" oder „gefahren" meint.

## Quellen

- Commits: `d1907a84` (Add deregistration), `85830c80` (Alternativen zum Platz: DNS, DNF), `2e76e2fc`, `4d4f0f71` (Ergebnisansicht mit failed/deregistered), `f22360d0` (DNS und DQ neben DNF), `92bb683e` (Abmelden in ungewerteter Runde wieder erlaubt), `a43a206a`, `eecbe3c9` (Abmeldungen nicht mehr als Wertung zählen)
- Migrationen: `V202508061200__deregistration.sql`, `V202508121045__mark_match_team_as_out.sql`
- Specs: `docs/superpowers/specs/2026-08-02-result-status-dns-dq-design.md`
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/competitionDeregistration/boundary/CompetitionDeregistrationLogic.kt`, `app/liveDashboard/boundary/LiveDashboardLogic.kt` (`teamIsSettled`, `teamHasRaced`), `frontend/src/utils/matchResultStatus.ts`
- Verwandte ADRs: [ADR-0026](0026-meldung-je-verein-teams-je-wettkampf.md), [ADR-0029](0029-durchfuehrung-laeufe-startnummern-platzierung.md), [ADR-0030](0030-tests-testcontainers-und-reine-logik.md), [ADR-0056](0056-automatischer-feed-abruf-feed-ist-wahrheit.md), [ADR-0059](0059-laufzustand-eine-ableitung.md), [ADR-0064](0064-aktivierungskette-ganzer-zeitplan.md), [ADR-0074](0074-freilos-ableitung-kein-zustand.md)
