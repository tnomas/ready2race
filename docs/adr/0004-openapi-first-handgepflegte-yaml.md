# ADR-0004: OpenAPI-first: handgepflegte YAML als Vertrag, generierter und eingecheckter Frontend-Client

- Status: angenommen
- Datum: 2024-12-19
- Bereich: api, frontend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Frontend und Backend wurden von Anfang an parallel von verschiedenen Personen entwickelt. Die Typen der Schnittstelle sollten nicht doppelt gepflegt werden, das Frontend aber trotzdem typsicher gegen die API programmieren können. Das Backend erzeugt kein Schema aus dem Kotlin-Code; eine Beschreibung musste also von Hand entstehen und für beide Seiten verbindlich sein.

## Entscheidung

- **Die Datei `backend/src/main/resources/openapi/documentation.yaml` ist der API-Vertrag.** Sie wird von Hand gepflegt (Stand September 2026: rund 23.000 Zeilen, 298 Pfade, OpenAPI 3.1.0) und über Ktor-Swagger unter `/api/documentation` ausgeliefert. Kein Werkzeug erzeugt sie aus Kotlin.
- **Das Frontend generiert seinen Client daraus:** `frontend/openapi-ts.config.ts` (`@hey-api/openapi-ts`, Client `@hey-api/client-fetch`) liest die YAML und schreibt `frontend/src/api/sdk.gen.ts` und `types.gen.ts`; Aufruf `npm run generate`. `frontend/src/api/index.ts` ist der Re-Export.
- **Die generierten Dateien sind eingecheckt.** Sie werden nie von Hand geändert. Wer die YAML ändert, erzeugt den Client im selben Commit; ein `npm run generate` auf einem sauberen Stand darf keinen Diff hinterlassen.
- In der YAML stehen Pfadparameter, Beschreibungen, das `ApiError`-Schema und der `ErrorCode`-Enum. Ein neuer Fehlercode oder eine neue Privileg-Ressource muss an drei Stellen stehen: `ErrorCode.kt` bzw. `Privilege.kt`, `documentation.yaml`, und danach `types.gen.ts` per Generator.
- Ab dem Zeitnahme-Modul (August 2026) werden zusätzlich TypeSpec-Dateien unter `api/src/*.tsp` gepflegt und per chirurgischem Merge in die YAML übernommen; die YAML bleibt die Quelle (siehe [ADR-0052](0052-typespec-als-zweitbeschreibung.md)).

## Verworfene Alternativen

- Schema-Generierung aus dem Kotlin-Code (Annotationen, Reflection): nicht belegt und in den Fork-Plänen ausdrücklich als „Codegen aus Kotlin" verworfen, weil die YAML dann nicht mehr die Beschreibung, sondern nur ein Abbild wäre.
- Generierte Client-Dateien nicht einchecken, sondern im Build erzeugen: nicht belegt; die eingecheckten Dateien sind der Grund, warum Merge-Konflikte in `sdk.gen.ts` regelmäßig auftreten und trotzdem hingenommen werden.
- TypeSpec als alleinige Quelle: bis Dezember 2025 lagen nur Stümpfe unter `api/`; erst 2026 wurden sie zur parallel gepflegten Zweitbeschreibung, ohne die YAML abzulösen.

## Konsequenzen

- Jede API-Änderung ist Handarbeit an einer sehr großen Datei; vergessene Einträge fallen erst auf, wenn `types.gen.ts` ein Feld nicht kennt.
- Generierte Dateien nie dem Auto-Merge überlassen: nach einem Merge `npm run generate` laufen lassen und den Stand vergleichen.
- `vitest` sieht Typfehler im Frontend nicht, `tsc -b` (Teil von `npm run build`) schon; beides gehört vor jeden Merge.
- Der Backend-Test `ApplicationTest.kt` prüft, dass die Swagger-Route und die YAML ausgeliefert werden; ein Hotfix am Pfad (`25f3c403`) zeigt, dass diese Prüfung greift.
- Beide Beschreibungen (YAML und `api/src/*.tsp`) driften, wenn jemand nur eine Seite pflegt; nichts im Repository belegt, dass `tsp compile` regelmäßig läuft.

## Quellen

- Commits: `17822e34` (`openapi-ts.config.ts` im Initial-Commit), `41bb449e` (YAML erweitert), `afb8b98a` (Pfadparameter in der YAML), `65faa442` (ApiError in der YAML), `f0678a5b` (409-ErrorCodes), `3979eb27` (API-Fehler dokumentiert), `f1ecd658` (fehlende Fehlercodes ergänzt), `e3358626` (Beschreibungen ergänzt), `25f3c403` (Swagger-Test-Pfad), `6a4f7450` (Beispiel für parallele Pflege von `api/src/stream.tsp`, YAML und Generat)
- Specs/Pläne: `docs/superpowers/plans/2026-08-02-athleten-dashboard.md` („Global Constraints"), `docs/superpowers/specs/2026-08-06-bestandsaufnahme-fehlermeldungen.md` („Zwei Fallstricke"), `docs/superpowers/plans/2026-08-17-timing-boards-frontend.md`
- Code: `frontend/openapi-ts.config.ts`, `frontend/package.json` (`generate`), `backend/src/main/kotlin/de/lambda9/ready2race/backend/plugins/Routing.kt` (Swagger-UI)
- Verwandte ADRs: [ADR-0010](0010-privilegien-action-resource-scope.md), [ADR-0011](0011-http-fehlersemantik-und-errorcode-muster.md), [ADR-0052](0052-typespec-als-zweitbeschreibung.md), [ADR-0100](0100-fork-arbeitsweise-worktrees-merge-richtung-build-db.md)
