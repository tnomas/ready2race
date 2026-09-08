# ADR-0092: Zwischenzeiten werden aus SPLIT-Marken übernommen, die Distanz gehört dem Wettkampf, with_laps entfällt ersatzlos

- Status: angenommen
- Datum: 2026-08-25
- Bereich: domäne, datenbank
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Marken der Streckenposten (`SPLIT`) versickerten: Boards, Rundenband und Ergebnisse lasen Rundenzeiten nur aus `competition_match_team_lap`, das ausschließlich der externe Feed füllte ([ADR-0056](0056-automatischer-feed-abruf-feed-ist-wahrheit.md)). Der Zeitnahmetyp trug einen Schalter `with_laps`, der keine Logik verzweigte. Eine Distanz existierte nicht im Modell, obwohl dieselbe Mole für die Langstrecke bei 3000 m und für den Sprint bei 250 m steht.

## Entscheidung

- **Übernahme statt Ableitung („Ansatz B").** `TimingSplitService` schreibt SPLIT-Marken als Zeilen in `competition_match_team_lap`, dieselbe Tabelle wie die Feed-Rundenzeiten, nach dem Fingerabdruck-Muster der offiziellen Zeiten ([ADR-0087](0087-eigenes-zeitnahme-modul-append-only.md)); alle Leser bleiben unverändert. Das gilt nur für `event.timing_system = INTERN`.
- **Distanz gehört dem Wettkampf.** `competition_properties.distance_meters` und `competition_properties.pace_reference` (V202608251210) sind vorlagefähig. Bezugsgrößen sind ein veranstaltungsübergreifender Katalog `pace_reference` (V202608251200) mit zwei Modi `TIME_PER_DISTANCE` und `DISTANCE_PER_TIME` („Zeit pro 500 m", „km/h"); die Beschriftung wird abgeleitet, nicht gespeichert.
- **Posten je Wettkampf mit Meter.** `competition_timing_station` (V202608251220) ordnet einen Posten einem Wettkampf mit `distance_meters` zu; der Posten selbst bleibt der Veranstaltung. `ANZEIGE`-Posten gehören nicht auf die Strecke. `competition_match_team_lap.distance_meters` (V202608251240) trägt den Meter an der Zeile.
- **Rechnung im Frontend.** `frontend/src/utils/timing/pace.ts` rechnet Zwischenzeit, Tempo je Abschnitt und Rangfolge, gruppiert nach `distanceMeters`; die Rangfolge vergleicht den Meter, nicht die Stelle. Am Ziel gibt es keine Zwischenzeit.
- **Zuschnitt.** Zwischenzeit-Posten sehen nur ihre eigene Strecke. Start- und Zielposten werden nicht zugeschnitten, weil ein vergessener Eintrag in `competition_timing_station` die Zeitnahme nicht lahmlegen darf.
- **`with_laps` entfällt ersatzlos** (V202608251230): Spalte, DTO-Feld, Request-Feld, Dialog-Schalter, Chip-Feld und Beschreibungszeile. Der Zeitnahmetyp beschreibt seither nur den Start. Kommentare benennen beide Schreiber von `competition_match_team_lap`.
- „Lauf zurücksetzen" räumt das Ergebnis, nicht die Messung; Zwischenzeiten folgen einer Streckenkorrektur.

## Verworfene Alternativen

- **Hochrechnung auf die Zielzeit:** die Distanz ist eine Behauptung; ein falscher Meter wäre eine Ansage.
- **Ableitung eines „hat Zwischenzeiten"-Kennzeichens aus den SPLIT-Posten:** totes Chip-Feld, und der Typ kennt seine Wettkämpfe nicht; „es gibt keine, und das ist Absicht".
- **Freie Formel statt zweier Modi:** unnötige Allgemeinheit.
- **Gespeicherte Beschriftung der Bezugsgröße:** zweite Wahrheit.
- **Ordnung über `timing_station.sorting`:** die Distanz ordnet die Strecke.
- **Tempo für Feed-Rundenzeiten:** die Spalte bleibt leer statt einer erfundenen Zahl.
- **Zuschnitt auch für Start- und Zielposten:** Ausfallrisiko am Renntag.

## Konsequenzen

- Ein Systemwechsel `RACECLOCKER → INTERN` räumt Feed-Rundenzeiten unumkehrbar ab; als vertretbar akzeptiert und im Entwurf dokumentiert.
- Zwei Schreiber auf einer Tabelle: wer die Feed-Übernahme ändert, muss den `TimingSplitService` mitdenken und umgekehrt.
- Wettkämpfe ohne `distance_meters` bekommen keine Tempo-Werte; die Oberfläche zeigt Zwischenzeiten dann nur als Zeit.
- Das Fingerabdruck-Muster bedeutet: fremde Zeilen in `competition_match_team_lap` werden nie stillschweigend überschrieben; der Plan verlangt „melde das, statt sie still nachzuziehen".
- Der Merge mit dem Fehlstart-Zweig stellte `with_laps` weg und `false_start_enabled` daneben (0a5b4a69); ältere Notizen, die `with_laps` nennen, sind überholt.

## Quellen

- Commits: `fee56b42` (Design), `bb1394f9` (Bezugsgrößen-Katalog), `9afb0d2d` (Distanz und Bezugsgröße am Wettkampf, V202608251210), `3771a331` (Posten je Wettkampf, V202608251220), `3c2cd696` (ANZEIGE nicht auf der Strecke), `3e7f0686` (Zwischenzeiten aus Marken), `1ca0c220` (Streckenkorrektur, Reset), `721aa087` (Tempo und Rangfolge, V202608251240), `d5d5aa48` (Meter statt Stelle), `da35ca38` (Zielposten-Erwartung), `3068d254` (Zuschnitt), `3fa5a5bc` (with_laps weg, V202608251230), `0a5b4a69` (Merge)
- Migrationen: `V202608251200__pace_reference.sql` bis `V202608251240__match_team_lap_distance.sql`
- Specs: `docs/superpowers/specs/2026-08-25-zwischenzeiten-und-distanz-design.md`, `docs/superpowers/plans/2026-08-25-zwischenzeiten-und-distanz.md`
- Verwandte ADRs: [ADR-0023](0023-wettkampfvorlagen-kopieren-nicht-referenzieren.md), [ADR-0056](0056-automatischer-feed-abruf-feed-ist-wahrheit.md), [ADR-0080](0080-zeitnahmeprofil-baum-vier-ebenen.md), [ADR-0087](0087-eigenes-zeitnahme-modul-append-only.md)
