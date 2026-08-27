# Livestream-Overlay (Stream-Domäne) — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eigene Stream-Domäne: transparente Vollbild-Szenen für Wirecast, server-seitiger
Szenen-Resolver (Automatik + Übersteuerung), Kontroll-Panel für Streamer, eigene Rechte.

**Architecture:** Neues Backend-Modul `app/stream/` (Muster `liveDashboard`), Push über einen
neuen WS-Kanal nach dem exakten Muster des Board-Kanals (`BoardViewBroadcaster`/`Sockets.kt`),
Frontend-Szene als öffentliche Route mit Geräte-Token (Muster geteilter Board-Link),
Panel im angemeldeten Bereich. Der Resolver ist eine reine Funktion; „on air" entscheidet
ausschließlich der Server.

**Tech Stack:** Kotlin/Ktor/KIO/jOOQ/Flyway/Postgres (Backend), TypeSpec → openapi-ts
(API), React/MUI/TanStack Router/Vitest (Frontend).

**Spec:** `docs/superpowers/specs/2026-08-27-livestream-overlay-design.md` — der Plan setzt
das Spec um; bei Detailfragen gilt das Spec.

## Global Constraints

- Sprache: UI-Texte über i18n (de UND en pflegen, `frontend/src/i18n/`), deutsche Texte mit
  echten Umlauten. Code-Kommentare deutsch, im Stil der Nachbardateien.
- Git: KEINE Erwähnung von KI/Claude in Commits; kurze deutsche Commit-Messages im Stil
  von `git log` (z. B. „Der Live-Kanal nimmt den Token seiner Oberfläche").
- Backend: `KIO.fail` ohne `!` ist ein No-Op — immer `!KIO.fail(...)` bzw. den Fluss der
  Nachbarservices kopieren. Nach Datenklassen-/DTO-Änderungen `mvn clean test`.
- Build-DB: jOOQ-Codegen läuft bei `mvn compile` (Flyway + jooq-codegen). Dieser Worktree
  braucht eine EIGENE Build-DB (geteilte DB driftet durch fremde Migrationen); nach
  DB-Wechsel `mvn clean`. `JAVA_HOME` ist in der Shell nicht gesetzt — vorher prüfen
  (`/usr/libexec/java_home -V`) und exportieren.
- API-Änderungen: TypeSpec in `api/src/*.tsp` pflegen, dann in `api/` kompilieren und im
  Frontend `npm run generate` (openapi-ts) laufen lassen; generierte Typen nie von Hand
  editieren.
- Migrationen: genau EINE neue Datei, Slot `V202608271000__stream_scene.sql` (letzter
  belegter Slot: V202608261210).
- Tests: Backend-Servicetests über die Testcontainers-Schiene (Muster `testComprehension`),
  Frontend als Vitest neben der Datei (Muster `streamOverlay.test.ts`).

---

### Task 1: Migration `stream_scene` + Token-Ziel + jOOQ

**Files:**
- Create: `backend/src/main/resources/db/migration/V202608271000__stream_scene.sql`

**Interfaces:**
- Produces: Tabellen `stream_scene`, `stream_scene_graphic`, `stream_override`; drittes
  Token-Ziel `timing_device_token.stream_scene`. jOOQ-Klassen `STREAM_SCENE`,
  `STREAM_SCENE_GRAPHIC`, `STREAM_OVERRIDE`.

- [ ] **Step 1: Audit-Spalten-Konvention nachschlagen** — `grep -ln "create table board" backend/src/main/resources/db/migration/*.sql` und die dortigen Spalten (`created_at/created_by/updated_at/updated_by` o. ä.) exakt übernehmen.

- [ ] **Step 2: Migration schreiben** (Kommentar-Stil der Nachbarmigrationen; Begründungen aus dem Spec):

```sql
create table stream_scene
(
    id                uuid primary key default gen_random_uuid(),
    event             uuid    not null references event (id) on delete cascade,
    name              text    not null,
    background        text    not null default 'TRANSPARENT', -- TRANSPARENT | CHROMA
    chroma_color      text,                                   -- nur bei CHROMA belegt
    safe_area_percent int     not null default 0,
    trial_mode        boolean not null default false
    -- + Audit-Spalten exakt wie bei board (Step 1)
);

create table stream_scene_graphic
(
    id        uuid primary key default gen_random_uuid(),
    scene     uuid    not null references stream_scene (id) on delete cascade,
    type      text    not null, -- STARTLIST|CLOCK|LAPS|RESULT|FINISH_TICKER|NEXT_UP|SCHEDULE|COURSE_IMAGE
    enabled   boolean not null default false,
    placement text    not null,
    size      text    not null default 'NORMAL', -- COMPACT | NORMAL
    settings  jsonb   not null default '{}',
    unique (scene, type)
);

create table stream_override
(
    id           uuid primary key default gen_random_uuid(),
    scene        uuid      not null references stream_scene (id) on delete cascade,
    graphic_type text      not null,
    state        text      not null, -- FORCED_ON | FORCED_OFF  (AUTO = Zeile fehlt)
    match        uuid      references match (id) on delete cascade,
    expires_at   timestamp,
    created_at   timestamp not null,
    unique (scene, graphic_type)
);

-- Drittes Ziel der vereinheitlichten Token-Infrastruktur (vgl. V202608250900):
alter table timing_device_token
    add column stream_scene uuid references stream_scene (id) on delete cascade;
alter table timing_device_token
    drop constraint timing_device_token_exactly_one_target;
alter table timing_device_token
    add constraint timing_device_token_exactly_one_target
        check (num_nonnulls(station, board, stream_scene) = 1);
create index if not exists idx_timing_device_token_stream_scene
    on timing_device_token (stream_scene);
```

Vorher prüfen, ob die Lauf-Tabelle wirklich `match` heißt (`grep "references match" backend/src/main/resources/db/migration/*.sql` — ggf. korrekten Namen einsetzen).

- [ ] **Step 3: Bauen** — `mvn compile` (eigene Build-DB!). Erwartung: Flyway migriert, jOOQ erzeugt die drei neuen Tabellenklassen.
- [ ] **Step 4: `mvn clean test`** — Bestand bleibt grün.
- [ ] **Step 5: Commit** — `git add backend/src/main/resources/db/migration/ && git commit -m "Stream-Szenen: Tabellen und drittes Token-Ziel"`

---

### Task 2: Privilegien READ/UPDATE STREAM

**Files:**
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/auth/entity/Privilege.kt`
- Modify: TypeSpec-Datei, die die Privilegien-/Resource-Aufzählung führt (`grep -rn "BOARD" api/src/*.tsp` — dieselben Stellen um `STREAM` ergänzen)

**Interfaces:**
- Produces: `Privilege.ReadStreamGlobal`, `Privilege.UpdateStreamGlobal`, Resource `STREAM`.

- [ ] **Step 1:** In `Privilege.kt` Resource `STREAM` ergänzen und nach dem Muster des BOARD-Paars (Zeilen 100–105, inkl. Kommentarstil — Begründung: Streamer brauchen kein UPDATE EVENT):

```kotlin
data object ReadStreamGlobal : Privilege(Action.READ, Resource.STREAM, Scope.GLOBAL)
data object UpdateStreamGlobal : Privilege(Action.UPDATE, Resource.STREAM, Scope.GLOBAL)
```

- [ ] **Step 2:** Prüfen, wie BOARD in die Admin-Rolle kommt (`grep -rn "ReadBoardGlobal" backend/src/main/kotlin --include="*.kt"`) — dieselben Seed-/Zuordnungsstellen um STREAM ergänzen (`initializeDatabase` sät, keine Migration).
- [ ] **Step 3:** TypeSpec-Stellen (Step-0-grep) um `STREAM` ergänzen; in `api/` kompilieren, im Frontend `npm run generate`; danach `grep -rn "readBoardGlobal" frontend/src` als Muster für die neuen Privilegien-Konstanten prüfen.
- [ ] **Step 4:** `mvn clean test` und Frontend `npm run build` — grün.
- [ ] **Step 5: Commit** — `"Eigenes Rechtepaar für die Stream-Domäne"`

---

### Task 3: Entity-Typen der Stream-Domäne

**Files:**
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/stream/entity/StreamEnums.kt`
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/stream/entity/StreamSceneDtos.kt`
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/stream/entity/StreamSceneViewDto.kt`
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/stream/entity/StreamError.kt`

**Interfaces:**
- Produces (für alle Folge-Tasks maßgeblich):

```kotlin
enum class StreamGraphicType { STARTLIST, CLOCK, LAPS, RESULT, FINISH_TICKER, NEXT_UP, SCHEDULE, COURSE_IMAGE }
enum class StreamPlacement { BOTTOM_CENTER, BOTTOM_LEFT, BOTTOM_RIGHT, TOP_LEFT, TOP_RIGHT, SIDE_LEFT, SIDE_RIGHT, FULL_CENTER }
enum class StreamGraphicSize { COMPACT, NORMAL }
enum class StreamBackground { TRANSPARENT, CHROMA }
enum class StreamOverrideState { AUTO, FORCED_ON, FORCED_OFF }

/** Erlaubte Plätze je Grafiktyp — die Verwaltungs-UI bietet nur diese an, der Service validiert dagegen. */
val allowedPlacements: Map<StreamGraphicType, Set<StreamPlacement>> = mapOf(
    StreamGraphicType.STARTLIST to setOf(StreamPlacement.BOTTOM_CENTER, StreamPlacement.BOTTOM_LEFT, StreamPlacement.BOTTOM_RIGHT),
    StreamGraphicType.CLOCK to setOf(StreamPlacement.TOP_RIGHT, StreamPlacement.TOP_LEFT),
    StreamGraphicType.LAPS to setOf(StreamPlacement.BOTTOM_CENTER, StreamPlacement.BOTTOM_LEFT, StreamPlacement.BOTTOM_RIGHT),
    StreamGraphicType.RESULT to setOf(StreamPlacement.BOTTOM_CENTER, StreamPlacement.FULL_CENTER),
    StreamGraphicType.FINISH_TICKER to setOf(StreamPlacement.SIDE_RIGHT, StreamPlacement.SIDE_LEFT),
    StreamGraphicType.NEXT_UP to setOf(StreamPlacement.BOTTOM_CENTER, StreamPlacement.BOTTOM_LEFT, StreamPlacement.BOTTOM_RIGHT),
    StreamGraphicType.SCHEDULE to setOf(StreamPlacement.FULL_CENTER),
    StreamGraphicType.COURSE_IMAGE to setOf(StreamPlacement.FULL_CENTER),
)

data class StreamSceneDto(id, event, name, background, chromaColor?, safeAreaPercent, trialMode, graphics: List<StreamSceneGraphicDto>)
data class StreamSceneGraphicDto(type, enabled, placement, size, settings: StreamGraphicSettings)
data class StreamGraphicSettings( // jsonb-Abbild; nur belegte Felder je Typ
    val displaySeconds: Int? = null,    // LAPS (Default 8), RESULT (20), STARTLIST (15)
    val listLength: Int? = null,        // SCHEDULE (Default 8)
    val imageDocument: UUID? = null,    // COURSE_IMAGE
)
data class StreamOverrideRequest(state: StreamOverrideState, match: UUID?, seconds: Int?)

data class StreamSceneViewDto(          // Push-Nutzlast UND GET-Antwort
    sceneId, background, chromaColor?, safeAreaPercent, trialMode,
    serverTime: LocalDateTime,
    graphics: List<StreamGraphicViewDto>,
)
data class StreamGraphicViewDto(
    type, placement, size,
    visible: Boolean, visibleSince: LocalDateTime?, visibleUntil: LocalDateTime?,
    overrideState: StreamOverrideState,
    match: AthleteBoardMatch?,          // STARTLIST/CLOCK/LAPS/NEXT_UP
    result: AthleteBoardResult?,        // RESULT
    provisional: Boolean?,              // RESULT: Lauf steht auf Klärung
    finishEntries: List<StreamFinishEntry>?, // FINISH_TICKER
    schedule: List<AthleteBoardMatch>?, // SCHEDULE
    imageUrl: String?,                  // COURSE_IMAGE
    sequenceStartedAt: LocalDateTime?,  // CLOCK: Countdown ab Sequenzstart
)
data class StreamFinishEntry(rank: Int, startNumber: Int, clubsShort: String?, clubsFull: String?, timeString: String)
```

- [ ] **Step 1:** Dateien anlegen; Zeittyp (`LocalDateTime` vs. anderes) und Validierungs-Muster von `BoardDtos.kt`/`LiveDashboardDto.kt` übernehmen; `StreamError` nach Muster `LiveDashboardError` (Fälle: `SceneNotFound`, `PlacementNotAllowed`, `GraphicUnknown`).
- [ ] **Step 2:** `mvn clean test` — kompiliert, Bestand grün.
- [ ] **Step 3: Commit** — `"Stream-Domäne: Begriffe und DTOs"`

---

### Task 4: Szenen-Resolver (reiner Kern) mit Tests

**Files:**
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/stream/boundary/StreamSceneResolver.kt`
- Test: `backend/src/test/kotlin/de/lambda9/ready2race/backend/stream/StreamSceneResolverTest.kt` (reiner Unit-Test, KEINE DB)

**Interfaces:**
- Consumes: Enums/DTOs aus Task 3, `AthleteBoardMatch`/`AthleteBoardResult` aus `eventInfo/entity`.
- Produces:

```kotlin
data class StreamResolverInput(
    val now: LocalDateTime,
    val graphics: List<StreamSceneGraphicDto>,       // nur enabled-Zeilen
    val overrides: List<StreamOverrideRow>,           // StreamOverrideRow(graphicType, state, match: UUID?, expiresAt: LocalDateTime?, createdAt: LocalDateTime)
    val preparing: AthleteBoardMatch?,                // Lauf „In Vorbereitung“, inkl. Zeitpunkt des Zustandswechsels (preparingSince)
    val preparingSince: LocalDateTime?,
    val running: AthleteBoardMatch?,                  // laufender Lauf
    val sequenceStartedAt: LocalDateTime?,            // laufende Startsequenz, sonst null
    val latestResult: AthleteBoardResult?,
    val latestResultAt: LocalDateTime?,               // Zeitpunkt Laufende (für RESULT-Auto-Out)
    val latestResultProvisional: Boolean,             // Laufzustand Klärung
    val finishEntries: List<StreamFinishEntry>,       // Einläufe des aktuellen Laufs, nach Rang
    val overriddenMatches: Map<UUID, AthleteBoardMatch>,   // Inhalt für Overrides mit match-Bezug
    val overriddenResults: Map<UUID, AthleteBoardResult>,
    val schedule: List<AthleteBoardMatch>,            // kommende Läufe (SCHEDULE)
    val courseImageUrl: String?,
)
data class ResolvedScene(val graphics: List<StreamGraphicViewDto>, val nextEvaluationAt: LocalDateTime?)

fun resolveScene(input: StreamResolverInput): ResolvedScene
```

**Regelwerk (aus dem Spec, hier normativ):**

1. `FORCED_OFF` → unsichtbar. Abgelaufene Overrides (`expiresAt <= now`) gelten als AUTO.
2. `FORCED_ON` → sichtbar mit gewähltem Inhalt (`match`-Bezug) bzw. Auto-Inhalt; schlägt Platz-Priorität. Zwei `FORCED_ON` auf einem Platz: der jüngere gewinnt (per `expiresAt`/Erzeugungsreihenfolge — `StreamOverrideRow` bekommt dafür `createdAt`).
3. AUTO-Regeln:
   - STARTLIST: sichtbar ab `preparingSince` für `displaySeconds` (Default 15); aus bei `sequenceStartedAt != null` oder laufendem Start.
   - CLOCK: sichtbar ab `sequenceStartedAt` (Countdown) bzw. solange `running != null`.
   - LAPS: sichtbar für `displaySeconds` (Default 8) ab der jüngsten `recordedAt`-Zeit der Runden des laufenden Laufs.
   - RESULT: sichtbar ab `latestResultAt` für `displaySeconds` (Default 20); `provisional` durchreichen.
   - FINISH_TICKER: sichtbar, sobald `finishEntries` nicht leer und RESULT (AUTO) noch nicht sichtbar war bzw. bis RESULT einblendet.
   - NEXT_UP: sichtbar, wenn `preparing != null` und Platz frei; aus ab `sequenceStartedAt`.
   - SCHEDULE / COURSE_IMAGE: sichtbar solange enabled.
4. Platz-Regel: je `placement` höchstens eine sichtbare Grafik; Priorität `RESULT > LAPS > STARTLIST > NEXT_UP`, sonst Reihenfolge der Enum.
5. `nextEvaluationAt` = frühester zukünftiger Umschaltpunkt (visibleUntil, Override-Ablauf), sonst null.

- [ ] **Step 1: Failing Tests schreiben** — mindestens diese Fälle, mit festen Zeitwerten (`val t0 = LocalDateTime.of(2026, 8, 27, 10, 0)`), Hilfs-Factory für Minimal-`AthleteBoardMatch`:
  - `startlist zeigt sich bei preparing und gibt nach 15 s den Platz an nextUp frei`
  - `nextUp verschwindet mit dem Sequenzstart`
  - `clock zaehlt ab Sequenzstart (sichtbar, sequenceStartedAt gesetzt)`
  - `laps verdraengt startlist auf demselben Platz`
  - `result verdraengt laps und traegt provisional bei Klaerung`
  - `finishTicker erscheint mit dem ersten Einlauf und weicht result`
  - `forcedOff blendet trotz Automatik aus`
  - `forcedOn mit matchBezug zeigt den gewaehlten Lauf`
  - `abgelaufener Override faellt auf AUTO zurueck`
  - `zwei forcedOn auf einem Platz: der juengere gewinnt`
  - `nextEvaluationAt ist der fruehste Umschaltpunkt`
- [ ] **Step 2:** Testlauf → rot (Klasse fehlt). `mvn test -Dtest=StreamSceneResolverTest`
- [ ] **Step 3:** Resolver implementieren (reine Funktion, keine KIO, keine DB).
- [ ] **Step 4:** `mvn test -Dtest=StreamSceneResolverTest` → grün; danach `mvn clean test`.
- [ ] **Step 5: Commit** — `"Der Szenen-Resolver entscheidet, was on air ist"`

---

### Task 5: Repos + StreamSceneService (CRUD, Overrides, Token, Probemodus)

**Files:**
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/stream/control/StreamSceneRepo.kt`
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/stream/control/StreamOverrideRepo.kt`
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/stream/boundary/StreamSceneService.kt`
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing/boundary/TimingDeviceTokenService.kt`
- Test: Testcontainers-Test im Muster der bestehenden Service-Tests (`grep -rln "testComprehension" backend/src/test` als Vorlage)

**Interfaces:**
- Consumes: jOOQ-Tabellen (Task 1), Entities (Task 3).
- Produces:
  - `StreamSceneService.getScenes(eventId)`, `createScene`, `updateScene`, `deleteScene`,
    `updateGraphics(sceneId, List<StreamSceneGraphicDto>)` (validiert gegen `allowedPlacements`, sonst `!KIO.fail(StreamError.PlacementNotAllowed)`),
    `setOverride(sceneId, type, StreamOverrideRequest)` (`seconds` → `expiresAt = now + seconds`), `clearOverride(sceneId, type)`,
    `setTrialMode(sceneId, Boolean)`, `createShareLink(sceneId)`.
  - `TimingDeviceTokenService.validateForStreamScene(token, eventId, sceneId)` — exakt nach dem Muster von `validateForBoard` (Zeile ~315), plus Share-Link-Ausstellung mit Ziel `stream_scene` nach dem Muster der Board-Share-Links.
- Jeder schreibende Weg endet mit dem Broadcast-Auslöser (Task 8: `StreamSceneBroadcaster.broadcastScene(sceneId)`) — bis Task 8 existiert, TODO-frei per Aufruf an `EventChangeMarker.bump` NICHT ersetzen, sondern die Broadcast-Zeile in Task 8 nachziehen (dort als Schritt aufgeführt).

- [ ] **Step 1:** Repos schreiben (Muster `LiveDashboardRepo`); Settings-jsonb ↔ `StreamGraphicSettings` über den vorhandenen `jsonMapper`.
- [ ] **Step 2: Failing Testcontainers-Test** — Szene anlegen → Grafiken upserten (inkl. abgelehnter unerlaubter Platz) → Override setzen/ablaufen lassen/löschen → Share-Link erzeugen → `validateForStreamScene` lässt NUR das eigene Szenen-Token durch (Board-Token derselben Veranstaltung wird abgewiesen).
- [ ] **Step 3:** Service implementieren; Rechte hier noch nicht (kommen an die Routen, Task 6).
- [ ] **Step 4:** Testlauf grün; `mvn clean test`.
- [ ] **Step 5: Commit** — `"Stream-Szenen: Verwaltung, Regie-Eingriffe und Szenen-Token"`

---

### Task 6: TypeSpec `stream.tsp` + HTTP-Routen + Codegen

**Files:**
- Create: `api/src/stream.tsp` (in `api/src/main.tsp` einbinden — Muster: wie `eventInfo.tsp` eingebunden ist)
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/stream/boundary/stream.kt`
- Modify: Routen-Registrierung (`grep -rn "liveDashboard()" backend/src/main/kotlin --include="*.kt"` — dieselbe Stelle ergänzt `stream()`)

**Interfaces:**
- Produces (Pfade unter `/event/{eventId}/stream`):

| Methode/Pfad | Recht | Zweck |
|---|---|---|
| GET `…/stream` | READ STREAM oder READ EVENT | Szenenliste inkl. Grafik-Konfiguration |
| POST `…/stream` | UPDATE STREAM oder UPDATE EVENT | Szene anlegen |
| PUT `…/stream/{sceneId}` | UPDATE STREAM/EVENT | Name/Hintergrund/SafeArea |
| DELETE `…/stream/{sceneId}` | UPDATE STREAM/EVENT | Szene löschen |
| PUT `…/stream/{sceneId}/graphics` | UPDATE STREAM/EVENT | Grafik-Zeilen upserten |
| POST `…/stream/{sceneId}/shareLink` | UPDATE STREAM/EVENT | Token ausstellen/rotieren, liefert URL |
| PUT `…/stream/{sceneId}/override/{graphicType}` | UPDATE STREAM/EVENT | Override setzen |
| DELETE `…/stream/{sceneId}/override/{graphicType}` | UPDATE STREAM/EVENT | zurück auf AUTO |
| PUT `…/stream/{sceneId}/trialMode` | UPDATE STREAM/EVENT | Probemodus |
| GET `…/stream/{sceneId}/view` | Sitzung (READ STREAM/EVENT) ODER Szenen-Token | initialer `StreamSceneViewDto` |

- [ ] **Step 1:** `stream.tsp` schreiben (DTO-Modelle spiegeln Task 3; Muster für Auth-Annotation und Token-Zugang: die Board-View-Operation in `eventInfo.tsp`).
- [ ] **Step 2:** `stream.kt` implementieren (Muster `liveDashboard.kt` für Auth-Prüfungen; der Token-Weg von `…/view` nach dem Muster des Board-HTTP-Zwillings in `eventInfo.kt`). `…/view` liefert bis Task 8 den Resolver-Stand mit leerem Dateninput NICHT — stattdessen ist Task 8 Voraussetzung: hier nur Routen + Service-Aufrufe verdrahten, `…/view` gibt vorerst 501 zurück und Task 8 ersetzt das (dort als Schritt aufgeführt).
- [ ] **Step 3:** `api/` kompilieren, Frontend `npm run generate`.
- [ ] **Step 4:** `mvn clean test`, `npm run build` — grün.
- [ ] **Step 5: Commit** — `"Stream-API: Szenen, Regie und Szenenstand"`

---

### Task 7: Probemodus-Datenquelle (rein, getestet)

**Files:**
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/stream/boundary/StreamTrialData.kt`
- Test: `backend/src/test/kotlin/de/lambda9/ready2race/backend/stream/StreamTrialDataTest.kt`

**Interfaces:**
- Produces: `fun trialInput(now: LocalDateTime, graphics: List<StreamSceneGraphicDto>): StreamResolverInput` — bildet `now` auf eine 3-Minuten-Schleife ab: 0–30 s Vorbereitung (STARTLIST/NEXT_UP), 30–60 s Startsequenz (CLOCK-Countdown), 60–150 s Rennen mit synthetischen Zwischenzeiten alle 20 s (LAPS) und Einläufen ab 120 s (FINISH_TICKER), 150–180 s Ergebnis (RESULT, einmal provisional). Synthetische Boote: 4 Bahnen, erfundene Vereinsnamen („RC Demo", „SC Probe" …).

- [ ] **Step 1: Failing Tests** — je Phase ein Test: `now` in Phase X ⇒ `resolveScene(trialInput(...))` macht die erwartete Grafik sichtbar.
- [ ] **Step 2:** rot laufen lassen, implementieren, grün laufen lassen (`mvn test -Dtest=StreamTrialDataTest`).
- [ ] **Step 3: Commit** — `"Probemodus: ein Demo-Lauf in Dauerschleife"`

---

### Task 8: Datenbeschaffung, Broadcaster und WS-Kanal

**Files:**
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/stream/boundary/StreamSceneLogic.kt`
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/stream/boundary/StreamSceneBroadcaster.kt`
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/plugins/Sockets.kt`
- Modify: `StreamSceneService.kt` (Broadcast-Auslöser aus Task 5 nachziehen; `…/view` aus Task 6 auf echten Stand umstellen)
- Modify: die Stelle, an der `BoardViewBroadcaster.broadcast` an `EventChangeMarker.bump` hängt (`grep -rn "BoardViewBroadcaster.broadcast" backend/src/main/kotlin`) — dort zusätzlich `StreamSceneBroadcaster.broadcast(eventId)`

**Interfaces:**
- Consumes: Resolver (Task 4), TrialData (Task 7), `BoardLogic`/`AthleteBoardLogic`-Bausteine, `TimingSequenceDto`-Quelle (Sequenzzustand: `grep -rn "TimingSequenceDto" backend/src/main/kotlin` und die Stelle finden, die den laufenden Sequenzstart je Veranstaltung kennt).
- Produces:
  - `StreamSceneLogic.buildInput(eventId, scene): KIO<…, StreamResolverInput>` — echter Input; bei `trial_mode` stattdessen `StreamTrialData.trialInput`.
  - `StreamSceneLogic.buildView(eventId, sceneId): KIO<…, StreamSceneViewDto>` = `buildInput` + `resolveScene` + DTO-Zusammenbau (inkl. `serverTime = now`).
  - `StreamSceneBroadcaster` — Kopie des `BoardViewBroadcaster`-Musters mit drei Abweichungen: (a) Nachricht `{"type":"streamSceneView","view":…}`; (b) `render` ruft `buildView`; (c) **Timer-Wecker**: liefert `resolveScene` ein `nextEvaluationAt`, plant die Render-Coroutine per `delay(bis dahin)` einen Selbst-Auslöser (`dirty.trySend`) — abgebrochen/erneuert bei jedem Rebuild. Öffentlich: `broadcast(eventId)`, `broadcastScene(sceneId)`, `currentView(env, eventId, sceneId)`, `subscribe/unsubscribe`.
  - `Sockets.kt`: `STREAM_SCENE_WS_PATH = "/api/ws/event/{eventId}/stream/{sceneId}"`, Handler `streamSceneSocket(env)` — Zeile für Zeile nach `boardViewSocket` (Zeilen 131–202): Sitzung mit `ReadStreamGlobal`/`ReadEventGlobal` ODER `TimingDeviceTokenService.validateForStreamScene`; Begrüßungsrahmen `currentView`; beide Routen (mit/ohne Subprotokoll).

- [ ] **Step 1:** `StreamSceneLogic` schreiben; Einlauf-Daten (`finishEntries`) und `latestResultAt` aus denselben Quellen wie die Board-Ergebnisliste (`BoardLogic.dataNeeds` nachlesen).
- [ ] **Step 2:** Broadcaster + Sockets; `…/view` (Task 6) auf `buildView` umstellen; Schreibwege aus Task 5 mit `broadcastScene` versehen.
- [ ] **Step 3: Testcontainers-Test** — Szene mit STARTLIST enabled + Lauf auf „In Vorbereitung" ⇒ `buildView` macht STARTLIST sichtbar; `trial_mode = true` ⇒ View trägt synthetische Boote.
- [ ] **Step 4:** `mvn clean test` grün.
- [ ] **Step 5: Commit** — `"Der Szenen-Kanal pusht den aufgelösten Stand"`

---

### Task 9: Frontend — Szenen-Socket und Bühne

**Files:**
- Create: `frontend/src/components/event/stream/useStreamSceneSocket.ts`
- Create: `frontend/src/components/event/stream/streamScenePush.ts` (+ `streamScenePush.test.ts`)
- Create: `frontend/src/pages/event/StreamScenePage.tsx`
- Create: `frontend/src/utils/stream/sceneToken.ts`
- Modify: `frontend/src/routes.tsx` (öffentliche Route `/event/$eventId/stream/$sceneId`, Token-Query → Ablage; Muster: Board-Route mit `writeBoardDeviceToken`, routes.tsx:29)

**Interfaces:**
- Consumes: generierte Typen `StreamSceneViewDto` etc. (Task 6).
- Produces:
  - `parseStreamSceneMessage(raw: string): StreamSceneViewDto | null` (Muster `boardViewPush.ts`: unbekannte Typen verwerfen)
  - `useStreamSceneSocket(eventId, sceneId, onView)` — Kopie von `useBoardViewSocket` (Backoff, Auth-Close-Code, Token-Runde), Token aus `sceneToken.ts`
  - `StreamScenePage`: 16:9-Bühne (Wrapper mit `aspect-ratio: 16/9`, per Transform auf Fensterbreite/-höhe skaliert), `background: transparent` bzw. Chroma-Farbe laut View, Safe-Area als Innenabstand in %, `data-stale`-Zustand nach 15 s ohne Push (keine NEUEN Einblendungen, Bestand bleibt); Grafiken rendert Task 10–12 über eine Platz-Zuordnung `placement → CSS-Anker` (fixe Grid-/Absolut-Plätze, hier als leere Slots angelegt).
- Schriften: die bereits eingebundene(n) Schriftfamilie(n) der App per Preload laden (`grep -rn "font" frontend/index.html frontend/src/main.tsx` für den Ort).

- [ ] **Step 1: Vitest für `parseStreamSceneMessage`** (gültig / unbekannter Typ / kaputtes JSON) — rot, implementieren, grün (`npm test -- streamScenePush`).
- [ ] **Step 2:** Hook + Seite + Route; Initialstand per GET `…/view` (Task 6), danach Socket.
- [ ] **Step 3:** `npm run build` grün; Seite im Dev-Server mit Szene aus Task 5-Seed öffnen (Board-Muster: launch.json), Probemodus einschalten, Bühne skaliert und bleibt transparent.
- [ ] **Step 4: Commit** — `"Die Stream-Bühne: Szene empfangen und skalieren"`

---

### Task 10: Frontend — Bandgrafiken (STARTLIST, NEXT_UP, LAPS, RESULT)

**Files:**
- Create: `frontend/src/components/event/stream/graphics/StreamStartlist.tsx`
- Create: `frontend/src/components/event/stream/graphics/StreamNextUp.tsx`
- Create: `frontend/src/components/event/stream/graphics/StreamLapsBand.tsx`
- Create: `frontend/src/components/event/stream/graphics/StreamResultPanel.tsx`
- Create: `frontend/src/components/event/stream/graphics/GraphicFrame.tsx` (+ `graphicVisibility.ts` + Test)
- Modify: `StreamScenePage.tsx` (Slots füllen)

**Interfaces:**
- Consumes: `StreamGraphicViewDto` je Typ; Bausteine `lastLaps`, `StreamBoatRow`, `FitToHeight`-Muster aus `frontend/src/components/event/board/streamOverlay/`.
- Produces: `GraphicFrame` — gemeinsame Hülle: bekommt `visible/visibleSince/visibleUntil`, animiert Slide+Fade (CSS-Transition ~300 ms, weicher Schatten — Alpha erlaubt das jetzt), hält beim Unsichtbarwerden den Inhalt für die Ausblenddauer. `graphicVisibility.ts`: `visibilityPhase(visible, mountedAt, now): 'entering'|'shown'|'leaving'|'hidden'` — als reine Funktion getestet.
- Inhalte: STARTLIST = Bahnen/Startnummern + Vereine (Kurz/Lang wie `useShortNames` im Board); RESULT = Ränge, Rückstand zum Sieger (Differenz aus den Ergebniszeiten), Badge „Vorläufig" bei `provisional`; NEXT_UP = einzeilig „Als Nächstes: {Wellenname}"; LAPS = bestehende `lastLaps`-Aufbereitung.
- Keine erfundenen Werte: fehlt eine Angabe (Tempo, Rückstand), bleibt die Stelle leer.

- [ ] **Step 1: Vitest `graphicVisibility`** — rot → implementieren → grün.
- [ ] **Step 2:** Komponenten bauen; i18n-Schlüssel `event.stream.*` (de + en).
- [ ] **Step 3:** Probemodus im Browser: alle vier Grafiken erscheinen/verschwinden animiert an ihren Plätzen. Screenshot zur Kontrolle.
- [ ] **Step 4:** `npm run build` + `npm test` grün.
- [ ] **Step 5: Commit** — `"Bandgrafiken: Startliste, Nächstes Rennen, Runden, Ergebnis"`

---

### Task 11: Frontend — CLOCK mit Sequenz-Countdown + FINISH_TICKER

**Files:**
- Create: `frontend/src/components/event/stream/graphics/StreamClock.tsx`
- Create: `frontend/src/components/event/stream/graphics/StreamFinishTicker.tsx`
- Modify: `frontend/src/components/event/board/streamClock.ts` (+ Test) — Countdown-Fähigkeit
- Test: `streamClock.test.ts` erweitern

**Interfaces:**
- Consumes: `streamClock.ts` (clockOffset-Korrektur), `sequenceStartedAt` + `match.actualStartTime` aus der View, `finishEntries`.
- Produces: `streamClock` versteht eine Startzeit in der Zukunft/`sequenceStartedAt`: vor dem Start negative Anzeige („−2:41"), ab Start wie bisher; Anzeige über `requestAnimationFrame` statt `setInterval` (nur in der neuen Komponente — die Board-Kachel bleibt unberührt). FINISH_TICKER: kompakte Liste, wächst pro Einlauf mit Einschub-Animation, bleibt stehen (`GraphicFrame` mit visible=true, kein Auto-Out).

- [ ] **Step 1: Failing Tests** in `streamClock.test.ts` für negative Zeiten (Sequenzstart vor/nach `now`, Formatierung `−m:ss`).
- [ ] **Step 2:** rot → implementieren → grün (`npm test -- streamClock`).
- [ ] **Step 3:** Komponenten bauen, im Probemodus prüfen (Countdown-Phase, wachsender Ticker).
- [ ] **Step 4: Commit** — `"Rennuhr zählt die Startsequenz, der Einlauf-Ticker bleibt stehen"`

---

### Task 12: Frontend — Füllgrafiken (SCHEDULE, COURSE_IMAGE)

**Files:**
- Create: `frontend/src/components/event/stream/graphics/StreamSchedule.tsx`
- Create: `frontend/src/components/event/stream/graphics/StreamCourseImage.tsx`

**Interfaces:**
- Consumes: `schedule` (Liste kommender Läufe, Wellenname + Zeit) und `imageUrl` aus der View.
- Produces: SCHEDULE = halbtransparente Karte (`FULL_CENTER`) mit den nächsten `listLength` Läufen, hebt den nächsten hervor; COURSE_IMAGE = Bild eingepasst (`object-fit: contain`), dezenter Rahmen. Beide über `GraphicFrame`.

- [ ] **Step 1:** Komponenten + i18n; im Probemodus/mit Seed prüfen.
- [ ] **Step 2:** `npm run build` grün. Commit — `"Füllgrafiken: Tagesprogramm und Streckenbild"`

---

### Task 13: Frontend — Szenen-Verwaltung

**Files:**
- Create: `frontend/src/components/event/stream/StreamScenesPanel.tsx` (+ Dialoge `StreamSceneDialog.tsx`, `StreamGraphicConfigDialog.tsx`)
- Modify: Event-Seite/Tab-Leiste (`grep -rn "BoardsPanel" frontend/src/pages` — daneben einhängen, sichtbar mit `readStreamGlobal` oder `updateEventGlobal`)

**Interfaces:**
- Consumes: generierte Endpunkte (Task 6), `allowedPlacements` (aus den generierten Typen bzw. als Frontend-Konstante gespiegelt — Quelle der Wahrheit bleibt der Server, der ablehnt).
- Produces: Szenenliste (Anlegen/Umbenennen/Löschen; Hintergrund Transparent/Chroma + Farbe; Safe-Area-%); je Szene Grafikliste mit enabled, Platz (nur erlaubte), Größe, Einblenddauern, Bildwahl für COURSE_IMAGE (bestehender Dokument-Upload — Muster im Verwaltungsbereich suchen: `grep -rn "eventDocument" frontend/src/components | head`); Share-Link-Knopf (Muster `BoardShareDialog.tsx`: URL mit Token anzeigen/kopieren/rotieren).

- [ ] **Step 1:** Panel + Dialoge bauen, i18n de/en.
- [ ] **Step 2:** Im Browser: Szene anlegen, Grafiken konfigurieren, Link kopieren, Szene öffnen — Ende-zu-Ende mit Task 9–12.
- [ ] **Step 3:** `npm run build` + `npm test` grün. Commit — `"Szenen-Verwaltung: anlegen, konfigurieren, teilen"`

---

### Task 14: Frontend — Kontroll-Panel

**Files:**
- Create: `frontend/src/pages/event/StreamPanelPage.tsx`
- Create: `frontend/src/components/event/stream/panel/StreamPanelGraphicCard.tsx`
- Create: `frontend/src/components/event/stream/panel/StreamPanelHealth.tsx`
- Modify: `frontend/src/routes.tsx` (Route `/event/$eventId/streamPanel`, angemeldet, `readStreamGlobal`)

**Interfaces:**
- Consumes: `useStreamSceneSocket` (dasselbe Abo wie die Szene — das Panel zeigt per Konstruktion den Stand der Szene), Override-Endpunkte (Task 6).
- Produces: Szenen-Auswahl oben; je Grafik eine Karte: Zustandspunkt (on air = grün pulsierend / bereit / aus), Schalter `Auto | An | Aus` (PUT/DELETE Override), bei „An": Lauf-Auswahl (Läufe des Tages; Endpunkt der Board-/Zeitplan-Daten wiederverwenden) und Dauer-Wahl („bis auf Widerruf", 10/20/30 s); Miniatur-Vorschau = dieselben Grafik-Komponenten (Task 10–12) in einem skalierten Container (transform: scale, pointer-events: none). `StreamPanelHealth`: Zeit seit letztem Push je Szene, Warnbanner ab 30 s („Szene ‚X' seit N s ohne Daten"); Probemodus-Schalter mit deutlichem Dauerhinweis, solange aktiv.
- Touch-tauglich: große Ziele, einspaltig auf dem Handy, zweispaltig ab md (Muster Schiedsrichter-Board).

- [ ] **Step 1:** Seite + Karten bauen, i18n de/en.
- [ ] **Step 2:** Ende-zu-Ende im Browser: zwei Fenster (Szene + Panel) — Übersteuern erscheint in <1 s in der Szene; Auto-Out fällt sichtbar zurück; Health-Warnung durch Backend-Stopp provozieren.
- [ ] **Step 3:** `npm run build` + `npm test` grün. Commit — `"Das Kontroll-Panel: sehen was on air ist, gezielt eingreifen"`

---

### Task 15: Gesamtprüfung

- [ ] **Step 1:** `mvn clean test` (Backend komplett, eigene Build-DB).
- [ ] **Step 2:** `npm test` + `npm run build` (Frontend), `npm run generate` idempotent (kein Diff).
- [ ] **Step 3:** Smoke im Browser mit Seed: Szene „Rennen" (alle 6 Renngrafiken) + Szene „Programm" (SCHEDULE) anlegen, Probemodus eine volle Schleife ansehen, Panel-Eingriffe, Token rotieren (alte Szene verliert die Verbindung und meldet es).
- [ ] **Step 4:** Offene Handtest-Punkte, die nur am echten Wirecast prüfbar sind, in einer kurzen Liste unter `docs/` festhalten (Transparenz in Wirecast, Dauerbetrieb >2 h).
- [ ] **Step 5: Commit** (falls Restdateien) — `"Stream-Domäne: Gesamtprüfung"`
