# ADR-0029: Durchführung: Meldungen finalisieren, Läufe mit Startnummern; Platzierung deckt alle Starter

- Status: angenommen
- Datum: 2025-06-12
- Bereich: domäne, datenbank
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Nach Meldeschluss müssen aus Setup ([ADR-0028](0028-wettkampf-setup-runden-matches-vorlagen.md)) und Meldungen ([ADR-0026](0026-meldung-je-verein-teams-je-wettkampf.md)) konkrete Läufe mit Startnummern entstehen, Ergebnisse erfasst und Folgerunden aus Platzierungen gebildet werden. Der Bereich entstand im Juni/Juli 2025 unter dem Arbeitsnamen „competition holding". Im August 2026 lief die Platzberechnung bei Massenfeld-Finals (der Normalfall im Küstenrudern) und bei Qualifikationen mit mehr Booten als Plätzen in einen IndexOutOfBounds.

## Entscheidung

- **Finalisieren** vergibt je Wettkampf `competition_registration.team_number` (umbenannt von `start_number`, `V202507040930__competition_execution.sql`) und erzeugt aus dem Setup `competition_match` (je Setup-Match, mit `start_time`) und `competition_match_team` (Registrierung, `start_number`, `place`). `start_number` ist eindeutig je Match (`starting_position_unique_in_match`), ebenso `place` (`place_unique_in_match`).
- Ergebnisse werden je Match gepflegt; die nächste Runde wird aus den Platzierungen gebildet. Der Bereich heißt `competitionExecution` (Backend-Domäne, Frontend-Tab „Durchführung").
- Die Durchführung liefert Runden mit Matches, Teams und Platzierungen (`CompetitionTeamPlaceDto`); im Frontend als Tab mit persistenten Akkordeons, die Dialoge sind aus den Runden in den Tab hochgezogen (`8d329c4b`). Die Match-Reihenfolge im UI wird explizit zugeordnet, nicht per Index (`efbd26ed`).
- **Platzierung deckt alle Starter.** Die Setzliste in der Platzberechnung umfasst mindestens alle Starter der Runde; der Zugriff ist total: Wer außerhalb der verteilten Plätze liegt, landet hinter allen verteilten Platzierungen in Laufreihenfolge. Fehlt ein CUSTOM-Eintrag in `competition_setup_place`, zählt das Rundenergebnis selbst (`b8784f3d`). Ein gemeinsamer Fix statt zwei Sonderfällen.

## Verworfene Alternativen

- Arbeitsname „competition holding": durch „execution" ersetzt (`adad6f30`), die Migration wurde vor dem Merge umbenannt.
- Zwei Sonderfälle (Massenfeld, Nichtqualifizierte) statt einer totalen Setzliste: verworfen zugunsten einer Regel.
- Startnummern bereits bei der Meldung: entfernt ([ADR-0026](0026-meldung-je-verein-teams-je-wettkampf.md)).

## Konsequenzen

- `team_number` (je Wettkampf, an der Meldung) und `start_number` (je Lauf, am Match-Team) sind zwei Zahlen mit ähnlichem Namen. Startlisten-Export und Ergebnisimport beziehen sich auf `competition_match_team.start_number`; die Startnummer ist zugleich die Bahn ([ADR-0081](0081-kurzbezeichner-kennung-kuerzel-sportneutral.md), [ADR-0055](0055-feed-schluessel-lauf-team-id-bahn-aus-rank.md)).
- Die Team-IDs (`competition_match_team.id`) sind Schlüssel für die Zeitnahme; ein Lauf-Reset darf sie nicht neu vergeben ([ADR-0061](0061-lauf-endet-nur-durch-aktiven-input.md)).
- Der Laufzustand (aktiviert, läuft, beendet, Klärung) wurde später an den Match-Zeilen ergänzt, ohne die Struktur zu ändern ([ADR-0059](0059-laufzustand-eine-ableitung.md), [ADR-0070](0070-laufzustaende-preparing-running-klaerung.md)).
- Die Folgerunden-Bildung ist manuell; eine Automatik, die Runden erstellt, aber nichts aktiviert, kam im August 2026 ([ADR-0073](0073-folgerunden-automatik-erstellt-aktiviert-nicht.md)).
- Die Platzberechnung ist jetzt total, aber „hinter allen verteilten Plätzen in Laufreihenfolge" ist eine Konvention, keine sportliche Wertung; Wertungskategorien werden separat gerechnet ([ADR-0072](0072-ergebnisse-nach-wertungskategorien-und-partie.md)).

## Quellen

- Commits: `c08bdfe5`/`c1d2b7f1` (neue Runde), `8fb67481`/`cee857c6`/`c2a602cb` (Finalize registrations), `fd61b9da`/`84703037`/`2dc24682`/`28c8b596`/`fdb29e95`/`dff56ebe` (Execution Backend/Frontend, Ergebnisse), `adad6f30` (holding → execution), `55acccc3`/`d518afe4` (Platzierungen), `c7dbf297` (persistente Akkordeons), `8d329c4b` (Dialoge hochgezogen), `efbd26ed` (Reihenfolge explizit), `b8784f3d`/`ffa03750` (Platzierung deckt alle Starter)
- Migrationen: `V202507040930__competition_execution.sql`
- Verwandte ADRs: [ADR-0026](0026-meldung-je-verein-teams-je-wettkampf.md), [ADR-0028](0028-wettkampf-setup-runden-matches-vorlagen.md), [ADR-0055](0055-feed-schluessel-lauf-team-id-bahn-aus-rank.md), [ADR-0059](0059-laufzustand-eine-ableitung.md), [ADR-0061](0061-lauf-endet-nur-durch-aktiven-input.md), [ADR-0072](0072-ergebnisse-nach-wertungskategorien-und-partie.md), [ADR-0073](0073-folgerunden-automatik-erstellt-aktiviert-nicht.md), [ADR-0081](0081-kurzbezeichner-kennung-kuerzel-sportneutral.md)
