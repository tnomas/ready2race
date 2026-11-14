# ADR-0012: Eigene Request-Validierung (Validatable) und gemeinsamer Parser; Parsing erst nach Authentifizierung

- Status: angenommen
- Datum: 2025-01-23
- Bereich: backend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Ktors Request-Validation-Plugin war für verschachtelte DTOs und strukturierte Fehlerantworten zu unflexibel. Zwei weitere Probleme kamen im Januar 2025 dazu: unparsbare Payloads lösten Exceptions aus, bevor die Anmeldung geprüft war (ein Unangemeldeter konnte so Parser-Fehler provozieren), und Jackson füllte fehlende primitive Felder still mit 0 oder false. Query-Parameter und Umgebungsvariablen wurden außerdem doppelt geparst.

## Entscheidung

- **Request-DTOs implementieren `Validatable`** (`backend/src/main/kotlin/de/lambda9/ready2race/backend/validation/Validatable.kt`, `fun validate(): ValidationResult`) und beschreiben ihre Regeln deklarativ mit Validatoren aus `validation/validators/`: `notNull`, `isNull`, `anyOf`, `allOf`, `noDuplicates`, Collection-, String-, Int-, BigDecimal- und Boolean-Validatoren, später `flatMap` und Projektion. Muster in `validation/Patterns.kt`.
- **Empfang über `receiveKIO(example)`** (`calls/requests/Extensions.kt`): parst den Body, ruft `validate()` und liefert `IO<RequestError, V>`. Jedes Request-DTO stellt ein `example` bereit (auch für Rate-Limit-Schlüssel).
- **Fehler erst nach Authentifizierung:** Parsing- und Validierungsfehler werden aufgeschoben, sodass in der `respondComprehension` zuerst `authenticate(...)` greift und erst dann `!receiveKIO(...)`. Fehlermeldungen bei unparsbarem Payload sind selbst formuliert.
- **Strenges Jackson:** `plugins/Serialization.kt` aktiviert `FAIL_ON_NULL_FOR_PRIMITIVES`; `null` in einem primitiven Feld ist ein 422, kein stiller Default (mit Test).
- **Ein Parser für alles:** `parsing/Parser.kt` (`Parser.Companion.boolean/int/enum/json` …) wird für Pfad- und Query-Parameter (`pathParam`, `queryParam`, `pagination<S>()`) und für die Konfiguration (`config/Config.kt`, `ParseEnvException`) verwendet. Der frühere `ParamParser` ist darin aufgegangen.
- Ergebnisse gehen als 422 mit strukturiertem JSON zurück ([ADR-0011](0011-http-fehlersemantik-und-errorcode-muster.md)).

## Verworfene Alternativen

- `ktor-server-request-validation`: eingesetzt, dann aus dem POM entfernt und durch ein eigenes Plugin ersetzt (`d640089a`), weil es keine verschachtelten Ergebnisse liefert.
- Collection-Validierung als eigene Klasse: zurück auf `Validator` umgestellt (`ca5198da`); Type-Erasure erzwang später einen Fix (`2fb4ac5c`).
- `oneOf` als Name: in `anyOf` umbenannt, weil „one of" Exklusivität suggeriert (`888ff2af`).
- Empfang „erst bei Bedarf" (TODO in `d7a65d60`): nicht umgesetzt belegt; DoubleReceive löst das Problem für den Rate-Limit-Schlüssel anders.
- Getrennte Parser für Parameter und Env: bis Juni 2025 so, dann zusammengeführt (`fa2834b7`).

## Konsequenzen

- Jedes neue Request-DTO braucht `validate()` und `example`; ohne `validate()` kommt alles durch, ohne `example` kompiliert `receiveKIO` nicht.
- Optionale Felder mit Bedeutung („`null` heißt unverändert") müssen ausdrücklich so behandelt werden, sonst setzt ein PUT ohne das Feld still zurück (Beispiel `captureMode`, [ADR-0090](0090-scharfschaltung-je-posten.md)).
- Multipart-Empfang muss innerhalb der `respondComprehension` liegen ([ADR-0002](0002-kio-effektsystem.md)).
- Ein Validator-Bug im Dokumenten-Upload (`9fcce8e0`) zeigt: Validatoren brauchen eigene Tests, das Framework fängt Fehler in ihnen nicht.
- DTO-Umbauten müssen Create **und** Update testen, payload-nah; ein Hotfix im August 2026 kam aus einem nur halb getesteten Fluss.

## Quellen

- Commits: `6f0013ca`, `a0bae1f0`, `4912d88c` (serverseitige Validierung, Validatable-DTOs), `ca5198da` (Collection zurück auf Validator), `888ff2af` (anyOf), `2fb4ac5c` (Type-Erasure-Fix), `1912072c` (Typisierung), `d640089a` (eigenes Plugin, noDuplicates), `9fcce8e0` (Upload-Validierung), `718695c7` (ParamParser), `2fe4664b`, `c0653e64` (flatMap), `9cdbe52a` (Projektion), `8cc18c62`, `8de57071` (eigene Fehlermeldungen bei unparsbarem Payload), `d7a65d60` (Fehler aufgeschoben bis nach der Authentifizierung), `4716debd` (Jackson fail on null), `39871fec`, `e210b4dd` (Parameter-Extensions), `fa2834b7` (Parser auch für Env/Config)
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/validation/`, `parsing/Parser.kt`, `calls/requests/Extensions.kt`, `plugins/Serialization.kt`, `config/Config.kt`
- Verwandte ADRs: [ADR-0002](0002-kio-effektsystem.md), [ADR-0009](0009-rate-limiting-im-server.md), [ADR-0011](0011-http-fehlersemantik-und-errorcode-muster.md), [ADR-0090](0090-scharfschaltung-je-posten.md)
