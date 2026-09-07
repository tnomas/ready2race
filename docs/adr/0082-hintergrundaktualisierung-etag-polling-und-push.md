# ADR-0082: Hintergrundaktualisierung: ETag-Polling mit Tick ab Antwort, ergänzt um einen öffentlichen Event-Push-Kanal; Polling bleibt Sicherheitsnetz

- Status: angenommen
- Datum: 2026-08-09
- Bereich: frontend, api
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Die Durchführungsseite zeigte den Stand des Öffnens; F5 kostete Scrollposition, offene Runden und Dialoge. Öffentliche Anzeigen, Boards, „Mein Event", Ergebnisseite, Dashboards und Zeitplan pollten alle im eigenen Takt. Das Frontend hat kein jsdom und keine testing-library; nur reine Funktionen sind testbar (ADR-0030). Ein hängender Abruf über Mobilfunk darf keine Warteschlange aufbauen. Der Änderungsmarker je Veranstaltung (ADR-0062) existierte bereits, als am 2026-08-23 der WebSocket-Stack des Zeitnahme-Moduls (ADR-0088) verfügbar wurde.

## Entscheidung

1. **ETag-Polling für die Durchführungsseite.** Ein ETagged Progress-Endpunkt wird im veranstaltungsweit gesetzten Takt abgefragt: `event.execution_auto_refresh` (an) und `execution_auto_refresh_seconds` (5–60, Vorgabe 5; `V202608091500`, Grenzen in Request, Check-Constraint und Formular). Ein 304 berührt keinen State. Verbindungsverlust behält den letzten Stand mit Chip; bei offenem Dialog ruht der Abgleich.
2. **Der Tick zählt ab Antwort, nicht ab Senden.** `useFetch` setzte den nächsten Tick beim Senden; auf langsamer Leitung brach das jede Anfrage ab. Gilt ebenso für Schiedsrichter-Board und WebDAV-Status.
3. **React-freier Poller.** `frontend/src/utils/polling.ts` exportiert `createPoller`: Timer startet erst nach Abschluss, `refreshNow` bricht per `AbortController` ab, Fehler behalten den Stand, gepollt wird nur im Vordergrund. `usePolledFetch` ist reine Verdrahtung. Kein `setInterval`.
4. **Öffentlicher Event-Kanal als Ergänzung.** `/api/ws/event/{eventId}/info` (`plugins/Sockets.kt`, `EVENT_CHANGE_WS_PATH`) ohne Auth; er spiegelt exakt die öffentlichen Info-Endpunkte und trägt nie Nutzdaten, sondern `{type: changed, marker}` nach Commit (CONFLATED je Abonnent) und den aktuellen Stand beim Verbinden.
5. **Frontend-Basis** `frontend/src/utils/eventChange/eventChangePush.ts`: `EVENT_CHANGE_DEBOUNCE_MS = 800`, `EVENT_CHANGE_POLL_STRETCH = 8`, Reconnect-Nachlade-Entscheidung; dazu `useEventChangeSocket`. Push lädt sofort; das bestehende Polling bleibt gestreckt bestehen und kehrt ohne Socket unverändert zurück.
6. **Regel:** Kein Board wird ohne Socket schlechter. Polling ist das Sicherheitsnetz, Push die Beschleunigung.

## Verworfene Alternativen

- Ersatz des Pollings durch reinen Push: ein abgerissener Socket ließe die Anzeige einfrieren.
- `setInterval`: überlappende Anfragen bei hängender Leitung.
- Zusammenlegen mit `useAthleteBoardData`: eigene Aufgabe, nicht gemacht.
- Fehlermeldung über `feedback.error` bei jedem Fehlschlag: entfällt, der Stand bleibt stehen.

## Konsequenzen

- Zwei Aktualisierungspfade müssen gepflegt werden; wer einen neuen Info-Endpunkt baut, muss sicherstellen, dass der Marker bei jeder Mutation bumpt (ADR-0097: „jede Mutation bumpt").
- Das Sprecher-Board verlor mit dem Push seinen Aktualisierungs-Regler (ADR-0098).
- Falle vom 2026-08-15: Die Handeingabe-Pause drosselte den Poll-Takt der ganzen Veranstaltung; behoben.
- Der Kanal ist unauthentifiziert; er darf deshalb nie mehr als den Marker tragen.
- Board-Kanal (ADR-0078) und Szenen-Kanal (ADR-0095) folgen demselben Muster mit fertiger Ansicht statt Marker.

## Quellen

- Commits: `fe76409d`, `24cd85c5`, `4e71f6ce`, `fb7712a9`, `1d13dd5c`, `954e7bbe` (Durchführungsseite, Tick ab Antwort); `8ee0039d`, `e5e0ddac`, `4837be73`, `af6b4476` (Event-Kanal)
- Migrationen: `V202608091500__event_execution_auto_refresh.sql`
- Code: `frontend/src/utils/polling.ts`, `frontend/src/utils/eventChange/eventChangePush.ts`, `useEventChangeSocket.ts`, `backend/.../plugins/Sockets.kt`
- Specs: `docs/superpowers/specs/2026-08-09-einheitlicher-laufstatus-oeffentlich-design.md` (§3)
- Verwandte ADRs: [ADR-0030](0030-tests-testcontainers-und-reine-logik.md), [ADR-0058](0058-schiedsrichter-dashboard-eigene-ressource-nutzlast.md), [ADR-0062](0062-oeffentliche-anzeigen-cache-marker-rate-limit.md), [ADR-0078](0078-board-system-ersetzt-info-ansichten.md), [ADR-0088](0088-timing-websocket-und-geraete-token.md), [ADR-0095](0095-eigene-stream-domaene-server-entscheidet-on-air.md), [ADR-0097](0097-zeitnahme-livestream-sync-eine-sequenz-rechnung.md), [ADR-0098](0098-sprecher-board-drei-spalten-dashboard.md)
