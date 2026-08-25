# Scharfschaltung der Erfassung — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Zeitnahme-Posten kann so eingerichtet werden, dass er sich erst scharf schalten muss,
bevor ein Druck eine Zeit MIT Zuordnung erfasst — während der manuelle Zieleinlauf ohne Zuordnung
immer offen bleibt.

**Architecture:** Zwei Spalten an `timing_station`: die Betriebsart (`ONETOUCH` | `ARMED`,
gepflegt von der Regattaleitung) und der Zustand (`armed`, geschaltet vom Posten selbst). Ein
kleiner Endpunkt mit Geräte-Token-Zugang schaltet; die vorhandene WebSocket-Nachricht
`stationsChanged` verteilt. Die Entscheidung „darf erfasst werden?" liegt in einer reinen Funktion,
weil sie an vier Stellen gebraucht wird.

**Tech Stack:** Kotlin/Ktor, KIO, jOOQ (generiert), Flyway, Postgres 17, JUnit 5 + Testcontainers;
React/TypeScript, MUI, react-i18next, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-25-scharfschaltung-design.md`

## Global Constraints

- **Worktree:** `/Users/thomas/Developer/privat/ready2race/.claude/worktrees/zeitnahme-umbau`,
  Zweig `claude/zeitnahme-umbau`.
- **Hier läuft eine Anwendung.** Backend auf Port **8136**, Vite auf **5176**, Entwicklungs-DB
  `r2r_zeitnahme_umbau` auf 7653. **Nicht beenden, nicht neu starten, die Entwicklungs-DB nicht
  anfassen** — die Migration dort spielt der Koordinator am Ende ein.
- **Build-Datenbank:** Jeder Maven-Aufruf braucht
  `-Ddatabase.url=jdbc:postgresql://localhost:7728/ready2race-build`. Die geteilte DB auf 7652 darf
  NICHT benutzt werden. Meckert Flyway über eine Prüfsumme:
  `docker exec r2r-zeitprofil-builddb psql -U developer -d ready2race-build -c 'drop schema ready2race cascade'`.
- **JAVA_HOME:** `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`
  vor jedem Maven-Aufruf. `mvnw` liegt in `backend/`.
- **Nach der Schema-Änderung `clean`** mitlaufen lassen. Voller Lauf mehrere Minuten — großzügiges
  Timeout (bis 600000 ms), im Vordergrund.
- **Migrationsnummer:** `V202608251300`. Muster `VyyyyMMddHHmm__beschreibung.sql`. Views gehören in
  `afterMigrate.sql`.
- **OpenAPI** ist handgepflegt; danach `cd frontend && npm run generate`. Nicht-nullable Felder
  gehören in `required`.
- **Backend-Architektur:** Entity-Control-Boundary; jeder `Jooq.query` in einem Repo, nie in einem
  Service; kein rohes SQL; KIO, **jedes `KIO.fail…` mit seinem `!`**.
- **Kein `any`/`as any`**; erzeugte Typen statt eigener Interfaces; neue i18n-Schlüssel in **allen
  drei** Sprachen (`de`, `en`, `da`).
- **i18n-Dateien nur zeilenweise anfassen** — kein Umschreiben per JSON-Serialisierung, das
  formatiert die ganze Datei um und erzeugt tausende Zeilen Diff-Lärm.
- **Deutsche Umlaute** (ä, ö, ü, ß) überall, niemals ae/oe/ue/ss. Steht in einem Codeblock deines
  Briefs eine Ersatzschreibung, schreib sie richtig.
- **Kommentare erklären das Warum**, im Ton der umliegenden Dateien.
- **Commits erwähnen weder Claude noch Anthropic.**
- **Prüfbefehle:** Backend `./mvnw clean test -Ddatabase.url=…` (Ausgangsstand **1509 grün**);
  Frontend `npm run build && npx vitest run` (**1499**) und `npm run lint` — **131 Probleme
  (46 Fehler, 85 Warnungen), diese Zahl darf nicht steigen**.

## Die eine Zeile, die nicht verhandelbar ist

Der große Erfassungsknopf (`CaptureButton`, bankt eine Zeit **ohne** Zuordnung) wird **nie**
gesperrt. Er ist die Notlösung für den Fall, dass das Scharfschalten vergessen wurde und ein Boot
durchs Ziel geht. Eine Sicherung, die eine echte Zielzeit verschluckt, ist schlimmer als keine.

---

## Task 1: Betriebsart und Zustand am Posten

**Files:**
- Create: `backend/src/main/resources/db/migration/V202608251300__timing_station_armed.sql`
- Create: `app/timing/entity/TimingCaptureMode.kt`
- Modify: `app/timing/entity/TimingStationDto.kt`, `TimingStationRequest.kt`,
  `control/Conversions.kt`, `control/TimingStationRepo.kt`,
  `boundary/TimingService.kt`, `boundary/timing.kt`
- Modify: `backend/src/main/resources/openapi/documentation.yaml`
- Modify: `backend/src/test/kotlin/.../timing/TimingStationServiceTest.kt` (oder die Datei, die
  heute `addStation`/`updateStation` prüft — nachsehen)

**Interfaces:**
- Produces:
  - `enum class TimingCaptureMode { ONETOUCH, ARMED }`
  - `TimingStationDto.captureMode: TimingCaptureMode`, `.armed: Boolean`
  - `TimingStationRequest.captureMode: TimingCaptureMode` (Vorgabe `ONETOUCH`)
  - `PUT /event/{eventId}/timing/stations/{stationId}/armed` mit `{"armed": Boolean}`
  - `TimingService.setStationArmed(stationId, eventId, armed, userId?)`

- [ ] **Schritt 1: Migration**

```sql
set search_path to ready2race, pg_catalog, public;

-- Die Betriebsart des Postens: ONETOUCH loest bei jedem Druck sofort aus (Vorgabe, das heutige
-- Verhalten), ARMED verlangt, dass der Posten sich vorher scharf schaltet. Gepflegt wird sie in den
-- Veranstaltungs-Einstellungen -- das ist eine Entscheidung der Regattaleitung, keine des
-- Zeitnehmers.
--
-- ONETOUCH als Vorgabe ist nicht Bequemlichkeit, sondern Sicherheit: Wuerde eine bestehende
-- Veranstaltung ungefragt auf ARMED springen, staende am naechsten Renntag ein Posten vor einem
-- toten Knopf, ohne zu wissen warum.
alter table timing_station
    add column capture_mode text not null default 'ONETOUCH'
        check (capture_mode in ('ONETOUCH', 'ARMED')),
    -- Der Betriebszustand, den der Posten selbst schaltet. Nur bei ARMED von Bedeutung; im
    -- ONETOUCH-Betrieb liegt er brach.
    --
    -- Getrennt von der Betriebsart, weil beide verschiedene Besitzer haben: Die Art setzt die
    -- Leitung einmal, den Zustand kippt der Zeitnehmer am Tag zwanzigmal. In einer Spalte
    -- ueberschriebe das Entschaerfen die Konfiguration.
    --
    -- false als Vorgabe: Ein Posten, der sich still selbst scharf schaltet, ist genau das, was die
    -- Sicherung verhindern soll.
    add column armed boolean not null default false;
```

- [ ] **Schritt 2: Den Schalt-Test schreiben**

In der Testdatei, die heute `addStation`/`updateStation` prüft (suchen mit
`grep -rn "addStation" backend/src/test`), vier Fälle — erst schreiben, rot laufen sehen:

1. Ein neu angelegter Posten steht auf `ONETOUCH` und `armed = false`.
2. `setStationArmed(..., armed = true)` schaltet scharf; erneutes Lesen zeigt es.
3. Entschärfen kehrt zurück.
4. Ein Posten einer **fremden** Veranstaltung wird abgelehnt (`TimingError.StationNotFound` oder
   was die Nachbarn dort werfen — sieh nach, wie `updateStation` das löst, und mach es genauso).

Lauf: `./mvnw test -Dtest=<Testklasse> -Ddatabase.url=jdbc:postgresql://localhost:7728/ready2race-build`

- [ ] **Schritt 3: Dienst, Repo, Route**

`setStationArmed` prüft die Zugehörigkeit zur Veranstaltung, schreibt, und sendet **danach**
`TimingWsMessage.StationsChanged` über den `TimingBroadcaster` — sieh dir an, wie `updateStation`
das heute macht, und folge dem.

Die Route liegt neben der Posten-Startliste und übernimmt deren Rechte-Weiche **wörtlich**:
Geräte-Token, sonst Sitzung. Vorbild ist der `get`-Block von `/matches` in
`app/timing/boundary/timing.kt` — dort steht die Begründung, warum Posten ohne Anmeldung lesen
dürfen; fürs Schalten gilt sie genauso.

Die **Betriebsart** kommt in `TimingStationRequest` (Vorgabe `ONETOUCH`) und bleibt bei
`UpdateEventGlobal` — sie gehört zur Einrichtung, nicht zum Betrieb.

- [ ] **Schritt 4: OpenAPI, Client, Prüflauf, Commit**

```bash
cd frontend && npm run generate
```

```bash
git add -A
git commit -m "Posten kennen Betriebsart und Scharfschaltung"
```

---

## Task 2: Der Postenbildschirm

**Files:**
- Create: `frontend/src/utils/timing/armed.ts`, `armed.test.ts`
- Create: `frontend/src/components/timing/ArmSwitch.tsx`
- Modify: `frontend/src/pages/app/TimingBoardPage.tsx`
- Modify: `frontend/src/components/timing/MatchCaptureView.tsx`
- Modify: `frontend/src/components/timing/CaptureButton.tsx`
- Modify: `frontend/src/i18n/{de,en,da}/translations.json`

**Interfaces:**
- Consumes: `TimingStationDto.captureMode`, `.armed`, `setStationArmed` aus Task 1.
- Produces: `captureAllowed(mode, armed): boolean`

- [ ] **Schritt 1: Die reine Entscheidung testen**

`frontend/src/utils/timing/armed.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {captureAllowed} from './armed.ts'

describe('captureAllowed', () => {
    it('erlaubt im Onetouch-Betrieb immer', () => {
        expect(captureAllowed('ONETOUCH', false)).toBe(true)
        expect(captureAllowed('ONETOUCH', true)).toBe(true)
    })

    it('erlaubt im Armed-Betrieb nur scharf geschaltet', () => {
        expect(captureAllowed('ARMED', true)).toBe(true)
    })

    // Der eine Fall, um den es geht.
    it('sperrt im Armed-Betrieb, solange entschaerft', () => {
        expect(captureAllowed('ARMED', false)).toBe(false)
    })
})
```

Lauf: `cd frontend && npx vitest run src/utils/timing/armed.test.ts` — erwartet:
„Failed to resolve import".

- [ ] **Schritt 2: Die Funktion schreiben**

```ts
import {TimingCaptureMode} from '@api/types.gen.ts'

/**
 * Darf dieser Posten gerade mit Zuordnung erfassen?
 *
 * Eine Zeile, aber sie wird an vier Stellen gebraucht (Boots-Knöpfe, Boots-Tasten, Leertaste,
 * Warnbalken). Viermal dieselbe Bedingung von Hand ist die Art Fehler, bei der später genau eine
 * davon vergessen wird — und ein Schlupfloch in einer Sicherung ist schlimmer als keine Sicherung.
 *
 * Gilt NICHT für den großen Erfassungsknopf: Der bankt eine Zeit ohne Zuordnung und ist die
 * Notlösung für den vergessenen Scharfschalter. Er wird nie gesperrt.
 */
export const captureAllowed = (mode: TimingCaptureMode, armed: boolean): boolean =>
    mode === 'ONETOUCH' || armed
```

- [ ] **Schritt 3: Der Halte-Schalter**

`ArmSwitch.tsx`: Ein Knopf, der erst nach etwa **einer Sekunde Halten** umschaltet, mit sichtbar
mitlaufendem Fortschrittsring (`CircularProgress` mit `variant="determinate"`). Loslassen vor
Ablauf bricht ab und setzt den Ring zurück.

Warum halten und nicht tippen: Ein Tippen passiert in der Tasche, ein einsekündiges Halten nicht.
Beide Richtungen brauchen dieselbe Geste — auch das Entschärfen darf nicht versehentlich gehen.

Denk an `onPointerDown`/`onPointerUp`/`onPointerLeave` (der Finger rutscht weg) und daran, den
Zeitgeber beim Abbau der Komponente zu räumen.

- [ ] **Schritt 4: Sperren, sichtbar machen, Notausgang benennen**

Drei Sperrstellen, alle über `captureAllowed`:
1. Die Boots-Knöpfe in `MatchCaptureView` (`capture(team.id)` bei `:121`).
2. Die Boots-Tasten `1`–`6` und `A`–`F` (`finishKeyTarget`, `MatchCaptureView` um `:160`).
3. Die Leertaste in `TimingBoardPage` (um `:754`).

Zur Leertaste: Sie bankt technisch **ohne** Zuordnung, wird aber trotzdem gesperrt — Tasten sind
die Unfallfläche (ein Ärmel trifft eine Tastatur, nicht einen bestimmten Knopf auf dem Schirm), der
Notausgang soll ein absichtlicher Griff sein. Schreib diese Begründung als Kommentar an die Stelle,
sonst wirkt sie später wie ein Versehen.

Sichtbarkeit: Die Boots-Knöpfe erkennbar tot, und über der Erfassungsfläche ein Balken in
Warnfarbe. **Aus drei Metern ablesbar** — ein Zeitnehmer schaut aufs Wasser, nicht auf den Schirm.

Notausgang: Im entschärften Zustand trägt der große Knopf eine eigene Beschriftung („Zeit ohne
Zuordnung banken"). Wer in dem Moment nicht liest, sondern drückt, hat trotzdem das Richtige getan.

Bei `ONETOUCH` erscheint **kein** Schalter und **kein** Balken — dort gibt es nichts zu schalten.

- [ ] **Schritt 5: Prüfen und committen**

```bash
cd frontend && npm run build && npm run lint && npx vitest run
```

```bash
git add -A
git commit -m "Postenbildschirm: scharf schalten, bevor mit Zuordnung erfasst wird"
```

---

## Task 3: Leitstand-Anzeige und Gesamtprüfung

**Files:**
- Modify: `frontend/src/components/timing/leitstand/LeitstandOverviewTab.tsx`
- Modify: `frontend/src/i18n/{de,en,da}/translations.json`

- [ ] **Schritt 1: Das Abzeichen**

Je Posten ein `Chip`: „scharf" (grün), „entschärft" (Warnfarbe), „Onetouch" (neutral).
**Read-only** — der Leitstand ändert nichts, der Posten entscheidet selbst. Wer am Wasser steht,
weiß als Einziger, ob gleich ein Boot kommt.

Der Gewinn ist die Vorwarnung: Die Leitung sieht vor dem Rennen, dass ein Posten noch entschärft
ist, und kann anrufen. Setz das Abzeichen deshalb dorthin, wo man vor dem Rennen ohnehin hinsieht.

Der Zustand kommt über die vorhandene Postenliste; sie lädt auf `stationsChanged` bereits neu —
prüf das nach und sag im Bericht, ob es stimmt.

- [ ] **Schritt 2: Vollständige Prüfläufe**

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
cd backend && ./mvnw clean test -Ddatabase.url=jdbc:postgresql://localhost:7728/ready2race-build
cd ../frontend && npm run build && npm run lint && npx vitest run
```

- [ ] **Schritt 3: Auf Schlupflöcher prüfen**

```bash
cd /Users/thomas/Developer/privat/ready2race/.claude/worktrees/zeitnahme-umbau
grep -rn "capture(" frontend/src/components/timing/ frontend/src/pages/app/TimingBoardPage.tsx | grep -v "captureAllowed\|useCaptureFlow\|onCapture"
```

Jeder Treffer ist eine Auslösefläche. Für jeden entscheiden: Geht er über `captureAllowed`, oder
ist er der Notausgang? Etwas Drittes darf es nicht geben. **Schreib die Liste in den Bericht**,
Treffer für Treffer mit Urteil.

- [ ] **Schritt 4: Commit**

```bash
git add -A
git commit -m "Leitstand zeigt die Scharfschaltung der Posten"
```

- [ ] **Schritt 5: Übergabe**

Die offenen Handtests aufschreiben:

1. Posten auf `ARMED` stellen, Bildschirm öffnen — steht er entschärft da, und ist das aus drei
   Metern zu sehen?
2. Entschärft: Boots-Knöpfe, `1`–`6`, `A`–`F` und Leertaste lösen nichts aus.
3. Entschärft: Der große Knopf bankt weiterhin eine Zeit ohne Zuordnung.
4. Halten schaltet scharf; ein kurzer Tipp tut nichts.
5. Scharf: alles wie gewohnt, auch mehrere Boote schnell hintereinander.
6. Der Leitstand zeigt den Wechsel ohne Neuladen.

---

## Task 4: Boote am Ton unterscheiden — ANGEHALTEN am 25.08.2026

> **Nicht umsetzen.** Dieser Task hängt den Schalter ans Event. Thomas hat entschieden, dass die
> Erfassungstöne (samt Fehlstart- und Zielton) künftig zum **Zeitnahmetyp** gehören und aus
> benannten Ton-Sätzen des Events gewählt werden — dorthin gehören dann auch dieser Schalter und
> die anpassbare Tastenbelegung. Task 4 wandert deshalb in den Entwurf „Zeitnahmetyp als vollständige
> Beschreibung", statt hier gebaut und sofort umgebaut zu werden. Die Tonleiter selbst (Verhältnisse,
> Kappung, Tests) bleibt gültig und wird von dort übernommen.

## Task 4 (angehalten): Boote am Ton unterscheiden

**Files:**
- Create: `backend/src/main/resources/db/migration/V202608251310__capture_tone_per_boat.sql`
- Modify: `app/timingConfig/entity/EventTimingConfigDto.kt`, `EventTimingConfigRequest.kt`,
  `app/timingConfig/boundary/TimingConfigService.kt`,
  `app/timing/entity/TimingSettingsDto.kt` und der Dienst, der sie auflöst
- Modify: `backend/src/main/resources/openapi/documentation.yaml`
- Create: `frontend/src/utils/timing/boatPitch.ts`, `boatPitch.test.ts`
- Modify: `frontend/src/components/timing/useCaptureFlow.ts`,
  `frontend/src/components/event/timing/EventTimingConfig.tsx`
- Modify: `frontend/src/i18n/{de,en,da}/translations.json`

**Interfaces:**
- Produces: `boatPitch(base: number, position: number): number`

**Warum das geht, und was es leistet**

`1`–`6` und `A`–`F` sprechen dieselben **sechs** Positionen an (`boardFocus.ts:28-36`) — zwei
Tastenreihen für dieselben Boote. Es braucht also sechs Tonhöhen, nicht zwölf. Gespielt wird der
Erfassungston an genau **einer** Stelle (`useCaptureFlow.ts:137`), und die weiß bereits, ob ein
Boot zugeordnet wurde.

Ehrlich zur Wirkung: Sechs Tonhöhen sind **nicht absolut erkennbar** — niemand hört „das war Boot
4". Zuverlässig hörbar ist das Relative: dass man ein *anderes* Boot getroffen hat als eben (das
fängt den Doppeltipp), grob die Lage im Feld, und die Extreme (Boot 1 und 6 liegen eine Oktave
auseinander). Formulier die Beschriftung in den Einstellungen entsprechend zurückhaltend; ein Text,
der mehr verspricht, macht den Bediener unaufmerksam.

- [ ] **Schritt 1: Migration**

```sql
set search_path to ready2race, pg_catalog, public;

-- Ob der Erfassungston die Boote unterscheidet: Position 1 spielt den eingestellten Grundton, die
-- uebrigen fuenf eine feste Leiter darueber. Vorgabe an -- der Nutzen (man hoert einen Doppeltipp
-- auf dasselbe Boot) wiegt schwerer als die Gewoehnung, und abschalten ist zwei Klicks entfernt.
alter table event
    add column capture_tone_per_boat boolean not null default true;
```

- [ ] **Schritt 2: Die Leiter testen**

`frontend/src/utils/timing/boatPitch.test.ts` — sieben Fälle, erst schreiben, rot laufen sehen:

```ts
import {describe, expect, it} from 'vitest'
import {boatPitch} from './boatPitch.ts'

describe('boatPitch', () => {
    it('laesst Position 1 auf dem Grundton', () => {
        expect(boatPitch(800, 1)).toBe(800)
    })

    it('legt Position 6 eine Oktave darueber', () => {
        expect(boatPitch(800, 6)).toBe(1600)
    })

    // Pentatonisch: keine kleinen Sekunden, kein Tritonus. Zwei fast gleichzeitige Erfassungen
    // ergeben dadurch einen Zusammenklang statt eines Schwebens -- und ein schwebender Ton am Ziel
    // klingt wie ein Fehler, auch wenn keiner passiert ist.
    it('folgt der pentatonischen Leiter', () => {
        expect(boatPitch(800, 2)).toBe(900)
        expect(boatPitch(800, 3)).toBe(1000)
        expect(boatPitch(800, 4)).toBe(1200)
        expect(boatPitch(800, 5)).toBe(Math.round(800 * (5 / 3)))
    })

    // Die Frequenzgrenze der Einstellungen ist 4000 Hz; ein hoch eingestellter Grundton staucht die
    // Leiter oben, statt darueber hinauszuschiessen.
    it('kappt an der oberen Grenze', () => {
        expect(boatPitch(3000, 6)).toBe(4000)
    })

    // Eine Position ausserhalb der sechs ist ein Programmfehler, kein Tonfehler: Grundton spielen
    // statt zu raten.
    it('faellt bei unbekannter Position auf den Grundton zurueck', () => {
        expect(boatPitch(800, 0)).toBe(800)
        expect(boatPitch(800, 7)).toBe(800)
    })
})
```

- [ ] **Schritt 3: Die Leiter schreiben**

Verhältnisse `[1, 9/8, 5/4, 3/2, 5/3, 2]`, Ergebnis gerundet, gekappt an der oberen Frequenzgrenze
aus `TimingToneLimits` (im Frontend gibt es die Grenzen gespiegelt — such danach, statt 4000 von
Hand hinzuschreiben).

- [ ] **Schritt 4: Verdrahten**

In `useCaptureFlow` beim Spielen: Ist ein Boot zugeordnet **und** der Schalter an, dann den
Erfassungston mit `boatPitch(tone.frequencyHz, position)` spielen; sonst unverändert.

**Der unzugeordnete Griff behält den Grundton** — damit bedeutet der Grundton „gebankt, noch ohne
Boot". Das ist Information, die nichts kostet; schreib sie als Kommentar dazu.

Die Position ist die Stelle des Bootes nach Startnummer, dieselbe, die `finishKeyTarget` benutzt —
hol sie dort, statt eine zweite Zählung zu erfinden.

- [ ] **Schritt 5: Der Schalter in den Einstellungen**

Neben die Erfassungstöne in `EventTimingConfig.tsx`, mit einer **Hörprobe der sechs Stufen** —
ohne sie stellt man blind ein. Der Hinweistext bleibt zurückhaltend (siehe oben).

- [ ] **Schritt 6: Prüfen und committen**

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
cd backend && ./mvnw clean test -Ddatabase.url=jdbc:postgresql://localhost:7728/ready2race-build
cd ../frontend && npm run build && npm run lint && npx vitest run
```

```bash
git add -A
git commit -m "Erfassungston unterscheidet die Boote"
```
