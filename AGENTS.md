# AGENTS.md – Arbeitsanleitung für KI-Agenten und neue Entwickler

Diese Datei ist werkzeugneutral. `CLAUDE.md` importiert sie und ergänzt nur Claude-spezifisches.
Sie beschreibt, **wie** in diesem Repo gearbeitet wird. **Warum** etwas so ist, steht in den
Architecture Decision Records unter [`docs/adr/`](docs/adr/README.md).

- Für dieses Projekt keine ClickUp-Aufgaben anfragen oder anlegen (privates Projekt).
- Arbeitssprache ist Deutsch mit echten Umlauten (ä ö ü ß) – in Commits, Kommentaren, Docs, i18n-Texten.

## 1. Was das Projekt ist

Ready2Race ist eine Veranstaltungs-Software für Sportwettkämpfe (Schwerpunkt Regatten im
Coastal Rowing, aber sportartneutral gebaut): Vereine melden Athleten und Boote zu Wettkämpfen,
die Veranstaltung plant Runden und Läufe, führt sie mit eigener Zeitnahme oder angebundenem
Zeitnahmedienst durch, veröffentlicht Ergebnisse, erzeugt Rechnungen, Urkunden und Livestream-Grafiken
und steuert Helfer über eine QR-basierte App.

- Lizenz GPL-3.0-only, Urheber lambda9 GmbH. Öffentliche Seite: ready2race.info.
- **Fork-Situation:** `origin` = github.com/lambda9-gmbh/ready2race (Upstream, Zweig `main`),
  `fork` = github.com/tnomas/ready2race (dieser Fork). Eigene Arbeit landet in `fork/main`;
  an Upstream gehen nur gezielte Merge-Requests gegen `main`. Archiv-Zweige (`archiv/…`, Tags) enthalten
  bewusst verworfene Arbeit und werden **nie** gemergt.

## 2. Repo-Karte

| Pfad | Inhalt |
|---|---|
| `backend/` | Kotlin 2.1 / Ktor 3.1 REST-API, PostgreSQL 17, Flyway, jOOQ (Kotlin-Generator), KIO-Effektsystem (`tailwind-kio`) |
| `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/<domäne>/` | 59 Domänen nach Entity-Control-Boundary (`entity/`, `control/`, `boundary/`); `material/` ist die Materialvermietung (Anbieter, Arten, Stücke, Angebote, Anfragen, Zuteilungen, Schäden; ADR-0109) |
| `backend/src/main/resources/db/migration/` | Flyway-Migrationen `VyyyyMMddHHmm__beschreibung.sql` und `afterMigrate.sql` (alle Views) |
| `backend/src/main/resources/openapi/documentation.yaml` | **handgepflegte** OpenAPI-3.1-Spezifikation, Quelle des Frontend-Clients |
| `api/src/*.tsp` | TypeSpec-Beschreibung derselben API mit ausführlichen Verhaltenskommentaren; wird parallel gepflegt, aber nichts wird daraus generiert |
| `frontend/` | React 18, Vite 6, TypeScript strikt, MUI 6, TanStack Router (code-basiert), hey-api-Client, i18next (de/en/da), Vitest |
| `frontend/src/api/*.gen.ts` | generierter Client, eingecheckt, nie von Hand ändern |
| `frontend/src/theme/` | MUI-Theme und Geltungsbereiche (`AdminThemeScope`, `LegacyThemeScope`), Kontrasthilfen (`readableColor`) |
| `frontend/src/pages/material/`, `frontend/src/components/material/` | Materialvermietung: Anbieter-Dashboard (Anfragen, Zuteilung, Schäden, Einstellungen), Flotte, Verwaltung; Entscheidungslogik in `*Logic.ts`/`materialNumbers.ts`/`materialWorkplace.ts` mit Tests |
| `frontend/src/components/ui/` | gemeinsame Seitenbausteine (`PageHeader`, `EmptyState`, `ErrorState`, `LoadingState`, Link-Varianten), Import über `@components/ui` |
| `frontend/src/pwa/` | Helfer-App als PWA unter `/app/` (eigener Service Worker) |
| `frontend/src/demo/` | Sprecher-Board-Demo und Livestream-Grafik-Galerie ohne Backend |
| `docs/adr/` | Architecture Decision Records (Index in `README.md`, Vorlage `template.md`) |
| `docs/superpowers/specs/`, `plans/` | Design-Specs, Testkataloge, Umsetzungspläne (Datumspräfix) |
| `docs/superpowers/seeds/`, `docs/seeds/` | SQL-Seeds für Teststände; Prod-Abzüge `seed-prod-*.sql` sind gitignored |
| `CLAUDE_v01.md` | alte Upstream-Anleitung, in Teilen veraltet (JWT, kein Frontend-Testrunner, `build.sh`); nur historisch |
| `.claude/` | gitignored: Worktrees, Stack-Skripte, Prod-Abzugswerkzeuge, `launch.json` |

## 3. Schnellstart und Befehle

Voraussetzungen: Docker, JDK 17–21 (Build-Ziel ist Java 17), Node/npm.

```bash
# Java in der Shell bekannt machen (fehlt sonst, ./mvnw meldet "Unable to locate a Java Runtime")
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"
```

### Backend

```bash
cd backend
docker compose up -d                 # db (7653, Entwicklungsdaten) und build-db (7652, nur Codegen)
cp template.env .env                 # einmalig, Werte eintragen
./mvnw clean package                 # Flyway auf build-db, jOOQ-Codegen, Kompilieren, Tests, Jar
java -jar target/ready2race-api-0.0.1-jar-with-dependencies.jar .env
```

- Der jOOQ-Codegen läuft in **jedem** Maven-Build (`generate-sources`) gegen `database.url`
  (Standard `jdbc:postgresql://localhost:7652/ready2race-build`). Ohne Schemaänderung spart
  `-DskipCodegen=true` Zeit.
- Eigene Build-DB per `-Ddatabase.url=jdbc:postgresql://localhost:7652/<eigene-db>` unterschieben,
  wenn mehrere Worktrees bauen (siehe Abschnitt 9).
- Tests: `./mvnw test` (Testcontainers startet ein eigenes Postgres, RAM-Daten ohne fsync). Migriert wird
  einmal in die Template-DB `r2r_template`, jeder Reset kopiert sie nach `r2r_work`; die volle Suite
  (rund 1900 Tests) braucht etwa viereinhalb Minuten. SQL-Log nur mit `R2R_TEST_LOG_SQL=true`. Nach
  Schemaänderungen **immer** `./mvnw clean test`. `flyway:clean` braucht `-Dflyway.cleanDisabled=false`.
- Nur kompilieren: `./mvnw compile` (mit Build-DB) oder `./mvnw compile -DskipCodegen=true`.
- `*HttpIT`-Klassen laufen nicht in `./mvnw test` (Surefire nimmt nur `*Test`); einzeln mit
  `./mvnw test -Dtest=<Klasse> -DfailIfNoSpecifiedTests=false`.
- Start liest die Env-Datei aus `args[0]` (Standard `.env`, Pfad **relativ zum Arbeitsverzeichnis**);
  echte Umgebungsvariablen schlagen die Datei (`HTTP_PORT=8091 java -jar … .env`). Eine Raute im
  Wert schneidet die Zeile ab. Der Start sät den Admin aus `ADMIN_EMAIL`/`ADMIN_PASSWORD` bei **jedem**
  Start neu, deshalb nie mit fremder Env-Datei gegen die geteilte Entwicklungs-DB starten.
- Das Jar nie neu bauen, während der Prozess läuft (lazy geladene Klassen fehlen dann); lieber ein
  zweites Backend auf anderem Port starten.
- Swagger-UI: `http://localhost:8080/api/documentation`. Dev-Mailansicht: `/api/dev/emails` (nur in `MODE=DEV`).
- Optionale Betriebsschlüssel (Vorgaben und Wirkung in `backend/template.env`, geprüft in `Config.kt`):
  `FRONTEND_ORIGINS`, `APP_TIMEZONE`, `SECURITY_ARGON2_MEMORY_KIB`, `DATABASE_POOL_SIZE`,
  `DATABASE_STATEMENT_TIMEOUT_MS`, `TRUSTED_PROXY_HOPS` (hinter nginx `1`). `GET /api/health` (204, ohne
  Anmeldung) ist der Healthcheck; er steht bewusst nicht in `documentation.yaml`.

### Frontend

```bash
cd frontend
npm install
cp template.env .env                 # VITE_API_BASE_URL usw.
npm run dev                          # Vite auf 5123
npm run generate                     # Client aus ../backend/.../documentation.yaml neu erzeugen
npm run build                        # tsc -b && vite build
npm run lint                         # eslint
npm test                             # vitest run (src/**/*.test.ts)
npm run build:demo                   # Sprecher-Board als eine HTML-Datei (dist-demo/)
```

Beleg, dass der Client aktuell ist: `npm run generate` hinterlässt **keinen** Diff. Vitest sieht
keine Typfehler, `tsc -b` schon: vor „fertig" beides laufen lassen. Nach einem Branchwechsel mit neuen
Dev-Abhängigkeiten `npm install`. Die PWA ist nur gegen einen gebauten Stand prüfbar; „Manifest:
Syntax error" und ein 404 auf `/static/theme.json` im Dev-Server sind Artefakte, keine Fehler.

### API-Ordner

`api/` hat keine Scripts. `npx tsp compile .` würde nach `api/tsp-output/` schreiben (gitignored);
die `.tsp`-Dateien sind Dokumentation und Zweitbeschreibung, nicht die Quelle von `documentation.yaml`.

## 4. Backend-Architektur

- **ECB je Domäne:** `entity/` (DTOs, Requests mit `Validatable` und `example`, `XyzError`, Sort-Enums),
  `control/` (`XyzRepo` mit allen `Jooq.query { … }`, `Conversions.kt`), `boundary/` (Routen-Datei
  `xyz.kt` mit `fun Route.xyz()`, `XyzService`, ggf. `XyzLogic`).
- **KIO:** `App<E, A> = KIO<JEnv, E, A>`. Services sind `object`s, Funktionen liefern
  `App<XyzError, ApiResponse>` und laufen in `KIO.comprehension { … }`. Innerhalb der Comprehension
  wird jedes KIO mit `!` ausgeführt. **`KIO.fail(...)` ohne `!` ist ein No-Op** – der Fehler geht verloren.
  Repos werfen nicht, Services entscheiden (`.orDie()`, `onNullFail`, `onTrueFail`).
- **Blockierende Arbeit** (JDBC, Dateien) läuft auf `Dispatchers.IO`, nie auf dem Netty-Event-Loop:
  `respondComprehension` tut das schon; neue eigene Coroutinen ebenso.
- **Rückruf-Adressen:** Jede Route, die eine `callbackUrl` annimmt, ruft `checkCallbackUrl`
  (`calls/requests/CallbackUrls.kt`, Allowlist `FRONTEND_ORIGINS` bzw. Host der Anfrage; ADR-0106).
- **Zeit:** Die App rechnet in `AppZone` (Vorgabe `Europe/Berlin`, per `APP_TIMEZONE`), nicht in der Zone
  des Hosts; neue Zeitrechnung nutzt `AppZone.zone`, nicht `ZoneId.systemDefault()`.
- **Transaktionen und Nachwirkungen:** `.transact()` aus `tailwind-kio-jooq`; Broadcasts und andere
  Effekte nach dem Commit über `calls/responses/AfterCommit.kt`.
- **Routen:** `call.respondComprehension { val user = !authenticate(Privilege.X); val body = !receiveKIO(Req.example); Service.f(body, user.id!!) }`.
  Hilfen in `calls/requests/Extensions.kt`: `authenticate`, `optionalAuthenticate`, `authenticateAny`, `authenticateAll` (mehrere Privilegien zugleich),
  `pathParam`, `queryParam`, `pagination<S>()`, `checkCaptcha()`.
- **Antworten:** `ApiResponse.NoData | Dto<T> | ETagged<T> | ListDto<T> | Page<T,S> | File | Created`.
  `ETagged` für sekündlich gepollte Endpunkte (304 via `If-None-Match`). Listen **immer** paginieren.
- **Fehler:** je Domäne `sealed interface XyzError : ServiceError` mit `respond(): ApiError`;
  Fehlercodes in `ErrorCode` (Backend) und `api/src/common.tsp` spiegeln. Fremde Domänenfehler nicht
  wiederverwenden, sondern übersetzen. Unerwartetes wird `respondDefect` (500).
- **Auth:** DB-gestützte Session-Tokens (6 h gleitend), Header `X-Api-Session` mit JSON `{"token": "…"}`.
  Kein JWT. Zusätzlich Geräte-Tokens für Zeitnahme-Posten, Boards und Stream-Szenen
  (`X-Timing-Device-Token`).
- **Privilegien:** `app/auth/entity/Privilege.kt` (`Action × Resource × Scope OWN/GLOBAL`). Ein neues
  Privileg braucht **keine Migration** (`initializeDatabase` sät beim Start), aber den Enum-Wert in
  `documentation.yaml` und die Konstante in `frontend/src/authorization/privileges.ts`. Neue Privilegien
  bekommt zunächst nur die Admin-Rolle.
- **Hintergrundjobs:** DB-Tabellen als Warteschlangen, Scheduler in `Application.kt`
  (E-Mail, Rechnungen, Urkunden, WebDAV, Startsequenzen, RaceClocker-Poll, Aufräumen).
- **Websockets:** `/api/ws/event/{eventId}/{timing|info|board/{id}|stream/{id}}`; Änderungen werden
  über Change-Marker und Broadcaster (`eventInfo`, `timing`, `stream`) verteilt.
- **Konfiguration:** `backend/template.env` listet alle Schlüssel; `MODE=DEV` schaltet CORS ein,
  `MODE=PROD` schaltet Dev-Routen ab. `Config.kt` ist die Wahrheit über Pflichtfelder.
- **Wiederkehrende Muster, die leicht brechen:**
  - Zustände werden an genau einer Stelle abgeleitet: Laufzustand in `LiveDashboardLogic.deriveMatchState`,
    Ergebnisgruppierung in `RatingCategoryRanking.groupAndRank`, Aufstellung in
    `getActuallyParticipatingParticipants`, Zeitnahmeprofil in `TimingProfileResolveLogic`, Sequenzrechnung
    in `TimingSequenceService.activeTiming`, wirksames Leihmaterial je Lauf-Team in der Sicht
    `effective_material_for_match_team` (Ausnahme je Lauf vor Grundzuteilung, kleinste Stücknummer, höchstens ein
    Stück; ADR-0111). Neue Oberflächen rufen diese Stellen, sie bauen keine Kopie.
  - Ein neuer Enum-Wert fällt still in jeden `else`-Zweig; vor dem Einführen alle `when`/`switch` auflisten.
  - Schreibt eine Mutation Daten, die öffentliche Anzeigen speisen, bumpt sie `EventChangeMarker`
    (jede Sequenz-Mutation, Ergebnisse, Aktivierung, Slot-Änderungen, jede Material-Mutation, die eine
    Anzeige ändert: Zuteilung, Entscheidung, Stück/Anbieter/Art/Angebot, Fixierung); reine Konfiguration,
    Dry-Runs und die Schadensakte (keine Anzeige liest sie) nicht.
  - Das erneute Speichern der Meldung (`upsertRegistrationForEvent`) löscht und legt neu an; bestehende Meldungen behalten
    Meldungsnummer, Namen und Anlagedaten über `ResaveCarryOver` (ADR-0109). Neue Spalten an `competition_registration`, die nicht aus
    dem Formular kommen, gehören in den Schnappschuss.
  - Verschwindet eine Meldung, gibt sie ihre Materialanfragen vorher ausdrücklich frei
    (`MaterialService.releaseRequestsOfRemovedRegistrations`: Sperre bei geschlossener Vergabe, Rückzugs-Mail,
    Marker); der Waisen-Trigger auf `material_request` ist nur das Sicherheitsnetz (ADR-0109). Neue Löschwege
    für Meldungen rufen die Freigabe.
  - Optionale Request-Felder mit Bedeutung: `null` heißt „unverändert", sonst setzt jedes PUT still zurück.
  - Schreiben zwei Oberflächen dieselbe Spalte, darf keine davon sie „aufräumen".
  - Externe Feeds werden ohne Redirect-Folge geholt (SSRF-Schutz).
  - Wer `competition_match_team.start_number` eines **bestehenden** Laufs neu schreibt, prüft den Stempel
    `competition_match.team_numbers_as_start_numbers` (`CompetitionMatchRepo.teamNumbersAsStartNumbers`), nicht
    den Schalter der Veranstaltung: mit Stempel ist die Startnummer die Bootsnummer, kein Bahnplatz, und Positionen
    1..n dürfen sie nicht überschreiben. `event.team_numbers_as_start_numbers` gilt nur beim Anlegen neuer Runden
    (`StartNumberAssignment`); Meldungen in Läufen behalten beim Fixieren ihre Meldungsnummer (ADR-0111).
  - `page { }` im PDF-Baukasten ist keine harte Seitengrenze; wer „eine Seite je X" zusagt, misst die Seitenzahl.

## 5. Frontend-Architektur

- **Routing:** `src/routes.tsx`, code-basiert mit `createRoute` (keine Dateirouten). Guards prüfen
  Privilegien aus `authorization/privileges.ts`.
- **Kontexte statt Redux:** `contexts/user` (Session-Token in `localStorage` unter `session.admin`
  bzw. `session.app`), `contexts/theme` (Theme vom Server), `contexts/confirmation`, `contexts/app`.
- **Komponenten** nach Domäne unter `components/`, Seiten unter `pages/`, generische Bausteine
  `EntityTable`, `EntityDialog`, `BaseDialog`, `EntityCardList`. Formulare mit `react-hook-form-mui`.
- **i18n ist erzwungen:** `strictKeyChecks` macht fehlende Schlüssel zu TypeScript-Fehlern. Jeder
  neue Text kommt in `de`, `en` **und** `da`; Dänisch wurde nie mit Sprachkenntnis gegengelesen.
  Plätze werden als Ordnungszahlen angezeigt („1.", „1st"), damit sie nicht wie Startnummern lesen.
- **Sitzungen:** Token in `localStorage['session.admin']` bzw. `['session.app']` als
  `{"token":…,"lastUsedAt":…}`; der Header `X-Api-Session` trägt JSON `{"token":"…"}`, nicht den nackten
  Token. Geräte-Token für Posten, Boards und Stream-Szenen reisen in `X-Timing-Device-Token`.
- **Anzeigen aktualisieren sich** über den öffentlichen Kanal `/api/ws/event/{id}/info` plus
  gestrecktes Polling als Sicherheitsnetz (`utils/eventChange`, `utils/polling.ts`); kein `setInterval`,
  Timer starten erst nach der Antwort. Die App kennt nur den Light-Mode; Alarmfarben stehen fest im Code.
- **Bausteine:** Seitenköpfe, Leer-, Lade- und Fehlerzustände kommen aus `@components/ui`. `PageHeader` ist
  das **einzige `h1`** einer Seite (Breadcrumbs über `utils/navigation/breadcrumbs.ts`). Die Bereiche der
  Veranstaltung (Gruppen, Sichtbarkeit, aktiver Eintrag) stehen nur in `pages/event/eventSections.ts`;
  Seitenleiste und `EventPage` rufen dessen Funktionen. Reiter sind `?tab=` mit `validateSearch` und
  reiner Logik in `*Logic.ts` (`competitionPageLogic.ts`, `configurationPageLogic.ts`); ungültige Werte
  fallen auf den ersten sichtbaren Reiter zurück (ADR-0103).
- **Anfragen:** Absende-Handler laufen über `runRequest` (`utils/request.ts`), Netzfehler erkennt
  `isNetworkError` bzw. `isRequestNetworkError`, Downloads gehen über `utils/download.ts`
  (`runDownload`); die Sitzungsentscheidungen stehen in `contexts/user/sessionPolicy.ts` (ADR-0105).
- **Theme-Geltungsbereiche:** `AdminThemeScope` für die Verwaltung, `LegacyThemeScope` für Renntag-
  Arbeitsplätze (Schiedsrichter-Dashboard, Regie, `timing/*`), Mandanten-Theme für öffentliche Seiten und
  Helfer-App (ADR-0104). Je Lauf eine Primäraktion, Seltenes im flachen ⋮-Menü.
- **Seiten** werden lazy geladen (`lazyPage` in `routes.tsx`); neue Seiten ebenso. `npm run lint` steht
  bei 0 Fehlern und bleibt dort.
- **Typen:** kein `any`, keine `as any`-Casts; API-Typen aus `@api` (`types.gen.ts`), keine eigenen
  Nachbauten. Pfad-Aliase `@api/*`, `@components/*`, `@contexts/*`, `@utils/*`, `@routes` usw.
- **Stil:** Prettier (`tabWidth 4`, keine Semikolons, `singleQuote`, `printWidth 100`). Klickbare
  Elemente bekommen `cursor-pointer`.
- **Material-Oberflächen:** Das Anbieter-Dashboard lädt die Übersicht einmal und reicht sie an alle Reiter
  (`useMaterialOverview`); Schreibaktionen prüft `useMaterialWrite` (GLOBAL überall, OWN beim eigenen Anbieter),
  nach jeder Mutation lädt die Übersicht neu (`reloadGate` sperrt bis dahin). Zwei Zahlen nie vermischen:
  „Meldungsnr. n“ (`teamNumberOf`, Grundzuteilung) und „Startnr. n“ (`startNumberInMatch`, je Lauf). Der
  Veranstalter-Block „Materialvermietung“ ist ein Abschnitt der Einstellungen, kein eigener Bereich in
  `eventSections.ts`. Lauftitel „Runde · Lauf“ in Material-Dialogen kommen aus `utils/roundMatchLabel.ts`
  (keine Dopplung wie „Finale · Finale“).
- **Sonderseiten:** Boards (`/board/$eventId/$boardId`), Stream-Szenen (`/event/$eventId/stream/$sceneId`,
  Browserquelle für Wirecast/OBS), Regie (`…/streamPanel`), Sprecher (`/speaker/…`), Helfer-App (`/app/…`).

## 6. API-Änderung Schritt für Schritt

1. Endpunkt/DTO in `backend/src/main/resources/openapi/documentation.yaml` beschreiben.
2. Dieselbe Änderung in `api/src/<domäne>.tsp` nachziehen (Verhaltenskommentare dort pflegen).
3. Backend: Request-DTO mit `Validatable` und `example`, Service, Repo, Route.
4. `cd frontend && npm run generate`, dann Frontend-Code gegen die generierten Typen.
5. **Beide Flüsse testen**, wenn ein DTO Create und Update bedient (Lehre aus dem Hotfix vom 13.08.2026).
6. Backend bauen (`./mvnw clean compile` bzw. `test`), Frontend `npm run build && npm run lint`.

## 7. Datenbank und Migrationen

- Name `VyyyyMMddHHmm__beschreibung.sql`, Zeitstempel = Erstellzeit. Versionsnummern sind eine
  **geteilte Ressource** zwischen parallelen Sessions: vor dem Anlegen `ls …/db/migration | tail`
  prüfen und die belegte Nummer im Abschlussbericht nennen.
- **Views nur in `afterMigrate.sql`** (drop if exists, dann create); nie in `V*`-Dateien.
- Flyway läuft beim App-Start mit `outOfOrder(true)`, weil Merges ältere Nummern nachreichen.
- Spalten vom Typ `timestamp` **ohne** Zeitzone; die App rechnet in `Europe/Berlin`, der
  Postgres-Container in UTC. SQL-Testdaten mit `now() at time zone 'Europe/Berlin'` setzen.
- Nach `git mv` einer Migration die alte Kopie unter `backend/target/classes/db/migration/` löschen,
  sonst laufen beide Fassungen.
- **Umbau und Abbau getrennt migrieren** (`V…1100` baut auf, `V…1110` entfernt), weil jOOQ aus dem
  migrierten Schema erzeugt und Kotlin sonst zwischen den Schritten nicht übersetzt. `drop column`
  scheitert an abhängigen Views: vorher droppen, `afterMigrate.sql` legt sie neu an.
- **Ein Revert lässt angewandte Migrationsdateien stehen** und räumt in einer Folge-Migration auf;
  eine entfernte Migration bricht jede DB, die sie schon sah (`flyway repair` nötig). Vor
  Migrationen in Löschrichtung in Produktion einen Dump ziehen; Backfill-Heuristiken vorher an einem
  Produktionsabzug messen.
- Nicht jede Migration setzt `search_path`; wer per `psql` nachspielt, setzt ihn an der Datenbank
  (`alter database … set search_path to ready2race, pg_catalog, public`).
- jOOQ typisiert alles nullable; ob ein `!!` trägt, entscheiden `SQLDataType.nullable(...)` und die
  Join-Form. Schema-Änderung ⇒ `./mvnw clean test`, sonst `NoSuchMethodError` auf `…Record.<init>`.

## 8. Tests

- **Backend:** `testComprehension { … }` (Service/Repo gegen echtes Postgres via Testcontainers,
  Rollback je Test) und `testApplicationComprehension { … }` (Ktor-`testApplication`, markiert DB
  dirty, langsam). Helfer `assertKIOSucceeds/Fails/Dies`. Migrationstests fahren Flyway gegen den
  Container. Testdateien spiegeln die Domänenordner.
- **Frontend:** Vitest, nur `*.test.ts` (reine Logik: `utils/timing`, `pwa`, `i18n`, `sessionToken`).
  Keine Komponententests. Logik, die testbar sein soll, gehört in `utils/`, nicht in Komponenten.
- Bei Änderungen an DTOs oder Formularen **alle Konsumenten** testen: Create und Update, Import und
  Export, Seeds; für Pflichtfelder einen Test mit dem echten Frontend-Payload, nicht nur mit dem
  Kotlin-Konstruktor.
- Sperren, Trigger und Jobs, die einen echten Commit brauchen, testet `testCommittingComprehension`
  (jede `.transact()` committet, die DB gilt danach als schmutzig); zwei gleichzeitig offene
  Transaktionen laufen deterministisch über `ConcurrentTx.runHoldingFirst` (`testing/ConcurrentTx.kt`).
- Vor „fertig": Testzahlen wörtlich berichten, und Vorbestehendes Rot mit und ohne eigene Änderung messen.
  Eine gesunkene Testzahl nach Aufräumarbeiten ist das Erste, was man einzeln nachverfolgt.
- Handtests werden in Testkatalogen unter `docs/superpowers/specs/*testkatalog*.md` geführt; was dort
  offen steht, ist nicht verifiziert.

## 9. Fallen im lokalen Betrieb

- **Ports:** Hauptcheckout Backend 8080 / Vite 5123. Worktrees nehmen 8100–8199 / 5140–5199
  (`.claude/worktree.sh`). Antwortet ein Port, gehört der Prozess womöglich einem anderen Worktree:
  `lsof -p <pid> -a -d cwd` prüfen, fremde Prozesse nicht beenden.
- **Build-DB-Drift:** die geteilte `ready2race-build` (7652) trägt Migrationen fremder Zweige; der
  Codegen übernimmt dann fremde Spalten und die Laufzeit wirft 500er. Je Worktree eigene Build-DB
  anlegen und per `-Ddatabase.url` bauen; die Build-DB darf weggeworfen werden, die Entwicklungs-DB
  `ready2race` (7653) nicht.
- **Parallele Maven-Builds** im selben `target/` zerstören den Kotlin-Inkrementalcache. Vorher
  `pgrep -f classworlds.launcher.Launcher`. Bei `CorruptedException`/`NoClassDefFoundError` erst
  `clean`, dann Fehler suchen.
- **Nach jedem Merge Backend neu bauen und starten.** Vite serviert Quelltext live, das Jar nicht;
  fehlende DTO-Felder rendern still als Leerstring.
- **`.env` ist für Agenten gesperrt** (Hook blockt sed/grep darauf, `cp` geht). Session für Browser-Tests
  per `POST /api/login` holen oder Token per SQL in `app_user_session` legen (`token` ist `char(30)`,
  `expires_at` großzügig, weil UTC gegen Berlin geprüft wird).
- `GET /api/event` antwortet auch unangemeldet 200; das ist kein Beleg für eine gültige Session.
  Harte Kontrolle über eine Route mit `authenticate(...)`. Ohne Anmeldung liefert die API
  `registrationCount: 0`, auch in Produktion. Der System-Admin steht nicht in `app_user_with_roles`.
- **Seeds** (`docs/superpowers/seeds/`, `docs/seeds/`): eigener UUID-Präfix je Seed, Cleanup-Block vorn,
  Zeiten relativ zu `now()`, `applied_fingerprint` bei geseedeten Ergebnissen (Materialvermietung:
  `docs/seeds/seed-material.sql`, Präfix `5eed0009`, setzt `seed-dm-coastal-2026.sql` und ein einmal
  gestartetes Backend voraus); Einspielen mit
  `docker exec -i backend-db-1 psql -U developer -d ready2race -v ON_ERROR_STOP=1 < seed.sql`.
  Produktionsabzüge (`docs/seeds/seed-prod-*.sql`) enthalten Klarnamen und bleiben gitignored.
- Rund 85 Wegwerf-Datenbanken `r2r_*` liegen auf 7653; ein `drop` ist unumkehrbar und passiert nur
  auf ausdrücklichen Auftrag.

## 10. Git-Arbeitsweise

- Feature-Zweige `claude/<thema>-<hash>` oder `feature/<thema>`; kleine Dinge dürfen auf `main`.
  Eigener Worktree pro Session, keine Branchwechsel im Hauptcheckout, fremde Worktrees nicht anfassen.
- Merge-Richtung: erst den Zielzweig in den eigenen mergen, dort Konflikte lösen und testen, dann
  Fast-Forward zurück. Generierte Dateien (`*.gen.ts`) nie dem Auto-Merge überlassen, sondern neu erzeugen.
- Kein bare `git stash`; nach `git merge --squash` vor dem Commit `git add -A` und `git show --stat`
  gegenlesen (null Löschungen bei einem Merge, der Dateien ändert, ist ein Alarmzeichen).
- **Commits bei paralleler Arbeit** nur mit exakten Dateipfaden (`git add <dateien>`, `git commit -- <dateien>`),
  nie `git commit -- backend` oder `-a`: ein Verzeichnispfad nimmt fremde Änderungen mit.
- **Commits:** deutsche Betreffzeile ohne Präfix im Stil „Bereich: was sich ändert", ausführlicher Body
  mit Begründung und verworfenen Ansätzen. Keine Nennung von KI-Werkzeugen, keine Co-Authored-By-Zeilen.
  Vor einem Merge-Request an das Upstream-Team lambda9 werden die Nachrichten des Zweigs ins Englische
  umgeschrieben (englisch-imperativ, Betreff ≤ 50 Zeichen, Rumpf auf 72 umgebrochen, kein
  Conventional-Commit-Präfix); Sicherungszweig davor, alte Hashes in Notizen sind danach ungültig.
- **Pushen nur auf ausdrücklichen Zuruf**, und nie nach `origin`. Vor jedem Push
  `git for-each-ref --format='%(refname:short) -> %(upstream:short)'` prüfen. Vor Aufräumaktionen
  `git push fork --all --tags`; alte Zweige als `archiv/<datum>-<thema>`-Tag sichern, dann löschen.
- Cherry-pick statt Merge, wenn ein Zweig WIP-Commits oder lokale `launch.json`-Änderungen trägt.
  Nach Mehrfach-Merges übersetzen lassen, nicht nur `git status` lesen.
- **Keine Herkunftsangaben:** Fremde Software wird nirgends als Vorbild oder Inspirationsquelle genannt,
  weder im Code noch in Commits, Specs oder Docs. Technische Anbindungen (RaceClocker, WebScorer,
  WebDAV, Wirecast/OBS) dürfen als Integrationen benannt werden.
- Abschlussbericht einer Session: Branch und Commit, Umfang, Testzahlen wörtlich, belegte
  Migrationsnummer und ausdrücklich das **nicht** Verifizierte.

## 11. Dokumentation pflegen

- **Neue oder geänderte Architekturentscheidung ⇒ neues ADR** in `docs/adr/` (Vorlage `template.md`,
  fortlaufende Nummer, Index in `README.md` ergänzen). Eine Entscheidung wird nicht editiert, sondern
  durch ein neues ADR ersetzt („ersetzt durch"). Verworfene Alternativen gehören hinein.
- Design-Specs vor größeren Umbauten nach `docs/superpowers/specs/YYYY-MM-DD-<thema>-design.md`,
  Pläne nach `plans/`. Seeds mit eigenem UUID-Präfix und Cleanup-Block (siehe `docs/superpowers/seeds/README.md`).
- Diese Datei aktualisieren, wenn sich Befehle, Struktur oder Regeln ändern. Sie beschreibt den
  Ist-Zustand, keine Historie.

## 12. Domänenglossar

| Begriff | Bedeutung im Code |
|---|---|
| Veranstaltung (`event`) | Regatta/Wettkampftage mit Wettkämpfen, Meldungen, Dokumenten, Boards |
| Wettkampf (`competition`) | ein Rennen der Ausschreibung (z. B. „12 JM4x"); `identifier` = **Kennung** (Rennnummer), `short_name` = **Kurzname/Kürzel** |
| Setup (`competitionSetup`) | Rundenstruktur eines Wettkampfs (Vorlauf, Hoffnungslauf, Finale), auch als Vorlage |
| Lauf (`competition_match`) | ein Start innerhalb einer Runde; Zustände u. a. „in Vorbereitung" (`activated_at`), „läuft", „Klärung", beendet |
| Welle/Kette | Startgruppe im Zeitplan; Name `HH:MM \| Kennung Kurzname \| Rundenkürzel` |
| Meldung (`eventRegistration`, `competitionRegistration`) | Verein meldet Athleten/Teams; Ersatzleute über `substitution` |
| Vereinskette | die Vereine der Athleten eines Boots in Bootsreihenfolge (`ClubComposition`); ersetzt den früheren Begriff Renngemeinschaft; Kurzformen aus `club_short_name` (je Namensschlüssel) und `club_name_rule` |
| Wertungskategorie (`ratingcategory`) | eigene Ranglisten innerhalb eines Wettkampfs; Reihenfolge je Veranstaltung; Wertung auch je Partie möglich |
| Freilos | Lauf ohne Gegner; eine **Ableitung** (`MatchStatusDto.bye`), kein eigener Zustand; Name in `bye_name` materialisiert, `bye_must_race` macht ihn operativ zum Rennen |
| Bedingungen (`participantRequirement`) | Nachweise je Athlet, wahlweise je Tag und je Wettkampf; Prüfungsschweregrad je Wettkampf; Freigabe für „Mein Event" je Bedingung |
| Check-in/-out (`participantTracking`) | Ereignisprotokoll (Boot in die Arena / zurück), keine Kopplung an die Rennlogik; Handeinträge mit Pflichtbegründung |
| Posten / Zeitnahmetyp / Zeitnahmeprofil (`timing*`) | Messstellen am Kurs; Profil = Vererbungsbaum Veranstaltung → Wettkampf → Runde → Partie, Art über `event.timing_system`; Scharfschaltung je Posten; Startsequenzen mit Ton-Sätzen |
| Zwischenzeit (SPLIT) | Stempel am Lauf; Distanz gehört dem Wettkampf |
| Zeitstrafe | wird ausgewiesen, nie verrechnet: die gespeicherte Zeit enthält die Strafe schon; `penalty_seconds`/`penalty_note` sind Ausweis |
| Startnummer | die eine Zahl je Boot und Lauf (`start_number`, überall `startNumber`); „Bahn" gibt es als Begriff nicht mehr. Vergibt die Rundenanlage: ohne Schalter Setzposition bzw. Rang, mit `event.team_numbers_as_start_numbers` (gesetzt von der Fixierung „nach Bootsnummern“) die Meldungsnummer; die Regel steht danach als Stempel am Lauf (`competition_match.team_numbers_as_start_numbers`), und in so angelegte Läufe schreibt der RaceClocker-Abgleich keine Listenpositionen (ADR-0111) |
| Rechnung | `invoice.contact_email` ist der Ausrichter, nicht der Empfänger; Empfänger sind die aktuellen Nutzer des Vereins |
| Meldender Verein | reine Verwaltung, wird nirgends angezeigt; angezeigt werden die Vereine der Athleten |
| Board | konfigurierbare Kachel-Anzeige (`board`, JSONB-Konfiguration; Athleten-Board, Tagesprogramm, Sprecher) mit eigenem Recht `BOARD`, hinter Auth oder Geräte-Token |
| Schiedsrichter-Dashboard (`liveDashboard`) | die mitlaufende Arbeitsansicht am Steg mit eigenem Recht `LIVE_DASHBOARD`; kein Board |
| Stream-Szene | Livestream-Overlay als Browserquelle (`app/stream`), Server entscheidet „on air", Regie-Board mit Probemodus |
| Helfer-App | PWA unter `/app/` für Scannen, Zeitnahme-Posten, Check-in; Scannen zuerst |
| Materialvermietung | Vereine mieten Boote/Zubehör bei Anbietern (`app/material`); Meldung → Anfrage → Entscheidung → Zuteilung; keine Abrechnung, kein automatisches Nachrücken |
| Anbieter (`material_provider`) | verleihende Organisation; Konten sind per Anbieter-Zuordnung verbunden und tragen die systemverwaltete Rolle „Materialanbieter“ (`…0040`, ADR-0110); OWN meint den eigenen Anbieter |
| Materialart / Stück / Angebot | Art (Kategorie `BOAT` oder `OTHER`, Zubehör erscheint auf keiner Anzeige) / einzelnes Ding mit Nummer und Status / Art eines Anbieters je Veranstaltung mit Preis, geplanter Anzahl und Wechselzeit |
| Anfrage (`material_request`) | Wunsch einer Meldung nach einem Angebot (`REQUESTED`, `CONFIRMED`, `WAITLISTED`, `DECLINED`, `WITHDRAWN`); ohne Fremdschlüssel auf die Meldung; Anbieter schließt die Vergabe mit „Vergabe geschlossen“ |
| Zuteilung / Ausnahme je Lauf | Zuteilung ohne Lauf = Grundzuteilung der bestätigten Anfrage; mit Lauf = Ausnahme, die für diesen Lauf Vorrang hat (etwa Ersatz) |
| Ausfall | Schaden mit Ausfallfenster (`material_damage`); wirkt nicht auf die Anzeigen, nur über eine Ausnahme je Lauf |
| Meldungsnummer | `competition_registration.team_number`: je Wettkampf eindeutig, fest ab der Fixierung (Schalter „Meldungsnummern nach Bootsnummern vergeben“); mit ihr paart die Grundzuteilung. Eine eigene Zahl neben der Startnummer im Lauf; nur mit dem Schalter übernimmt die Rundenanlage sie als Startnummer, bestehende Läufe ändert eine Fixierung nie, und Meldungen, die schon in Läufen stehen, behalten beim Fixieren ihre Nummer (ADR-0111) |
| RaceClocker | angebundener externer Zeitnahmedienst: Rennen als Zeitnahmeprofile, Ergebnis-Feed per Polling, Lauf-Team-ID in „Extra info", Bahn = Position nach Rank |
