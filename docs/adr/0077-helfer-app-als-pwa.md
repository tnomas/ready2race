# ADR-0077: Helfer-App als installierbare PWA: Service-Worker-Scope über den Ablageort, Sitzungen im localStorage, Offline-Sperre für Schreibaktionen

- Status: angenommen
- Datum: 2026-08-09
- Bereich: frontend, betrieb
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Helfer scannen am Steg mit wechselndem Netz. Die Helfer-App unter `/app` (ADR-0039) lud ein 3-MB-Bundle unkomprimiert über einen Reverse-Proxy, auf dessen Konfiguration das Projekt keinen Zugriff hat; die Sitzung starb mit dem App-Prozess, und das Dashboard war nur mit dem Verwaltungs-Chrome erreichbar. Ein Service Worker unter `/app/` braucht entweder den Header `Service-Worker-Allowed` (kein Hosting-Zugriff) oder muss physisch unter `/app/` liegen.

## Entscheidung

1. **Scope über den Ablageort.** `vite-plugin-pwa` im `injectManifest`-Modus (`frontend/vite.config.ts`); ein Build-Hook verschiebt den gebauten Worker nach `dist/app/sw.js`, wodurch der Scope `/app/` ohne Header gilt. Registriert wird nur aus dem `/app`-Zweig; Quelle ist `frontend/src/pwa/sw.ts`. Manifest und Worker werden auch aus dem Dev-Server unter `/app` geliefert, weil der SPA-Fallback sonst `index.html` als Manifest ausliefert.
2. **Cache-Strategie:** `index.html` nicht precached (NetworkFirst), API netzwerk-only. Der Lese-Cache liegt in der App-Schicht (`frontend/src/pwa/readCache.ts`, 12 h, an `userId` gebunden, beim Abmelden geleert) und wird nur bei echten Netzfehlern genutzt – keine Klarnamen in der CacheStorage geteilter Geräte.
3. **Offline-Sperre für Schreibaktionen.** Offline zeigt das Dashboard den letzten Stand mit Banner; alle fünf schreibenden Aktionen sind gesperrt. Es gibt keine Offline-Warteschlange.
4. **Sitzungen im `localStorage`.** Helfer-Sitzungen liegen mit `lastUsedAt` und 6-Stunden-Verfall (spiegelt den Server) im `localStorage` statt `sessionStorage`, damit die installierte App nach Neustart ohne Login weiterarbeitet. Am 2026-08-11 wurde das auf die Admin-Sitzung übertragen (`session.admin`, gleitendes Fenster, `touchSessionToken` bei jeder erfolgreichen Antwort; `frontend/src/contexts/user/sessionToken.ts`). Sockets nehmen den Token ihrer Oberfläche zuerst (`pathname.startsWith('/app')`), den der anderen als Rückfall, Geräte-Token zuletzt; ein 1008 heißt „dieser Token nicht", die Liste wird durchprobiert.
5. Dashboard als Route `/app/dashboard` mit `eventId` als Prop; Update-Snackbar mit Ausstieg statt `skipWaiting`; zweistufiger Kill-Switch; statisches Manifest. Logout leert nur den Speicher der beendeten Sitzung.

## Verworfene Alternativen

- `sessionStorage`: überlebt die Installation als PWA nicht.
- Offline-Erfassung mit Queue: bräuchte Idempotenz im Backend.
- Service-Worker-Runtime-Cache auf die API: Klarnamen in der CacheStorage geteilter Geräte.
- Refresh-Token im Backend: sauberer, aber ein eigenes Vorhaben.
- `encode gzip` im Proxy, dynamisches Manifest je Regatta, Code-Splitting, zweiter Vite-Entry, `AppFunction` um das Dashboard erweitern (stattdessen `appEntries`): verworfen.
- Fester Vorrang von `session.app` in den Sockets: ließ den Leitstand dauerhaft auf „Nicht autorisiert" stehen.

## Konsequenzen

- Token im `localStorage` ist die Sicherheitsentscheidung, die das Upstream-Team lambda9 mittragen muss; sie ist im Spec (§13) als Übergabepunkt benannt.
- Der Manifest-Link in der gemeinsamen `index.html` gilt auch für `/board` und `/results`; die Abwägung wurde bei der Übergabe bewusst offen gelassen.
- Drei Build-Fallen: Der Hook bricht mit ENOENT ab, wenn `dist/sw.js` fehlt; Dev-Server muss Manifest und Worker unter `/app` liefern; ein Update erscheint erst nach Bestätigung der Snackbar.
- Am 2026-09-02 wurde der Ablauf der App umgebaut (ADR-0099); Scope und Token-Ablage blieben.
- Handtests der PWA stehen aus.

## Quellen

- Commits: `af496493`, `01e55fed`, `e972cb37`, `f99ac919`, `aac663c9`, `88442436`, `c80d1360`, `a4bf675f`, `6ab38f24`, `bf404b5e`, `0451135f`, `3d8a8fa0`, `3178f1c0`, `3b83e64a` (PWA); `db418b0d`, `bf28a815`, `bddeeb36` (Admin-Sitzung, Socket-Token)
- Code: `frontend/vite.config.ts` (Hook nach `dist/app/sw.js`), `frontend/src/pwa/sw.ts`, `frontend/src/pwa/readCache.ts`, `frontend/src/contexts/user/sessionToken.ts`
- Specs: `docs/superpowers/specs/2026-08-09-pwa-helfer-app-design.md`, `docs/superpowers/specs/2026-08-10-pwa-helfer-app-uebergabe.md`, `docs/superpowers/specs/2026-08-10-pwa-helfer-app-testplan.md`, `docs/superpowers/plans/2026-08-09-pwa-helfer-app.md`
- Verwandte ADRs: [ADR-0008](0008-serverseitige-sessions-header-token.md), [ADR-0039](0039-helfer-app-eigener-bereich-unter-app.md), [ADR-0085](0085-betrieb-ab-je-veranstaltungstag.md), [ADR-0088](0088-timing-websocket-und-geraete-token.md), [ADR-0099](0099-helfer-app-scannen-zuerst.md)
