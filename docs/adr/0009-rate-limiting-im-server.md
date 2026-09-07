# ADR-0009: Rate-Limiting im Server: Login je E-Mail, Passwort-Reset, publicInfo als Notbremse

- Status: angenommen
- Datum: 2025-01-09
- Bereich: backend, betrieb
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Die Anwendung wird ohne vorgeschaltetes API-Gateway betrieben; Brute-Force-Schutz für Login und Passwort-Reset musste der Server selbst leisten. Im August 2026 kam ein zweiter Fall dazu: öffentliche Anzeige-Endpunkte, die von rund 200 Handys im Sekundenabstand abgefragt werden und auf der Datenbank landeten. Vereins-WLAN und Carrier-NAT legen dabei viele Geräte auf eine IP.

## Entscheidung

Ktor-RateLimit ist in `backend/src/main/kotlin/de/lambda9/ready2race/backend/plugins/Requests.kt` mit drei benannten Gruppen konfiguriert:

| Gruppe | Limit | Schlüssel | Zweck |
|---|---|---|---|
| `login` | 10 Versuche je 5 Minuten | E-Mail aus dem Login-Payload (dafür DoubleReceive) | Brute-Force je Konto, nicht je IP |
| `resetPassword` | 5 je 5 Minuten | E-Mail | Reset-Mails begrenzen |
| `publicInfo` | 500 je 5 Sekunden | `request.origin.remoteHost` | Notbremse für öffentliche Info-Routen |

- Überschreitung antwortet mit 429 und `RequestError.TooManyRequests` (StatusPages in `plugins/Responses.kt`), dokumentiert in der OpenAPI-YAML.
- `publicInfo` ist bewusst weit über jeder legitimen Menge; die eigentliche Lastgrenze der öffentlichen Anzeigen ist der Antwort-Cache je Veranstaltung ([ADR-0062](0062-oeffentliche-anzeigen-cache-marker-rate-limit.md)). Pfade mit erratbaren Codes (z. B. Band-Codes in „Mein Event") brauchen eine engere, eigene Gruppe.
- DoubleReceive ist für alle Requests außer WebSocket-Upgrades installiert, damit der Rate-Limit-Schlüssel den Body lesen kann, ohne ihn dem Handler wegzunehmen.

## Verworfene Alternativen

- Login-Limit 3 je 5 Minuten (Januar 2025): am 2025-04-28 auf 10 gelockert, weil sich Nutzer bei Tippfehlern zu schnell aussperrten (`5a65e626`).
- Rate-Limit je IP für den Login: nicht gewählt, weil hinter NAT ein Nutzer alle anderen sperren würde; deshalb E-Mail als Schlüssel.
- Query-Umbau der Athleten-Anzeige (N+1 beseitigen) statt Cache und Notbremse: bewusst nicht gemacht, weil der Cache die Last unabhängig von der Zuschauerzahl deckelt ([ADR-0062](0062-oeffentliche-anzeigen-cache-marker-rate-limit.md)).
- Externes Gateway oder Reverse-Proxy-Limits: nicht belegt.

## Konsequenzen

- Das Login-Limit ist an den Payload gebunden; ein fehlerhafter oder fremd formatierter Body fällt auf einen anderen Schlüssel. Der `Upgrade`-Header allein ist clientgesteuert und darf DoubleReceive nicht abschalten (Kommentar in `Requests.kt`).
- 500 Requests je 5 Sekunden je IP schützen nicht vor einem einzelnen Angreifer mit vielen Adressen; das ist hingenommen, weil der Cache die Datenbank schützt.
- Neue öffentliche Routen müssen der Gruppe `publicInfo` (oder einer engeren) zugeordnet werden; nichts erzwingt das automatisch.
- Die Limits gelten je Prozess; bei mehreren Instanzen vervielfachen sie sich.

## Quellen

- Commits: `4df8c468` (RateLimit eingeführt), `c1ef7228` (Limiter für Logins repariert), `d285fddd` (429-Antwort), `5a65e626` (10 je 5 Minuten), `d4e2cd08` (Cache und Takt-Untergrenze der Athleten-Anzeige), `9aee625c` (`publicInfo` als Notbremse), `8dcea681` (Betriebshärtung nachgemessen), `fe6c62de` (Takt-Untergrenze 3 s)
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/plugins/Requests.kt`, `plugins/Responses.kt`
- Verwandte ADRs: [ADR-0008](0008-serverseitige-sessions-header-token.md), [ADR-0034](0034-eigenes-bild-captcha.md), [ADR-0062](0062-oeffentliche-anzeigen-cache-marker-rate-limit.md), [ADR-0076](0076-mein-event-band-qr-ohne-anmeldung.md)
