# ADR-0032: Frontend einbettbar; Theme und Logo je Instanz konfigurierbar; nur Light-Mode

- Status: angenommen
- Datum: 2025-01-10
- Bereich: frontend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Die Anwendung soll nicht nur unter eigener Domain, sondern eingebettet auf Vereins-Websites laufen. Dort bestimmt die umgebende Seite Sprache und Pfad, und Cookies sind über Domain-Grenzen unzuverlässig. Betreiber wollen zudem Farben und Logo anpassen, ohne das Frontend neu zu bauen (Dezember 2025). Im Fork zeigte sich im August 2026, dass die Pastelltöne `warning.main`/`warning.dark` des Themes unter 3:1 Kontrast auf Weiß liegen und Alarme der Zeitnahme aus dem Theme blass wirkten.

## Entscheidung

**Einbettung**
- Die App mountet in `<div id="ready2race-root">` (`frontend/index.html`). Der Router-Basepath kommt aus `data-basepath` dieses Elements (`routes.tsx`: `document.getElementById('ready2race-root')!.dataset.basepath`). Eine Einbettung setzt das Attribut, der eigenständige Betrieb lässt es weg.
- Ist keine Sprache gesetzt (eingebettet), zeigt die AppBar ein Sprachwidget (`components/appbar/LanguageWidget.tsx`, `757d7dbf`).
- Die Sitzung reist im Header `X-Api-Session`, nicht im Cookie ([ADR-0008](0008-serverseitige-sessions-header-token.md)); der Token lag zuerst in `sessionStorage`, seit dem Fork in `localStorage` unter `session.admin` bzw. `session.app` (`contexts/user/sessionToken.ts`).

**Theme je Instanz**
- Der Server liefert eine `ThemeConfigDto` (`app/globalConfigurations`, `ThemeService`/`ThemeRepo`); statische Auslieferung als `theme.json` unter `VITE_THEME_URL`. Das Frontend baut daraus in `theme.ts` das MUI-Theme (`muiTheme(locale, themeConfig)`); `ThemeProvider` liegt um `UserProvider` und `App`.
- Farben und eigenes Logo sind konfigurierbar (auch im mobilen Drawer). Die R2R-Logo-URL ist Frontend-Konfiguration (`VITE_R2R_LOGO_URL`), kein fester Pfad (`5f6feb15`). Logos und Schriften kommen aus `VITE_LOGOS_URL`/`VITE_FONTS_URL`.

**Nur Light-Mode**
- `theme.ts` setzt `mode: 'light'`; es gibt kein Dark-Mode-Gegenstück, und neue Oberflächen dürfen keins voraussetzen.
- Warntexte nutzen `warningTextColor` (`utils/warningText.ts`), das exakt die Abdunklung spiegelt, die MUIs Warn-Alert selbst anwendet; abgesetzte Hinweise sind echte Warn-Alerts, Warn-Chips gefüllt (`33d6cb24`, `c0cf2704`, `922e50b3`).
- Alarmfarben der Zeitnahme-Anzeigen (Pause, Fehlstart) stehen fest im Code, deckend mit weißer Schrift. Ein Alarm darf nicht von den hinterlegten Veranstaltungsfarben abhängen.

## Verworfene Alternativen

- Cookie-Sitzung: für die Einbettung ungeeignet, ersetzt durch den Header ([ADR-0008](0008-serverseitige-sessions-header-token.md)).
- Fester Logo-Pfad: durch `VITE_R2R_LOGO_URL` ersetzt.
- Dark-Mode: nicht gebaut; die Anzeigen für Boards und Stream haben eigene, feste Farbwelten ([ADR-0078](0078-board-system-ersetzt-info-ansichten.md), [ADR-0096](0096-livestream-grafiken-designsystem-regie-board.md)).
- Themeabhängige Alarmfarben: verworfen, weil ein Veranstalter mit sandfarbenem Theme sonst blasse Fehlstart-Warnungen bekäme.

## Konsequenzen

- Jede neue Route muss mit dem Basepath funktionieren; absolute Pfade ohne Router brechen die Einbettung. Der Service-Worker der Helfer-App hat deshalb einen eigenen Scope-Mechanismus ([ADR-0077](0077-helfer-app-als-pwa.md)).
- Theme-Farben sind Betreiberdaten; wer eine Farbe aus dem Theme für etwas Sicherheitsrelevantes nutzt, muss den Kontrast nicht kennen. Die Regel „Alarme fest im Code" ist die Antwort darauf.
- `warning.main` direkt als Textfarbe ist verboten; Prüfer suchen nach `warningTextColor`.
- Der Light-Mode-Beschluss schließt `prefers-color-scheme` aus; eine spätere Dark-Variante müsste alle festen Farben (Boards, Stream, Alarme) einzeln nachziehen.

## Quellen

- Commits: `02a7fad0` (Cookie-Eigenschaften, index.scss), `757d7dbf` (Sprachwidget), `333ae9ed` (Basepath aus dataset), `a4474f77` (Sitzung im Header), `5db6ee5b`/`bddc9c22`/`cf7eea19`/`d6d7ff16` (Theme-Konfiguration, Farben, Logo), `5f6feb15` (R2R-Logo-URL), `33d6cb24`/`c0cf2704`/`922e50b3` (Warnfarben), `0001fab9` (Boards mit festen Farben)
- Code: `frontend/index.html`, `frontend/src/routes.tsx`, `frontend/src/theme.ts`, `frontend/src/Config.ts`, `frontend/src/utils/warningText.ts`, `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/globalConfigurations/`
- Verwandte ADRs: [ADR-0005](0005-frontend-stack-react-vite-mui.md), [ADR-0006](0006-mehrsprachigkeit-i18next-erzwungene-schluessel.md), [ADR-0008](0008-serverseitige-sessions-header-token.md), [ADR-0031](0031-auslieferung-fat-jar-getrenntes-frontend.md), [ADR-0077](0077-helfer-app-als-pwa.md), [ADR-0078](0078-board-system-ersetzt-info-ansichten.md)
