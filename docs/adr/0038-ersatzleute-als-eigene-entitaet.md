# ADR-0038: Ersatzleute (Substitution) als eigene Entität je Meldung und Runde; Aufstellung entscheidet Kotlin, nicht SQL

- Status: angenommen
- Datum: 2025-07-09
- Bereich: domäne, backend, datenbank
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Während der Durchführung eines Wettkampfs fallen Teilnehmende aus und werden ersetzt, teils erst ab einer bestimmten Runde, teils mit Rücktausch in einer späteren Runde. Die Meldung des Vereins darf davon unberührt bleiben, weil an ihr Rechnung, Gebühren und die Nachvollziehbarkeit hängen. Gleichzeitig müssen Startlisten, Urkunden, Bedingungsprüfungen und „Mein Event" die tatsächlich fahrende Besatzung zeigen.

## Entscheidung

- Ein Wechsel ist eine eigene Zeile in der Tabelle `substitution` (Migration `V202507091030__substitution.sql`): `competition_registration`, `competition_setup_round` (mit `on delete cascade`), `participant_out`, `participant_in`, `reason`, `order_for_round`, `named_participant` und die üblichen Audit-Spalten. Der Unique-Index `order_for_round_unique_in_round` auf `(competition_setup_round, order_for_round)` legt die Reihenfolge mehrerer Wechsel in einer Runde fest.
- Wechsel gelten ab ihrer Runde für alle folgenden Runden. Jede Abfrage von Teams oder Teilnehmern in der Durchführung wendet die Substitutionen an; Startlisten und Ergebnisdokumente werden aus den persistierten Match-Daten nach Anwendung der Wechsel gebaut.
- Geschlechts- und Altersregeln gelten in beide Richtungen (Tausch und Rücktausch); Teilnahmebedingungen werden auf die einwechselnde Person geprüft.
- Rechte: eigene Privileg-Ressource `SUBSTITUTION` mit `CreateSubstitutionGlobal` und `DeleteSubstitutionGlobal` (`Privilege.kt`). Löschen ist seit `5a970cc2` eingeschränkt, damit eine Kette von Wechseln nicht mitten drin aufgerissen wird.
- **Wer fährt, entscheidet Kotlin.** Die SQL-Abfrage fasst bewusst zu weit („gemeldet oder irgendwann eingewechselt"); die Funktion `getActuallyParticipatingParticipants` in `CompetitionExecutionService` bestimmt je (Meldung, Runde), wer tatsächlich in der Aufstellung steht. Ketten über mehrere Runden und Tausch über zwei Boote lassen sich nicht in ein `where` schreiben, und ein zweiter Nachbau in SQL würde gegen die Startliste driften.
- Rollen für Teilnahmebedingungen vereinigen Meldung und Einwechslung **ohne** Rundenbezug, weil eine Bedingung für die ganze Veranstaltung gilt.

## Verworfene Alternativen

- **Team-Bearbeitung während der Durchführung**: verworfen, weil damit die Meldung und alles, was an ihr hängt (Rechnung, Gebühren), verändert würde; Änderungen laufen ausschließlich über Substitutionen.
- **Eigene Aufstellungslogik in „Mein Event"** (2026-08-10): verworfen, weil ein zweiter Nachbau derselben Regel gegen die Startliste driften würde; „Mein Event" ruft dieselbe Kotlin-Entscheidung.
- **Unbeschränktes Löschen von Wechseln**: durch `5a970cc2` verschärft.

## Konsequenzen

- Jede neue Abfrage, die Teams oder Besatzungen liest, muss die Substitutionen anwenden. Die Historie zeigt, wie leicht das vergessen wird: `eb667afb` und `d69028de` („add missing checks for substitutions on fetches") holten es einen Monat nach der Einführung an mehreren Stellen nach.
- Doppelte Wechsel im Bestand mussten per Migration `V202508220945__identify_substitution_duplicates.sql` bereinigt werden.
- Die Entscheidung, in SQL weit zu fassen und in Kotlin zu filtern, macht die Abfragen einfach, aber die Kotlin-Funktion zur einzigen Wahrheit; Tests dafür gehören in reine Logik-Objekte ([ADR-0030](0030-tests-testcontainers-und-reine-logik.md)).
- Urkunden und Startlisten zeigen die Person, die gefahren ist, nicht die gemeldete; für Nachweise gegenüber dem Verband ist die Meldung weiterhin in `competition_registration` erhalten.

## Quellen

- Commits: `126813c9` (Create substitution migration), `dfe22e84`, `949c4184` (unique index), `18159d15`, `2441bbf4` (Backend, verstecktes Frontend), `c2b1ca65` (reverse gender check), `5033829e` (Add substitution privilege), `eb667afb`, `d69028de` (Substitution in allen Fetches), `5a970cc2` (Restrict substitution deletion)
- Migrationen: `backend/src/main/resources/db/migration/V202507091030__substitution.sql`, `V202508220945__identify_substitution_duplicates.sql`
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/competitionExecution/boundary/CompetitionExecutionService.kt` (`getActuallyParticipatingParticipants`), `app/auth/entity/Privilege.kt`
- Verwandte ADRs: [ADR-0026](0026-meldung-je-verein-teams-je-wettkampf.md), [ADR-0027](0027-teilnahmebedingungen-global-je-event-manuell.md), [ADR-0029](0029-durchfuehrung-laeufe-startnummern-platzierung.md), [ADR-0030](0030-tests-testcontainers-und-reine-logik.md), [ADR-0076](0076-mein-event-band-qr-ohne-anmeldung.md)
