# Zwischenzeiten und Distanz

Stand 25.08.2026. Baut auf dem Zeitnahmeprofil-Baum auf
(`docs/superpowers/specs/2026-08-24-zeitnahmeprofil-design.md`).

## Warum

Drei Befunde aus dem Bestand, die die Ausgangslage bestimmen:

1. **Die Unterscheidung „mit Rundenzeiten" gibt es faktisch nicht.** `timing_mode.with_laps`
   verzweigt nirgends Logik — der einzige Backend-Treffer auf den Namen ist ein zufällig gleich
   heißender Lambda-Parameter in `EventInfoService`. Der Schalter erzeugt zwei Beschriftungen: den
   Chip an der Partie im Board (`matchBoard.modeChipParts`) und eine Zeile im Typ-Panel. Mehr tut
   er nicht.
2. **Interne Zwischenzeiten landen nirgends.** `competition_match_team_lap` wird ausschließlich
   aus dem RaceClocker-Feed befüllt (`CompetitionExecutionService.applyLapsFromFeed`). Für die
   hauseigene Zeitnahme steht ausdrücklich im Code: *„Marks on SPLIT stations are intermediate and
   never part of the official time"* — und einen anderen Abnehmer haben sie nicht. Ein SPLIT-Posten
   erfasst, und die Zeit versickert.
3. **Distanz existiert im Modell nicht.** Weder am Wettkampf noch am Posten. `timing_station` hat
   Name, Typ, Sortierung und die Anzeige-Verknüpfung — sonst nichts.

Die Verrohrung dagegen steht schon und ist typ-neutral: Marke → `timing_assignment` → Team
funktioniert für START und FINISH und würde für SPLIT genauso funktionieren. Es fehlt allein der
Abnehmer.

Dahinter liegt eine Zuständigkeitsfrage. Distanz ist keine Eigenschaft der Zeitnahme, sondern des
Wettkampfs — die Zeitnahme braucht Start und Ziel, alles andere ist Ausstattung. Der Zeitnahmetyp
schrumpft dadurch auf das, was er wirklich beschreibt: **wie ein Lauf gestartet wird** (Startart,
Intervall, Vorlauf, Tonplan). **Wie er gemessen wird**, sagen die Posten am Wettkampf.

## Entscheidungen (25.08.2026, mit Thomas abgestimmt)

1. **Ansatz B: Übernahme statt Ableitung.** Aus den SPLIT-Marken werden Zeilen in
   `competition_match_team_lap` geschrieben — dieselbe Tabelle, in der die RaceClocker-Rundenzeiten
   stehen. Board, Livestream-Rundenband und Ergebnisse lesen sie bereits und funktionieren
   unverändert weiter. Das Muster dafür gibt es im Projekt schon: `TimingOfficialTimeService`
   übernimmt Marken in offizielle Zeiten und erkennt seine eigenen Zeilen am Fingerabdruck wieder.
2. **Gesamtdistanz und Bezugsgröße gehören dem Wettkampf**, nicht der Zeitnahme — als Felder an
   `competition_properties`, damit Wettkampf-Vorlagen sie mitbringen.
3. **Posten werden je Wettkampf zugeordnet, mit ihrer Distanz.** Der Posten selbst bleibt der
   Veranstaltung (er ist eine Person mit einem Tablet); der Wettkampf sagt, welche Posten er
   passiert und bei welchem Meter. Nötig, weil dieselbe Mole für die Langstrecke bei 3000 m und
   für den Sprint bei 250 m steht.
4. **Bezugsgrößen sind ein Katalog in den Wettkampf-Komponenten** (`/config?tab=competition-elements`),
   veranstaltungsübergreifend gepflegt wie Kategorien, Gebühren und Dateiformate. Im Rudern
   „Zeit pro 500 m", im Laufen „Zeit pro Kilometer", im Radsport „km/h".
5. **Gerechnet wird: die Zwischenzeit selbst, das Tempo je Abschnitt und die Rangfolge an der
   Zwischenzeit.** Eine Hochrechnung auf die Zielzeit ist ausdrücklich nicht Teil dieser Arbeit.
6. **`timing_mode.with_laps` fällt ersatzlos** — Spalte, DTO-Feld, Request-Feld, Schalter im
   Typ-Dialog, Chip-Feld und Beschreibungszeile. *Nachtrag 25.08.2026, Ist-Zustand:* Die
   ursprünglich vorgesehene **Ableitung aus den SPLIT-Posten wurde bewusst nicht gebaut**, und
   zwar aus zwei verschiedenen Gründen:
   - Der **Chip an der Partie** rendert das Feld gar nicht — `matchBoard.ModeChipParts` trug es
     mit, ohne dass es je auf einem Board erschienen wäre. Ein totes Datum braucht keinen Ersatz;
     es abzuleiten hieße, eine Rechnung für eine Anzeige zu bauen, die es nicht gibt.
   - Der **Beschreibungszeile im Typ-Panel** fehlt die Datengrundlage: Der Zeitnahmetyp gehört der
     Veranstaltung, die Posten gehören dem Wettkampf. Ein Typ weiß nicht, welchen Wettkämpfen er
     zugeordnet ist, und „hat SPLIT-Posten" ist deshalb an ihm keine beantwortbare Frage.
     Beantwortbar wäre sie erst am Wettkampf — und dort steht die Liste der Posten ohnehin
     ausgeschrieben im Zeitnahme-Tab.

   Wer hier eine Ableitung sucht: Es gibt keine, und das ist Absicht.

## Modell

### Katalog: `pace_reference`

```sql
create table pace_reference
(
    id               uuid      primary key,
    name             text      not null unique,
    -- TIME_PER_DISTANCE: "wie lange für n Meter" (Rudern: 500, Laufen: 1000).
    -- DISTANCE_PER_TIME: "wie weit in einer Stunde" (Radsport: km/h).
    -- Zwei Ausprägungen, keine freie Formel: Jede weitere Sportart, die uns einfällt, fällt in
    -- eine der beiden -- und eine Formel, die niemand liest, ist schwerer zu prüfen als zwei Fälle.
    mode             text      not null check (mode in ('TIME_PER_DISTANCE', 'DISTANCE_PER_TIME')),
    -- Bezugsstrecke in Metern. Bei TIME_PER_DISTANCE die Strecke, auf die gerechnet wird;
    -- bei DISTANCE_PER_TIME die Einheit der Ausgabe (1000 = km/h).
    reference_meters int       not null check (reference_meters > 0),
    created_at       timestamp not null,
    created_by       uuid      references app_user on delete set null,
    updated_at       timestamp not null,
    updated_by       uuid      references app_user on delete set null
);
```

Die Beschriftung wird abgeleitet, nicht gespeichert: `TIME_PER_DISTANCE` mit 500 zeigt `/500 m`,
`DISTANCE_PER_TIME` mit 1000 zeigt `km/h`. Ein eigenes Feld dafür wäre eine zweite Wahrheit, die
beim Ändern der Meter still falsch würde.

Rechte wie bei den Nachbar-Katalogen: Lesen `ReadEventGlobal`, Schreiben `UpdateEventGlobal`.

### Wettkampf: Distanz und Bezugsgröße

```sql
alter table competition_properties
    add column distance_meters int
        check (distance_meters is null or distance_meters > 0),
    add column pace_reference uuid references pace_reference on delete set null;
```

An `competition_properties`, nicht an `competition`: Dieselbe Tabelle trägt laut Check-Constraint
auch die Zeilen der **Wettkampf-Vorlagen**. Eine Vorlage bringt damit Distanz und Bezugsgröße mit,
und die 19 Wettkämpfe einer Regatta müssen nicht 19-mal von Hand dasselbe eintragen.

`on delete set null` beim Katalogeintrag: Wer eine Bezugsgröße löscht, soll nicht daran gehindert
werden; der Wettkampf zeigt dann eben kein Tempo mehr. Das ist die mildere Wirkung als eine Sperre,
weil die Bezugsgröße reine Anzeige ist und keine Messung verfälscht.

### Posten am Wettkampf: `competition_timing_station`

```sql
create table competition_timing_station
(
    id              uuid      primary key,
    competition     uuid      not null references competition on delete cascade,
    -- Der Posten bleibt der Veranstaltung; hier steht nur, dass DIESER Wettkampf ihn passiert.
    timing_station  uuid      not null references timing_station on delete cascade,
    -- Bei welchem Meter der Strecke. Der Startposten steht bei 0, der Zielposten bei der
    -- Gesamtdistanz; dazwischen die Zwischenzeit-Posten.
    distance_meters int       not null check (distance_meters >= 0),
    created_at      timestamp not null,
    created_by      uuid      references app_user on delete set null,
    updated_at      timestamp not null,
    updated_by      uuid      references app_user on delete set null,
    unique (competition, timing_station)
);

create index on competition_timing_station (competition);
```

Am Wettkampf, nicht an `competition_properties`: Ein Posten gehört einer Veranstaltung, eine
Vorlage keiner — eine Vorlage könnte auf diese Zeilen also gar nicht zeigen.

Die Reihenfolge der Zwischenzeiten ergibt sich aus `distance_meters`, nicht aus
`timing_station.sorting`: Die Sortierung ordnet die Posten im Leitstand, die Distanz ordnet sie auf
der Strecke, und nur letztere trägt die Rechnung.

### Was entfällt

`timing_mode.with_laps` samt Spalte, DTO-Feld, Request-Feld, Schalter im Typ-Dialog, Chip-Feld in
`matchBoard.ModeChipParts` und der Beschreibungszeile in `TimingModePanel`.

## Der Weg der Zeit

Neuer Dienst `TimingSplitService` im Paket `app/timing/boundary`, nach dem Muster von
`TimingOfficialTimeService`:

1. Marken lesen: die zugeordneten aktiven Marken der Veranstaltung an Posten vom Typ `SPLIT`
   (`TimingOfficialTimeRepo.getAssignedActiveMarks` liefert sie bereits mit `stationType`).
2. Den gemessenen Start je Team bestimmen — dieselbe Regel wie bei den offiziellen Zeiten: die
   **späteste** START-Marke, weil ein neu gestartetes Team mehrere trägt.
3. Je Team und Posten `lap_millis = Marke − Start`. Negative Werte fallen heraus statt still
   gespeichert zu werden: sie bedeuten eine Marke vor dem Start, also einen Zuordnungsfehler.
4. `position` aus der Reihenfolge der zugeordneten Posten **nach Distanz**, `name` aus
   `timing_station.name`.
5. Schreiben mit `CompetitionMatchTeamLapRepo.upsert` und `deleteBeyond` — genau wie
   `applyLapsFromFeed`. `created_at` bleibt dabei der Zeitpunkt des ersten Auftretens, woran das
   Rundenband im Livestream seine Reihenfolge hängt.

**Zuschnitt:** Der Dienst fasst nur Wettkämpfe an, deren Zeitnahmeprofil-Art `MODE` ist (also
`event.timing_system = INTERN`) — spiegelbildlich dazu, dass der RaceClocker-Abruf nur
RACECLOCKER-Veranstaltungen anfasst. So können die beiden Schreiber einander nicht überschreiben,
obwohl sie sich eine Tabelle teilen.

**Auslöser:** dieselben wie bei den offiziellen Zeiten — nach dem Zuordnen einer Marke, nach dem
Zurücknehmen einer Zuordnung und über den Neuberechnungs-Aufruf des Leitstands. Kein eigener Takt.

## Rechnungen

Die Zwischenzeit selbst ist mit dem Schreibweg erledigt. Die beiden übrigen Rechnungen sind reine
Anzeige und gehören deshalb ins Frontend, nah an ihre Darstellung:

- **Tempo je Abschnitt.** Aus `(distanz_n − distanz_n−1)` und `(lapMillis_n − lapMillis_n−1)`, für
  den ersten Abschnitt gegen Start und 0 m. Formatiert nach der Bezugsgröße des Wettkampfs:
  `TIME_PER_DISTANCE` als `m:ss` je Bezugsstrecke, `DISTANCE_PER_TIME` als eine Nachkommastelle.
- **Rangfolge an der Zwischenzeit.** Die Teams eines Laufs, sortiert nach `lapMillis` bei gleicher
  `position`. Braucht keine Distanz.

Beides als reines Modul `frontend/src/utils/timing/pace.ts` mit Tests, ohne Netz und ohne
Komponenten — dasselbe Muster wie `matchBoard.ts` daneben.

Damit das Frontend rechnen kann, trägt die Rundenzeit ihre Distanz mit: `MatchTeamLapDto` bekommt
`distanceMeters: Int?`. Null bei den RaceClocker-Rundenzeiten — deren Spaltennamen kommen aus dem
Fremdsystem und lassen sich keinem Posten zuordnen. **Dort gibt es folglich kein Tempo**, und die
Anzeige lässt die Spalte dann leer, statt eine Zahl zu erfinden.

Die Bezugsgröße reist mit dem Wettkampf zu den Anzeigen, die sie brauchen (Board, Livestream,
Ergebnisse); welche DTOs das im Einzelnen sind, entscheidet der Plan.

## Oberfläche

- **Konfiguration → Wettkampf-Komponenten:** ein Panel `PaceReferencePanel` neben
  `StartListConfigPanel` und `MatchResultImportConfigPanel`, mit Tabelle und Dialog wie die
  Nachbarn. Felder: Name, Art (zwei Optionen), Bezugsstrecke in Metern, dazu eine Vorschau der
  abgeleiteten Beschriftung („zeigt: /500 m").
- **Wettkampf bearbeiten:** zwei Felder neben den übrigen Eigenschaften — Gesamtdistanz in Metern
  und Bezugsgröße aus dem Katalog. Beide optional; ohne sie gibt es kein Tempo, aber sehr wohl
  Zwischenzeiten.
- **Wettkampf, Zeitnahme-Tab:** unter dem Zeitnahmeprofil-Baum ein Abschnitt „Posten auf der
  Strecke": die Posten der Veranstaltung zum Anhaken, je angehaktem Posten ein Meter-Feld,
  sortiert nach Distanz. Ein Hinweis, wenn ein Meter über der Gesamtdistanz liegt — als Warnung,
  nicht als Sperre, weil die Gesamtdistanz optional ist.

## Tests

**Backend:**
- `TimingSplitServiceTest` gegen echtes Postgres: aus einer zugeordneten SPLIT-Marke wird eine
  Zwischenzeit; zwei Posten ergeben zwei Zeilen in Distanz-Reihenfolge; ein neu gestartetes Team
  rechnet gegen die späteste START-Marke; eine Marke vor dem Start fällt heraus; eine
  zurückgenommene Zuordnung räumt ihre Zeile ab; ein RaceClocker-Wettkampf wird nicht angefasst.
- Migrationstest: die vier neuen Objekte existieren, `timing_mode.with_laps` ist weg.

**Frontend:** `pace.test.ts` — Tempo für beide Arten der Bezugsgröße, erster Abschnitt gegen den
Start, fehlende Distanz ergibt kein Tempo, Rangfolge bei Gleichstand, leere Eingaben.

## Reihenfolge

1. Katalog `pace_reference` samt Konfigurations-Oberfläche.
2. Distanz und Bezugsgröße an `competition_properties`, im Wettkampf-Formular und in der Vorlage.
3. `competition_timing_station` samt Oberfläche im Zeitnahme-Tab.
4. `TimingSplitService`: der Schreibweg von der Marke zur Zwischenzeit.
5. `distanceMeters` an der Rundenzeit, `pace.ts`, Anzeige von Tempo und Rangfolge.
6. `with_laps` entfernen.

Migrationsnummern ab `V202608251200`; `V202608250900` ist im Nachbar-Worktree
`sequence-visualization-controls` belegt.

## Risiken

- **Zwei Schreiber, eine Tabelle.** RaceClocker-Abruf und `TimingSplitService` teilen sich
  `competition_match_team_lap`. Sie sind über das Zeitnahme-System der Veranstaltung getrennt, und
  solange es steht, kommen sie einander nicht in die Quere. Stellt eine Veranstaltung mitten im
  Betrieb aber von RACECLOCKER auf INTERN um, geschieht Folgendes — nachgeprüft am gebauten Stand,
  und es ist weder die Kollision noch die stille Vermischung, die dieser Absatz zunächst
  vorhersagte:

  `TimingSplitRepo.getTeamsWithLaps` liefert ab der Umstellung auch die Boote mit **Feed-Zeilen**,
  denn die Abfrage hängt am System der Veranstaltung und nicht an der Herkunft der Zeile. Für
  diese Boote gibt es keine Marken, also keine `splits`, also ein leeres `keepPositions` — und
  `CompetitionMatchTeamLapRepo.deleteBeyond` löscht mit leerer Liste **alles**. Die erste
  Markenzuordnung nach der Umstellung räumt damit sämtliche RaceClocker-Rundenzeiten der
  Veranstaltung ab. Der `unique (competition_match_team, position)` kommt gar nicht erst zum
  Zug.

  Vertretbar ist das: Nach der Umstellung gehören die Zwischenzeiten dem neuen System, und eine
  halb aufgeräumte Tabelle wäre schlimmer als eine leere. **Unumkehrbar ist es aber auch** — die
  Feed-Zeilen sind fort und kämen nur über einen erneuten Abruf zurück, den es nach der
  Umstellung nicht mehr gibt. Der Handtest prüft deshalb nicht, ob es kollidiert, sondern **dass
  die alten Zeilen verschwinden**: Veranstaltung mit RaceClocker-Rundenzeiten auf INTERN
  umstellen, eine einzige Marke zuordnen, und danach nachsehen, dass die Feed-Rundenzeiten der
  ganzen Veranstaltung weg sind.
- **Die Distanz ist eine Behauptung.** Niemand misst nach, ob der Posten wirklich bei 3000 m steht.
  Ein falscher Meter erzeugt ein falsches Tempo, das plausibel aussieht. Deshalb keine
  Hochrechnung auf die Zielzeit in dieser Arbeit: Ein falscher Meter wäre dort nicht mehr nur
  Anzeige, sondern eine Ansage.
- **Zwischenzeiten sind eine zweite Wahrheit.** Sie werden aus Marken abgeleitet und gespeichert;
  jede Korrektur an einer Marke muss sie nachziehen. Das Muster dafür existiert bei den offiziellen
  Zeiten und wird übernommen — aber jeder neue Korrekturweg muss daran denken.
