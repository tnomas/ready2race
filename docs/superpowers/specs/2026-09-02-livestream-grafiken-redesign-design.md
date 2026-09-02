# Livestream-Grafiken: Neugestaltung

Stand: 02.09.2026 · Zweig: `claude/livestream-elements-redesign-08f789`

## Ausgangslage

Die acht Stream-Grafiken (`frontend/src/components/event/stream/graphics/`) teilen sich eine
Karten-Optik aus der ersten Fassung: schwarze, halbtransparente Kästen mit Akzentbalken,
MUI-Standardtypografie, und eine feste Bandhöhe, in die `FitToHeight` volle Felder
hineinschrumpft. Bei sechs und mehr Booten mit Besatzungszeile werden Ergebnis und Startliste
dadurch klein und gequetscht, und ein Vollbild-Ergebnis sieht aus wie ein zu groß geratenes
Band.

## Ziel

Eine gemeinsame Broadcast-Bildsprache für alle Grafiken, zwei klar getrennte Formfamilien
(Bänder als Overlay, Tafeln als Vollbild), und Zeilenlayouts, die sich nach der Feldgröße
richten statt zu skalieren. Das Automatik-Regelwerk, der Push-Kanal und das Kontroll-Panel
bleiben unverändert; „je nach Situation einblenden" leistet das Panel bereits (Auto | An | Aus).

## Entscheidungen

1. **Eigenes Grafik-Designsystem** unter `graphics/design/`: Farb- und Maß-Token
   (`streamTheme.ts`), Grundfläche `StreamPlate`, Kopfzeile `StreamHeader`, Bootszeile
   `StreamRowLine`/`StreamRowStacked`, Platzmarke `RankBadge`. Die alten
   `board/streamOverlay/*`-Bausteine bleiben für das Chroma-Board-Element unangetastet.
2. **Schrift:** Barlow Condensed (600/700) für Titel, Labels und Startnummern/Ränge — aus dem
   npm-Paket `@fontsource/barlow-condensed`, wird also vom eigenen Server ausgeliefert; Roboto
   bleibt für Namen und Zeiten (tabellarische Ziffern). Die Bühne lädt beide vor.
3. **Zwei Formfamilien je nach Platz:**
   - `BOTTOM_*` → **Band** (Lower Third): bis 96rem breit, höchstens ein Drittel der Bühne
     hoch. Zeilenmodus nach Feldgröße: bis 4 Boote zweizeilig (Verein + Besatzung), ab 5
     einzeilig (Besatzung hinter dem Verein, ellipsiert). Kein Schrumpfen bis 8 Boote.
   - `FULL_CENTER` → **Tafel**: 104rem breit, bis 58rem hoch, großer Kopf. Bis 9 Boote eine
     Spalte zweizeilig, ab 10 Boote zwei Spalten einzeilig (bis 20). Darüber greift wie
     bisher `FitToHeight` als Netz.
   - `SIDE_*` → **Seitenleiste** (Einlauf-Ticker): 34rem breit, wächst je Einlauf.
   - `TOP_*` → **Uhr-Platte** mit Beschriftung (Start in / Rennzeit) und Wettkampfkürzel.
   Die Modusentscheidung liegt in reinen Funktionen (`streamLayout.ts`, Vitest).
4. **Startliste darf auf `FULL_CENTER`** (Vollbild-Aufstellung vor dem Start): Backend
   `allowedPlacements` und Frontend `ALLOWED_PLACEMENTS` werden gemeinsam erweitert.
   Alle übrigen Zuordnungen bleiben.
5. **Inhaltliche Ergänzungen, klein gehalten:** NEXT_UP zeigt die geplante Startzeit;
   RESULT trägt den Rückstand zum Sieger in der Zeile statt darunter; SCHEDULE markiert
   Ausfälle und Pausen; die Uhr bekommt eine Zeile, die Countdown und Rennzeit benennt.
6. **Kürzungsleiter statt Messen** (`graphics/design/streamText.ts`, Vitest): Kurzformen
   bleiben der Standard und kommen vom Server. Reicht auch die Kurzform nicht, greift in
   fester Reihenfolge: (1) Vornamen der Besatzung zu Initialen, sobald die Zeile ihr
   Zeichenbudget überschreitet — das Budget hängt an Zeilenmodus, Spaltenzahl und Länge der
   Vereinskette; (2) in den schmalen Formen die Vereinskette zusammenziehen — Einlauf-Leiste
   ab drei Gliedern („A / B +1"), Zwischenzeiten-Karte auf das erste Glied („A +1"); Band und
   Tafel behalten die volle Kette; (3) die Ellipse als letztes Netz, sie trifft nie den
   ersten Verein. Die Einlauf-Leiste darf die Besatzung auf zwei Zeilen umbrechen, aber nur
   zwischen ganzen Namen. Keine Einstellung „Kurz/Lang" je Grafik (Entscheidung 02.09.).
7. **Sichtprüfung über eine Demo-Galerie** (`frontend/stream-demo.html`,
   `src/demo/streamDemo.tsx`, `src/demo/streamDemoData.ts`, Muster Sprecher-Demo): rendert die
   echte Bühne mit festen Szenarien (kleine und volle Felder, lange Vereinsketten, DNF/Strafe/
   Abmeldung, vorläufig, Pause, kombinierte Szenen) über einem simulierten Kamerabild —
   ohne Backend. Die Szenarien sind der visuelle Testkatalog dieser Runde.

## Nicht im Umfang

Neue Grafiktypen, Sponsorenflächen, Broadcast-Verzögerung, Streckenbild-Auslieferung für
Token-Szenen, Änderungen am Resolver oder am Panel.
