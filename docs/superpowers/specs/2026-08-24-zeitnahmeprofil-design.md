# Zeitnahmeprofil: ein Baum statt zweier Zuordnungswelten

Stand 24.08.2026. Ersetzt die heutige Doppelung in den Zeitnahme-Einstellungen einer
Veranstaltung durch **einen** Begriff, **eine** Vererbungsregel und **eine** Oberfläche.

## Warum

Heute stehen in den Zeitnahme-Einstellungen zwei Zuordnungs-Bedienungen nebeneinander:

- **RaceClocker**: `RaceClockerRaceAssignments` — am *Rennen* werden die Wettkämpfe angehakt
  (Mehrfachauswahl je Rennen). Das Rennen hängt als Spalte `competition.raceclocker_race` am
  Wettkampf, es gibt keine Vererbung.
- **Interne Zeitnahme**: `EventCompetitionTimingSection` und
  `TimingModeAssignmentSection` — je *Wettkampf* (und je Runde) wird ein Zeitnahmetyp gewählt,
  leer heißt erben.

Beide beschreiben dasselbe: **womit diese Partie gestoppt wird.** Was beim RaceClocker das Rennen
ist, ist bei der internen Zeitnahme der Zeitnahmetyp. Dass die eine Welt rennen-zuerst und die
andere wettkampf-zuerst bedient wird, ist der eigentliche Fehler — nicht die Anzahl der Felder.

Dazu kommt eine Fähigkeit, die niemand braucht: Jeder Wettkampf kann heute ein **eigenes
Zeitnahme-System** und **eigene Dateiformate** setzen. Zwei Zeitnahme-Softwares in einer Regatta
gibt es nicht; die Möglichkeit erzeugt nur Zustände, die man erklären, anzeigen und beim Ändern
der Voreinstellung im Auge behalten muss (die ganze Abweichungsliste existiert nur dafür).

## Entscheidungen (24.08.2026, mit Thomas abgestimmt)

1. **Begriff: „Zeitnahmeprofil"** (`timingProfile`). Der Oberbegriff für „RaceClocker-Rennen
   *oder* interner Zeitnahmetyp". Die konkreten Dinge behalten ihre Namen — ein Rennen bleibt ein
   Rennen, ein Zeitnahmetyp bleibt ein Zeitnahmetyp. Profil ist der Name der **Rolle**, die beide
   spielen, und damit der Name der Zuordnung, der Vererbung und der Oberfläche.
2. **Baum über vier Ebenen: Event → Wettkampf → Runde → Partie.** Jede Ebene kann ein Profil
   setzen oder erben; die speziellste gesetzte Ebene gewinnt. Der Baum gilt für **beide** Welten.
   Motiv (Thomas): ein Wettkampf, dessen Qualifikations-Partie ein Zeitfahren ist und dessen
   Folge-Partien im Wellenstart laufen.
3. **Zeitnahme-System nur noch an der Veranstaltung.** `competition.timing_system` fällt weg,
   ebenso `competition.startlist_config` und `competition.result_import_config`. Der Wegfall ist
   die Gesamtbereinigung: die Migration verwirft die Werte, statt einen Aufräum-Knopf zu bauen.
4. **Gesamtbereinigung im Baum**: „Alles darunter auf Erben" — an der Wurzel für die ganze
   Veranstaltung, an einem Wettkampf für dessen Runden und Partien.
5. **Der Zeitnahme-Tab des Wettkampfs bleibt** und zeigt denselben Baum, eingestiegen bei diesem
   Wettkampf. Ein Bauteil, zwei Einstiege.

## Modell

### Auflösung

```
Partie-Zuordnung  >  Runden-Zuordnung  >  Wettkampf-Zuordnung  >  Event-Zuordnung  >  keins
```

Genau die Richtung, die `TimingModeResolveLogic` heute für zwei Ebenen kennt, und dieselbe, die
das `coalesce(competition.timing_system, event.timing_system)` beschrieb — nur einmal statt
zweimal formuliert.

Welche **Art** von Profil gilt, entscheidet allein `event.timing_system`:

| `event.timing_system` | Profil-Art | Auswahl im Baum         |
|-----------------------|------------|-------------------------|
| `RACECLOCKER`         | `RACE`     | die Rennen der Veranstaltung |
| `INTERN`              | `MODE`     | die Zeitnahmetypen der Veranstaltung |
| `WEBSCORER`           | —          | keine Profile; der Baum bleibt verborgen |
| nicht gesetzt         | —          | keine Profile; Hinweis statt Baum |

### Tabelle `timing_profile_assignment`

Ersetzt `timing_mode_assignment` **und** `competition.raceclocker_race`.

```sql
create table timing_profile_assignment
(
    id                      uuid      primary key,
    -- Immer gesetzt, auch in den tieferen Zeilen: Der Baum wird je Veranstaltung am Stück
    -- gelesen, und ohne diese Spalte bräuchte jede Lesung die Join-Kette über
    -- competition_setup_round -> competition_setup -> competition_properties -> competition.
    event                   uuid      not null references event on delete cascade,
    competition             uuid      references competition on delete cascade,
    competition_setup_round uuid      references competition_setup_round on delete cascade,
    competition_setup_match uuid      references competition_setup_match on delete cascade,
    -- Genau eine der beiden Profil-Arten. Zwei Spalten statt einer polymorphen Referenz:
    -- so bleiben die Fremdschluessel echt, und das restrict unten behaelt seine Wirkung.
    raceclocker_race        uuid      references raceclocker_race on delete restrict,
    timing_mode             uuid      references timing_mode on delete restrict,
    created_at              timestamp not null,
    created_by              uuid      references app_user on delete set null,
    updated_at              timestamp not null,
    updated_by              uuid      references app_user on delete set null,
    constraint chk_timing_profile_genau_eines check (
        num_nonnulls(raceclocker_race, timing_mode) = 1
    ),
    -- Jede Zeile traegt ihren vollen Pfad: eine Runden-Zeile nennt auch ihren Wettkampf,
    -- eine Partie-Zeile auch ihre Runde. Das haelt Lesen und Aufraeumen ohne Joins moeglich.
    constraint chk_timing_profile_pfad check (
        (competition is not null or (competition_setup_round is null and competition_setup_match is null))
        and (competition_setup_round is not null or competition_setup_match is null)
    ),
    -- nulls not distinct (Postgres 17), wie bisher bei timing_mode_assignment: auch die
    -- Event-Zeile (drei nulls) darf nur einmal existieren.
    unique nulls not distinct (event, competition, competition_setup_round, competition_setup_match)
);

create index on timing_profile_assignment (event);
create index on timing_profile_assignment (competition);
```

Zeilenformen:

| Ebene     | `competition` | `competition_setup_round` | `competition_setup_match` |
|-----------|---------------|---------------------------|---------------------------|
| Event     | null          | null                      | null                      |
| Wettkampf | gesetzt       | null                      | null                      |
| Runde     | gesetzt       | gesetzt                   | null                      |
| Partie    | gesetzt       | gesetzt                   | gesetzt                   |

### Migration (`V202608242100__timing_profile_assignment.sql`)

Reihenfolge, alles in einer Migration:

1. Tabelle anlegen (oben).
2. Zeitnahmetyp-Zuordnungen übernehmen:
   `insert ... select` aus `timing_mode_assignment`, `event` über
   `competition -> event` nachgeschlagen, `competition_setup_match` null.
3. Rennen-Zuordnungen übernehmen: je `competition` mit `raceclocker_race is not null` eine
   Wettkampf-Zeile.
4. `drop table timing_mode_assignment;`
5. `alter table competition drop column raceclocker_race, drop column timing_system,
   drop column startlist_config, drop column result_import_config;`

**Datenverlust, bewusst:** Schritt 5 verwirft die Wettkampf-Übersteuerungen von System und
Dateiformaten. Das ist Entscheidung 3. Vor dem Ausrollen auf Produktion einmal prüfen, was
verloren geht:

```sql
select c.id, cp.identifier, c.timing_system, c.startlist_config, c.result_import_config
from competition c join competition_properties cp on cp.competition = c.id
where c.timing_system is not null or c.startlist_config is not null or c.result_import_config is not null;
```

Trägt eine produktive Regatta hier Zeilen, muss vorher entschieden werden, ob die
Veranstaltungs-Werte passen — nicht hinterher.

## Backend

### Neues Domänenpaket `app/timingProfile`

```
app/timingProfile/
  boundary/TimingProfileResolveLogic.kt   reine Logik, vier Ebenen, ohne DB/Ktor
  boundary/TimingProfileService.kt        Baum lesen, Zuordnung setzen, bereinigen
  boundary/timingProfile.kt               Routen
  control/TimingProfileRepo.kt            Zuordnungen + Baumstruktur
  entity/TimingProfileKind.kt             RACE | MODE
  entity/TimingProfileAssignment.kt       Zeile, auf das Nötige reduziert
  entity/TimingProfileAssignmentRequest.kt
  entity/TimingProfileOptionDto.kt        id, name, detail
  entity/TimingProfileTreeDto.kt          + TimingProfileCompetitionDto/RoundDto/MatchDto
  entity/TimingProfileError.kt
```

`TimingProfileResolveLogic` löst nach dem Muster von `TimingModeResolveLogic` auf (das dabei
entfällt):

```kotlin
data class Assignment(
    val competition: UUID?,
    val round: UUID?,
    val match: UUID?,
    val profile: UUID,
)

fun resolve(assignments: Collection<Assignment>, competition: UUID?, round: UUID?, match: UUID?): UUID?
```

Sucht in der Reihenfolge Partie → Runde → Wettkampf → Event die erste passende Zeile. `null` für
`competition` fragt die Wurzel ab; damit beantwortet dieselbe Funktion auch „was gilt auf dieser
Ebene, wenn sie erbt?" für die Oberfläche.

### Endpunkte

| Methode | Pfad | Zweck |
|---------|------|-------|
| `GET` | `/event/{eventId}/timing-profile-tree` | Der ganze Baum samt Auswahlmöglichkeiten |
| `PUT` | `/event/{eventId}/timing-profile-assignment` | Upsert einer Ebene; `profile: null` räumt ab (= erben) |
| `DELETE` | `/event/{eventId}/timing-profile-assignments` | Gesamtbereinigung, optional `?competition={id}` |

Rechte wie bisher: Lesen `ReadEventGlobal`, Schreiben `UpdateEventGlobal`. Kein neues Privileg.

`GET .../timing-profile-tree` liefert:

```
TimingProfileTreeDto
  timingSystem: TimingSystem?          // das der Veranstaltung
  kind: TimingProfileKind?             // RACE, MODE oder null (Webscorer / nicht gesetzt)
  options: [TimingProfileOptionDto]    // id, name, detail  (Rennen: Ergebnis-Adresse; Typ: "Intervall 30 s" / "Welle")
  ownProfile: UUID?                    // die Event-Zeile
  competitions: [
    { competitionId, identifier, name, ownProfile, effectiveProfile,
      rounds: [ { roundId, name, ownProfile, effectiveProfile,
                  matches: [ { matchId, name, ownProfile, effectiveProfile } ] } ] } ]
```

`effectiveProfile` rechnet der Server — nicht die Oberfläche. Damit gibt es die Regel genau
einmal, und der Baum bleibt eine Anzeige. Nach jeder Änderung lädt die Oberfläche ihn neu, wie
es `RaceClockerRaceAssignments` heute schon tut.

Wettkampf-Kennung und -Name kommen aus `competition_properties`, und zwar nur aus den Zeilen mit
`competition is not null`: dieselbe Tabelle trägt laut Check-Constraint auch die Zeilen der
Wettkampf-Vorlagen, die zu keiner Veranstaltung gehören (siehe `TimingConfigRepo.getDeviations`).

Partien kommen aus `competition_setup_match` (die Struktur, nicht die Durchführung) — sie
existieren, sobald der Wettkampfablauf steht, also lange vor dem ersten Lauf. Der angezeigte Name
ist `coalesce(competition_match.bye_name, competition_setup_match.name)`, ersatzweise
„Lauf {execution_order}". Runden werden über die `next_round`-Kette sortiert
(`TimingStartOrderLogic.roundOrder`), Partien nach `execution_order`.

`PUT` prüft im Service:

- Das Profil gehört zu dieser Veranstaltung (wie heute `ensureRaceBelongsToEvent`).
- Die Art des Profils passt zu `event.timing_system` — sonst `TIMING_PROFILE_KIND_MISMATCH`.
- Der Pfad ist stimmig: die Runde gehört zum Wettkampf, die Partie zur Runde — sonst
  `TIMING_PROFILE_SCOPE_INVALID`.

`DELETE` ohne `competition` löscht alle Zeilen der Veranstaltung **außer** der Event-Zeile; mit
`competition` alle Runden- und Partie-Zeilen dieses Wettkampfs (seine eigene Zeile bleibt). Also
immer: „alles *unterhalb* dieser Ebene erbt wieder".

### Stellen, die den Wettkampf-Override verlieren

| Datei | heute | künftig |
|-------|-------|---------|
| `RaceClockerPollRepo.getCandidates` | `coalesce(COMPETITION.TIMING_SYSTEM, EVENT.TIMING_SYSTEM)`, `join RACECLOCKER_RACE on COMPETITION.RACECLOCKER_RACE` | `EVENT.TIMING_SYSTEM`; das Rennen wird **nicht mehr im SQL** gejoint |
| `RaceClockerPollRepo.isAutoPullConfigured` | coalesce | `EVENT.TIMING_SYSTEM` |
| `TimingMatchRepo.internSystem` | coalesce | `EVENT.TIMING_SYSTEM` |
| `CompetitionMatchRepo.getStartListConfigTarget` | `coalesce(COMPETITION.STARTLIST_CONFIG, EVENT.STARTLIST_CONFIG)` | `EVENT.STARTLIST_CONFIG` |
| `CompetitionExecutionService` (Ergebnis-Import) | `competition.resultImportConfig ?: event.resultImportConfig` | `event.resultImportConfig` |
| `RaceClockerRaceRepo.isAssignedToCompetition` | zählt `COMPETITION.RACECLOCKER_RACE` | zählt `TIMING_PROFILE_ASSIGNMENT.RACECLOCKER_RACE` |

**Der Poll-Kandidat wird in Kotlin aufgelöst.** `getCandidates` liefert künftig alle unbeendeten
Läufe der Veranstaltung samt `competitionId`, `roundId`, `matchId` und ohne Rennen;
`RaceClockerPollService` schlägt das Rennen über `TimingProfileResolveLogic` nach (die Rennen
selbst kommen aus `RaceClockerRaceRepo.getByEvent`) und lässt Läufe ohne Rennen still fallen —
genau die Wirkung, die der innere Join heute hat. Dasselbe Muster benutzt `TimingMatchService`
bereits für den Zeitnahmetyp; eine Ebenen-Auflösung mit vier Stufen gehört nicht ins SQL.

### Was entfällt

- `app/timingConfig/entity/TimingConfigDto.kt`, `TimingConfigRequest.kt`,
  `CompetitionTimingDeviationDto.kt`
- `TimingConfigRepo` (die Datei enthält nur `getDeviations`)
- `TimingConfigService.getTimingConfig` / `.updateTimingConfig` und die Route `timingConfig()`
  am Wettkampf
- `EventTimingConfigDto.deviatingCompetitions`
- `app/timing/boundary/TimingModeResolveLogic.kt`, `control/TimingModeAssignmentRepo.kt`,
  `entity/TimingModeAssignmentDto.kt`, `entity/TimingModeAssignmentRequest.kt` und die beiden
  Routen `getTimingModeAssignments` / `upsertTimingModeAssignment`
- `RaceClockerRaceService.setRaceClockerRaceAssignments` und
  `getRaceClockerCompetitionAssignments` samt `RaceClockerRaceAssignments`-DTOs

Bleiben: `timing_mode` (Verwaltung der Typen), `raceclocker_race` (Verwaltung der Rennen),
`event`-seitige Zeitnahme-Voreinstellung inklusive Töne, Genauigkeit und Abruf-Takte.

## Frontend

### Neu: `components/event/timing/TimingProfileTree.tsx`

Ein Bauteil, zwei Einstiege:

```tsx
<TimingProfileTree eventId={eventId} />                          // Event-Einstellungen: ab der Wurzel
<TimingProfileTree eventId={eventId} competitionId={id} />       // Wettkampf-Tab: ab diesem Wettkampf
```

- Baumzeilen mit Einrückung und Aufklapp-Pfeil; **alles eingeklappt außer der ersten Ebene**.
  Ein Wettkampf, unter dem etwas Eigenes gesetzt ist, trägt einen Zähler („2 Abweichungen") und
  klappt beim Öffnen der Seite trotzdem nicht auf — der Zähler ist die Einladung.
- Je Zeile ein `Select`: „Erbt (*Name*)" (an der Wurzel: „nicht gesetzt") plus die Profile.
  Speichert sofort, sperrt nur die eigene Zeile, lädt den Baum danach neu.
- Kopfzeile mit `Button` „Alles darunter auf Erben" (Bestätigungsdialog über `useConfirmation`,
  wie beim Löschen eines Rennens), an der Wurzel und je Wettkampf.
- Reine Logik in `timingProfileTree.ts` (Zeilen abflachen, Aufklapp-Zustand, Abweichungszähler,
  Beschriftung eines Profils) — mit Tests, ohne Netz, wie `eventCompetitionTimingRows.ts` heute.

### Geändert

- `EventTimingConfig.tsx`: `RaceClockerRaceAssignments`, `EventCompetitionTimingSection` und der
  ganze Abweichungs-Abschnitt raus, `TimingProfileTree` rein (unterhalb des Speichern-Knopfs, wie
  die Tabelle heute — jede Zeile speichert sofort). Der RaceClocker-Block behält das Anlegen der
  Rennen, der INTERN-Block das Anlegen der Zeitnahmetypen; nur das *Zuordnen* wandert in den Baum.
- `CompetitionTimingConfig.tsx`: schrumpft auf Überschrift, Hinweis („System und Dateiformate
  gelten für die ganze Veranstaltung", mit Link dorthin) und `TimingProfileTree` für diesen
  Wettkampf. Formular, Überschreiben-Schalter und Warnungen entfallen.
- `CompetitionExecution.tsx`: bezieht das System künftig aus `getEventTimingConfig` statt aus
  `getTimingConfig` — `effectiveTimingSystem` wird zu einem schlichten Feldzugriff. Die
  Startlisten-Warnung („kein Format konfiguriert") rechnet ebenfalls nur noch auf der
  Veranstaltung.
- i18n `de`/`en`/`da`: Neuer Ast `event.timing.profiles.*`; `event.timing.competitions.*`,
  `event.timing.assignments.*`, `event.timing.deviations.*` und
  `event.competition.timing.*` (bis auf den neuen Hinweis) entfallen.

### Entfällt

`EventCompetitionTimingSection.tsx`, `eventCompetitionTimingRows.ts(+test)`,
`RaceClockerRaceAssignments.tsx`, `TimingModeAssignmentSection.tsx`,
`competition/timing/timingConfigForm.ts(+test)`.

**Bewusst verloren:** die Mehrfachauswahl „am Rennen die Wettkämpfe anhaken". Der Normalfall
(alle Wettkämpfe in ein Rennen) ist im Baum ein einziger Klick an der Wurzel; der Ausnahmefall
kostet je Wettkampf einen. Eine Mehrfachauswahl im Baum wäre eine eigene Aufgabe und steht hier
nicht im Umfang.

## Tests

**Backend** (JUnit 5, Testcontainers wo DB nötig — `testComprehension` gegen echtes Postgres):

- `TimingProfileResolveLogicTest`: alle vier Ebenen, jede schlägt die darüber; leere Menge;
  fremder Wettkampf stört nicht; Runden-Zeile vererbt nicht an die Nachbarrunde.
- `TimingProfileMigrationTest`: `timing_mode_assignment`-Zeilen und
  `competition.raceclocker_race` landen als Wettkampf-Zeilen; die alten Spalten sind weg.
- `TimingProfileServiceTest`: Upsert legt an / ersetzt / räumt ab; falsche Profil-Art,
  fremdes Profil und krummer Pfad werden abgelehnt; Bereinigung löscht genau die Ebenen darunter.
- `RaceClockerPollLogicTest` / `-RepoTest`: Kandidaten ohne Profil fallen heraus; eine
  Partie-Zuordnung schlägt die des Wettkampfs; das System kommt nur noch von der Veranstaltung.
- `TimingMatchServiceTest`: Partie-Ebene wirkt auf den ausgelieferten Zeitnahmetyp.

**Frontend** (Vitest): `timingProfileTree.test.ts` — Abflachen, Abweichungszähler,
Erbt-Beschriftung, Aufklapp-Zustand.

## Reihenfolge der Umsetzung

1. Migration + jOOQ-Neugenerierung (eigene Build-DB, siehe unten).
2. `TimingProfileResolveLogic` samt Tests (reine Logik, ohne DB).
3. Repo, Service, Routen, OpenAPI-Yaml; alte Endpunkte und DTOs entfernen.
4. Die sechs Stellen aus der Tabelle „Stellen, die den Wettkampf-Override verlieren".
5. `npm run generate`, dann Frontend: Baum, beide Einstiege, Aufräumen, i18n.
6. `./mvnw clean test`, `npm run build`, `npm run lint`.

**Bauumgebung** (aus früheren Sitzungen, gilt hier genauso):

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
cd backend && ./mvnw clean test -Ddatabase.url=jdbc:postgresql://localhost:7728/ready2race-build
```

Eigene Build-DB `r2r-zeitprofil-builddb` auf Port 7728 — die geteilte 7652 trägt die
Migrationen fremder Worktrees. Migrationsnummer `V202608242100`; im Nachbar-Worktree
`sequence-visualization-controls` ist `V202608242020` belegt.

## Offene Risiken

- **Der Prod-Abzug wird geprüft, bevor die Migration dort läuft** (Abfrage oben). CRF 2026 läuft
  produktiv; verworfene Wettkampf-Übersteuerungen fallen sonst erst am Renntag auf.
- **Der Poll-Umbau ist die heikelste Stelle.** Der innere Join war die stille Sicherung „ohne
  Rennen kein Abruf". Die Kotlin-Auflösung muss dieselbe Wirkung haben, sonst laufen Abrufe ins
  Leere und belasten den Takt.
- **Partien-Zuordnungen überleben das Neuerzeugen einer Runde in der Durchführung.**
  *Korrektur vom 25.08.2026 — hier stand vorher das Gegenteil, und das war falsch.* Die Zuordnung
  hängt an `competition_setup_match`, also am **Ablauf**. `CompetitionExecutionService.deleteCurrentRound`
  löscht dagegen `competition_match`, also die **Durchführung**; die Setup-Partien behalten ihre
  Kennungen, und die Zuordnungen finden ihre Läufe nach dem Neuerzeugen wieder.

  Sie sterben ausschließlich, wenn jemand den Wettkampfablauf selbst umbaut (Reiter
  „Wettbewerbsablauf"): Dort verschwindet die Setup-Partie wirklich, und mit ihr per
  `on delete cascade` ihre Zuordnung. Das ist richtig so — die Partie, auf die sie zeigte, gibt es
  danach nicht mehr. Genau diese Unterscheidung gehört in den Hinweistext des Baums.
