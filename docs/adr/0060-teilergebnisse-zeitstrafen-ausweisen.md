# ADR-0060: Teilergebnisse ohne Rennende; Zeitstrafen werden ausgewiesen, nie verrechnet

- Status: angenommen
- Datum: 2026-07-30
- Bereich: domäne, datenbank
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Bisher mussten alle Plätze eines Laufs auf einmal eingetragen werden; ein Lauf galt erst mit vollständigen Ergebnissen als bewertet. Die Zeitnahme liefert Zeiten aber Boot für Boot, und Strafen kommen später dazu. Der Zeitnahme-Feed liefert die Zeit bereits inklusive Strafe; eine zweite Verrechnung in ready2race wäre falsch.

## Entscheidung

- **Ein Lauf kann Teilergebnisse tragen, ohne beendet zu werden.** Einzelne Boote bekommen Zeit und Platz, während andere noch fahren; das Rennende ist eine eigene Handlung (ADR-0061). Öffentliche Anzeigen zeigen Teilergebnisse gemäß der Freigaberegel der Veranstaltung (ADR-0045).
- **Zeitstrafen sind reiner Ausweis.** `competition_match_team.penalty_seconds` und `penalty_note` (Migration V202608061202) werden am Ergebnis erfasst und angezeigt, aber nie verrechnet: Die gespeicherte Zeit enthält die Strafe bereits. Die Anzeige lautet „inkl. 15 s Strafe" statt einer zweiten Zahl (`PenaltyText.format`).
- **Import und Push ersetzen eine manuelle Strafe.** Strafen aus dem Zeitnahme-Feed werden übernommen; das eigene Zeitnahme-Modul schreibt `penalty_seconds` nach derselben Konvention (ADR-0087). Die Regel ist an der Schreibstelle dokumentiert.
- **Das stille Deaktivieren bei vollständigen Ergebnissen entfällt** (`prepareForNewPlaces`, `7dfa1f37`): Vollständige Ergebnisse sind kein Rennende.

## Verworfene Alternativen

- Verrechnung der Strafe in der Ergebniszeit: die Zeit käme doppelt bestraft an, weil der Feed die Strafe schon enthält.
- Strafzeit-Mapping im Feed-Import als eigene Rechnung: verworfen aus demselben Grund (ADR-0054).
- Stilles Deaktivieren eines Laufs bei vollständigen Ergebnissen: entfernt; Beenden bleibt eine ausdrückliche Handlung.

## Konsequenzen

- Wer eine Strafe von Hand nachträgt, muss die Zeit selbst anpassen; das Feld ist Dokumentation, keine Rechenanweisung. Das eigene Zeitnahme-Modul rechnet die Strafe vor dem Abschneiden in die Summe (ADR-0087), weil dort die Rohzeit ohne Strafe entsteht.
- Ein manueller Strafeintrag überlebt den nächsten Feed-Abruf oder Zeitnahme-Push nicht; wer die Automatik behalten will, trägt die Strafe im Zeitnahmesystem ein.
- Teilergebnisse erzeugen den Zustand AWAITING_FINISH (ADR-0059): vollständig gewertet, aber nicht beendet. Öffentliche Ergebnisse folgen der Vorgabe „nur beendete Läufe", weil eine veröffentlichte Zeit nach einer späten Strafe nicht zurücknehmbar ist.
- Die Platzberechnung läuft bei jedem Teilergebnis neu; Plätze werden relativ 1..n vergeben, weshalb eine Abmeldung nach dem ersten Ergebnis nicht mehr erlaubt ist (ADR-0044).

## Quellen

- Commits: `756b418c` / `b1e2e238` (Teilergebnisse ohne Rennende), `e0ff6296` / `04973b74` (Zeitstrafen erfassen und anzeigen), `24a36398` (Strafe als „enthalten" beschriftet), `d48ec7b1` (Strafen aus dem Feed), `d74bb875` (Ist-Start, Teilergebnisse und Strafen auf dem Athleten-Board), `7dfa1f37` (stille Deaktivierung entfernt)
- Migrationen: `V202608061202__match_team_penalty.sql`
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/competitionExecution/entity/PenaltyText.kt`
- Verwandte ADRs: [ADR-0044](0044-abmeldung-dns-dnf-dq-im-freitext.md), [ADR-0045](0045-oeffentliche-ergebnisse-live-tab-freigabe.md), [ADR-0046](0046-timecode-adaptive-praezision.md), [ADR-0054](0054-externer-zeitnahmedienst-setzung-bleibt-hier.md), [ADR-0059](0059-laufzustand-eine-ableitung.md), [ADR-0061](0061-lauf-endet-nur-durch-aktiven-input.md), [ADR-0087](0087-eigenes-zeitnahme-modul-append-only.md)
