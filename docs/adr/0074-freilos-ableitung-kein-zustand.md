# ADR-0074: Freilos ist eine Ableitung, kein Zustand; Freilos-Name wird am Lauf materialisiert; „Freilos muss fahren"; „Freilos ohne Start" gebaut und ausgebaut

- Status: angenommen
- Datum: 2026-08-10
- Bereich: domäne, backend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Ein Freilos – ein Lauf, in dem nur ein Boot übrig ist – sah in Zeitplan, Dashboard und Durchführung wie ein wartender Lauf aus („Ausstehend", dann „Überfällig"). Am Steg war nicht zu sehen, dass nichts kommt. Die Ursache (Abmeldung oder schlicht kein Gegner) kann nur das Backend feststellen, weil `out`-Zeilen in allen drei Lesewegen gefiltert werden. Dazu kamen zwei Sonderwünsche aus dem Regelwerk: Manche Ordnungen verlangen, dass auch das einzelne Boot die Strecke fährt; und ein Boot, das seinen Vorlauf verpasst, sollte ohne Start ins Finale.

## Entscheidung

1. **Freilos ist eine Ableitung.** `MatchStatusLogic.deriveBye` wendet die Regel des bestehenden Freilos-Panels an (Runde nicht verpflichtend, genau ein nicht „out" geführtes Team) und reist als `MatchStatusDto.bye: MatchByeDto?` an alle Oberflächen. Es gibt keinen neuen `MatchState`; der Chip „Freilos · offen/quittiert/entfällt" hängt hinter PREPARING/RUNNING.
2. **Die Ursache wird nur behauptet, wo sie beweisbar ist:** `DEREGISTRATION` mit Vereinsname und Freitext nur, wenn genau eine nicht fahrende Zeile einen `competition_deregistration`-Datensatz trägt; sonst Namen ohne Grund oder neutral `NO_OPPONENT`. Eine kleine eigene Abfrage `getByeInputs` mit fester Ordnung liest sie, damit Dashboard-Nutzlast und ETag unberührt bleiben.
3. **Quittieren statt Aktivieren.** Im Zeitplan blendet ein Freilos „Aktivieren" aus und zeigt „Freilos quittieren"; `finished_at` ist die Quittung. Das Frontend liest `status.bye`, nie `teams.length === 1` als zweite Wahrheit.
4. **Der Freilos-Name wird materialisiert:** `competition_match.bye_name` (`V202608121300__match_bye_name.sql`), gelesen per `coalesce(cm.bye_name, csm.name)`. Die ursprüngliche Benennungslogik nach Teilnehmerzahl (ADR-0028) bleibt byte-identisch; zwei Commits, die sie verändert hatten, wurden revertiert.
5. **„Freilos muss fahren":** `competition_match.bye_must_race` (`V202608111800`) macht ein Freilos operativ zu einem echten Rennen: Ergebnis-Sperre öffnet, Feed-Abruf behandelt es normal, Sammelexporte enthalten es, die Folgerunden-Automatik wartet. Die Setzung behält Freilos-Semantik: mit genau einem Boot ist jedes Ergebnis Platz 1, die Zeit ist Anzeige („außer Konkurrenz"). Einschalten löscht einen automatisch vergebenen Platz 1, Ausschalten stellt ihn wieder her.
6. **Runde löschen bleibt erlaubt**, mit Aussage, wie viele Läufe schon öffentlich waren; Freilose zählen dabei nicht.

## Verworfene Alternativen

- Neuer `MatchState`-Wert für Freilos: fiele stumm in jedes `when`/`switch` (Gegenteil der Klärung in ADR-0070, wo genau das gewollt ist).
- Erweiterung der bestehenden Team-Abfragen um Freilos-Daten: hätte ETag und Nutzlast des Dashboards gekippt.
- Zuordnung Name↔Grund bei mehreren Abmeldungen: Raterei.
- Freilos-Topf in `timelineIndicator` und `roundCounterChips`; Änderungen an Knöpfen, Rechten, Quittierung: nicht angefasst.
- Abgewandelte Benennungslogik (`a443eddc`, `c7afc694`): revertiert, Original wiederhergestellt.
- Löschsperre für gefahrene Runden: das Regattabüro muss zurücknehmen können.
- **„Freilos ohne Start" – gebaut und am selben Abend ausgebaut.** Ein Flag `competition_match_team.bye` (Migration V202608151900, `7ec42068`, `60faff70`) ließ ein Boot ohne Start vor den platzierten Booten aufsteigen. Der Projektinhaber brauchte das Feature nicht mehr, und ein unbenutzter Sonderfall in Wertungs- und Weiterkommens-Logik ist „genau dort am teuersten". `bf42075c` entfernte Migration, Feld, Endpunkt, Sonderfälle und Texte vollständig; der Stand liegt auf dem Zweig `claude/freilos-komplett`. Verworfen wurde auch die Analyse „Boot zwischen zwei Läufen verschieben".

## Konsequenzen

- Zwei bewusst belassene Abweichungen, im KDoc benannt: `checkUpdateMatchResult` prüft weiter die ungefilterte Teamliste (ein angezeigtes Freilos kann serverseitig Ergebnisse annehmen), und `automaticFirstPlace` vergibt in Runde 1 keinen Platz 1 für ein Abmelde-Freilos. Nebenfund: Ein Freilos-Boot zählt in `teamIsSettled` als erledigt.
- Flyway-Falle: Datenbanken, auf denen V202608151900 schon angewandt war, brauchen `flyway repair`, weil die Datei nicht mehr existiert (siehe ADR-0014).
- Das strukturelle Freilos (`bye_name`, `bye_must_race`) und das ausgebaute Boot-Freilos sind zwei verschiedene Mechanismen; wer das zweite wiederbelebt, revertiert `bf42075c`.
- Handtests Block M (M5/M6/M17) sind offen.

## Quellen

- Commits: `fc1ee557`, `72224bef`, `5abe933e`, `2153569e`, `9741c632` (Ableitung, Chip); `8bfd7c76`, `9af4fc6b` (Runde löschen); `9189056a`, `319d2fb9` (bye_must_race); `a443eddc`, `c7afc694` (revertierte Benennung); `7ec42068`, `60faff70` (Freilos ohne Start), `bf42075c` (Ausbau)
- Migrationen: `V202608111800__bye_must_race.sql`, `V202608121300__match_bye_name.sql`; V202608151900 entfernt
- Code: `MatchStatusLogic.deriveBye` (`app/matchStatus/boundary`), `afterMigrate.sql` (coalesce auf `bye_name`)
- Specs: `docs/superpowers/specs/2026-08-09-freilos-anzeige-design.md`, `docs/superpowers/plans/2026-08-09-freilos-anzeige.md`
- Verwandte ADRs: [ADR-0028](0028-wettkampf-setup-runden-matches-vorlagen.md), [ADR-0044](0044-abmeldung-dns-dnf-dq-im-freitext.md), [ADR-0059](0059-laufzustand-eine-ableitung.md), [ADR-0070](0070-laufzustaende-preparing-running-klaerung.md), [ADR-0073](0073-folgerunden-automatik-erstellt-aktiviert-nicht.md), [ADR-0014](0014-flyway-migrationskonventionen.md)
