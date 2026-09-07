# ADR-0096: Livestream-Grafiken mit eigenem Designsystem, bühnenfesten Maßen und Kürzungsleiter; Regie-Board mit Phasen-Probemodus statt Dauerschleife

- Status: angenommen
- Datum: 2026-08-30
- Bereich: frontend, datenbank
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Die acht Grafiken der Stream-Domäne ([ADR-0095](0095-eigene-stream-domaene-server-entscheidet-on-air.md)) teilten eine Karten-Optik mit `FitToHeight`, die ab sechs Booten schrumpfte. Maße in `vw`/`vh` koppelten die Karten ans Fenster statt an die 1920×1080-Bühne; die Regie-Vorschau sah anders aus als die Mischer-Quelle. Lange Vereinsketten ([ADR-0071](0071-vereinskette-statt-renngemeinschaft.md)) und Besatzungen sprengten die Zeilen. Das Kontroll-Panel war eine Formularseite, und der Probemodus lief als Drei-Minuten-Schleife, in der die Regie nichts gezielt ansehen konnte.

## Entscheidung

**Designsystem** (`frontend/src/components/event/stream/graphics/design/`)
- Token in `streamTheme.ts`, Bausteine `StreamPlate`, `StreamHeader`, `StreamBoatLine`, `StreamTag` (die einzige Schräge) und `RankBadge`. Die alten `board/streamOverlay/*`-Bausteine bleiben für das Chroma-Board-Element unangetastet.
- Schriften aus dem eigenen Bundle (`@fontsource`): Barlow Condensed für Titel und Startnummern, Roboto für Namen und Zeiten.
- Maße sind bühnenfest (1920×1080), nicht fensterabhängig; Grafikplätze sind auf den Sicherheitsbereich gekappt.
- Zwei Formfamilien je Anker-Platz (`streamLayout.ts`): `BOTTOM_*` ist das Band (bis 4 Boote zweizeilig, ab 5 einzeilig), `FULL_CENTER` die Tafel (ab 10 Booten zweispaltig), `SIDE_*` die Seitenleiste, `TOP_*` die Uhr-Platte. Der Zeilenmodus folgt der Feldgröße statt zu schrumpfen; `FitToHeight` bleibt nur Sicherheitsnetz. Die Startliste darf auf `FULL_CENTER`.
- Kürzungsleiter in fester Reihenfolge (`streamText.ts`): Kurzformen vom Server, dann Vornamen zu Initialen bei Budgetüberschreitung, dann Vereinskette in schmalen Formen zusammenziehen („A / B +1"), zuletzt Ellipse, nie am ersten Verein. Kurzformen sind Standard; es gibt keine Einstellung „Kurz/Lang" je Grafik.
- Demo-Galerie `frontend/stream-demo.html` (Build über `vite.demo.config.ts`) mit 28 Szenarien als visueller Testkatalog ohne Backend.

**Regie-Board**
- `StreamDirectorPage` ersetzt `StreamPanelPage` unter derselben Route als dunkler Vollbild-Arbeitsplatz wie Leitstand und Sprecher-Board: Szenen als Reiter, Programmvorschau über Schachbrett mit Fokus-Zoom, je Grafik eine Karte mit Miniatur, Feed-Zustand `onAir | ready | off | noFeed` mit Grund (`director/graphicFeed.ts`) und `Auto | An | Aus`. „An" ist bei `noFeed` gesperrt.
- Probemodus in acht Phasen eines Laufs: `stream_scene.trial_phase` und `trial_phase_since` (V202609021300, Werte `PREPARING`, `COUNTDOWN`, `RUNNING`, `SPLIT`, `FINISH`, `FINISHED`, `RESULT`, `IDLE`), gesetzt über `PUT …/trialPhase`. Die Regie setzt Phasen selbst und löst sie erneut aus; Fenster laufen ab Phasenbeginn, der Loop-Wecker entfällt. Regie-Overrides wirken auch im Probemodus.
- Die alten Panel-Dateien sind gelöscht; die Szenen-Verwaltung bleibt auf `/streamScenes`.

## Verworfene Alternativen

- **Messen der Textbreite zur Laufzeit:** nicht deterministisch zwischen Vorschau und Mischer; die Kürzungsleiter ist es.
- **Kurz/Lang-Schalter je Grafik** (Entscheidung 02.09.): Kurzformen sind die Bildsprache, kein Wahlfeld.
- **`vw`/`vh`-Maße:** Vorschau und Quelle wichen ab.
- **Demo-Schleife** (5f9d01f0): ersetzt durch schaltbare Phasen (6a4f7450).
- **Preview/Programm-Umschaltung wie im Mischer, Layout-Editor, neue Grafiktypen, Sponsorenflächen, Broadcast-Verzögerung:** nicht im Umfang.
- **Änderungen an Resolver, Panel-Logik oder den alten `board/streamOverlay/*`-Bausteinen:** ausdrücklich ausgeschlossen.

## Konsequenzen

- Jede neue Grafik muss sich einer Formfamilie zuordnen und die Kürzungsleiter benutzen; freie Layouts gibt es nicht.
- Die Demo-Galerie ist der Testkatalog für Optik; wer eine Grafik ändert, ergänzt oder prüft dort ein Szenario. Sie läuft ohne Backend und ersetzt keinen Wirecast-Handtest.
- Zwei Schriftfamilien im Bundle vergrößern das Frontend; das ist der Preis für reproduzierbare Maße.
- Der Probemodus ist ein Szenen-Zustand in der Datenbank; eine vergessene Probephase überlebt den Neustart. Vor dem Sendebeginn gehört „Probemodus aus" in die Checkliste.
- „An" bei `noFeed` gesperrt heißt: die Regie kann keinen leeren Rahmen erzwingen; sie sieht den Grund auf der Karte.
- Der Wirecast-Handtest der Neugestaltung stand zum Zeitpunkt der Rekonstruktion aus (`docs/stream-handtests-wirecast.md`).

## Quellen

- Commits: `616cf1f2` (bühnenfeste Maße), `f66e2255` (Sicherheitsbereich), `d87b9772` (Zeilenabstände), `59ee1c25` (gemeinsame Bildsprache, Vollbild-Tafeln, Zeilenlayout), `d30485e8` (Kürzungsleiter), `5f9d01f0` (Demo-Schleife), `80fe6a4f` (Kontroll-Panel), `8883db3d` (Panel verlinkt), `7b2b9b9d` (Regie im Probemodus), `6a4f7450` (Regie-Board, Phasen, V202609021300)
- Migrationen: `V202609021300__stream_scene_trial_phase.sql`
- Specs: `docs/superpowers/specs/2026-09-02-livestream-grafiken-redesign-design.md`, `docs/superpowers/specs/2026-09-02-livestream-regie-board-design.md`, `docs/stream-handtests-wirecast.md`
- Code: `frontend/src/components/event/stream/graphics/design/`, `frontend/src/pages/event/StreamDirectorPage.tsx`, `frontend/stream-demo.html`
- Verwandte ADRs: [ADR-0071](0071-vereinskette-statt-renngemeinschaft.md), [ADR-0081](0081-kurzbezeichner-kennung-kuerzel-sportneutral.md), [ADR-0094](0094-stream-overlay-als-board-kachel.md), [ADR-0095](0095-eigene-stream-domaene-server-entscheidet-on-air.md), [ADR-0097](0097-zeitnahme-livestream-sync-eine-sequenz-rechnung.md)
