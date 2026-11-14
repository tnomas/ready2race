# ADR-0052: TypeSpec unter api/ als Zweitbeschreibung mit chirurgischem Merge; die YAML bleibt Quelle

- Status: angenommen
- Datum: 2025-12-10
- Bereich: api
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Die handgepflegte OpenAPI-Datei `backend/src/main/resources/openapi/documentation.yaml` ([ADR-0004](0004-openapi-first-handgepflegte-yaml.md)) ist auf über 23.000 Zeilen und rund 300 Pfade gewachsen. Upstream begann im Dezember 2025 eine typisierte Beschreibung in TypeSpec, die die YAML ablösen sollte, kam aber über drei WIP-Commits nicht hinaus. Im Fork sollten ab August 2026 die Endpunkte des Zeitnahme-Moduls und der Stream-Domäne beschrieben werden; die YAML enthielt zu diesem Zeitpunkt bereits Abweichungen von den Kotlin-Datenklassen (nicht existierende Felder), und ein erzeugter Ersatz hätte sie über Nacht ersetzt.

## Entscheidung

- Das Verzeichnis `api/` enthält `main.tsp` (importiert alle `api/src/*.tsp`, 49 Dateien inklusive `common.tsp` mit `uuid`/`dateTime`, `Gender`, `ErrorCode`), `tspconfig.yaml` (Emitter `@typespec/openapi3`, Version 3.1.0, Ausgabe nach `{output-dir}/schema`) und je Domäne eine Modelldatei (`timing.tsp`, `stream.tsp`, `auth.tsp`, …).
- **Die YAML bleibt die Quelle.** Backend-Routen und der Frontend-Client (`frontend/openapi-ts.config.ts`, Eingabe `../backend/src/main/resources/openapi/documentation.yaml`, Ausgabe `src/api`) laufen ausschließlich über `documentation.yaml`. Die TypeSpec-Ausgabe wird nirgends eingelesen; `documentation.yaml` trägt keinen Generator-Header und liegt nicht am Ausgabepfad.
- **Chirurgischer Merge**: Neue Endpunkte werden zuerst in `api/src/*.tsp` modelliert und dann von Hand, abschnittsweise, in `documentation.yaml` übertragen. Bei Widersprüchen folgt die YAML der Kotlin-Datenklasse, nicht der TypeSpec-Datei. Die Privileg-Ressource in `auth.tsp` spiegelt die Reihenfolge im Backend; Authentifizierung und der WebSocket-Vertrag stehen nur als Dokumentationskommentar (etwa im Kopf von `stream.tsp`).
- **Client im selben Commit neu erzeugen**: Nach jedem Merge in die YAML werden `frontend/src/api/types.gen.ts` und `sdk.gen.ts` per `npm run generate` erzeugt und committet. Ein neuer `ErrorCode` muss an drei Stellen stehen: Kotlin-Enum, YAML, und über die Generierung im Frontend.

## Verworfene Alternativen

- **Vollständige Ablösung der YAML durch den TypeSpec-Emitter**: Upstream nicht abgeschlossen (drei WIP-Commits); im Fork verworfen, weil die generierte Datei die bestehenden Abweichungen und die handgeschriebenen Beschreibungen verloren hätte und weil nichts im Repo belegt, dass `tsp compile` je gelaufen ist.
- **Codegen aus Kotlin** (Spec aus den Datenklassen erzeugen): verworfen; die Beschreibung soll unabhängig vom Code lesbar sein.
- **TypeSpec-Stümpfe weiter ignorieren**: bis zum Zeitnahme-Modul der tatsächliche Zustand; verworfen, weil die `.tsp`-Dateien ausführliche Verhaltensdokumentation tragen können, die in der YAML keinen Platz hat.

## Konsequenzen

- Zwei handgepflegte Beschreibungen driften. In den letzten 200 Commits berühren 17 sowohl `api/src` als auch `documentation.yaml`, aber nichts prüft die Übereinstimmung. Wer nur eine Datei ändert, hinterlässt einen stillen Widerspruch.
- Generierte Dateien dürfen nie dem Auto-Merge überlassen werden; nach jedem Merge ist `npm run generate` zu wiederholen, und ein unstaged Diff danach zeigt einen Fehler ([ADR-0100](0100-fork-arbeitsweise-worktrees-merge-richtung-build-db.md)).
- Wer die OpenAPI-Spec ändert, ohne den Client zu erzeugen, fängt den Fehler erst in der nächsten Session; `vitest` sieht Typfehler nicht, `tsc -b` schon.
- Die Swagger-Oberfläche unter `/api/documentation` zeigt weiterhin die YAML; sie ist die einzige Sicht, die Backend und Frontend gemeinsam haben.
- Für neue Domänen (Zeitnahme, Stream) ist die `.tsp`-Datei der Ort für Erklärungen zu Kanälen, Token und Verhalten ([ADR-0088](0088-timing-websocket-und-geraete-token.md), [ADR-0095](0095-eigene-stream-domaene-server-entscheidet-on-air.md)).

## Quellen

- Commits: `af2e3622`, `121a2cad`, `e256d929` (WIP TypeSpec, Upstream), `d54d90ed` (Dänisch in `email.tsp`), `3a93e5b9` (Timing-Endpunkte im TypeSpec-Vertrag), `7106739b`, `9effcfee` (Kompilierfehler in der Spec behoben), `f5b6d238` (Plan auf „surgical openapi merge" umgestellt), `cc3d8ebf`, `0b83345f` (API-Vertrag der Zeitnahme dokumentiert, Frontend-Typen nachgezogen), `d9e54e65`, `0a5b4a69` (erzeugte Dateien nach Merge neu erzeugt), `6a4f7450` (`stream.tsp` und YAML gemeinsam geändert)
- Specs/Pläne: `docs/superpowers/plans/2026-08-17-timing-boards-frontend.md` („Global Constraints"), `docs/superpowers/plans/2026-08-02-athleten-dashboard.md`, `docs/superpowers/specs/2026-08-06-bestandsaufnahme-fehlermeldungen.md`, `docs/superpowers/specs/2026-08-27-livestream-overlay-design.md`
- Dateien: `api/main.tsp`, `api/tspconfig.yaml`, `api/src/*.tsp`, `backend/src/main/resources/openapi/documentation.yaml`, `frontend/openapi-ts.config.ts`, `frontend/src/api/{sdk,types}.gen.ts`
- Verwandte ADRs: [ADR-0004](0004-openapi-first-handgepflegte-yaml.md), [ADR-0011](0011-http-fehlersemantik-und-errorcode-muster.md), [ADR-0088](0088-timing-websocket-und-geraete-token.md), [ADR-0095](0095-eigene-stream-domaene-server-entscheidet-on-air.md), [ADR-0100](0100-fork-arbeitsweise-worktrees-merge-richtung-build-db.md)
