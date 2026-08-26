# Der Zeitnahmetyp bekommt seine Töne — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die vier Zeitnahme-Töne gehören zum Zeitnahmetyp statt zur Veranstaltung, gepflegt als
benannte Ton-Sätze mit einem Vorgabesatz zum Erben; dazu Startsequenz-Schalter, konfigurierbare
Tastenbelegung, die Tonleiter je Boot — und die Startbildschirm-Einstellungen wandern hinter ein
Zahnrad auf den Bildschirm selbst.

**Architecture:** Neue Tabelle `timing_tone_set` je Veranstaltung mit den vier Tönen und einem
Vorgabesatz (partieller Unique-Index). `timing_mode` zeigt optional darauf — null heißt erben. Die
Töne reisen künftig mit der Partie (`TimingMatchDto.timingMode`), weil jede Partie ihren Typ hat;
`TimingSettingsDto` behält den Vorgabesatz als Rückfall für Erfassungen ohne Zuordnung.

**Tech Stack:** Kotlin/Ktor, KIO, jOOQ (generiert), Flyway, Postgres 17, JUnit 5 + Testcontainers;
React/TypeScript, MUI, react-i18next, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-26-zeitnahmetyp-toene-design.md`

## Global Constraints

- **Worktree:** `/Users/thomas/Developer/privat/ready2race/.claude/worktrees/quirky-tu-229a12`,
  Zweig `claude/zeitnahmetyp-toene`, ausgehend von `main` (`0a5b4a69`).
- **Im Haupt-Checkout läuft die Anwendung** (Backend Port **8080**, Vite **5123**, Datenbank
  `ready2race` auf 7653). **Nicht beenden, nicht neu starten, die Datenbank nicht anfassen** — die
  Migrationen dort spielt der Koordinator am Ende ein.
- **Build-Datenbank:** Jeder Maven-Aufruf braucht
  `-Ddatabase.url=jdbc:postgresql://localhost:7728/ready2race-build`. Die geteilte DB auf 7652 darf
  NICHT benutzt werden. Meckert Flyway über eine Prüfsumme:
  `docker exec r2r-zeitprofil-builddb psql -U developer -d ready2race-build -c 'drop schema ready2race cascade'`
  — sie dient ausschließlich dem Codegen.
- **JAVA_HOME:** `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`.
  `mvnw` liegt in `backend/`.
- **Nach jeder Schema-Änderung `clean`** mitlaufen lassen. Großzügiges Timeout (bis 600000 ms), im
  Vordergrund.
- **Migrationsnummern:** `V202608261200` bis `V202608261260`. Höchste bestehende ist
  `V202608251300`.
- **OpenAPI** ist handgepflegt; danach `cd frontend && npm run generate`. Nicht-nullable Felder
  gehören in `required`.
- **Backend-Architektur:** Entity-Control-Boundary; jeder `Jooq.query` in einem Repo, nie in einem
  Service; kein rohes SQL; KIO, **jedes `KIO.fail…` mit seinem `!`** — ohne ist es ein stiller
  No-Op, und diese Fehlerklasse hatte das Projekt schon.
- **Rechte:** Lesen `ReadEventGlobal`, Schreiben `UpdateEventGlobal`. Kein neues Privileg.
- **Kein `any`/`as any`**; erzeugte Typen aus `@api/types.gen.ts` statt eigener Interfaces.
- **i18n in allen drei Sprachen** (`de`, `en`, `da`). **Die JSON-Dateien nur zeilenweise anfassen** —
  kein Umschreiben per JSON-Serialisierung, das formatiert die ganze Datei um und erzeugt tausende
  Zeilen Diff-Lärm.
- **Anklickbare Elemente** bekommen die Klasse `cursor-pointer`.
- **Deutsche Umlaute** (ä, ö, ü, ß) überall, niemals ae/oe/ue/ss — auch in Testnamen und
  Commit-Nachrichten. **Diese Regel steht über dem wörtlichen Brieftext:** Steht in einem Codeblock
  deines Briefs eine Ersatzschreibung, schreib sie richtig.
- **Kommentare erklären das Warum**, im Ton der umliegenden Dateien.
- **Commits erwähnen weder Claude noch Anthropic**, kein Co-Authored-By.
- **`git add` nur mit ausdrücklichen Pfaden**, nie `git add -A`.
- **Prüfbefehle:** Backend `./mvnw clean test -Ddatabase.url=…` (Ausgangsstand **1569 grün**);
  Frontend `npm run build && npm run lint && npx vitest run` (**1564 grün**, Lint **131 Probleme /
  46 Fehler / 85 Warnungen — darf nicht steigen**).

## Die zwei Zusicherungen, an denen alles hängt

**1. Nach der Migration klingt keine Regatta anders als vorher.** Der Startsequenz-Ton hängt heute
am Typ, die anderen drei an der Veranstaltung. Die Migration muss beides so zusammenführen, dass
jeder Lauf denselben Klang behält. Der Migrationstest gegen Altdaten ist der wichtigste Test
dieser Arbeit.

**2. Der Notausgang bleibt hörbar.** Eine Zeit **ohne** Zuordnung gehört zu keinem Typ. Bleibt der
Rückfall auf den Vorgabesatz aus, verstummt genau der Griff, der im Ernstfall zählt — und Stille an
der Ziellinie liest sich wie ein Fehler.

---

## Task 1: Ton-Sätze anlegen und Bestandsdaten überführen

**Files:**
- Create: `backend/src/main/resources/db/migration/V202608261200__timing_tone_set.sql`
- Create: `app/timing/entity/TimingToneSetDto.kt`, `TimingToneSetRequest.kt`
- Create: `app/timing/control/TimingToneSetRepo.kt`
- Modify: `app/timing/boundary/TimingService.kt` (oder eine eigene Datei, wenn sie zu groß wird —
  dann melden), `app/timing/boundary/timing.kt`
- Modify: `backend/src/main/resources/openapi/documentation.yaml`
- Create: `backend/src/test/kotlin/.../timing/TimingToneSetMigrationTest.kt`

**Interfaces:**
- Produces:
  - Tabelle `timing_tone_set`, jOOQ `TIMING_TONE_SET`
  - `TimingToneSetDto(id, name, isDefault, sequenceTonePlan, splitTone, falseStartTone, finishTone, tonePerBoat)`
  - `timing_mode.tone_set`, `.start_sequence_enabled`, `.boat_keys_primary`, `.boat_keys_secondary`
  - `GET/POST /event/{eventId}/timing/tone-sets`, `PUT/DELETE /…/{toneSetId}`

- [ ] **Schritt 1: Migration schreiben**

Die Tabelle, die Spalten am Typ, und die Überführung. Die Überführungsregel steht im Entwurf; hier
noch einmal, weil sie der Kern ist:

1. Je Veranstaltung **mit** Zeitnahmetypen einen Satz „Standard" (`is_default = true`) mit den drei
   Tönen der Veranstaltung und `sequence_tone_plan = null`.
2. Für **jeden Typ mit eigenem `tone_plan`** einen weiteren Satz, benannt nach dem Typ, mit dessen
   Tonplan und denselben drei Veranstaltungs-Tönen; der Typ zeigt darauf.
3. Typen ohne eigenen Tonplan bleiben auf `tone_set = null` und erben „Standard".

```sql
set search_path to ready2race, pg_catalog, public;

-- Ein benannter Satz aus den vier Toenen einer Zeitnahme. Gehoert der Veranstaltung, weil man ihn
-- einmal einstellt und viele Zeitnahmetypen ihn teilen -- wer die Lautstaerke aller Typen aendern
-- will, aendert einen Satz statt sieben Typen.
create table timing_tone_set
(
    id                 uuid      primary key,
    event              uuid      not null references event on delete cascade,
    name               text      not null,
    -- Der Vorgabesatz: Typen ohne eigene Wahl erben ihn. Genau einer je Veranstaltung, erzwungen
    -- ueber den partiellen Index unten statt ueber Anwendungslogik -- zwei Vorgaben werfen eine
    -- Frage auf, die niemand beantworten kann.
    is_default         boolean   not null default false,
    -- null heisst jeweils "eingebauter Standard", damit "Standard wiederherstellen" moeglich
    -- bleibt -- dieselbe Bedeutung wie bisher an Veranstaltung und Typ.
    sequence_tone_plan jsonb,
    split_tone         jsonb,
    false_start_tone   jsonb,
    finish_tone        jsonb,
    -- Unterscheidet der Erfassungston die Boote? Position 1 spielt den Zielton, die uebrigen fuenf
    -- eine pentatonische Leiter darueber. Gehoert hierher: Es ist eine Eigenschaft des Klangbildes.
    tone_per_boat      boolean   not null default true,
    created_at         timestamp not null,
    created_by         uuid      references app_user on delete set null,
    updated_at         timestamp not null,
    updated_by         uuid      references app_user on delete set null,
    unique (event, name)
);

create unique index on timing_tone_set (event) where is_default;

alter table timing_mode
    -- null heisst "erbt den Vorgabesatz". set null beim Loeschen: Wer einen Satz wegwirft, soll
    -- nicht gehindert werden; die Typen fallen auf die Vorgabe zurueck statt unbrauchbar zu werden.
    add column tone_set               uuid references timing_tone_set on delete set null,
    -- Startet die App diesen Lauf? Vorgabe an -- das heutige Verhalten.
    add column start_sequence_enabled boolean not null default true,
    -- Die Tasten, die am Zielposten die Boote treffen, in Positionsreihenfolge. Zwei Reihen, weil
    -- man je nach Tastatur greift, was naeher liegt; die zweite ist optional.
    add column boat_keys_primary      text not null default '123456',
    add column boat_keys_secondary    text default 'ABCDEF';
```

Dann die Überführung in reinem SQL (drei `insert`/`update`-Schritte nach der Regel oben), und
zuletzt:

```sql
alter table timing_mode drop column tone_plan;
```

**Die drei Ton-Spalten der Veranstaltung bleiben vorerst stehen** — sie fallen erst in Task 3, nach
dem Umbau des Lesewegs. Sonst stünde zwischen zwei Migrationen ein Zustand ohne Töne.

- [ ] **Schritt 2: Den Migrationstest schreiben, rot laufen sehen**

Vorbild für den Rahmen: `backend/src/test/kotlin/.../raceclocker/RaceClockerSingleRaceMigrationTest.kt`
— eigener Testcontainer, bis zur Vorgänger-Version migrieren, Altdaten säen, dann den Rest.

Fälle:
1. Eine Veranstaltung mit zwei Typen, einer **mit** eigenem Tonplan, einer **ohne**: Es entstehen
   zwei Sätze. Der Typ ohne Plan zeigt auf `null`, der mit Plan auf seinen eigenen Satz, und dessen
   `sequence_tone_plan` ist der alte Plan.
2. Der Vorgabesatz trägt die drei Töne der Veranstaltung unverändert.
3. Eine Veranstaltung **ohne** Zeitnahmetypen bekommt keinen Satz — kein leerer Ballast.
4. Genau ein Vorgabesatz je Veranstaltung.

- [ ] **Schritt 3: Domäne und Endpunkte**

Repo, DTO, Request, Dienst, Routen — nach dem Muster der Nachbarn im `timing`-Paket. Beim Setzen
eines neuen Vorgabesatzes muss der alte seine Markierung verlieren; der partielle Index lässt sonst
nicht schreiben. Löse das **in einer Anweisung** (erst alle auf `false`, dann den einen auf `true`)
und schreib dazu, warum.

Die **Tastenbelegung** wird beim Schreiben geprüft: keine Doppelung innerhalb einer Reihe und nicht
zwischen den beiden Reihen, kein Leerzeichen (die Leertaste hat ihre eigene Bedeutung), höchstens so
viele Zeichen, wie es Positionen geben kann. Eigener Fehler, kein roher Datenbankfehler.

- [ ] **Schritt 4: OpenAPI, Client, Prüflauf, Commit**

```bash
git add backend/src/main/resources/db/migration backend/src/main/kotlin backend/src/test backend/src/main/resources/openapi frontend/src/api
git commit -m "Ton-Sätze je Veranstaltung, Zeitnahmetypen zeigen darauf"
```

---

## Task 2: Die Töne reisen mit der Partie

**Files:**
- Create: `app/timing/boundary/TimingToneResolveLogic.kt`
- Modify: `app/timing/entity/TimingModeDto.kt`, `TimingSettingsDto.kt`,
  `app/timing/boundary/TimingMatchService.kt`, `TimingOfficialTimeService.kt` (dort wird
  `TimingSettingsDto` gebaut — nachsehen)
- Modify: `backend/src/main/resources/openapi/documentation.yaml`
- Modify: `frontend/src/utils/timing/useTimingSettings.ts`,
  `frontend/src/components/timing/useCaptureFlow.ts`,
  `frontend/src/utils/timing/useFalseStartTone.ts`, `frontend/src/pages/app/TimingBoardPage.tsx`
- Create: `backend/src/test/kotlin/.../timing/TimingToneResolveLogicTest.kt`

**Interfaces:**
- Consumes: `timing_tone_set`, `timing_mode.tone_set` aus Task 1.
- Produces:
  - `TimingModeDto.toneSet: ResolvedToneSet` (die vier Töne, bereits auf den eingebauten Standard
    aufgelöst, plus `tonePerBoat`)
  - `TimingSettingsDto.defaultToneSet: ResolvedToneSet`

- [ ] **Schritt 1: Die reine Auflösung testen, rot laufen sehen**

`TimingToneResolveLogic` ist reine Logik ohne Datenbank- und Ktor-Bezug, nach dem Muster von
`TimingProfileResolveLogic`. Die Kette je Ton: **Satz des Typs → Vorgabesatz der Veranstaltung →
eingebauter Standard.** Fälle:

1. Der Typ hat einen Satz: dessen Töne gelten.
2. Der Typ hat keinen: der Vorgabesatz gilt.
3. Ein Ton im gewählten Satz ist `null`: er fällt auf den eingebauten Standard — **nicht** auf den
   Vorgabesatz. Ein gewählter Satz ist eine Aussage; ein leeres Feld darin heißt „Standard", nicht
   „nimm den von woanders".
4. Es gibt gar keinen Vorgabesatz: alle vier fallen auf den eingebauten Standard.

Fall 3 ist der, den man leicht falsch herum baut — schreib die Begründung als Kommentar dazu.

- [ ] **Schritt 2: Auflösen und ausliefern**

`TimingMatchService.getMatches` löst je Partie auf und hängt das Ergebnis an `timingMode`.
`TimingSettingsDto` bekommt den aufgelösten Vorgabesatz und **behält seine drei bisherigen
Ton-Felder vorerst** — Task 3 räumt sie ab, wenn das Frontend umgestellt ist.

- [ ] **Schritt 3: Frontend auf die Töne der Partie umstellen**

Der Erfassungston kommt aus der geführten Partie; gibt es keine, aus `defaultToneSet`. Der
Fehlstart-Ton ebenso. Die Stelle, an der gespielt wird, ist `useCaptureFlow` — dort landet
künftig der Ton der Partie statt der Veranstaltungs-Ton.

**Das ist Zusicherung 2:** Der große Erfassungsknopf bankt eine Zeit ohne Zuordnung und gehört zu
keiner Partie. Er muss klingen. Prüf das ausdrücklich und schreib im Bericht, über welchen Weg
sein Ton kommt.

- [ ] **Schritt 4: Prüfläufe und Commit**

```bash
git commit -m "Töne reisen mit der Partie, Vorgabesatz bleibt der Rückfall"
```

---

## Task 3: Die Veranstaltung gibt die Töne ab

**Files:**
- Create: `backend/src/main/resources/db/migration/V202608261210__event_toene_weg.sql`
- Modify: `app/timingConfig/entity/EventTimingConfigDto.kt`, `EventTimingConfigRequest.kt`,
  `app/timingConfig/boundary/TimingConfigService.kt`, `app/timing/entity/TimingSettingsDto.kt`
- Modify: `backend/src/main/resources/openapi/documentation.yaml`
- Modify: `frontend/src/components/event/timing/EventTimingConfig.tsx` (die drei Ton-Editoren raus)
- Delete: `frontend/src/components/event/timing/CaptureToneEditor.tsx`,
  `FalseStartToneEditor.tsx` — **nur, wenn sie danach niemand mehr benutzt**; die Ton-Satz-Pflege
  aus Task 5 braucht sie womöglich. Prüf das und melde es, statt blind zu löschen.

```sql
set search_path to ready2race, pg_catalog, public;

-- Die drei Toene sind seit V202608261200 in den Ton-Saetzen und werden seit dem Umbau des
-- Lesewegs von dort gelesen. Erst jetzt duerfen sie fallen: Zwischen den beiden Migrationen haette
-- sonst ein Stand ohne Toene gestanden.
alter table event
    drop column timing_finish_tone,
    drop column timing_split_tone,
    drop column timing_false_start_tone;
```

- [ ] **Schritt 1: Migration, dann dem Compiler folgen**
- [ ] **Schritt 2: Prüfläufe und Commit**

---

## Task 4: Der Zeitnahmetyp-Dialog

**Files:**
- Modify: `frontend/src/components/event/timing/TimingModeDialog.tsx`,
  `TimingModePanel.tsx`
- Modify: `frontend/src/utils/timing/boardFocus.ts` (+ `boardFocus.test.ts`) — die Tastenbelegung
  ist heute fest verdrahtet (`1`–`6`, `A`–`F`)
- Modify: `frontend/src/components/timing/MatchCaptureView.tsx` (die Hinweise auf den Tasten)
- Modify: `frontend/src/i18n/{de,en,da}/translations.json`

- [ ] **Schritt 1: Die Tastenauflösung testen, rot laufen sehen**

`finishKeyTarget` bekommt die Belegung als Parameter statt fest verdrahteter Bereiche. Fälle:
Treffer in der ersten Reihe, Treffer in der zweiten, eine Taste außerhalb beider trifft nichts,
eine leere zweite Reihe ist zulässig, Groß- und Kleinschreibung trifft dieselbe Position.

- [ ] **Schritt 2: Dialog erweitern**

Ton-Satz („Erbt (*Name des Vorgabesatzes*)" als Vorgabe), Startsequenz ja/nein, die beiden
Tastenreihen, und die **Erklärtexte**:

- **Startart:** was Einzelstart und Wellenstart bedeuten — Einzelstart schickt jedes Boot für sich
  (Zeitfahren), Wellenstart mehrere gemeinsam; der Massenstart ist eine Welle, in der alle Boote
  stehen.
- **Fehlstart:** dass der Schalter nur bestimmt, ob am Startposten ein Fehlstart-Knopf erscheint,
  und dass die **Wertung** eines Fehlstarts davon unberührt bleibt — sie richtet sich nach dem
  Regelwerk und wird von Hand als Strafzeit oder Ausscheidung eingetragen.

- [ ] **Schritt 3: Prüfläufe und Commit**

---

## Task 5: Ton-Sätze pflegen, Ton-Editoren umziehen

**Files:**
- Create: `frontend/src/components/event/timing/ToneSetPanel.tsx`, `ToneSetDialog.tsx`
- Modify: `frontend/src/components/event/timing/EventTimingConfig.tsx`
- Modify: `frontend/src/i18n/{de,en,da}/translations.json`

Ein Abschnitt in den Veranstaltungs-Einstellungen: Liste der Sätze, anlegen, bearbeiten, einen als
Vorgabe markieren. Im Dialog die vier Ton-Editoren (die vorhandenen wiederverwenden) und der
Schalter für die Tonleiter je Boot, mit **Hörprobe der sechs Stufen** — ohne sie stellt man blind
ein.

Die Seite soll dadurch **leichter** werden, nicht schwerer: Ein Abschnitt tritt an die Stelle
dreier Editoren.

- [ ] **Prüfläufe und Commit**

---

## Task 6: Das Zahnrad am Athleten-Startbildschirm

**Files:**
- Modify: `frontend/src/pages/app/TimingStartDisplayPage.tsx`
- Modify: `frontend/src/components/event/timing/EventTimingConfig.tsx` (die Einstellungen dort raus)
- Modify: `frontend/src/i18n/{de,en,da}/translations.json`

Dieselben Felder, derselbe Endpunkt — nur der Ort. Auf einem Bildschirm, der im Vollbild an der Wand
hängt, muss das Zahnrad zurückhaltend sein: klein, in einer Ecke, und es **verschwindet nach
einigen Sekunden ohne Mausbewegung**. Ein Zahnrad, das dauerhaft auf der Anzeige klebt, ist auf
einer Wand schlimmer als eine Einstellung, die man woanders sucht.

In den Veranstaltungs-Einstellungen bleibt ein Satz, der sagt, wo die Einstellungen jetzt sind.

- [ ] **Prüfläufe und Commit**

---

## Task 7: Die Tonleiter je Boot

Übernimmt die angehaltene Aufgabe aus
`docs/superpowers/plans/2026-08-25-zwischenzeiten-und-distanz.md` (Task 4, dort als ANGEHALTEN
markiert) — Verhältnisse, Kappung und Testfälle stehen dort vollständig und bleiben gültig. Der
Unterschied: Der Schalter heißt jetzt `timing_tone_set.tone_per_boat` (aus Task 1) statt eines
Feldes an der Veranstaltung, und der Grundton ist der **Zielton des aufgelösten Satzes**.

**Files:**
- Create: `frontend/src/utils/timing/boatPitch.ts`, `boatPitch.test.ts`
- Modify: `frontend/src/components/timing/useCaptureFlow.ts`

- [ ] **Schritt 1: Die sieben Testfälle aus dem alten Plan schreiben, rot laufen sehen**
- [ ] **Schritt 2: Leiter bauen, verdrahten, Prüfläufe, Commit**

---

## Task 8: Gesamtprüfung

- [ ] **Schritt 1: Beide vollständigen Prüfläufe**
- [ ] **Schritt 2: Auf Reste prüfen**

```bash
grep -rn "tone_plan\|tonePlan" backend/src frontend/src --include='*.kt' --include='*.ts' --include='*.tsx' --include='*.sql' | grep -v "\.gen\.ts" | grep -v sequence_tone_plan | grep -v sequenceTonePlan
grep -rn "timing_finish_tone\|timing_split_tone\|timing_false_start_tone" backend/src frontend/src | grep -v migration
```

Erwartet: keine Treffer außer den Migrationen.

- [ ] **Schritt 3: Übergabe** — die offenen Handtests aufschreiben, mindestens:
  1. Eine Regatta mit zwei Zeitnahmetypen: Klingt nach der Migration alles wie vorher?
  2. Ein Typ mit eigenem Ton-Satz gegen einen erbenden — hört man den Unterschied?
  3. Der große Erfassungsknopf ohne geführte Partie: **klingt er?**
  4. Eine geänderte Tastenbelegung greift, und die Hinweise auf den Boots-Knöpfen zeigen die neuen
     Tasten.
  5. Das Zahnrad am Startbildschirm: erscheint es, verschwindet es wieder, und wirkt die Änderung
     sofort?
  6. Die Tonleiter: sechs Boote, sechs Tonhöhen, und Boot 1 gegen Boot 6 eine Oktave.
