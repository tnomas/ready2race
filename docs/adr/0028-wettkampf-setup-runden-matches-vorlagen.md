# ADR-0028: Wettkampf-Setup: verkettete Runden mit Matches, Seeding und Vorlagen; Match-Benennung nach Teilnehmerzahl bleibt unangetastet

- Status: angenommen
- Datum: 2025-03-19
- Bereich: domäne, datenbank
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Wettkampfmodi (Vorlauf, Halbfinale, Finale, Turnierbäume, Zeitfahren als Qualifikation) müssen vor der Durchführung definiert sein, damit aus Meldungen Läufe entstehen können. Das Upstream-Team lambda9 baute das Setup im März bis Mai 2025 (Ticket #15104). Im Juni 2026 kam die Benennung von Läufen abhängig von der Teilnehmerzahl hinzu, weil „Viertelfinale" nur bei acht oder mehr Teams stimmt. Im August 2026 verursachte ein Fix an dieser Benennung nach Abmeldungen doppelte Namen („VF1" zweimal) und wurde vom Projektinhaber zurückgenommen.

## Entscheidung

**Struktur** (`V202505301000__competition_setup.sql`)
- `competition_setup` hängt an den Competition-Properties. Runden (`competition_setup_round`) sind über `next_round` verkettet und tragen `required`, `use_default_seeding` und `places_option`.
- Runden enthalten Matches (`competition_setup_match`: `weighting`, Teamzahl, `execution_order`, `start_time_offset`) mit Teilnehmerplätzen (`competition_setup_participant`: `seed`, `ranking`).
- `competition_setup_place` beschreibt, welche Platzierung ein Rundenergebnis ergibt, gesteuert über das Enum `PlacesOption`.
- Setups gibt es als Vorlagen (`competition_setup_template`); ein Check-Constraint (`chk_either_competition_setup_or_competition_setup_template`) erzwingt entweder Setup oder Vorlage. Vorlagen werden kopiert ([ADR-0023](0023-wettkampfvorlagen-kopieren-nicht-referenzieren.md)). Mitgelieferte Presets (u. a. Beachsprint) sind Seed-Zeilen in der Migration.
- Ein Tree-Helfer im Frontend erzeugt Turnierbäume und Rundennamen.

**Benennung nach Teilnehmerzahl** (`V202606191000__competition_setup_match_naming.sql`)
- `competition_setup_round.is_qualification` markiert Vorrunden (Zeitfahren). `competition_setup_match_naming` speichert nur Abweichungen (Name, Ausführungsreihenfolge) je Teilnehmerzahl und Match-Gewicht.
- Beim Anlegen einer Runde wird die Benennung gegen die tatsächliche Baumgröße aufgelöst und auf die Match-Zeilen des Wettkampfs geschrieben (`CompetitionExecutionService.createNewRound`, `CompetitionSetupMatchRepo.updateNameAndOrder`).
- **Diese Namensanwendung bleibt byte-identisch zum Upstream-Original.** Wer nach einer Abmeldung andere Namen braucht, erzeugt die Runde neu. Freilos-Namen werden getrennt davon an der Lauf-Instanz materialisiert (`competition_match.bye_name`, [ADR-0074](0074-freilos-ableitung-kein-zustand.md)).

## Verworfene Alternativen

- Gruppenphasen (`competition_setup_group`, `competition_setup_group_statistic_evaluation`): im Schema angelegt, im Frontend deaktiviert (`b376e1ad`); der Bedarf fehlte.
- „Duplicatable"-Matches: erst auf Rundenebene verschoben (`07c672ab`), dann komplett entfernt (`5b4aab6a`).
- Gewichtung als Einfluss auf die Match-Anordnung: nur noch visuell (`0d54543e`).
- Begriffe „Outcomes" und „Position": zu „Participants" (`b09c93a9`) und „ExecutionOrder" (`705163bf`) umbenannt.
- Reset nicht abgedeckter Partien auf einen Setup-Snapshot (`base_name`/`base_execution_order`, `a443eddc`, Migration V202608121200): revertiert (`78582095`), weil es die Namensanwendung veränderte.
- Freilos-Benennung als Teil der Namensanwendung (`c7afc694`): revertiert (`5e3147b9`), gleiche Begründung; Endstand `b89f6d28`.

## Konsequenzen

- Das Setup ist ein Graph (verkettete Runden), keine Liste; Änderungen an der Runden-Reihenfolge ändern `next_round`, und jede Ansicht muss die Kette laufen.
- Die Namensanwendung ist als Upstream-Code eingefroren; Fork-Änderungen daran sind ausgeschlossen, um Merge-Konflikte und Verhaltensdrift zu vermeiden. Der Preis: Nach Abmeldungen muss die Runde neu erzeugt werden.
- Die Migrationsdatei `V202608121200` bleibt trotz Revert im Baum, weil Flyway sonst Dev-Datenbanken verweigert ([ADR-0014](0014-flyway-migrationskonventionen.md)); `V202608121300__match_bye_name.sql` droppt die Snapshot-Spalten wieder.
- Jeder Leser von Match-Namen muss `coalesce(competition_match.bye_name, setup-name)` anwenden; die Zeitplan-Import-Kandidaten bewusst nicht, weil der Import gegen Setup-Namen matcht.
- Gruppenphasen sind Schema-Ballast, den jede Migration am Setup mitschleppt.

## Quellen

- Commits: `18ee58dd` (Setup Groups WIP), `29d7faa7`/`b6622eca`/`5a562f9e` (Runden, Seeding, Gewichtung), `0d54543e` (Gewichtung nur visuell), `eee4e6c6` (Gruppen-Matches), `b09c93a9` (Outcomes → Participants), `b376e1ad` (Gruppen deaktiviert), `881acad1` (Startzeit-Offsets), `beb9be78`/`72c2fcae`/`6244b3d8` (Places), `07470ef9`/`32b90b41` (Setup-Vorlagen), `07c672ab`/`5b4aab6a` (Duplicatable raus), `705163bf` (ExecutionOrder), `2eb88dfb`/`363432b9` (PlacesOption), `61e9c1f1` (Presets), `86196093` (Merge #15), `36dc1b0e` (Benennung nach Teilnehmerzahl), `a443eddc`/`78582095` (Reset gebaut/revertiert), `c7afc694`/`5e3147b9` (Freilos-Benennung gebaut/revertiert), `b89f6d28` (bye_name), `34de1dde` (Setzungsnummer im Freilos)
- Migrationen: `V202505301000__competition_setup.sql`, `V202606191000__competition_setup_match_naming.sql`, `V202608121300__match_bye_name.sql`
- Verwandte ADRs: [ADR-0014](0014-flyway-migrationskonventionen.md), [ADR-0023](0023-wettkampfvorlagen-kopieren-nicht-referenzieren.md), [ADR-0029](0029-durchfuehrung-laeufe-startnummern-platzierung.md), [ADR-0073](0073-folgerunden-automatik-erstellt-aktiviert-nicht.md), [ADR-0074](0074-freilos-ableitung-kein-zustand.md)
