# ADR-0107: Backend-Laufzeit: blockierende Arbeit auf `Dispatchers.IO`, Pool mit Statement-Timeout, Sitzungsverlängerung höchstens einmal je Minute, Argon2-Parameter, `AppZone`, Healthcheck, Proxy-Annahme

- Status: angenommen
- Datum: 2026-11-13
- Bereich: backend
- Rekonstruiert: ja, aus der Commit-Historie des Zweigs

## Kontext

Ein Review der Laufzeit zeigte mehrere Eigenschaften, die am Regattatag teuer werden, aber im Test nie auffallen: JDBC-Aufrufe liefen auf dem Netty-Event-Loop, der zugleich alle Websockets bedient; eine hängende Abfrage hielt eine Pool-Verbindung beliebig lange; jede Anfrage schrieb die Sitzungsverlängerung in die Datenbank; Argon2id hatte mit 15 KiB Speicher praktisch keine Speicherhärte; die Zeitzone folgte der des Hosts (in einem Container ohne `TZ` liefen Ist-Starts, Countdown-Anker und Ablaufzeiten ein bis zwei Stunden neben den Zeitplan-Slots); der Docker-Healthcheck pollte eine paginierte Listenabfrage; ein Login-Limit je IP war hinter einem Proxy sinnlos, weil alle Anfragen von dessen Adresse kamen.

## Entscheidung

- **Blockierende Arbeit läuft auf `Dispatchers.IO`.** `respondComprehension` (Routen mit Transaktion) und der Pfad für Antworten ohne Transaktion führen die KIO-Comprehension in `withContext(Dispatchers.IO)` aus (`calls/responses/Extensions.kt`); ebenso die Hintergrundschleifen in `Application.kt`. Ein Test belegt, dass die Arbeit nicht mehr auf der Event-Loop-Gruppe läuft. Noch offen: DB-Prüfungen in Websocket-Handshakes.
- **Verbindungspool mit Obergrenze und Statement-Timeout:** Der HikariCP-Pool (`app/App.kt`, `hikariConfig`) bekommt `DATABASE_POOL_SIZE` (Vorgabe 10, wie bisher) und setzt je Verbindung `statement_timeout` aus `DATABASE_STATEMENT_TIMEOUT_MS` (Vorgabe 120000, `0` = aus). Flyway läuft beim Start über eine eigene Verbindung, damit eine lange Migration nicht am Timeout stirbt. Außerhalb `PROD` warnt der Pool bei Verbindungen, die länger als 60 s gehalten werden.
- **Sitzungsverlängerung höchstens einmal je Minute** (`AuthService`): Der Ablauf wird nur geschrieben, wenn der gespeicherte Ablauf um mehr als das Verlängerungsintervall hinter dem neuen liegt. Die Sitzung endet damit frühestens 6 h − 1 min nach der letzten Anfrage.
- **Argon2id mit 19456 KiB** (`SECURITY_ARGON2_MEMORY_KIB`, Mindestwert 8, in `PROD`/`STAGING` Warnung darunter), zwei Iterationen, Parallelität 1. Alte Hashes prüfen weiter und werden beim nächsten erfolgreichen Login transparent neu geschrieben; der Admin wird beim Start wie bisher neu gehasht ([ADR-0007](0007-argon2id-passwort-hashing.md)).
- **`AppZone` und `APP_TIMEZONE`:** Die eine Zeitzone der App steht in `AppZone` (Vorgabe `Europe/Berlin`, ausdrücklich nicht die des Hosts und nicht `TZ`). `AppZone.install` setzt beim Start die JVM-Vorgabe, bevor Verbindungen aufgebaut werden; der Postgres-Treiber gibt sie als Sitzungszeitzone weiter. Auf einem Host in Berlin ändert sich nichts ([ADR-0016](0016-schema-konventionen-uuid-audit-timestamp.md)).
- **`GET /api/health`** (`health/health.kt`): `select 1` über den Pool, ohne Anmeldung und ohne Rate-Limit, 204 oder 500. Bewusst nicht in `documentation.yaml`: Betriebsschnittstelle, kein Teil des Frontend-Clients.
- **Proxy-Annahme `TRUSTED_PROXY_HOPS`:** Vorgabe 0, `X-Forwarded-For` wird ignoriert. Hinter einem Reverse-Proxy (Docker-Verbund mit nginx) ist 1 zu setzen; erst dann ist die Client-Adresse (`plugins/clientAddress`) die echte.
- **Weitere Härtungen derselben Linie:** Pagination hängt immer den Primärschlüssel als letzten Sortierschlüssel an; Websocket-Rahmen über 4 KiB schließen die Verbindung (`TOO_BIG`); `DoubleReceive` nur noch auf den drei Login- und Reset-Routen; Client-Fehler antworten mit 400, 404, 413 und 415 statt 500; Stacktraces in 500ern nur in `DEV` und `TEST`; Mailversand sperrt, sendet und vermerkt in einer Transaktion (keine Doppelmails bei zwei Instanzen).

## Verworfene Alternativen

- **Alles auf dem Event-Loop lassen und den Pool vergrößern:** blockiert Websockets, sobald mehr Abfragen laufen als Loop-Threads.
- **Statement-Timeout je Abfrage im Code:** vergessen sich neue Abfragen; am Pool gilt er für alle.
- **Sitzungsverlängerung bei jeder Anfrage beibehalten:** ein Schreibzugriff je Poll eines jeden Boards.
- **`TZ` des Containers als Zeitzone:** genau der Zustand, der die Zeiten verschob.
- **Login-Limit je IP ohne Proxy-Annahme:** blockiert hinter einem Proxy alle Nutzer gemeinsam. Das Limit selbst ist deshalb noch nicht gebaut.
- **`X-Forwarded-For` immer vertrauen:** ein Client könnte Rate-Limits und Logs fälschen.
- **Eine verschachtelbare `transact` in der Bibliothek:** zentraler Eingriff in fremdes Verhalten, heute ruft kein Test einen Service mit innerem `transact` auf.

## Konsequenzen

- Der Mailversand hält während SMTP eine Pool-Verbindung; bei kleinem Pool und langsamem Mailserver kann das knapp werden.
- Ein Statement-Timeout von zwei Minuten kann lange Exporte (Bündel-ZIP, WebDAV) abbrechen; in echt nicht gemessen. Dann `DATABASE_STATEMENT_TIMEOUT_MS` erhöhen oder `0` setzen.
- Die Reihenfolge von Datensätzen mit gleichem Sortierwert kann sich sichtbar minimal ändern (Primärschlüssel als Nachsortierung).
- 19 MiB je Hash belasten den Heap bei vielen gleichzeitigen Logins (gemessen etwa 55 ms je Hash); auf dem Produktionshost unter Last nicht belegt.
- Vor einer Schemaänderung per Hand (`flyway:clean`) ist `-Dflyway.cleanDisabled=false` nötig.
- Offen und bewusst nicht gebaut: Giftpillen-Behandlung der Job-Schleifen, Limit-Deckel und gemeinsamer `count` der Paginierung, Sicherheits-Header und Swagger in `PROD` (Produktentscheidung; `X-Frame-Options` kollidiert womöglich mit der PDF-Vorschau im iframe), Login-Limit je IP.

## Quellen

- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/calls/responses/Extensions.kt`, `.../app/App.kt`, `.../AppZone.kt`, `.../health/health.kt`, `.../config/Config.kt`, `.../security/PasswordUtilities.kt`, `backend/template.env`
- Betrieb: `docs/superpowers/specs/2026-11-13-app-review-betriebshinweise.md`
- Verwandte ADRs: ADR-0007 (Argon2id), ADR-0008 (Sitzungen), ADR-0009 (Rate-Limiting), ADR-0016 (Zeitstempel ohne Zeitzone), ADR-0106
