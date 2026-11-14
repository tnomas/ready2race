# ADR-0105: Frontend-Anfragen: Netzfehler als eigener Fall, `runRequest` für Absende-Handler, ein Download-Helfer, Sitzungsrichtlinie, alle Seiten lazy

- Status: angenommen
- Datum: 2026-11-13
- Bereich: frontend
- Rekonstruiert: ja, aus der Commit-Historie des Zweigs

## Kontext

Der generierte hey-api-Client liefert bei Netzabbruch weder Antwort noch Fehlerobjekt im Vertragsformat. Die Folge war Handler-Code, der bei weggebrochenem WLAN am Steg still hängen blieb (Absende-Knopf gesperrt, kein Hinweis), Tabellen, die nach einem Netzfehler „leer" zeigten, und Doppel-Absenden bei langsamer Leitung. Downloads bauten an rund einem Dutzend Stellen von Hand Anker und Blob-URL, ohne die URL wieder freizugeben. Beim Seitenreload während eines Backend-Neustarts (502 vom Proxy) verlor der Benutzer seine Sitzung, weil jeder Fehler wie „abgemeldet" behandelt wurde. Der Einstiegs-Chunk war 3,9 MB groß.

## Entscheidung

- **Netzfehler sind ein eigener Fall.** `FetchError<E>` in `utils/hooks.ts` ist eine Union aus Vertragsfehlern und `{status: 0, error: NetworkError}`; `isNetworkError` unterscheidet sie. Ein Netzfehler ohne vorhandene Daten ergibt `error.status === 0` und `pending: false`; vorhandene Daten bleiben stehen. Daten-Hooks pausieren Polling im verdeckten Tab.
- **Absende-Handler laufen über `runRequest(setBusy, request)`** (`utils/request.ts`): die Sperre wird im `finally` gelöst, ein Netzfehler kommt als `{kind: 'network'}` zurück (`isRequestNetworkError`) und wird mit `common.error.network` gemeldet. `EntityDialog` und `EntityTable` sind dagegen gehärtet (kein Doppel-Absenden, Fehlerzustand mit „Erneut versuchen", Seite wird bei Suche und Sortierung auf 0 gesetzt, `clampPage` nach Löschen).
- **Ein Download-Helfer:** `utils/download.ts` (`downloadBlob`, `downloadResponse`, `runDownload`) legt Anker an, gibt die Blob-URL nach `REVOKE_DELAY_MS` frei und behandelt Netzfehler. Neue Downloads nutzen ihn.
- **Sitzungsrichtlinie als reine Funktionen** (`contexts/user/sessionPolicy.ts`): Nur wenn der Server die Sitzung ausdrücklich nicht kennt (204 oder 401 auf `GET /login`), verlässt der Token das Gerät. Alles andere (5xx, 502 hinter nginx, Netzfehler) heißt `retry` mit wachsender Wartezeit bis 30 s; ein unbeaufsichtigtes Board oder eine OBS-Quelle erholt sich also von selbst. Der Header `X-Api-Session` bleibt JSON mit Token ([ADR-0008](0008-serverseitige-sessions-header-token.md)).
- **Alle Seiten und Layouts werden lazy geladen** (`lazyPage` in `routes.tsx`). Bei einem Chunk-Fehler nach einem Deployment lädt `utils/chunkReload.ts` die Seite genau einmal neu. Eigene Seiten `NotFoundPage` und `RouteErrorPage` fangen unbekannte Adressen und Routenfehler. Englisch bleibt statisch eingebunden (Rückfallsprache, Schlüsseltypen), Deutsch und Dänisch laden nach; `supportedLngs` sorgt dafür, dass eine Browsersprache `de-DE` als Deutsch gilt.
- **Lint steht bei null Fehlern** (`npm run lint`) und bleibt dort; Warnungen bleiben erlaubt.

## Verworfene Alternativen

- **Netzfehler als Ausnahme werfen:** jeder Aufrufer müsste `try/catch` kennen; die Union lässt TypeScript fehlende Fälle melden.
- **Globaler Axios-ähnlicher Interceptor mit Toast:** kann nicht entscheiden, ob eine Sperre zu lösen oder ein Dialog offen zu lassen ist.
- **Bei jedem Fehler abmelden:** ein Neustart des Backends während der Regatta würde alle Helfer ausloggen.
- **Nur die großen Seiten lazy laden:** der Aufwand je Seite ist gleich, die Kopplung der Startmenge wäre unkontrollierbar geblieben.
- **Dauerhaftes Neuladen bei Chunk-Fehlern:** Endlosschleife bei echtem Ausfall des Hosts.

## Konsequenzen

- Der Einstiegs-Chunk sank von 3.874 kB auf 317 kB (gzip 94 kB); die Startmenge liegt gesamt bei 1.089 kB (gzip 323 kB), der Precache bei 213 Einträgen.
- Neue Absende-Handler und Downloads gehören durch `runRequest` bzw. `runDownload`; Handler mit eigenem `try/finally` und eigenem Anker sind Altbestand. Einige Downloads unter `components/event/**` sind noch nicht umgestellt (Durchführung, Platzierungen, Meldungsabschluss, Teilnahmebedingungen-Export, Zeitplan-Import, Dokumentenliste, Teamtabelle).
- Aufrufer von `EntityTable` halten `columns` und `customEntityActions` per `useMemo` stabil, sonst wirkt der Schutz gegen unnötiges Nachladen nicht.
- Dialoge mit `preCondition: () => open` leeren ihre Daten beim Schließen, schon während der Ausblend-Animation.
- Seitenwechsel mit Chunk-Nachladen, PWA offline und die Netzfehlerpfade sind nicht im Browser belegt (Testkatalog Block J).

## Quellen

- Code: `frontend/src/utils/hooks.ts`, `frontend/src/utils/request.ts`, `frontend/src/utils/download.ts`, `frontend/src/utils/chunkReload.ts`, `frontend/src/contexts/user/sessionPolicy.ts`, `frontend/src/routes.tsx`
- Verwandte ADRs: ADR-0008 (Sitzungen), ADR-0077 (PWA, Offline-Sperre), ADR-0082 (Hintergrundaktualisierung)
