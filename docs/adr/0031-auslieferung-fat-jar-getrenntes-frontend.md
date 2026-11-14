# ADR-0031: Auslieferung als Fat-Jar, Frontend getrennt gebaut; Docker-Build aus dem Repo entfernt; skipCodegen für Dev-Builds

- Status: angenommen
- Datum: 2024-12-19
- Bereich: betrieb
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Die Anwendung ist als „PopUp-Lösung" für Vereine gedacht: einfache Installation, ein Prozess, eine Datenbank. Der Initial-Commit brachte `build.sh`, ein `build/Dockerfile` und `docker-compose.yaml` mit. Build und Deployment liefen beim Upstream-Team lambda9 tatsächlich außerhalb des Repos; die Container-Dateien im Repo veralteten. Im Fork wurde 2026 die Bauzeit zum Thema, weil Flyway und jOOQ-Codegen bei jedem Build laufen, obwohl sich das Schema selten ändert.

## Entscheidung

- **Backend als Fat-Jar.** `./mvnw clean package` in `backend/` erzeugt `ready2race-api` als Jar-with-dependencies (Artefaktname seit April 2025). Start: `java -jar … <pfad-zur-.env>`; die Konfiguration kommt aus einer `.env` nach `backend/template.env`, typisiert geparst (`ParseEnvError` statt Exception, `7bf87c61`). Der Build braucht eine laufende Postgres für Flyway und jOOQ-Codegen (`backend/docker-compose.yaml`).
- **Frontend getrennt.** Vite baut `frontend/dist`; zusätzlich `npm run testbuild` (`vite build --mode test`) für die Testumgebung. Das Backend liefert das Frontend nicht aus; im Mode DEV schaltet es CORS `anyHost` frei (`plugins/HTTP.kt`).
- **Kein Reverse-Proxy vorausgesetzt.** `ForwardedHeaders`/`XForwardedHeaders` wurden entfernt (`cb7c5e79`), weil sie ohne vertrauenswürdigen Proxy ein Sicherheitsrisiko sind.
- **Docker-Build nicht im Repo.** `backend/build.sh` und `backend/build/Dockerfile` sind gelöscht (`840e508e`); `deploy*.sh` steht in `.gitignore`. `backend/README.md` beschreibt Java-Version, Build und Start ohne Container.
- **`skipCodegen` für Entwicklungsbuilds.** Maven-Property `skipCodegen` (Default `false`; `./mvnw … -DskipCodegen=true` überspringt Flyway und jOOQ). `build-helper-maven-plugin` registriert `target/generated-sources/jooq` unabhängig vom Codegen als Source-Root, weil der inkrementelle Kotlin-Compiler sonst auf einen teureren Pfad fällt (gemessen 16,5 s statt 12,1 s; mit Fix 8,8 s). Der Release-Build (`./mvnw package` ohne Property) bleibt unverändert; Fat-Jar-Index und Manifest sind byte-gleich.

## Verworfene Alternativen

- Docker-Image-Build im Repo (`openjdk:21-slim`, Port 8080 aus dem Initial-Commit): entfernt, weil Deployment außerhalb des Repos lebt und die Dateien nicht gepflegt wurden.
- Frontend aus dem Backend ausliefern: nicht belegt; das Frontend ist einbettbar und wird separat gehostet ([ADR-0032](0032-einbettbares-frontend-theme-je-instanz.md)).
- Naives Überspringen des Codegens ohne Source-Root-Registrierung: macht den Build langsamer statt schneller (`26711ab1`).

## Konsequenzen

- Zwei Artefakte, zwei Deployments; die Frontend-`baseUrl` zeigt per `VITE_API_BASE_URL` auf das Backend.
- Der Betreiber ist für TLS und Proxy selbst verantwortlich; das Backend vertraut keinen Forwarded-Headern. Rate-Limits je Remote-Host ([ADR-0009](0009-rate-limiting-im-server.md)) sehen hinter einem Proxy nur dessen Adresse.
- Der Build ist datenbankabhängig: ohne laufende Postgres kein Jar. Geteilte Build-Datenbanken zwischen Worktrees verseuchen den Codegen ([ADR-0100](0100-fork-arbeitsweise-worktrees-merge-richtung-build-db.md)).
- `skipCodegen=true` nach einer Schemaänderung liefert stillschweigend alte jOOQ-Klassen; nach Migrationen ist ein Build ohne die Property Pflicht.
- Ein laufendes Jar darf nicht überschrieben werden (lazy geladene Lambda-Klassen fehlen dann); ein zweites Backend auf anderem `HTTP_PORT` ist der sichere Weg.

## Quellen

- Commits: `17822e34` (Initial commit: build.sh, Dockerfile, docker-compose), `4df8c468` (Ktor-Plugins, Rate-Limiting), `cb7c5e79` (ForwardedHeaders entfernt), `238e896f` (Prepare for deployments), `2b0ec4d0` (deploy-Skripte ignoriert), `840e508e`/`c0953fe1` (README, Java-Version, Docker-Build entfernt), `7bf87c61` (Config-Parsing), `26711ab1`/`62a49255` (skipCodegen)
- Code: `backend/pom.xml` (Property `skipCodegen`, Kommentar zum build-helper), `backend/README.md`, `backend/docker-compose.yaml`, `frontend/package.json` (`testbuild`)
- Verwandte ADRs: [ADR-0001](0001-kotlin-ktor-jooq-flyway-backend.md), [ADR-0009](0009-rate-limiting-im-server.md), [ADR-0017](0017-java-17-zielplattform-jooq-3-19.md), [ADR-0032](0032-einbettbares-frontend-theme-je-instanz.md), [ADR-0100](0100-fork-arbeitsweise-worktrees-merge-richtung-build-db.md)
