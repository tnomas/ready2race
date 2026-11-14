# ADR-0088: Timing-WebSocket mit Auth per Subprotokoll und Broadcast nach Commit; Geräte-Token als eine Infrastruktur für Posten, Boards und Szenen; Zeitnahme-Routen unter der Veranstaltung

- Status: angenommen
- Datum: 2026-08-17
- Bereich: backend, api, frontend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Die Posten-Boards des Zeitnahme-Moduls ([ADR-0087](0087-eigenes-zeitnahme-modul-append-only.md)) brauchen Änderungen in Echtzeit. Die bestehende Anmeldung läuft über den Header `X-Api-Session` ([ADR-0008](0008-serverseitige-sessions-header-token.md)); Browser können beim WebSocket-Upgrade aber keine eigenen Header setzen, und die Middleware `DoubleReceive` kam mit Upgrade-Anfragen nicht klar. Zeitnahme-Hardware und geteilte Anzeigegeräte können sich außerdem nicht als App-Nutzer anmelden. Leitstand und Boards hingen anfangs unter der Helfer-App (`/app/timing`).

## Entscheidung

**WebSocket-Kanal**
- Kanal `/api/ws/event/{eventId}/timing`. Die Anmeldung reist im Subprotokoll: `new WebSocket(url, ["r2r", token])` (Konstante `TIMING_WS_SUBPROTOCOL` in `plugins/Sockets.kt`); `X-Api-Session` bleibt Fallback für Nicht-Browser. Upgrade-Anfragen sind von `DoubleReceive` ausgenommen.
- Broadcasts werden in `respondKIO` gepuffert und erst nach dem Commit gesendet. Kein Abonnent sieht Pre-Commit-Zustand, ein Rollback erzeugt keine Phantom-Ereignisse. Der Scheduler, der außerhalb von `respondKIO` läuft, sendet erst nach eigenem `transact`.
- Ein anwendungsweiter Supervisor-Scope mit begrenzter Queue und genau einer Writer-Coroutine je Abonnent hält die Reihenfolge und isoliert hängende Clients.
- Der Kanal ist reiner Change-Feed: Schreiben läuft weiterhin über REST, Reconnect bedeutet voller REST-Refetch. Kein Event-Replay.
- Im Frontend entscheidet `frontend/src/utils/timing/socketTokens.ts` nach derselben Regel wie HTTP (`pathname.startsWith('/app')`), welche Sitzung zuerst probiert wird: eigene Oberfläche, dann die andere, dann Geräte-Token. Ein Close-Code 1008 heißt „dieser Token nicht" und wird erst nach der ganzen Liste als terminal behandelt.

**Geräte-Token**
- Tabelle `timing_device_token` (V202608181100): postengebunden, gespeichert als SHA-256-Digest in `token_hash`, einmalig im Klartext ausgegeben; `revoked` behält die Zeile, damit alte Marken zuordenbar bleiben. Marken per Token tragen `source = HARDWARE` und kein `created_by`.
- Share-Link-Tokens (V202608211420) speichern zusätzlich den Klartext, weil der Link selbst das Credential ist; die Prüfung läuft unverändert über `token_hash`. Hardware-Tokens bleiben nur-Hash.
- Das Token reist im Header `X-Timing-Device-Token`, nie in `X-Api-Session`. Die Lesewege (state, stations, teams, sequences, officialTimes, WebSocket) akzeptieren es veranstaltungsweit; Schreiben bleibt postengebunden; Widerruf ist Sitzungssache.
- Dieselbe Tabelle ist die eine Token-Infrastruktur für drei Ziele: Posten, Board (V202608250900, `check (num_nonnulls(station, board) = 1)`) und Stream-Szene (V202608271000, `num_nonnulls(station, board, stream_scene) = 1`). Ein Board-Token öffnet genau sein Board und keinen Zeitnahme-Endpunkt; ein Szenen-Token genau seine Szene.

**Routen**
- Leitstand, Erfassungsboard und Startbildschirm liegen kanonisch unter `/event/$eventId/timing/...`; die Seiten sind routenunabhängig (Props statt Routen-Hooks). Das Geräte-Token reist als `?token=` in der URL, wird clientseitig abgelegt und per replace-Redirect sofort aus der Adresszeile entfernt; ein Interceptor hängt es an alle Timing-Aufrufe. Im DEV-Setup ist der Header in CORS freigegeben.
- Die `/app/timing`-Welt bleibt daneben bestehen, bis die Mobile-Überarbeitung kommt (Kommentar in `frontend/src/routes.tsx`).

## Verworfene Alternativen

- **Schreiben über den Socket:** REST hat Validierung, Privilegprüfung und Transaktionsgrenzen; der Socket bleibt Change-Feed.
- **Event-Replay beim Reconnect:** Spec: „no event replay needed"; ein REST-Refetch ist einfacher und immer korrekt.
- **Separate Token-Mechaniken je Ziel** (Posten, Board, Szene): drei Tabellen, drei Prüfwege, drei Widerrufe; stattdessen ein Check-Constraint.
- **Fester Vorrang von `session.app` bei der Token-Wahl:** ließ den Leitstand dauerhaft auf „Nicht autorisiert" stehen; ersetzt durch die Oberflächen-Regel (bddeeb36).
- **Abriss von `/app/timing`:** bewusst verschoben, im Code kommentiert.

## Konsequenzen

- Jeder Broadcast muss durch den Puffer in `respondKIO` oder nach einem eigenen Commit gehen. Ein direkter Send aus einem Service ist ein Fehler, auch wenn er in Tests funktioniert.
- Ein hängender Abonnent verliert Nachrichten (begrenzte Queue) und muss per Reconnect voll nachladen; Clients dürfen sich nicht auf Lückenlosigkeit verlassen.
- Wer ein Token widerruft, löscht keine Zeile; Auswertungen über Marken bleiben vollständig, die Tabelle wächst.
- Klartext-Links sind Credentials. Wer einen Share-Link weitergibt, gibt das Gerät weiter; Widerruf ist der einzige Rückweg.
- Zwei Welten (`/event/.../timing` und `/app/timing`) müssen bis zur Mobile-Überarbeitung gepflegt werden.
- Beim Handtest über die API: der Geräte-Token gehört in `X-Timing-Device-Token`, `X-Api-Session` trägt das serialisierte Session-Objekt (siehe [ADR-0008](0008-serverseitige-sessions-header-token.md)).

## Quellen

- Commits: `02aa4885` (WebSocket-Fanout), `1dbdc2ca` (Härtung), `9d2a7f05` (Subscription-Race, After-Commit-Flush), `2195dd4a` (Reconnect-Lifecycle), `868dfe39` (1008 stabil), `bddeeb36` (Token der Oberfläche), `a9ea323a` (Geräte-Token), `cc8633b6` (Token öffnet Lesewege), `bf28a815` (Routen unter der Veranstaltung), `a356d86e` (CORS), `13060281` (Share-Link), `0001fab9` (Board-Token, V202608250900), `6b21ed0b` (Szenen-Token, V202608271000), `152436f7` (Widerruf und Constraint gehärtet)
- Migrationen: `V202608181100__timing_official_time.sql` (Tabelle `timing_device_token`), `V202608211420__timing_device_token_share_link.sql`, `V202608250900__board_device_token.sql`, `V202608271000__stream_scene.sql`
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/plugins/Sockets.kt`, `frontend/src/utils/timing/socketTokens.ts`
- Specs: `docs/superpowers/specs/2026-08-17-timing-module-design.md` („Realtime & sync")
- Verwandte ADRs: [ADR-0008](0008-serverseitige-sessions-header-token.md), [ADR-0078](0078-board-system-ersetzt-info-ansichten.md), [ADR-0082](0082-hintergrundaktualisierung-etag-polling-und-push.md), [ADR-0087](0087-eigenes-zeitnahme-modul-append-only.md), [ADR-0095](0095-eigene-stream-domaene-server-entscheidet-on-air.md)
