# ADR-0001: Backend in Kotlin auf Ktor mit jOOQ, Flyway und Maven

- Status: angenommen
- Datum: 2024-12-19
- Bereich: backend, betrieb
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Das Upstream-Team lambda9 brauchte Ende 2024 ein Grundgerüst für eine Web-Anwendung zur Wettkampfverwaltung, die als einzelnes Jar ausgeliefert und von Vereinen oder Veranstaltern selbst betrieben werden kann. Das Team hatte bereits eine eigene Kotlin-Bibliothek (tailwind, siehe [ADR-0002](0002-kio-effektsystem.md)) und Erfahrung mit jOOQ. Ein schwergewichtiges Framework mit eigenem Lebenszyklus war nicht gewünscht; die Datenbank sollte die Quelle der Typen sein, nicht ein Objektmodell.

## Entscheidung

Das Backend ist eine Kotlin-Anwendung auf Ktor und wird so gebaut und gestartet:

- **Sprache und Laufzeit:** Kotlin (aktuell 2.1.10) auf Java 17 als Zielplattform (siehe [ADR-0017](0017-java-17-zielplattform-jooq-3-19.md)).
- **HTTP:** Ktor (aktuell 3.1.1) mit Netty-Engine. Installierte Plugins liegen unter `backend/src/main/kotlin/de/lambda9/ready2race/backend/plugins/`: `HTTP.kt` (DefaultHeaders, Compression, CORS nur im Modus DEV), `Serialization.kt` (Jackson), `Sessions.kt`, `Requests.kt` (DoubleReceive, RateLimit), `Responses.kt` (StatusPages), `Sockets.kt` (WebSockets), `Routing.kt` (alle Routen unter `/api`, Swagger-UI unter `/api/documentation`), `StaticFiles.kt`.
- **Datenzugriff:** jOOQ mit Codegenerierung aus der migrierten Datenbank (`jooq-kotlin`, `jooq-kotlin-coroutines`, KotlinGenerator, `inputSchema` = `ready2race`). Die generierten Klassen entstehen im Build unter `target/` und liegen nicht im Repository. Es gibt kein ORM und keine Entity-Klassen mit eigenem Lebenszyklus.
- **Schema:** Flyway (aktuell 11.3.4) migriert beim Anwendungsstart in `Application.kt` das Schema `ready2race` (Konventionen in [ADR-0014](0014-flyway-migrationskonventionen.md)).
- **Build:** Maven mit Wrapper (`backend/mvnw`), Root-`pom.xml` als Parent mit dem einzigen Modul `backend`; Assembly-Plugin erzeugt ein Fat-Jar (Auslieferung in [ADR-0031](0031-auslieferung-fat-jar-getrenntes-frontend.md)).
- **Konfiguration:** dotenv-Datei, deren Name als erstes Programmargument übergeben wird (`java -jar ready2race.jar config.env`); Vorlage `backend/template.env`, Parsing in `config/Config.kt`. Echte Umgebungsvariablen schlagen die Datei.
- **Logging:** log4j2 mit kotlin-logging; Konfiguration per `-Dlog4j.configurationFile`.

Neue Backend-Funktionalität fügt sich in dieses Gerüst ein: eine Domäne unter `app/`, Zugriff über jOOQ-Records, Schemaänderungen als Flyway-Migration, keine zusätzlichen Frameworks.

## Verworfene Alternativen

- Gradle als Build-Werkzeug: nicht belegt; Maven mit Wrapper war von Anfang an gesetzt.
- ORM (JPA/Hibernate, Exposed): nicht belegt; jOOQ erzeugt die Typen aus der Datenbank, wodurch Views und Migrationen die einzige Wahrheit über das Schema bleiben.
- Spring oder ein anderes Vollframework: nicht belegt; Ktor mit expliziten Plugins genügte für eine REST-API mit WebSockets.

## Konsequenzen

- Die Datenbank ist die Quelle der Typen. Jede Schemaänderung verlangt einen jOOQ-Lauf (`./mvnw generate-sources`) gegen eine migrierte Datenbank; ein Worktree ohne eigene Build-Datenbank erzeugt falsche Klassen (siehe [ADR-0100](0100-fork-arbeitsweise-worktrees-merge-richtung-build-db.md)).
- Kotlin übersetzt alle Hauptquellen als Einheit; ein Schemaabbau in derselben Migration wie der Aufbau macht den Zweig zwischendurch unübersetzbar (siehe [ADR-0014](0014-flyway-migrationskonventionen.md)).
- Die dotenv-Konfiguration liest den Dateinamen relativ zum Arbeitsverzeichnis; absolute Pfade scheitern, eine Raute im Passwort zerlegt die Datei. Beides sind bekannte Fallen im Betrieb.
- CORS ist nur im Modus DEV aktiv; in Produktion muss das Frontend vom selben Ursprung ausgeliefert werden oder ein vorgeschalteter Proxy die Herkunft regeln.
- Der Stack wurde seit Dezember 2024 nicht gewechselt; Versionssprünge (Flyway 11.2, Postgres-Treiber 42.7.7, tailwind 0.2.0) blieben innerhalb derselben Bausteine.

## Quellen

- Commits: `17822e34` (Initial commit: `backend/pom.xml`, `Application.kt`, `plugins/*`), `ccac2e9a` (Flyway 11.2), `dacd356f` (Postgres-Treiber 42.7.7)
- Code: `backend/pom.xml` (Versionen), `backend/src/main/kotlin/de/lambda9/ready2race/backend/Application.kt` (Startfolge), `backend/README.md`, `backend/template.env`
- Verwandte ADRs: [ADR-0002](0002-kio-effektsystem.md), [ADR-0003](0003-entity-control-boundary-je-domaene.md), [ADR-0014](0014-flyway-migrationskonventionen.md), [ADR-0017](0017-java-17-zielplattform-jooq-3-19.md), [ADR-0031](0031-auslieferung-fat-jar-getrenntes-frontend.md)
