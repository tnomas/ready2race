# ADR-0011: HTTP-Fehlersemantik (403/422/409) und ErrorCode-Muster: Backend nennt den Grund, Frontend übersetzt

- Status: angenommen
- Datum: 2025-01-30
- Bereich: api, backend, frontend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Das Frontend soll Fehler unterscheidbar anzeigen: fehlendes Recht, ungültige Eingabe, fachlicher Konflikt. Anfangs antwortete fehlendes Recht mit 401 und Validierungsfehler mit 400. Im Fork zeigte sich im August 2026, dass rund 139 von 195 nutzerauslösbaren Fehlerzweigen keinen `ErrorCode` trugen: Helfer am Renntag sahen „Ein Fehler ist aufgetreten" oder einen englischen Backend-Satz in der deutschen Oberfläche, und Dialoge verschluckten 409er ganz.

## Entscheidung

**Statuscodes:**

- 403 Forbidden: fehlendes Privileg (`AuthError`).
- 422 Unprocessable Entity: Parsing- oder Validierungsfehler, mit strukturiertem JSON aus `ValidationResult` ([ADR-0012](0012-eigene-request-validierung-und-parser.md)).
- 409 Conflict: fachlicher Konflikt (referenzierte Entität löschen, Lauf bereits gewertet), immer mit `errorCode`.
- 429 Too Many Requests: Rate-Limit ([ADR-0009](0009-rate-limiting-im-server.md)).
- 500: Defekt (`respondDefect`), nie ein fachlicher Fehler.

**Schema:** Jede Fehlerantwort ist ein `ApiError(status, message, details, errorCode)` (`calls/responses/ApiError.kt`); Domänenfehler implementieren `ServiceError`/`ToApiError` und bauen ihn in `respond()`. `ErrorCode` ist ein Enum in `calls/responses/ErrorCode.kt` (127 Werte) und wird in der handgepflegten OpenAPI-YAML sowie in `api/src/common.tsp` gespiegelt.

**ErrorCode-Muster (Fork, ab 2026-08-05):**

1. Jeder vom Nutzer auslösbare Fehler trägt einen `ErrorCode`. Strukturwerte (verbleibende Läufe, `maxReductionMinutes`, fehlender Geschlechtswert) reisen in `ApiError.details`, nicht im Text.
2. Das Frontend übersetzt Codes in eigenen, ohne i18n-Kontext testbaren Modulen je Bereich: `deregistrationError.ts`, `scheduleError.ts`, `liveDashboardError.ts`, `executionError.ts`, `certificateError.ts`, `awardCeremonyError.ts`, `resultListError.ts`, `streamApiError.ts`. Muster: Code → i18n-Key mit Fallback und Existenz-Test.
3. Ohne bekannten Code bleibt die generische Meldung; **nie** wird der Backend-Text angezeigt.
4. Ein neuer Code steht an drei Stellen: `ErrorCode.kt`, `documentation.yaml`, danach `types.gen.ts` per Generator.

## Verworfene Alternativen

- 401 für fehlendes Recht und 400 für ungültige Anfragen (Januar 2025): durch 403 und 422 ersetzt, weil 401 „nicht angemeldet" bedeutet und 422 den Validierungsfall vom Transportfehler trennt.
- Backend-Text im Frontend anzeigen: verworfen, weil der Text englisch und für Helfer ohne Kontext ist.
- Regex-Fallback auf Freitext: nur als Übergang für ältere Backend-Versionen belassen (`9487da94`), nicht als Muster.
- Toten Code (`PlaceAndTimeBothNull`, `QrCodeNotFound`, `CatererTransactionRequest`) bei der Inventur löschen: nur gemeldet, nicht angefasst; WebDAV und 404er auf nicht angebotene IDs ausgeklammert.

## Konsequenzen

- Drei Pflegestellen je Code; vergisst man die YAML, kennt das Frontend den Wert nicht und fällt auf die generische Meldung zurück, ohne Fehler zu werfen.
- Die Inventur vom 2026-08-06 hat die renntagskritischen Bereiche zuerst versorgt (Zeitplan, Live-Anzeigen, Durchführung, Urkunden); andere Bereiche tragen noch Fehler ohne Code. Die Liste liegt in `docs/superpowers/specs/2026-08-06-bestandsaufnahme-fehlermeldungen.md`.
- `MatchIsBye` wurde aus `MatchResultsLocked` abgespalten, `AwardCertificateError.IsChallengeEvent` kam hinzu; wer Codes zusammenlegt, verliert die Unterscheidbarkeit wieder.
- Ein `ErrorCode` ohne `!` in einer Comprehension wird verworfen und der Aufruf antwortet 200 ([ADR-0057](0057-kio-fail-ohne-bang-ist-no-op.md)).
- Der Sonderwert für Defekte des automatischen Feed-Abrufs wird nicht beantwortet, sondern in `competition_match.raceclocker_poll_error` abgelegt (Kommentar in `ErrorCode.kt`).

## Quellen

- Commits: `52ff4f6d` (JSON für Validierungsfehler), `b2aabad7` (RequestErrors), `38267d95` (403 statt 401), `3aee5cdc` (422), `65faa442` (ApiError in der YAML), `f0678a5b` (409-ErrorCodes), `1cd93c6c`, `add51539` (Fehleranzeige im Frontend), `92bb683e` (Abmeldung mit Code), `42436c47` (strukturierte Schichtfehler), `7249fbda` (Zeitnahme-Preset-Fehler), `b5f16612`, `9487da94` (Zeitplan-Fehler benannt), `10b262ca` (Urkundenfehler deutsch), `c9c3172a` (Durchführung), `e46d6b30` (Live-Anzeigen)
- Specs: `docs/superpowers/specs/2026-08-06-bestandsaufnahme-fehlermeldungen.md`
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/calls/responses/{ApiError,ErrorCode,ToApiError}.kt`, `plugins/Responses.kt`, `frontend/src/components/**/…Error.ts`
- Verwandte ADRs: [ADR-0002](0002-kio-effektsystem.md), [ADR-0004](0004-openapi-first-handgepflegte-yaml.md), [ADR-0006](0006-mehrsprachigkeit-i18next-erzwungene-schluessel.md), [ADR-0010](0010-privilegien-action-resource-scope.md), [ADR-0012](0012-eigene-request-validierung-und-parser.md), [ADR-0057](0057-kio-fail-ohne-bang-ist-no-op.md)
