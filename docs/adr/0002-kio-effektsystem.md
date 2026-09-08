# ADR-0002: KIO-Effektsystem (tailwind-kio) mit Comprehension statt Exceptions

- Status: angenommen
- Datum: 2024-12-19
- Bereich: backend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Services, Repositories und Routen-Handler sollten Fehler typisiert transportieren, statt Exceptions zu werfen, die irgendwo weiter oben gefangen werden. Datenbankzugriffe brauchen außerdem eine Umgebung (jOOQ-Kontext, Konfiguration), die nicht durch jede Signatur gereicht werden soll. Das Upstream-Team lambda9 hatte dafür bereits eine eigene Bibliothek (tailwind) mit einem Effekttyp `KIO`.

## Entscheidung

Alle Service- und Repository-Funktionen liefern einen KIO-Effekt statt eines nackten Werts:

- Typen (in `app/App.kt`): `JEnv = Jooq<Env>`, `App<E, A> = KIO<JEnv, E, A>`; Repos liefern `JIO<A>` (Fehlerkanal `Nothing` oder Datenbankfehler).
- Bibliothek: `de.lambda9.tailwind:tailwind-kio` und `tailwind-kio-jooq` (aktuell 0.2.0, über jitpack). Eigene Infrastruktur dafür gibt es nicht mehr.
- Ablaufsteuerung: `KIO.comprehension { … }`. Innerhalb der Comprehension führt der Präfix-Operator `!` einen Effekt aus und bindet sein Ergebnis; ein Fehler bricht die Comprehension ab. Ketten aus `andThen`/`map` werden nicht geschrieben.
- Routen: `call.respondComprehension { … }` (in `calls/responses/Extensions.kt`) kapselt Authentifizierung, Empfang, Serviceaufruf und Antwort in einer suspendfähigen Comprehension (`calls/comprehension/CallComprehension.kt`, `kio/CoroutineComprehension.kt`).
- Transaktionen: `.transact()` aus tailwind-kio-jooq; Effekte, die erst nach dem Commit laufen dürfen (Broadcasts), gehen über `calls/responses/AfterCommit.kt`.
- Fehlerbehandlung: Domänenfehler sind `sealed interface XyzError : ServiceError` (`app/ServiceError.kt` = `ToApiError`). Ein `KIOException`-Handler in `plugins/Responses.kt` bildet ungefangene Fehler auf `respondError` bzw. `respondDefect` (500) ab.
- Konvertierungen (`control/Conversions.kt`) sind ebenfalls in KIO gewickelt.
- Hilfsfunktionen liegen in `kio/KIOExtensions.kt` (`onTrueFail`, `onFalseFail`, `onNullDie`, `accessConfig`, `discard`).

Kurz: Wer im Backend etwas tut, das scheitern kann, gibt ein `App<Fehler, Ergebnis>` zurück und wird in einer Comprehension mit `!` aufgerufen.

## Verworfene Alternativen

- Eigene HikariCP-/jOOQ-Konfiguration und ein eigener `JooqQueryPrinter` wurden zugunsten der Bibliotheksimplementierung entfernt (`33e7d823`, `6d16d568`).
- Kotlin „context receivers" für den Env-Kontext wurden erwogen und wegen ihres experimentellen Status nicht genutzt; stattdessen ein künstlicher Kontext im Scheduler (`29f9439b`).
- `andThen`-Ketten waren die erste Form und wurden im Februar 2025 durch Comprehensions ersetzt (`bfb7d205`); die Handler folgten im März mit der suspendfähigen Comprehension (`cc4ee910`).
- Exceptions als Fehlertransport: nicht belegt als Alternative; der `KIOException`-Handler ist nur das Sicherheitsnetz.

## Konsequenzen

- `KIO.fail(...)` in Statement-Position ohne `!` ist ein No-Op: die Comprehension bindet nichts, der Fehler wird verworfen und der Aufruf antwortet mit Erfolg. Diese Bug-Klasse trat mehr als 15 Mal auf und ist Gegenstand von [ADR-0057](0057-kio-fail-ohne-bang-ist-no-op.md). Suchmuster: `grep -rn "^\s*KIO\.fail"`.
- Funktionen mit Fehlerkanal `Nothing` (`App<Nothing, …>`) können gar nicht fehlschlagen; wer dort einen Fehlerpfad braucht, muss erst die Signatur ändern.
- Multipart-Empfang muss innerhalb der `respondComprehension` liegen, sonst ist der Request bereits konsumiert.
- Der Scheduler läuft außerhalb von `respondKIO`; Effekte nach dem Commit müssen dort von Hand nach `transact()` angehängt werden.
- Die Bibliothek ist ein Upstream-Artefakt von lambda9; Versionswechsel (Snapshot → 0.1.0 → 0.2.0) betreffen jede Signatur im Backend.
- Tests folgen demselben Muster (`testComprehension`, siehe [ADR-0030](0030-tests-testcontainers-und-reine-logik.md)).

## Quellen

- Commits: `17822e34` (`plugins/KIO.kt`), `8baa24a8` (Konvertierungen in KIO), `bfb7d205` (Comprehension statt andThen), `cc4ee910` (suspendfähige Comprehension in Handlern), `0e01bb2e` (kio-Paket), `c1ef7228` (KIOException in StatusPages), `33e7d823` (tailwind als Open-Source-Abhängigkeit), `46e80c6c` (Merge tailwind-oss), `6d16d568` (QueryPrinter aus dem Projekt entfernt), `29f9439b` (context receivers vertagt)
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/App.kt`, `kio/`, `calls/comprehension/CallComprehension.kt`, `calls/responses/AfterCommit.kt`, `plugins/Responses.kt`
- Verwandte ADRs: [ADR-0001](0001-kotlin-ktor-jooq-flyway-backend.md), [ADR-0003](0003-entity-control-boundary-je-domaene.md), [ADR-0011](0011-http-fehlersemantik-und-errorcode-muster.md), [ADR-0030](0030-tests-testcontainers-und-reine-logik.md), [ADR-0057](0057-kio-fail-ohne-bang-ist-no-op.md)
