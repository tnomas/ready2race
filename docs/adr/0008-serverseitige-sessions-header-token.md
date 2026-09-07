# ADR-0008: Serverseitige Sessions mit Datenbank-Token im Header X-Api-Session (kein Cookie, kein JWT)

- Status: angenommen
- Datum: 2024-12-19
- Bereich: backend, api, frontend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Die Anmeldung sollte widerrufbar und nachvollziehbar sein, ohne JWT-Infrastruktur oder externen Identity-Provider. Die erste Fassung transportierte die Sitzung als Cookie (`user-session`, SameSite=strict, secure, httpOnly). Als das Frontend in fremde Seiten eingebettet und Cross-Origin betrieben werden sollte ([ADR-0032](0032-einbettbares-frontend-theme-je-instanz.md)), stand das Cookie im Weg. Im Fork kam 2026 hinzu, dass die Verwaltungsanmeldung Tab-Wechsel überleben soll und dass Zeitnahme-Posten, Boards und Stream-Szenen eigene, personenlose Tokens brauchen.

## Entscheidung

- **Eine Sitzung ist eine Zeile in `app_user_session`:** `token char(30)` (Primärschlüssel, erzeugt von `RandomUtilities.token()`), `app_user`, `expires_at`, `created_at`. Die Gültigkeit prüft ausschließlich der Server (`AuthService.useSessionToken`); es gibt keine signierten Tokens und keine Ablesung von Rechten aus dem Token.
- **Lebensdauer 6 Stunden, gleitend:** `tokenLifetime = 6.hours` in `AuthService.kt`; jede erfolgreiche Nutzung setzt `expires_at` neu. Ein Scheduler-Job „Delete expired session tokens" räumt alle 5 Minuten auf ([ADR-0013](0013-scheduler-und-datenbank-warteschlangen.md)).
- **Transport im Header `X-Api-Session`:** `plugins/Sessions.kt` registriert `header<UserSession>("X-Api-Session")`. Der Header trägt das serialisierte Session-Objekt `{"token":"…"}`, nicht den nackten Token. Requests laufen ohne `credentials`; CORS (nur DEV) erlaubt und exponiert den Header.
- **Frontend-Ablage in `localStorage`** (`frontend/src/contexts/user/sessionToken.ts`): Verwaltung unter `session.admin`, Helfer-App unter `session.app`, jeweils `{"token":…,"lastUsedAt":…}` mit `SESSION_MAX_AGE_MS` = 6 h; `touchSessionToken` schiebt die Frist bei jeder erfolgreichen Antwort. Ein alter `sessionStorage['session']`-Eintrag wird beim Übergang übernommen und gelöscht.
- **WebSockets** nehmen den Token ihrer Oberfläche zuerst (`pathname.startsWith('/app')` entscheidet), die andere Sitzung als Rückfall, Geräte-Token zuletzt; ein Close-Code 1008 heißt „dieser Token nicht", also wird die Liste durchprobiert.
- **Geräte-Token** für Posten, Boards und Szenen reisen im eigenen Header `X-Timing-Device-Token` und nicht in `X-Api-Session` ([ADR-0088](0088-timing-websocket-und-geraete-token.md)).

## Verworfene Alternativen

- Cookie-Sitzung (`02a7fad0`, Januar 2025): gebaut und am 2025-06-23 durch den Header ersetzt, weil Einbettung und Cross-Origin-Betrieb mit SameSite-Cookies nicht funktionierten.
- Lebensdauer 30 Minuten: bis April 2025; auf 6 Stunden erhöht, weil sonst ungespeicherte Wettkampf-Setups verloren gingen (`bbc77921`).
- `sessionStorage` als Ablage (Juni 2025 bis August 2026): ersetzt, weil der Admin-Login beim Tab-Wechsel verloren ging (`db418b0d`).
- Fester Vorrang von `session.app` in den Socket-Kanälen: verworfen, weil der Leitstand in der Verwaltung dauerhaft „Nicht autorisiert" zeigte (`bddeeb36`).
- JWT oder externer Identity-Provider: nicht belegt.

## Konsequenzen

- Jeder Request kostet eine Datenbankabfrage auf `app_user_session`; dafür ist Widerruf sofort wirksam (Zeile löschen).
- `token` ist `char(30)`: ein kürzerer Test-String wird gepaddet und findet sich nicht wieder. Wer per SQL eine Sitzung anlegt, muss `expires_at` großzügig setzen, weil der Vergleich in Europe/Berlin läuft und Postgres in UTC ([ADR-0016](0016-schema-konventionen-uuid-audit-timestamp.md)).
- Handaufrufe der API müssen `X-Api-Session: {"token":"…"}` senden; ein nackter Token erzeugt einen stillen 401. `GET /api/event` taugt nicht als Anmeldekontrolle (`optionalAuthenticate`), `GET /api/login` antwortet bei abgelaufener Sitzung 204 und das Frontend räumt den Eintrag weg.
- `localStorage` überlebt Tabs und Neustarts; auf geteilten Geräten (Helfer-App) ist das gewollt, in der Verwaltung ein Abwägen gegen die 6-Stunden-Frist.
- Der System-Admin steht nicht in `app_user_with_roles`; Test-Helferbänder gehören an einen Nutzer mit Rolle.

## Quellen

- Commits: `17822e34` (`V202412161600__users_and_sessions.sql`), `6d720544` (checkLogin, logout), `875817dd` (Aufräum-Job), `bbc77921` (6 Stunden), `4df8c468`/`02a7fad0` (Cookie-Fassung), `a4474f77` (Header statt Cookie), `840b3e3d` (Header exponiert), `f1d0f647` (credentials entfernt), `db418b0d` (localStorage mit gleitendem Fenster), `bf28a815` (Geräte-Token als Link), `bddeeb36` (Socket nimmt Token seiner Oberfläche)
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/plugins/Sessions.kt`, `app/auth/boundary/AuthService.kt`, `security/RandomUtilities.kt`, `frontend/src/contexts/user/sessionToken.ts`
- Verwandte ADRs: [ADR-0007](0007-argon2id-passwort-hashing.md), [ADR-0009](0009-rate-limiting-im-server.md), [ADR-0010](0010-privilegien-action-resource-scope.md), [ADR-0032](0032-einbettbares-frontend-theme-je-instanz.md), [ADR-0077](0077-helfer-app-als-pwa.md), [ADR-0088](0088-timing-websocket-und-geraete-token.md)
