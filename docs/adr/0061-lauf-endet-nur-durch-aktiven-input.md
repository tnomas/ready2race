# ADR-0061: Ein Lauf endet nur durch aktiven Input; Rückfrage bei offenen Ergebnissen; Beenden zurücknehmen und Lauf zurücksetzen ohne Neuvergabe der Team-IDs

- Status: angenommen
- Datum: 2026-08-02
- Bereich: domäne, backend, api
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

`prepareForNewPlaces` setzte einen Lauf stumm inaktiv, sobald alle Boote ein Ergebnis hatten, aber ohne `finished_at` und ohne Anstoß der Aktivierungskette. Ein Backlog-Punkt fragte nach einem Schalter „Speichern und Lauf inaktiv setzen". Beim Beenden mit ergebnislosen Booten gab es nur einen Hinweistext, ein so beendeter Lauf fiel auf „Anstehend" zurück; abgemeldete Boote zählten als fehlend, sodass ein Lauf mit Abmeldung nie beendet galt. Am Regattatag musste außerdem ein versehentliches Beenden rückgängig gehen und ein einzelner Lauf korrigierbar sein, ohne die ganze Runde zu löschen, was die `competition_match_team`-IDs neu erzeugt hätte, die exportierte Startlisten und der Zeitnahme-Feed bereits tragen.

## Entscheidung

1. **Ein Lauf wird ausschließlich durch einen aktiven Klick beendet.** Kein Auto-Beenden, kein Schalter. Der Beenden-Klick ist das Signal an das Regattabüro, dass der Stand final ist. Die Karte zeigt „Ergebnisse vollständig, wartet auf Beenden" (AWAITING_FINISH, ADR-0059). Der Feed-Abruf (ADR-0056) meldet nur Daten und beendet nie; die Folgerunden-Automatik (ADR-0073) erstellt, aktiviert und beendet nichts.
2. **Rückfrage bei offenen Ergebnissen** (`PUT …/competitionExecution/{id}/finish`): Dialog mit „Als DNS", „Als DNF", „Offen lassen", „Abbrechen", danach 5 s Bedenkzeit. Das Backend markiert offene Boote in einem SQL-Update (`OpenResultHandling` DNS/DNF/DSQ, landet in `failed_reason`). „Offen" ist neu definiert: Abgemeldete Boote zählen weder im Backend-Zustand noch in der Vollständigkeitsanzeige noch in der Aktivierungskette als fehlend (`teamIsSettled`, dritter Parameter `deregistered`).
3. **Abmelden ist keine Dialogoption.** Die Abmeldung bleibt beim Regattabüro (ADR-0044).
4. **Beenden zurücknehmen** (`8ff9bd96`): eigener Endpunkt, nur in der letzten Runde (dieselbe Sperre wie Ergebniskorrekturen, Freilose erlaubt). Er entfernt nur den Finish-Stempel und rollt weder Ketten-Aktivierungen noch eine bereits erzeugte Folgerunde zurück. Auf der Durchführungsseite darf das Büro in jedem Kettenmodus beenden (`3f09bf91`, ADR-0065).
5. **Lauf zurücksetzen** (`PUT …/competitionExecution/{id}/reset`): leert nur, was der Lauf produziert hat (Aktivierung, Start, Finish, Plätze, Zeiten, Strafen, Rundenzeiten, Klärung). Aufstellung, Bahnen, Startzeit und alle UUIDs bleiben. Nur in der aktuellen Runde, eigener Fehlercode, wenn die Folgerunde schon existiert. Der Reset setzt die Abruf-Pause (`raceclocker_auto_paused_at`) und vergisst den Feed-Fingerabdruck, sonst importierte der nächste Tick die gelöschten Ergebnisse zurück.

## Verworfene Alternativen

- Einstellbarer Schalter „Beenden durch Schiedsrichter vs. automatisch bei vollständigen Ergebnissen" (Backlog C1): verworfen zugunsten der reinen Handentscheidung.
- Stilles Deaktivieren bei vollständigen Ergebnissen (`prepareForNewPlaces`): entfernt (`7dfa1f37`).
- Abmelden als Dialogoption: bleibt dem Regattabüro vorbehalten.
- Status je Boot einzeln im Dialog wählen: dafür gibt es die Ergebnismaske.
- Rückfrage bei vollständigen Ergebnissen: Undo deckt das ab.
- Automatischer Rollback von Kette und Folgerunde beim Zurücknehmen: verworfen; die Folgen sind sichtbar und werden von Hand bereinigt.
- Pause beim Reset löschen (Erstfassung von `bc6cc852`): sofort korrigiert (`6d82365a`), der Reset setzt die Pause.

## Konsequenzen

- Am Renntag hängt der Fortschritt an einem Menschen; die Aktivierungskette (ADR-0064) rückt erst nach dem Klick weiter. Das ist gewollt und der Grund, warum der Kettenmodus (ADR-0065) regelt, wer klicken darf.
- Ein vergessenes Beenden hält alles auf; die Anzeige AWAITING_FINISH ist die einzige Erinnerung.
- Nach „Beenden zurücknehmen" existiert eine Folgerunde womöglich weiter; wer korrigieren will, löscht sie (ADR-0073: je Korrektur ein Löschen).
- Ein Reset löscht auch Handeinträge (organisatorische Regel bis eine Nachfrage gebaut ist, Testkatalog „Offene Punkte").
- Weil die Team-UUIDs überleben, bleiben exportierte Startlisten und die „Extra info"-Zuordnung im Feed gültig (ADR-0055).
- „Lauf zurücksetzen" räumt das Ergebnis, nicht die Messung: Zeitmarken des eigenen Zeitnahme-Moduls bleiben (ADR-0092).

## Quellen

- Commits: `7dfa1f37` (stille Deaktivierung entfernt), `02cbe29d` (Rückfrage bei offenen Ergebnissen), `8ff9bd96` (Beenden zurücknehmen, Laufzustand aus Zeitplan und Durchführung), `3f09bf91` (Beenden in jedem Kettenmodus), `bc6cc852` (Reset behält Team-UUIDs), `6d82365a` (Reset setzt die Abruf-Pause), `a71df501` (Reset leert die Klärung)
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/liveDashboard/entity/OpenResultHandling.kt`, `…/app/competitionExecution/boundary/competitionExecution.kt` (`/finish`, `/reset`), `…/app/liveDashboard/boundary/LiveDashboardLogic.kt` (`teamIsSettled`)
- Specs: `docs/superpowers/specs/2026-07-30-schiedsrichter-dashboard-backlog.md` („Entscheidungen 04.08.2026", C1, A4), `docs/superpowers/specs/2026-08-02-finish-match-open-results-design.md`, `docs/superpowers/specs/2026-08-05-testkatalog-crf-2026.md` („Offene Punkte")
- Verwandte ADRs: [ADR-0044](0044-abmeldung-dns-dnf-dq-im-freitext.md), [ADR-0055](0055-feed-schluessel-lauf-team-id-bahn-aus-rank.md), [ADR-0056](0056-automatischer-feed-abruf-feed-ist-wahrheit.md), [ADR-0059](0059-laufzustand-eine-ableitung.md), [ADR-0060](0060-teilergebnisse-zeitstrafen-ausweisen.md), [ADR-0064](0064-aktivierungskette-ganzer-zeitplan.md), [ADR-0065](0065-kettenmodus-dreiwertig-regattabuero-beendet-immer.md), [ADR-0070](0070-laufzustaende-preparing-running-klaerung.md), [ADR-0073](0073-folgerunden-automatik-erstellt-aktiviert-nicht.md), [ADR-0092](0092-zwischenzeiten-am-lauf-distanz-am-wettkampf.md)
