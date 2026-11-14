# ADR-0055: Schlüssel im Zeitnahme-Feed: Lauf-Team-ID in „Extra info", Bahn aus der Listenposition, Bib nicht mehr als Startnummer

- Status: angenommen
- Datum: 2026-07-23
- Bereich: api, backend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Der Rückweg aus dem Zeitnahme-Feed (ADR-0054) braucht zwei Antworten: Welche Zeile gehört zu welchem Boot, und welche Bahn hat das Boot? Der erste Entwurf nahm die Startnummer (Bib) als einzigen Schlüssel und wollte die Team-UUID intern halten. Der Round-Trip-Test zeigte, dass Bibs nicht eindeutig sind. Ein Bahntausch vor Ort musste außerdem bisher in ready2race nachgezogen werden. Ein Verschiebe-Test im Feed belegte: Beim Umsortieren eines Eintrags wandern Bib, Zeit und „Extra info" mit dem Eintrag, nur das Feld `Rank` bleibt an der Listenposition. Der Anbieter stellt versteckte ID-Felder nur Integrationspartnern zur Verfügung; das Custom-Feld fehlt im JSON, sobald es versteckt wird.

## Entscheidung

1. **Die R2R-Lauf-Team-ID reist in der Spalte „Extra info" des Dienstes.** Der Startlisten-Export schreibt `competition_match_team.id` in die Spalte `col_team_match_id` (Migration V202607231000); der Feed-Parser (`RaceClockerFeedRow.kt`) liest jede UUID aus „Extra info", Lauf-Team-ID zuerst, Registrierungs-UUID als Fallback. Die Spalte ist öffentlich sichtbar; das ist ein geduldeter Behelf, kein Geheimnis.
2. **Bahnen kommen aus der Listenposition `Rank`, nicht aus der Bib.** `RaceClockerFeedRow.lanesByRow()` nummeriert die Zeilen einer Welle nach `Rank` mit 1..n und schreibt das über das gemeinsame `writeStartNumbers()` auf `competition_match_team.start_number`. Die Zuweisung nimmt alle zugeordneten Zeilen, nicht nur die getimten, damit Boote auf dem Wasser ihre Bahn behalten.
3. **Die Bib wird auf dem Pull-Pfad nicht mehr als Startnummer zurückgeschrieben** (`ParsedTeamResult.startNumber = null`). Der Excel-Import schreibt die Bib weiterhin.
4. **Die Bahnzuweisung steht vor beiden Guards** (`NoResults` und Restart-Reset): „eine Bahn hängt an der Startliste, nicht an einer Zeit". Ein Lauf ohne Ergebnis endet erfolgreich (204) statt mit Fehler, sonst nähme die Job-Transaktion die gerade geschriebenen Bahnen wieder zurück.

Praktische Regel: Die Spalte „Extra info" muss beim Startlisten-Import im Dienst gemappt sein; per `?json=1` prüfen, dass jede Zeile eine UUID trägt. Die doppelte UUID in der ersten Zeile ist kein Fehler (der Anbieter setzt das Label auf den Wert der ersten Zeile, der Parser liest nur `pair[1]`).

## Verworfene Alternativen

- Bib als einziger Schlüssel (Spec vom 19.07., §6): Startnummern sind über Wellen hinweg nicht eindeutig; nach dem Round-Trip-Test abgelöst.
- Bib als Startnummer aus dem Pull (`8ddc393b`): nach einem Bahntausch im Dienst stünde die falsche Nummer in ready2race.
- Custom-Feld des Dienstes als ID-Träger: JSON-Schlüssel wandert mit dem Label, Kollisionsgefahr, fehlt im Feed bei „versteckt".
- Versteckte ID-Felder des Anbieters: nur für Integrationspartner verfügbar; eine Anfrage als Integrationspartner ist als naheliegender nächster Schritt notiert, aber offen.
- Wellenname als Teil des Schlüssels: durch die Lauf-Team-ID ersetzt; der Name bleibt nur Notnagel für Altexporte.
- Bahnzuweisung erst nach den Guards (Erstfassung): ein Merge des Restart-Zweigs hatte die frühe Zuweisung ohne git-Konflikt wieder ausgehebelt; `c82e4d4f` zog sie erneut vor.

## Konsequenzen

- Es gibt nur eine Zahl je Boot und Lauf (`start_number`, nicht nullbar). Ein Bahnentausch ist ein Tausch der Startnummern im Dialog „Partie bearbeiten" (ADR-0081).
- Der automatische Abruf (ADR-0056) überschreibt einen Handtausch der Bahnen, sobald sich der Feed ändert; der manuelle Knopf geht über den Riegel „nur aktivierte Läufe" hinweg (Testkatalog C40–C45, Live-Pull-Restrisiko).
- Ohne gemappte „Extra info"-Spalte findet der Pull nichts. Der Fehler ist am Renntag still: keine Ergebnisse, keine Fehlermeldung.
- Altexporte ohne UUID werden über den Wellennamen gefunden (Testkatalog C39); der Name ist deshalb kein beliebiger Freitext.
- Der Fix „Bahnen vor den Guards" ist nur durch einen eigenen DB-Test gegen Testcontainers abgesichert (`62c44952`); ein Merge kann ihn ohne Konflikt wieder aushebeln, wie am 10.08.2026 geschehen.

## Quellen

- Commits: `dbf7de25` (Lauf-Team-ID in „Extra info", V202607231000), `8ddc393b` / `d64ae540` (Bahnen aus `Rank`), `da9d03d5` (Bahn hängt an der Startliste), `c82e4d4f` (Bahnzuweisung vor beiden Guards), `62c44952` (Bahntausch-Test)
- Migrationen: `backend/src/main/resources/db/migration/V202607231000__raceclocker_feedback.sql`
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/raceclocker/entity/RaceClockerFeedRow.kt` (`lanesByRow`), `…/app/competitionExecution/boundary/CompetitionExecutionService.kt` (`writeStartNumbers`)
- Specs: `docs/superpowers/specs/2026-07-19-raceclocker-integration-design.md` (§6), `docs/superpowers/specs/2026-08-05-testprotokoll-nachtlauf.md` (C1), `docs/superpowers/specs/2026-08-05-testkatalog-crf-2026.md` (C39–C45)
- Verwandte ADRs: [ADR-0042](0042-startlisten-export-ergebnisimport-stabile-kennung.md), [ADR-0054](0054-externer-zeitnahmedienst-setzung-bleibt-hier.md), [ADR-0056](0056-automatischer-feed-abruf-feed-ist-wahrheit.md), [ADR-0081](0081-kurzbezeichner-kennung-kuerzel-sportneutral.md)
