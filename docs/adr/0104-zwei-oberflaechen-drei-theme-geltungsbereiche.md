# ADR-0104: Zwei Oberflächen, drei Theme-Geltungsbereiche; je Lauf eine Primäraktion, Seltenes in ein flaches Menü

- Status: angenommen
- Datum: 2026-11-13
- Bereich: frontend
- Rekonstruiert: ja, aus der Commit-Historie des Zweigs

## Kontext

Die Software hat zwei Gesichter. Die öffentliche Seite zeigt Ergebnisse und Veranstaltungen und soll einladend aussehen. Die Verwaltung (Büro, Meldungen, Konfiguration) soll ruhig und dicht sein. Dazu kommen Arbeitsplätze am Renntag (Schiedsrichter-Dashboard, Regie, Leitstand, Zeitnahme-Posten, Helfer-App), die draußen auf Telefon und Tablet in praller Sonne bedient werden: große Schrift, feste Alarmfarben, wenige Klicks. Ein einziges MUI-Theme bediente alle drei und erfüllte keinen Zweck gut; Mandanten-Farben ([ADR-0032](0032-einbettbares-frontend-theme-je-instanz.md)) machten Kontrastfehler zusätzlich möglich.

## Entscheidung

**Drei Geltungsbereiche, ein Fundament in `frontend/src/theme/`:**
1. **Öffentliche Oberfläche** (Startseite, Ergebnisse, Meldeseiten): das Mandanten-Theme als Schaufenster; Layout `ResultsLayout` mit `PublicPageHeader`, Karten mit klickbarer Fläche (`CardActionAreaLink`).
2. **Arbeitsoberfläche der Verwaltung:** `AdminThemeScope` umschließt `RootLayout` und `ResultsLayout` und legt `adminTheme(outer)` über das Mandanten-Theme. Mandantenfarben und -schriften bleiben wirksam; geändert werden Dichte, flache Rahmen statt Schatten (`elevation` 1–3), Radien (`CONTROL_RADIUS`, `CONTAINER_RADIUS`) und lesbare Textfarben (`palette.statusText.*`, `primaryText`, berechnet mit `readableColor` auf Kontrast ab 4,5:1). `secondary` ist grau.
3. **Renntag-Arbeitsplätze und Posten:** `LegacyThemeScope` (Routenauswahl in `RootLayout`) hält für Schiedsrichter-Dashboard, `streamPanel` und `timing/*` (Leitstand, Posten, Startanzeige) im Inhalt das bisherige Theme; nur der Rahmen ist neu. Die Helfer-App bleibt beim Mandanten-Theme. Große Schrift und feste Alarmfarben im Code bleiben Absicht ([ADR-0032](0032-einbettbares-frontend-theme-je-instanz.md): nur Light-Mode).

**Bausteine** liegen in `@components/ui`: `PageHeader`, `SectionHeader`, `EmptyState`, `ErrorState`, `LoadingState` (zeigt erst nach 200 ms etwas), `TableSkeleton`, Link-Varianten (`ButtonLink`, `IconButtonLink` mit Pflicht-`aria-label`, `ListItemButtonLink`, `TextLink`). Jede Detailseite hat Lade-, Fehler- (mit „Erneut versuchen") und Leerzustand.

**Muster „eine Primäraktion je Lauf, Seltenes in ein flaches Menü":** Auf Lauf-Karten der Durchführung (`ExecutionMatchCard`), im Schiedsrichter-Dashboard (`LiveDashboardMatchCard`, Plan der Aktionen in `cardActionPlan.ts`) und an den Posten steht die eine Handlung, die der Zustand nahelegt, als großer Primärknopf (48 px). Seltene, zerstörerische oder zurücknehmende Handlungen liegen in einem ⋮-Menü ohne Untermenü, Zerstörerisches zuletzt, rot, hinter einer Linie. Folgen: „Ergebnis eintragen" ist ein Klick statt zwei; „In Klärung", „Lauf zurücksetzen", „Beenden zurücknehmen", „Runde löschen" und „Runde entfällt" kosten einen Klick mehr. Tabellenaktionen: bis zu zwei als Icon-Knöpfe mit Tooltip, ab drei alles ins Menü. Das Backend-Verhalten ist unverändert; nur Anordnung und Klickzahl ändern sich.

**Fensterregel:** Vollbild-Arbeitsplätze auf eigenen Bildschirmen (Leitstand, Regie, Sprecher-Board, Schiedsrichter-Dashboard) öffnen aus dem Betrieb heraus in neuem Fenster.

## Verworfene Alternativen

- **Ein Theme für alles:** hohe Dichte und große Posten-Schrift widersprechen sich; die Alarmfarben am Steg dürfen sich nie an Mandantenfarben ausrichten.
- **Alle Arbeitsplätze auf das neue Verwaltungstheme umstellen:** Maße und Farben der Posten sind draußen erprobt; der Gewinn stünde in keinem Verhältnis zum Risiko am Regattatag.
- **Dunkles Theme für die Verwaltung:** die App kennt nur den Light-Mode ([ADR-0032](0032-einbettbares-frontend-theme-je-instanz.md)).
- **Alle Aktionen einer Lauf-Karte als Knöpfe:** übersichtlich nur bis drei Zustände; am Steg wird die falsche Taste getroffen.
- **Untermenüs im ⋮-Menü:** zusätzliche Klicks für Handlungen, die ohnehin selten sind.

## Konsequenzen

- Neue Arbeitsplatz-Seiten gehören entweder in den `LegacyThemeScope` (Renntag, draußen) oder unter `AdminThemeScope`; die Routenauswahl steht in `RootLayout`. Das Admin-Theme sagt über Tabellen, Dialoge und DataGrid im Detail noch nichts Belegtes (siehe Testkatalog).
- Anker (`<a>`) tragen ihre MUI-Farbe; `index.scss` färbt nur noch Anker ohne MUI-Klasse.
- Eine Aktion, die vom Direktknopf ins Menü wanderte, ist in Anleitungen und Schulungsunterlagen nachzuziehen.
- Die Funktionslisten der umgebauten Seiten (Veranstaltung, Wettkampf, Konfiguration, Durchführung, Teilnehmende, öffentlich, Posten, Meldung, Renntag-Arbeitsplätze) hielten fest, dass keine Funktion verloren ging; bewusste Abweichung: Eine reine STREAM-Rolle sieht „Boards verwalten" und „Sprecher-Board" nicht mehr, die sie ohnehin nicht öffnen durfte.

## Quellen

- Code: `frontend/src/theme/`, `frontend/src/components/ui/`, `frontend/src/layouts/RootLayout.tsx`, `frontend/src/components/event/competition/excecution/ExecutionMatchCard.tsx`, `frontend/src/components/event/liveDashboard/cardActionPlan.ts`, `frontend/src/pages/event/tabs/betriebTiles.ts`
- Verwandte ADRs: ADR-0032 (Theme je Instanz), ADR-0093 (Betrieb), ADR-0099 (Helfer-App), ADR-0103
