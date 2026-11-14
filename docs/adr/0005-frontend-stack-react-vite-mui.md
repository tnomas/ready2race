# ADR-0005: Frontend-Stack React/Vite/TypeScript mit MUI, TanStack Router, react-hook-form; Kontexte statt Redux

- Status: angenommen
- Datum: 2024-12-19
- Bereich: frontend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Die Oberfläche ist eine Verwaltungsanwendung: viele Tabellen, Formulare und Dialoge, dazu später öffentliche Anzeigen, eine Helfer-App fürs Handy und Livestream-Grafiken. Das Upstream-Team wollte eine Single-Page-App, die getrennt vom Backend gebaut und als statische Dateien ausgeliefert wird, mit fertigen UI-Bausteinen statt eigenem Designsystem.

## Entscheidung

Das Frontend unter `frontend/` besteht aus:

- **React 18 + Vite + TypeScript** (`~5.6`), Imports über den Alias `@/…` (vite-tsconfig-paths). Build: `npm run build` = `tsc -b && vite build`; Tests: `vitest run`.
- **Routing über `@tanstack/react-router`, code-basiert:** alle Routen stehen in `frontend/src/routes.tsx` (`createRoute`, keine Dateirouten). Guards nutzen `authorization/privileges.ts`.
- **UI über MUI** (`@mui/material`, `@mui/icons-material`, `@mui/x-data-grid`, `@mui/x-date-pickers`, Emotion); Theme in `theme.ts` mit serverseitiger `ThemeConfigDto` (siehe [ADR-0032](0032-einbettbares-frontend-theme-je-instanz.md)). Styles zusätzlich als SCSS.
- **Formulare über `react-hook-form-mui`**; eigene Feldbausteine unter `components/form/` (z. B. `FormInputSwitch`).
- **Benachrichtigungen über `notistack`**, Datumslogik über `date-fns`, Bestätigungsdialoge über einen `ConfirmationProvider`.
- **Zustand über React-Kontexte statt einer Store-Bibliothek:** `contexts/user/` (Sitzung, Privilegien), `contexts/theme/`, `contexts/app/AppSessionContext.tsx` (Helfer-App), `contexts/confirmation/`, `contexts/eventRegistration/`. `package.json` enthält kein Redux und keinen vergleichbaren Store.
- **Struktur:** `pages/` (Seiten je Route), `components/` nach Domäne (`event/`, `qrApp/`, `timing/`, `results/`, `speaker/` …) mit generischen Bausteinen `EntityTable`, `EntityDialog`, `BaseDialog`, `EntityCardList` (siehe [ADR-0033](0033-entitytable-entitydialog-grundmuster.md)), `utils/` (API-Hilfen, Hooks, Poller, Geräte-Token), `layouts/`.
- Prettier und ESLint (typescript-eslint, react-hooks, react-refresh) sind konfiguriert.

## Verworfene Alternativen

- Die anfängliche Datumsbibliothek und das Locale-Handling wurden am 2025-02-13 durch date-fns ersetzt (`1b99ee43`), weil die Locales sonst doppelt gepflegt wurden.
- Ein eigenes Passwort-Bestätigungsfeld wurde zugunsten des entsprechenden react-hook-form-mui-Elements aufgegeben (`246f8b4a`).
- Ein globaler Store (Redux o. ä.): nicht belegt; die Kontexte decken Sitzung, Theme und Helfer-App ab, alles andere wird pro Seite geladen.
- Dateibasiertes Routing: nicht belegt; die eine Routendatei ist mit über 1.000 Zeilen groß, aber an einer Stelle lesbar.

## Konsequenzen

- Es gibt kein React-Komponententest-Harness; Oberflächenverhalten wird per Handtest belegt. Vitest testet nur reine Logik ([ADR-0030](0030-tests-testcontainers-und-reine-logik.md)).
- `routes.tsx` wächst mit jedem Bereich (Verwaltung, `/app` Helfer-App, `/results`, `/speaker`, `/board`, `/event/$eventId/stream/$sceneId`); Änderungen dort erzeugen Merge-Konflikte.
- MUI gibt die Optik vor; Livestream-Grafiken und Boards brauchten später ein eigenes, bühnenfestes Designsystem außerhalb des MUI-Themes ([ADR-0096](0096-livestream-grafiken-designsystem-regie-board.md)).
- Nach einem Branchwechsel mit neuen Dev-Abhängigkeiten ist `npm install` nötig; `vitest` sieht Typfehler nicht, `tsc -b` schon.
- Die App kennt nur den Light-Mode ([ADR-0032](0032-einbettbares-frontend-theme-je-instanz.md)).

## Quellen

- Commits: `17822e34` (Initial commit mit Vite/React/TanStack), `593635b4` (MUI und Grundlayout), `97dd6266` (notistack), `1b99ee43` (date-fns), `8e9b34cf` (Imports auf `@/`), `246f8b4a` (Passwortbestätigung aus react-hook-form-mui), `3c60b330` (`FormInputSwitch`)
- Code: `frontend/package.json`, `frontend/src/routes.tsx`, `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/contexts/`
- Verwandte ADRs: [ADR-0004](0004-openapi-first-handgepflegte-yaml.md), [ADR-0006](0006-mehrsprachigkeit-i18next-erzwungene-schluessel.md), [ADR-0030](0030-tests-testcontainers-und-reine-logik.md), [ADR-0032](0032-einbettbares-frontend-theme-je-instanz.md), [ADR-0033](0033-entitytable-entitydialog-grundmuster.md), [ADR-0077](0077-helfer-app-als-pwa.md)
