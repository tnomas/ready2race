# ADR-0062: Öffentliche Anzeigen: Cache je Veranstaltung mit Änderungsmarker, Rate-Limit als Notbremse, Takt-Untergrenze; kein N+1-Umbau

- Status: angenommen
- Datum: 2026-08-03
- Bereich: backend, betrieb
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Das öffentliche Athleten-Board (später die Boards, ADR-0078) sollte auf rund 200 Handys mit 15-s-Polling laufen. Der Endpunkt landete mit etwa einem Dutzend Abfragen je Request direkt auf der Datenbank (N+1 über die Teams). Ein Abschluss-Review vor dem ersten Regatta-Einsatz fand das als Betriebsrisiko. Später verzögerte die reine TTL frische Daten, ohne je welche zu erzeugen: Eine neue Zeit versauerte bis zu TTL-Länge im Cache.

## Entscheidung

1. **Antwort-Cache je Veranstaltung.** Der öffentliche Endpunkt rechnet einmal je Veranstaltung und TTL, unabhängig von der Zuschauerzahl (`AthleteBoardLogic.CACHE_TTL_SECONDS = 5`, für die Boards `BoardLogic.CACHE_TTL_SECONDS = 2`). `serverTime` wird trotzdem je Antwort frisch gestempelt, weil es den Countdown verankert.
2. **Änderungsmarker statt reiner TTL** (`EventChangeMarker`, ab 12.08.): Jeder Cache-Eintrag merkt sich den Markerstand der Veranstaltung und gilt nur, solange TTL und Marker halten. Der Marker ist bewusst In-Memory, weil die Caches im selben Einzelprozess leben. Alle Schreibwege, die öffentliche Anzeigen speisen, rufen `EventChangeMarker.bump(eventId)`: Feed-Abruf nur bei echtem Schreiben, Finish-Trichter, Aktivierung, Ergebnisse, Slot-CRUD, Hinweis, Zeitnahme-Übernahme (nur bei echtem Schreiben an `competition_match_team`), jede Sequenz-Mutation inklusive DONE-Übergang. Poll-Buchhaltung, Dry-Runs, Resume und reine Konfiguration bumpen bewusst nicht.
3. **Rate-Limit als Notbremse:** `RateLimitName("publicInfo")` mit 500 Anfragen je 5 s und Client-IP (`plugins/Requests.kt`), bewusst weit über jeder legitimen Menge, weil Vereins-WLAN und Carrier-NAT viele Geräte auf eine IP legen. Die eigentliche Lastgrenze ist der Cache. Pfade mit erratbaren Codes brauchen eine engere Gruppe.
4. **Takt-Untergrenze im Server:** Der Aktualisierungstakt kommt aus `display_duration_seconds`, fällt aber nie unter `MIN_REFRESH_INTERVAL_SECONDS` (zunächst 10 s, mit den Boards vom 10.08. auf Sprecherinnenwunsch auf 3 s freigegeben).
5. **Kein N+1-Umbau vor dem Einsatz:** Der Cache deckelt die Last; ein Batch-Umbau der Team-Abfragen kurz vor der Regatta wurde als unnötiges Risiko nicht gemacht.
6. **Kein ETag auf diesem Pfad:** Es müsste `serverTime` ausklammern, ein 304 ließe „Stand von" altern, und die gzip-Antwort ist ohnehin unter 1 KB.

## Verworfene Alternativen

- ETag auf dem Athleten-Board: siehe Punkt 6; das Schiedsrichter-Dashboard nutzt ETag, weil es keinen Countdown-Anker trägt (ADR-0058).
- Batch-Umbau der N+1-Abfragen: verschoben, Cache deckelt.
- Persistenter oder verteilter Marker: kein Bedarf bei Single-Instance-Betrieb.
- Neue Auslöser bei jedem Feature im Code verteilen: der vorhandene Marker triggert; der spätere Push-Kanal (ADR-0082) hängt an demselben Marker.
- Später revidiert: Takt-Untergrenze 10 s → 3 s und Cache 5 s → 2 s für die Boards (`fe6c62de`).

## Konsequenzen

- Der Betrieb ist auf eine Instanz ausgelegt. Eine zweite Instanz hätte je einen eigenen Marker und Cache; frische Daten kämen dann nur über die TTL.
- Jeder neue Schreibweg, der öffentliche Anzeigen speist, muss `bump` rufen. Vergessene Bumps zeigen sich als „hängt bis zu TTL-Länge nach" (belegt am Stream-Countdown bei Pause, ADR-0097).
- Ein Bump bei jedem Poll-Tick würde den Cache wertlos machen; deshalb „nur bei echtem Schreiben", was am Fingerabdruck des Feed-Abrufs hängt (ADR-0056).
- Die Messung von Datenbanklast ist tückisch: jOOQ nutzt Prepared Statements, Hintergrundjobs rauschen; sauber wird sie nur mit Log-Markern (`select 'ZZMARK_…'`, Arbeitsnotiz).
- Die N+1-Abfragen existieren weiter; wer den Cache abschaltet oder die TTL auf 0 setzt, holt sich das Ausgangsproblem zurück.
- Das Rate-Limit fängt nur Amok. Für „Mein Event" (ADR-0076) hängt die Sicherheit an der Entropie der gedruckten Codes, nicht an dieser Gruppe.

## Quellen

- Commits: `d4e2cd08` (Cache und Takt-Untergrenze), `9aee625c` (Rate-Limit publicInfo), `8dcea681` (Nachmessung am laufenden System), `fe6c62de` (Takt bis 3 s, Board-Cache 2 s), `1f805304` (Änderungsmarker je Veranstaltung), `a700caf2` (jeder speisende Schreibweg bumpt), `baa3053a` (Zeitnahme-Übernahme bumpt), `2af994d3` (Sequenz-Mutationen bumpen), `8ee0039d` (Marker wird Push-Kanal)
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/eventInfo/boundary/AthleteBoardLogic.kt`, `…/BoardLogic.kt`, `…/EventChangeMarker.kt`, `…/plugins/Requests.kt`
- Specs: `docs/superpowers/specs/2026-08-02-athleten-dashboard-design.md` („Betriebshärtung (Nachtrag 2026-08-03)", „Nachmessung am laufenden System")
- Verwandte ADRs: [ADR-0009](0009-rate-limiting-im-server.md), [ADR-0045](0045-oeffentliche-ergebnisse-live-tab-freigabe.md), [ADR-0056](0056-automatischer-feed-abruf-feed-ist-wahrheit.md), [ADR-0058](0058-schiedsrichter-dashboard-eigene-ressource-nutzlast.md), [ADR-0076](0076-mein-event-band-qr-ohne-anmeldung.md), [ADR-0078](0078-board-system-ersetzt-info-ansichten.md), [ADR-0082](0082-hintergrundaktualisierung-etag-polling-und-push.md), [ADR-0097](0097-zeitnahme-livestream-sync-eine-sequenz-rechnung.md)
