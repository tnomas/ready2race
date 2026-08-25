# Zwischenzeiten und Distanz — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zeiten von SPLIT-Posten landen als Zwischenzeiten an der Partie, der Wettkampf trägt
Gesamtdistanz und Bezugsgröße, die Posten tragen ihre Distanz — und daraus entstehen Tempo je
Abschnitt und Rangfolge an der Zwischenzeit.

**Architecture:** Die Zwischenzeit wird nicht abgeleitet, sondern übernommen: Ein neuer
`TimingSplitService` schreibt aus zugeordneten SPLIT-Marken Zeilen in `competition_match_team_lap`
— dieselbe Tabelle, aus der Board, Livestream-Rundenband und Ergebnisse schon heute die
RaceClocker-Rundenzeiten lesen. Distanz und Bezugsgröße sind Eigenschaften des Wettkampfs, nicht
der Zeitnahme; die Bezugsgrößen selbst sind ein veranstaltungsübergreifender Katalog in den
Wettkampf-Komponenten. Gerechnet wird im Frontend, weil Tempo und Rangfolge reine Anzeige sind.

**Tech Stack:** Kotlin/Ktor, KIO-Monade, jOOQ (generiert), Flyway, Postgres 17, JUnit 5 +
Testcontainers; React/TypeScript, MUI, react-i18next, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-25-zwischenzeiten-und-distanz-design.md`

## Global Constraints

- **Worktree:** `/Users/thomas/Developer/privat/ready2race/.claude/worktrees/zeitnahme-umbau`,
  Zweig `claude/zeitnahme-umbau`.
- **Hier läuft eine Anwendung.** Backend PID auf Port **8136** und Vite auf **5176** gehören diesem
  Worktree. **Nicht beenden, nicht neu starten**, und die Entwicklungs-Datenbank
  `r2r_zeitnahme_umbau` auf Port 7653 **nicht anfassen** — die Migrationen dort spielt der
  Koordinator am Ende ein. Frontend-Änderungen sind über Vite sofort live; das ist erwünscht.
- **Build-Datenbank:** Jeder Maven-Aufruf braucht
  `-Ddatabase.url=jdbc:postgresql://localhost:7728/ready2race-build`. Die geteilte DB auf 7652
  trägt die Migrationen fremder Worktrees und darf nicht benutzt werden. Meckert Flyway nach einer
  Migrationsänderung über die Prüfsumme:
  `docker exec r2r-zeitprofil-builddb psql -U developer -d ready2race-build -c 'drop schema ready2race cascade'`
  — sie dient ausschließlich dem Codegen, es gehen keine echten Daten verloren.
- **JAVA_HOME:** `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`
  vor jedem Maven-Aufruf. `mvnw` liegt in `backend/`.
- **Nach jeder Schema-Änderung `clean`** mitlaufen lassen, sonst `NoSuchMethodError` in
  unbeteiligten Tests. Ein voller Lauf dauert mehrere Minuten — großzügiges Timeout (bis 600000 ms),
  im Vordergrund, nicht im Hintergrund.
- **Migrationsnummern:** `V202608251200`, `V202608251210`, `V202608251220`, `V202608251230`,
  `V202608251240`.
  `V202608250900` ist im Nachbar-Worktree `sequence-visualization-controls` belegt — nicht
  darunter nummerieren. Muster `VyyyyMMddHHmm__beschreibung.sql`. Views gehören in
  `afterMigrate.sql`, nie in eine reguläre Migration.
- **OpenAPI** (`backend/src/main/resources/openapi/documentation.yaml`) ist handgepflegt; nach jeder
  Änderung `cd frontend && npm run generate`. Was im Kotlin-DTO nicht nullable ist, gehört in
  `required`.
- **Backend-Architektur:** Entity-Control-Boundary je Domäne; jeder `Jooq.query` gehört in ein Repo,
  nie in einen Service; Datenbankzugriff ausschließlich über jOOQ, nie rohes SQL; Fehlerbehandlung
  über KIO; Services geben `ApiResponse`-Typen zurück.
- **Rechte:** Lesen `Privilege.ReadEventGlobal`, Schreiben `Privilege.UpdateEventGlobal` — wie bei
  allen Nachbar-Katalogen. Kein neues Privileg.
- **Kein `any`/`as any`** im Frontend; immer die erzeugten Typen aus `@api/types.gen.ts` statt
  eigener Interfaces. Fehlt ein i18n-Schlüssel, wird er angelegt — in **allen drei** Sprachen
  (`de`, `en`, `da`), sonst bricht die Typprüfung.
- **Anklickbare Elemente** bekommen die Klasse `cursor-pointer`.
- **Deutsche Umlaute** (ä, ö, ü, ß) in Code, Kommentaren, Testnamen, i18n-Texten und
  Commit-Nachrichten — niemals ae/oe/ue/ss. Findet sich in einem Codeblock deines Briefs eine
  Ersatzschreibung, schreib sie richtig; die Regel steht über dem wörtlichen Brieftext.
- **Kommentare erklären das Warum**, im Ton der umliegenden Dateien (deutsche Fließtext-KDoc).
- **Commits erwähnen weder Claude noch Anthropic**, kein Co-Authored-By.
- **Prüfbefehle:** Backend `./mvnw clean test -Ddatabase.url=…`; Frontend
  `npm run build && npm run lint && npx vitest run`. `npm run lint` meldet im Ausgangsstand
  **131 Probleme (46 Fehler, 85 Warnungen)** — diese Zahl darf nicht steigen, und keine Meldung
  darf aus einer von dir angefassten Datei stammen.

---

## Dateiübersicht

**Neu (Backend):**

| Datei | Verantwortung |
|---|---|
| `db/migration/V202608251200__pace_reference.sql` | Katalog der Bezugsgrößen |
| `db/migration/V202608251210__competition_distance.sql` | Distanz und Bezugsgröße am Wettkampf |
| `db/migration/V202608251220__competition_timing_station.sql` | Posten je Wettkampf mit Distanz |
| `db/migration/V202608251230__timing_mode_ohne_laps.sql` | `with_laps` entfernen |
| `db/migration/V202608251240__match_team_lap_distance.sql` | Distanz an der Zwischenzeit |
| `app/paceReference/entity/PaceReferenceMode.kt` | `TIME_PER_DISTANCE` \| `DISTANCE_PER_TIME` |
| `app/paceReference/entity/PaceReferenceDto.kt` | Katalog-DTO |
| `app/paceReference/entity/PaceReferenceRequest.kt` | Anlegen/Ändern |
| `app/paceReference/entity/PaceReferenceSort.kt` | Sortierung der Seite |
| `app/paceReference/entity/PaceReferenceError.kt` | Fehler der Domäne |
| `app/paceReference/control/PaceReferenceRepo.kt` | Datenzugriff |
| `app/paceReference/control/Conversions.kt` | Record ↔ DTO |
| `app/paceReference/boundary/PaceReferenceService.kt` | Dienst |
| `app/paceReference/boundary/paceReference.kt` | Routen |
| `app/timing/entity/CompetitionTimingStationDto.kt` | Posten am Wettkampf, mit Distanz |
| `app/timing/entity/CompetitionTimingStationsRequest.kt` | Die ganze Liste in einem PUT |
| `app/timing/control/CompetitionTimingStationRepo.kt` | Datenzugriff |
| `app/timing/boundary/TimingSplitLogic.kt` | Reine Logik: Marken → Zwischenzeiten |
| `app/timing/boundary/TimingSplitService.kt` | Schreibweg |

**Neu (Frontend):**

| Datei | Verantwortung |
|---|---|
| `components/paceReference/PaceReferencePanel.tsx` | Abschnitt in den Wettkampf-Komponenten |
| `components/paceReference/PaceReferenceTable.tsx` | Tabelle |
| `components/paceReference/PaceReferenceDialog.tsx` | Dialog |
| `components/paceReference/paceReferenceLabel.ts` (+ `.test.ts`) | Abgeleitete Beschriftung |
| `components/event/competition/timing/CompetitionTimingStations.tsx` | Posten auf der Strecke |
| `utils/timing/pace.ts` (+ `.test.ts`) | Tempo je Abschnitt, Rangfolge |

---

## Task 1: Der Katalog der Bezugsgrößen

**Files:**
- Create: `backend/src/main/resources/db/migration/V202608251200__pace_reference.sql`
- Create: `backend/src/main/kotlin/.../app/paceReference/` (die acht Dateien aus der Übersicht)
- Modify: `backend/src/main/kotlin/.../plugins/Routing.kt` oder die Stelle, an der
  `startListConfig()` gemountet wird — nachsehen und daneben mounten
- Modify: `backend/src/main/resources/openapi/documentation.yaml`
- Create: `frontend/src/components/paceReference/PaceReferencePanel.tsx`, `-Table.tsx`,
  `-Dialog.tsx`, `paceReferenceLabel.ts`, `paceReferenceLabel.test.ts`
- Modify: `frontend/src/pages/ConfigurationPage.tsx` (Panel im Tab `competition-elements`)
- Modify: `frontend/src/i18n/{de,en,da}/translations.json`

**Interfaces:**
- Consumes: nichts.
- Produces:
  - Tabelle `ready2race.pace_reference`, jOOQ `PACE_REFERENCE` / `PaceReferenceRecord`
  - `enum class PaceReferenceMode { TIME_PER_DISTANCE, DISTANCE_PER_TIME }`
  - `data class PaceReferenceDto(id: UUID, name: String, mode: PaceReferenceMode, referenceMeters: Int)`
  - Endpunkte `GET/POST /pace-reference`, `PUT/DELETE /pace-reference/{paceReferenceId}`
  - Frontend: `paceReferenceLabel(mode, referenceMeters): string`

- [ ] **Schritt 1: Migration schreiben**

```sql
set search_path to ready2race, pg_catalog, public;

-- Womit eine Sportart Tempo ausdrückt. Im Rudern die Zeit pro 500 m, im Laufen die Zeit pro
-- Kilometer, im Radsport Kilometer pro Stunde. Veranstaltungsübergreifend gepflegt wie die
-- übrigen Wettkampf-Komponenten (Kategorien, Gebühren, Dateiformate), weil eine Sportart sich
-- nicht je Regatta ändert.
create table pace_reference
(
    id               uuid      primary key,
    -- Der Name ist das, worüber am Wettkampf ausgewählt wird -- doppelt wäre er nicht mehr
    -- unterscheidbar. Gleiche Regel wie bei timing_mode und timing_station.
    name             text      not null unique,
    -- TIME_PER_DISTANCE: "wie lange für n Meter". DISTANCE_PER_TIME: "wie weit in einer Stunde".
    -- Zwei Ausprägungen statt einer freien Formel: Jede Sportart, die uns einfällt, fällt in eine
    -- der beiden, und zwei Fälle lassen sich prüfen -- eine Formel, die niemand liest, nicht.
    mode             text      not null check (mode in ('TIME_PER_DISTANCE', 'DISTANCE_PER_TIME')),
    -- Bezugsstrecke in Metern: bei TIME_PER_DISTANCE die Strecke, auf die gerechnet wird
    -- (500 im Rudern), bei DISTANCE_PER_TIME die Einheit der Ausgabe (1000 = km/h).
    reference_meters int       not null check (reference_meters > 0),
    created_at       timestamp not null,
    created_by       uuid      references app_user on delete set null,
    updated_at       timestamp not null,
    updated_by       uuid      references app_user on delete set null
);
```

- [ ] **Schritt 2: Die reine Logik der Beschriftung testen (Frontend)**

`frontend/src/components/paceReference/paceReferenceLabel.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {paceReferenceLabel} from './paceReferenceLabel.ts'

describe('paceReferenceLabel', () => {
    it('zeigt bei Zeit pro Strecke die Strecke in Metern', () => {
        expect(paceReferenceLabel('TIME_PER_DISTANCE', 500)).toBe('/500 m')
    })

    it('rechnet volle Kilometer in Kilometer um', () => {
        expect(paceReferenceLabel('TIME_PER_DISTANCE', 1000)).toBe('/km')
    })

    it('zeigt bei Strecke pro Zeit die Einheit', () => {
        expect(paceReferenceLabel('DISTANCE_PER_TIME', 1000)).toBe('km/h')
    })

    // Eine krumme Bezugsstrecke ist erlaubt und darf nicht als Kilometer durchgehen.
    it('laesst krumme Strecken in Metern stehen', () => {
        expect(paceReferenceLabel('DISTANCE_PER_TIME', 500)).toBe('500 m/h')
    })
})
```

Lauf: `cd frontend && npx vitest run src/components/paceReference/paceReferenceLabel.test.ts`
— erwartet: „Failed to resolve import".

- [ ] **Schritt 3: Die Beschriftung schreiben**

```ts
import {PaceReferenceMode} from '@api/types.gen.ts'

/**
 * Die Beschriftung einer Bezugsgröße — abgeleitet, nicht gespeichert: Ein eigenes Feld dafür wäre
 * eine zweite Wahrheit, die beim Ändern der Bezugsstrecke still falsch würde.
 *
 * Volle Kilometer werden als solche geschrieben, weil „/1000 m" niemand so liest.
 */
export const paceReferenceLabel = (mode: PaceReferenceMode, referenceMeters: number): string => {
    const strecke = referenceMeters % 1000 === 0 ? `${referenceMeters / 1000} km` : `${referenceMeters} m`
    const kurz = strecke === '1 km' ? 'km' : strecke
    return mode === 'TIME_PER_DISTANCE' ? `/${kurz}` : `${kurz}/h`
}
```

Test läuft grün — erwartet: 4 Tests.

- [ ] **Schritt 4: Die Backend-Domäne bauen**

Vorbild ist **`app/startListConfig/`** — dieselbe Art Katalog, dieselben Rechte, dieselbe
Seitenstruktur. Lies die acht Dateien dort und baue `app/paceReference/` danach: Repo mit
`getPage`/`get`/`create`/`update`/`delete`, Service mit den fünf Operationen, Routen unter
`/pace-reference`, `PaceReferenceSort` mit `NAME` als Sortierfeld.

Zwei Dinge, die das Vorbild nicht hergibt:

- **Doppelter Name** wird abgelehnt: `PaceReferenceError.NameTaken` mit einem neuen
  `ErrorCode.PACE_REFERENCE_NAME_TAKEN` (409). Der Unique-Index allein liefert einen rohen
  Datenbankfehler.
- **Löschen** ist immer erlaubt; der Fremdschlüssel am Wettkampf steht auf `on delete set null`
  (Task 2). Keine Sperre wie bei den Rennen — die Bezugsgröße ist reine Anzeige und verfälscht
  keine Messung.

- [ ] **Schritt 5: OpenAPI ergänzen und Client erzeugen**

Pfade `/pace-reference` (`get` mit Pagination wie die Nachbarn, `post`) und
`/pace-reference/{paceReferenceId}` (`put`, `delete`), Schemata `PaceReferenceDto`,
`PaceReferenceRequest`, `PaceReferenceMode` (enum), der neue `ErrorCode`-Wert. Nimm die
`StartListConfig`-Einträge als Vorlage, auch für die Pagination-Parameter.

Dann `cd frontend && npm run generate`.

- [ ] **Schritt 6: Die Oberfläche bauen**

`PaceReferenceTable.tsx`, `-Dialog.tsx`, `-Panel.tsx` nach dem Vorbild von
`frontend/src/components/startListConfig/`. Der Dialog hat drei Felder: Name, Art (zwei
Optionen, `FormInputRadioButtonGroup`), Bezugsstrecke in Metern (`FormInputNumber`, Minimum 1).
Darunter eine Vorschau der abgeleiteten Beschriftung („zeigt: /500 m") aus `paceReferenceLabel`
— so sieht man beim Anlegen, was am Ende dasteht.

In `ConfigurationPage.tsx` das Panel im Tab `competition-elements` einhängen, hinter
`MatchResultImportConfigPanel`.

- [ ] **Schritt 7: Alles prüfen**

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
cd backend && ./mvnw clean test -Ddatabase.url=jdbc:postgresql://localhost:7728/ready2race-build
cd ../frontend && npm run build && npm run lint && npx vitest run
```

- [ ] **Schritt 8: Commit**

```bash
git add -A
git commit -m "Bezugsgrößen: Katalog in den Wettkampf-Komponenten"
```

---

## Task 2: Distanz und Bezugsgröße am Wettkampf

**Files:**
- Create: `backend/src/main/resources/db/migration/V202608251210__competition_distance.sql`
- Modify: `app/competitionProperties/entity/CompetitionPropertiesRequest.kt` und das zugehörige
  DTO (im selben Paket suchen), `control/Conversions.kt`, den Service, der schreibt
- Modify: `backend/src/main/resources/openapi/documentation.yaml`
- Modify: `frontend/src/components/event/competition/CompetitionPropertiesFormInputs.tsx`
- Modify: `frontend/src/components/event/competition/common.ts` (Formular-Typ und Mapper)
- Modify: `frontend/src/i18n/{de,en,da}/translations.json`

**Interfaces:**
- Consumes: `pace_reference` und `PaceReferenceDto` aus Task 1.
- Produces: `competition_properties.distance_meters`, `.pace_reference`; beide Felder in
  `CompetitionPropertiesRequest` und im Wettkampf-DTO.

- [ ] **Schritt 1: Migration**

```sql
set search_path to ready2race, pg_catalog, public;

-- Distanz und Bezugsgröße gehören dem Wettkampf, nicht der Zeitnahme: Die Zeitnahme braucht Start
-- und Ziel, alles andere ist Ausstattung der Strecke.
--
-- An competition_properties und nicht an competition, weil dieselbe Tabelle laut Check-Constraint
-- auch die Zeilen der Wettkampf-VORLAGEN trägt. Eine Vorlage bringt damit beides mit, und die 19
-- Wettkämpfe einer Regatta müssen es nicht 19-mal von Hand bekommen.
alter table competition_properties
    add column distance_meters int
        check (distance_meters is null or distance_meters > 0),
    -- set null statt restrict: Wer eine Bezugsgröße löscht, soll nicht gehindert werden -- der
    -- Wettkampf zeigt dann eben kein Tempo mehr. Sie ist reine Anzeige und verfälscht keine
    -- Messung, also ist die mildere Wirkung die richtige.
    add column pace_reference uuid references pace_reference on delete set null;
```

- [ ] **Schritt 2: Backend durchziehen**

`CompetitionPropertiesRequest` bekommt `distanceMeters: Int?` und `paceReference: UUID?`, das
Wettkampf-DTO die entsprechenden Felder (die Bezugsgröße als aufgelöstes `PaceReferenceDto?`, damit
die Anzeige nicht nachschlagen muss — prüfe am Nachbarfeld `competitionCategory`, wie das dort
gelöst ist, und mach es genauso). Validierung: `distanceMeters` positiv, wenn gesetzt.

Der Compiler führt dich zu den Stellen, die schreiben und lesen. Achte darauf, dass **Vorlagen**
denselben Weg nehmen — dieselbe Request-Klasse bedient beide.

- [ ] **Schritt 3: OpenAPI und Client**

Beide Felder an `CompetitionPropertiesRequest` und am Wettkampf-DTO ergänzen, dann
`npm run generate`.

- [ ] **Schritt 4: Formular**

In `CompetitionPropertiesFormInputs.tsx` zwei Felder ergänzen: Gesamtdistanz in Metern
(`FormInputNumber`, Minimum 1, optional) und Bezugsgröße (`FormInputAutocomplete` über die
Katalogliste, optional). Ein Hinweis darunter, dass beide nur für die Tempo-Anzeige gebraucht
werden und Zwischenzeiten auch ohne sie funktionieren.

Der Formular-Typ und die Mapper liegen in `common.ts` — beide Felder dort nachziehen, sonst gehen
sie beim Speichern verloren.

- [ ] **Schritt 5: Prüfen und committen**

Beide Prüfbefehle wie in Task 1.

```bash
git add -A
git commit -m "Wettkampf trägt Gesamtdistanz und Bezugsgröße"
```

---

## Task 3: Posten auf der Strecke

**Files:**
- Create: `backend/src/main/resources/db/migration/V202608251220__competition_timing_station.sql`
- Create: `app/timing/entity/CompetitionTimingStationDto.kt`,
  `app/timing/entity/CompetitionTimingStationsRequest.kt`,
  `app/timing/control/CompetitionTimingStationRepo.kt`
- Modify: `app/timing/boundary/TimingService.kt` (oder ein neuer Dienst, wenn die Datei schon groß
  ist — dann melde das), `app/timing/boundary/timing.kt` (Routen)
- Modify: `backend/src/main/resources/openapi/documentation.yaml`
- Create: `frontend/src/components/event/competition/timing/CompetitionTimingStations.tsx`
- Modify: `frontend/src/components/event/competition/timing/CompetitionTimingConfig.tsx`
- Modify: `frontend/src/i18n/{de,en,da}/translations.json`

**Interfaces:**
- Consumes: `competition_properties.distance_meters` aus Task 2 (für die Warnung).
- Produces:
  - Tabelle `competition_timing_station`
  - `data class CompetitionTimingStationDto(timingStation: UUID, name: String, type: TimingStationType, distanceMeters: Int)`
  - `GET /event/{eventId}/competition/{competitionId}/timing-stations`
  - `PUT /event/{eventId}/competition/{competitionId}/timing-stations` mit
    `CompetitionTimingStationsRequest(stations: List<CompetitionTimingStationEntry>)`,
    `CompetitionTimingStationEntry(timingStation: UUID, distanceMeters: Int)`

- [ ] **Schritt 1: Migration**

```sql
set search_path to ready2race, pg_catalog, public;

-- Welche Posten dieser Wettkampf passiert und bei welchem Meter. Der Posten selbst bleibt der
-- Veranstaltung -- er ist eine Person mit einem Tablet, keine Eigenschaft eines Wettkampfs.
-- Getrennt nötig, weil derselbe Posten für zwei Wettkämpfe verschieden weit weg steht: Die Mole
-- liegt für die Langstrecke bei 3000 m und für den Sprint bei 250 m.
--
-- Am Wettkampf und nicht an competition_properties: Ein Posten gehört einer Veranstaltung, eine
-- Wettkampf-Vorlage keiner -- eine Vorlage könnte auf diese Zeilen gar nicht zeigen.
create table competition_timing_station
(
    id              uuid      primary key,
    competition     uuid      not null references competition on delete cascade,
    timing_station  uuid      not null references timing_station on delete cascade,
    -- Der Startposten steht bei 0, der Zielposten bei der Gesamtdistanz, dazwischen die
    -- Zwischenzeit-Posten. Die Reihenfolge der Zwischenzeiten ergibt sich aus DIESEM Wert, nicht
    -- aus timing_station.sorting: Die Sortierung ordnet die Posten im Leitstand, die Distanz
    -- ordnet sie auf der Strecke -- und nur letztere trägt die Rechnung.
    distance_meters int       not null check (distance_meters >= 0),
    created_at      timestamp not null,
    created_by      uuid      references app_user on delete set null,
    updated_at      timestamp not null,
    updated_by      uuid      references app_user on delete set null,
    unique (competition, timing_station)
);

create index on competition_timing_station (competition);
```

- [ ] **Schritt 2: Repo und Dienst**

Das PUT ersetzt die ganze Liste eines Wettkampfs (löschen, was nicht mehr dabei ist; einfügen bzw.
ändern, was dabei ist) — dieselbe Form wie die frühere Rennen-Zuordnung, weil die Oberfläche in
Listen denkt, nicht in einzelnen Zeilen.

Der Dienst prüft: der Wettkampf gehört zur Veranstaltung, und **jeder Posten gehört zu derselben
Veranstaltung**. Sonst `CompetitionTimingStationError.StationNotFound`. Ohne diese Prüfung ließe
sich ein Posten einer fremden Regatta anhängen — der Fremdschlüssel allein hindert daran nicht.

- [ ] **Schritt 3: Ein Test gegen echtes Postgres**

`backend/src/test/kotlin/.../timing/CompetitionTimingStationServiceTest.kt` mit
`testComprehension` (Vorbild: `app/timing/TimingMatchServiceTest`, Fixtures in
`app/timing/TimingTestFixtures.kt` — `createTestEventWithAdmin()`, `createTestMatchFixture(eventId)`,
`addTestStation(eventId, userId, type)`):

1. Setzen und Lesen: zwei Posten mit Distanzen, die Liste kommt nach Distanz sortiert zurück.
2. Ersetzen: ein zweites PUT mit nur einem Posten räumt den anderen ab.
3. Ein Posten einer fremden Veranstaltung wird abgelehnt.
4. Zweimal derselbe Posten im selben PUT wird abgelehnt (der Unique-Index würde sonst roh
   scheitern) — `CompetitionTimingStationError.DuplicateStation`.

Erst schreiben, rot laufen sehen, dann bauen.

- [ ] **Schritt 4: OpenAPI, Client, Oberfläche**

`CompetitionTimingStations.tsx`: die Posten der Veranstaltung als Liste mit Kontrollkästchen; je
angehaktem Posten ein Meter-Feld daneben. Sortiert nach Distanz, ungesetzte am Ende. Ein
Speichern-Knopf für die ganze Liste (nicht je Zeile — es ist ein PUT).

Warnung als `Alert severity="warning"`, wenn ein Meter über der Gesamtdistanz des Wettkampfs liegt
oder wenn zwei Posten denselben Meter tragen. Keine Sperre: Die Gesamtdistanz ist optional, und ein
Posten genau am Ziel ist legitim.

Eingehängt in `CompetitionTimingConfig.tsx` unter dem Zeitnahmeprofil-Baum, mit eigener Überschrift
„Posten auf der Strecke".

- [ ] **Schritt 5: Prüfen und committen**

```bash
git add -A
git commit -m "Posten auf der Strecke: je Wettkampf mit ihrer Distanz"
```

---

## Task 4: Von der Marke zur Zwischenzeit

**Files:**
- Create: `app/timing/boundary/TimingSplitLogic.kt`
- Create: `app/timing/boundary/TimingSplitService.kt`
- Create: `backend/src/test/kotlin/.../timing/TimingSplitLogicTest.kt`
- Create: `backend/src/test/kotlin/.../timing/TimingSplitServiceTest.kt`
- Modify: die Stellen, die heute `TimingOfficialTimeService.recomputeApply…` auslösen — dieselben
  Auslöser bekommen den neuen Dienst dazu (`grep -rn "recomputeApply" backend/src/main`)

**Interfaces:**
- Consumes: `competition_timing_station` (Task 3), `TimingProfileRepo.getAssignments(eventId, kind)`
  und `TimingProfileKind.MODE` aus dem Zeitnahmeprofil-Baum.
- Produces:
  - `TimingSplitLogic.Mark(team: UUID, station: UUID, timestampMillis: Long, isStart: Boolean)`
  - `TimingSplitLogic.StationAtDistance(station: UUID, name: String, distanceMeters: Int)`
  - `TimingSplitLogic.Split(team: UUID, position: Int, name: String, lapMillis: Long, distanceMeters: Int)`
  - `TimingSplitLogic.compute(marks, stations): List<Split>`
  - `TimingSplitService.recomputeEvent(eventId, userId): App<ServiceError, Unit>`

- [ ] **Schritt 1: Den Logik-Test schreiben**

```kotlin
package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.TimingSplitLogic
import de.lambda9.ready2race.backend.app.timing.boundary.TimingSplitLogic.Mark
import de.lambda9.ready2race.backend.app.timing.boundary.TimingSplitLogic.StationAtDistance
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Reine Logik der Frage „welche Zwischenzeiten ergeben diese Marken?" — ohne Datenbank, damit die
 * Regeln einzeln nachrechenbar sind. Die Regeln sind dieselben wie bei den offiziellen Zeiten:
 * die SPÄTESTE Startmarke zählt (ein neu gestartetes Team trägt mehrere), und was vor dem Start
 * liegt, ist ein Zuordnungsfehler und keine Zeit.
 */
class TimingSplitLogicTest {

    private val team = UUID.randomUUID()
    private val start = UUID.randomUUID()
    private val split1 = UUID.randomUUID()
    private val split2 = UUID.randomUUID()

    private val stations = listOf(
        StationAtDistance(split2, "Boje 2", 2000),
        StationAtDistance(split1, "Boje 1", 1000),
    )

    @Test
    fun `zaehlt ab dem gemessenen Start und ordnet nach Distanz`() {
        val splits = TimingSplitLogic.compute(
            listOf(
                Mark(team, start, 10_000, isStart = true),
                Mark(team, split2, 190_000, isStart = false),
                Mark(team, split1, 100_000, isStart = false),
            ),
            stations,
        )

        assertEquals(listOf(1 to 90_000L, 2 to 180_000L), splits.map { it.position to it.lapMillis })
        assertEquals(listOf("Boje 1", "Boje 2"), splits.map { it.name })
        assertEquals(listOf(1000, 2000), splits.map { it.distanceMeters })
    }

    // Ein neu gestartetes Team traegt mehrere Startmarken - die letzte ist der Start, den es
    // wirklich genommen hat.
    @Test
    fun `die spaeteste Startmarke gewinnt`() {
        val splits = TimingSplitLogic.compute(
            listOf(
                Mark(team, start, 10_000, isStart = true),
                Mark(team, start, 50_000, isStart = true),
                Mark(team, split1, 100_000, isStart = false),
            ),
            stations,
        )

        assertEquals(listOf(50_000L), splits.map { it.lapMillis })
    }

    @Test
    fun `ohne Startmarke gibt es keine Zwischenzeit`() {
        val splits = TimingSplitLogic.compute(
            listOf(Mark(team, split1, 100_000, isStart = false)),
            stations,
        )

        assertTrue(splits.isEmpty())
    }

    // Eine Marke vor dem Start ist ein Zuordnungsfehler, keine negative Zeit.
    @Test
    fun `eine Marke vor dem Start faellt heraus`() {
        val splits = TimingSplitLogic.compute(
            listOf(
                Mark(team, start, 100_000, isStart = true),
                Mark(team, split1, 50_000, isStart = false),
            ),
            stations,
        )

        assertTrue(splits.isEmpty())
    }

    @Test
    fun `ein Posten ohne zugeordnete Distanz zaehlt nicht mit`() {
        val fremd = UUID.randomUUID()
        val splits = TimingSplitLogic.compute(
            listOf(
                Mark(team, start, 10_000, isStart = true),
                Mark(team, fremd, 100_000, isStart = false),
                Mark(team, split1, 120_000, isStart = false),
            ),
            stations,
        )

        assertEquals(listOf("Boje 1"), splits.map { it.name })
        assertEquals(listOf(1), splits.map { it.position })
    }

    // Zwei Marken am selben Posten: die frueheste ist die Durchfahrt, die zweite ein Doppeltipp -
    // dieselbe Regel, die die offizielle Zielzeit anwendet.
    @Test
    fun `am selben Posten zaehlt die frueheste Marke`() {
        val splits = TimingSplitLogic.compute(
            listOf(
                Mark(team, start, 10_000, isStart = true),
                Mark(team, split1, 120_000, isStart = false),
                Mark(team, split1, 100_000, isStart = false),
            ),
            stations,
        )

        assertEquals(listOf(90_000L), splits.map { it.lapMillis })
    }
}
```

- [ ] **Schritt 2: Rot laufen lassen**

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
cd backend && ./mvnw test -Dtest=TimingSplitLogicTest -Ddatabase.url=jdbc:postgresql://localhost:7728/ready2race-build
```

Erwartet: „unresolved reference: TimingSplitLogic".

- [ ] **Schritt 3: Die Logik schreiben**

`TimingSplitLogic` ist reine Logik ohne DB- und Ktor-Bezug, nach dem Muster von
`TimingProfileResolveLogic`. `compute` je Team: späteste Startmarke bestimmen; je Posten mit
bekannter Distanz die früheste Marke nehmen; `lapMillis = marke − start`, negative verwerfen; nach
Distanz sortieren und `position` ab 1 vergeben.

- [ ] **Schritt 4: Grün, dann den Dienst**

`TimingSplitService.recomputeEvent(eventId, userId)`:

1. Nur Wettkämpfe mit Zeitnahmeprofil-Art `MODE` — spiegelbildlich dazu, dass der
   RaceClocker-Abruf nur RACECLOCKER-Veranstaltungen anfasst. So können sich die beiden Schreiber
   dieselbe Tabelle teilen, ohne einander zu überschreiben. Nutze `TimingProfileRepo` bzw. das
   Zeitnahme-System der Veranstaltung; wie der Zuschnitt heute formuliert ist, zeigt
   `TimingMatchRepo`.
2. Marken über `TimingOfficialTimeRepo.getAssignedActiveMarks(eventId)` — sie liefert bereits
   `stationType`; START und SPLIT reichen.
3. Die Posten-Distanzen je Wettkampf über `CompetitionTimingStationRepo`.
4. `TimingSplitLogic.compute` je Wettkampf, dann schreiben mit
   `CompetitionMatchTeamLapRepo.upsert` und `deleteBeyond` — genau wie
   `CompetitionExecutionService.applyLapsFromFeed`. **Upsert statt Löschen-und-Einfügen**, weil
   `created_at` der Zeitpunkt des ersten Auftretens ist und das Rundenband im Livestream seine
   Reihenfolge daran hängt.

- [ ] **Schritt 5: Der Dienst-Test gegen echtes Postgres**

`TimingSplitServiceTest` mit `testComprehension`:

1. Eine zugeordnete SPLIT-Marke wird eine Zwischenzeit an der Partie.
2. Zwei Posten ergeben zwei Zeilen in Distanz-Reihenfolge.
3. Eine zurückgenommene Zuordnung räumt ihre Zeile wieder ab.
4. Ein Wettkampf einer RACECLOCKER-Veranstaltung wird nicht angefasst.

- [ ] **Schritt 6: An die Auslöser hängen**

`grep -rn "recomputeApply" backend/src/main` zeigt, wo die offiziellen Zeiten neu gerechnet werden
— dieselben Stellen rufen zusätzlich `TimingSplitService.recomputeEvent`. Kein eigener Takt.

- [ ] **Schritt 7: Voller Lauf und Commit**

```bash
git add -A
git commit -m "Zwischenzeiten aus den Marken der Streckenposten"
```

---

## Task 5: Tempo und Rangfolge

**Files:**
- Create: `backend/src/main/resources/db/migration/V202608251240__match_team_lap_distance.sql`
- Modify: `app/competitionExecution/entity/CompetitionMatchTeamWithRegistration.kt`
  (`MatchTeamLap` bekommt `distanceMeters: Int?`)
- Modify: `app/timing/boundary/TimingSplitService.kt` (schreibt die Distanz mit)
- Modify: die Repos/Conversions, die `MatchTeamLap` bauen
- Modify: `backend/src/main/resources/openapi/documentation.yaml`
- Create: `frontend/src/utils/timing/pace.ts`, `pace.test.ts`
- Modify: die Anzeige, die Rundenzeiten zeigt (`grep -rn "laps" frontend/src/components` — Board
  und Livestream-Rundenband); Tempo je Abschnitt und Rangfolge dort ergänzen
- Modify: `frontend/src/i18n/{de,en,da}/translations.json`

**Interfaces:**
- Consumes: `paceReferenceLabel` (Task 1), `distanceMeters` an der Rundenzeit (dieser Task).
- Produces:
  - `segmentPace(laps, referenceMode, referenceMeters): (string | null)[]`
  - `rankAtPosition(teams, position): {teamId: string; rank: number}[]`

- [ ] **Schritt 1: Die Distanz an die Rundenzeit hängen**

Die Zwischenzeit trägt ihre Distanz selbst — als neue Spalte, nicht über den Postennamen
nachgeschlagen. Migration `V202608251240__match_team_lap_distance.sql`:

```sql
set search_path to ready2race, pg_catalog, public;

-- Wozu diese Zwischenzeit gehört, in Metern. Die Zwischenzeit trägt es selbst, statt es über den
-- Postennamen nachzuschlagen: Der Name ist frei vergeben und änderbar, und die Zuordnung eines
-- Postens kann sich ändern, nachdem die Zeit schon gelaufen ist -- eine gespeicherte Zeit soll
-- dann nicht rückwirkend eine andere Distanz bekommen.
--
-- Null bei den RaceClocker-Rundenzeiten: Deren Spaltennamen kommen aus dem Fremdsystem und
-- gehören keinem Posten. Dort gibt es folglich kein Tempo, und die Anzeige lässt die Stelle leer,
-- statt eine Zahl zu erfinden.
alter table competition_match_team_lap
    add column distance_meters int
        check (distance_meters is null or distance_meters >= 0);
```

`MatchTeamLap` bekommt `distanceMeters: Int?` und reicht die Spalte durch. Der Schreibweg aus
Task 4 füllt sie — `TimingSplitLogic.Split` trägt die Distanz bereits, sie muss nur in den
`CompetitionMatchTeamLapRecord` wandern. `applyLapsFromFeed` lässt sie null.

- [ ] **Schritt 2: Die Rechnungen testen**

`frontend/src/utils/timing/pace.test.ts` — Fälle:

1. Tempo zwischen zwei Posten bei `TIME_PER_DISTANCE`: 1000 m in 200 s ergibt bei Bezug 500 m
   „1:40".
2. Der erste Abschnitt rechnet gegen Start und 0 m.
3. `DISTANCE_PER_TIME`: 1000 m in 200 s ergibt „18,0 km/h" (eine Nachkommastelle).
4. Fehlende Distanz an einer Rundenzeit ergibt `null` für diesen Abschnitt — keine erfundene Zahl.
5. Eine Rundenzeit mit derselben Distanz wie die vorige ergibt `null` statt einer Division durch
   null.
6. Rangfolge an einer Position: drei Teams nach `lapMillis`, Gleichstand bekommt denselben Rang.
7. Ein Team ohne Zwischenzeit an dieser Position taucht in der Rangfolge nicht auf.

Erst schreiben, rot laufen sehen (`npx vitest run src/utils/timing/pace.test.ts`), dann bauen.

- [ ] **Schritt 3: Anzeige**

Tempo als zusätzliche Zeile oder Spalte dort, wo die Rundenzeiten schon stehen; Rangfolge als
kleine Ziffer an der Zwischenzeit. Halte dich an die Nachbarschaft — dieselbe Schriftgröße, dieselbe
Zurückhaltung. Kein neues Bedienelement.

- [ ] **Schritt 4: Prüfen und committen**

```bash
git add -A
git commit -m "Tempo je Abschnitt und Rangfolge an der Zwischenzeit"
```

---

## Task 6: `with_laps` entfernen

**Files:**
- Create: `backend/src/main/resources/db/migration/V202608251230__timing_mode_ohne_laps.sql`
- Modify: `app/timing/entity/TimingModeDto.kt`, `TimingModeRequest.kt`,
  `boundary/TimingModeService.kt`, `control/Conversions.kt`
- Modify: `backend/src/main/resources/openapi/documentation.yaml`
- Modify: `frontend/src/components/event/timing/TimingModeDialog.tsx`, `TimingModePanel.tsx`,
  `frontend/src/utils/timing/matchBoard.ts` (+ Tests), `frontend/src/components/timing/matchDisplay.tsx`
- Modify: `frontend/src/i18n/{de,en,da}/translations.json`

- [ ] **Schritt 1: Migration**

```sql
set search_path to ready2race, pg_catalog, public;

-- Der Schalter "Werden Rundenzeiten erwartet?" hat nie etwas verzweigt -- er erzeugte zwei
-- Beschriftungen und sonst nichts. Ob es Zwischenzeiten gibt, sagt seit V202608251220 die einzige
-- Stelle, die es wirklich weiß: ob der Wettkampf SPLIT-Posten auf der Strecke hat.
--
-- Damit beschreibt der Zeitnahmetyp nur noch, WIE gestartet wird (Startart, Intervall, Vorlauf,
-- Tonplan). WIE gemessen wird, sagen die Posten am Wettkampf.
alter table timing_mode
    drop column with_laps;
```

- [ ] **Schritt 2: Dem Compiler folgen**

Erst die Felder aus DTO und Request entfernen, dann `./mvnw clean compile` und jede Stelle
abarbeiten. Danach dasselbe im Frontend: Schalter aus dem Dialog, Feld aus `ModeChipParts`,
Beschreibungszeile aus `TimingModePanel`, die i18n-Schlüssel `event.timing.modes.withLaps` und
`event.timing.modes.describe.withLaps` in allen drei Sprachen.

Der Chip an der Partie leitet die Zwischenzeit-Angabe künftig daraus ab, ob der Wettkampf
SPLIT-Posten hat — wenn diese Information im Board-DTO noch nicht liegt, **melde das, statt sie
still nachzuziehen**: Das wäre eine eigene Entscheidung, keine mechanische Anpassung.

- [ ] **Schritt 3: OpenAPI, Client, Prüfen, Commit**

```bash
git add -A
git commit -m "Zeitnahmetyp beschreibt nur noch den Start"
```

---

## Task 7: Gesamtprüfung

- [ ] **Schritt 1: Voller Backend-Lauf**

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
cd backend && ./mvnw clean test -Ddatabase.url=jdbc:postgresql://localhost:7728/ready2race-build
```

- [ ] **Schritt 2: Voller Frontend-Lauf**

```bash
cd frontend && npm run build && npm run lint && npx vitest run
```

`npm run lint` darf nicht über 131 Probleme (46 Fehler, 85 Warnungen) steigen.

- [ ] **Schritt 3: Auf Reste prüfen**

```bash
cd /Users/thomas/Developer/privat/ready2race/.claude/worktrees/zeitnahme-umbau
grep -rn "withLaps\|with_laps" backend/src frontend/src --include='*.kt' --include='*.ts' --include='*.tsx' --include='*.yaml' | grep -v node_modules | grep -v "\.gen\.ts"
```

Erwartet: keine Treffer.

- [ ] **Schritt 4: Übergabe schreiben**

Was gebaut wurde, die vier (oder fünf) Migrationsnummern, und die offenen Handtests:

1. Eine Bezugsgröße „Zeit pro 500 m" anlegen, einem Wettkampf Distanz und Bezugsgröße geben.
2. Zwei Posten auf der Strecke setzen, am Postenbildschirm erfassen, und prüfen, dass die
   Zwischenzeit am Lauf erscheint.
3. Tempo je Abschnitt und Rangfolge am Board gegenlesen.
4. Eine Zuordnung zurücknehmen und prüfen, dass die Zwischenzeit verschwindet.
5. Ein RaceClocker-Wettkampf behält seine Feed-Rundenzeiten und zeigt kein Tempo.
