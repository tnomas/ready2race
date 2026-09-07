# ADR-0094: Stream-Overlay als Board-Kachel mit Chroma-Key ohne neuen Datenpfad

- Status: ersetzt durch [ADR-0095](0095-eigene-stream-domaene-server-entscheidet-on-air.md)
- Datum: 2026-08-13
- Bereich: frontend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Für die Regatta am 14./15.08.2026 wollte der Livestream eine Board-URL als Browser-Quelle keyen. Ein Tag vor dem Renntag war kein neuer Datenpfad möglich; das Board-System ([ADR-0078](0078-board-system-ersetzt-info-ansichten.md)) lieferte bereits alles, was ein Lower-Third braucht.

## Entscheidung

- Neuer Kachel-Typ `STREAM` im Board-System mit Overlay-Modus: vollflächig nach dem Mechanismus der Sprecher-Kachel, kein Seiten-Chrome, Editor-Raster gesperrt.
- Modi `AUTO | RUNNING | RESULTS | UPCOMING | LAPS | UPCOMING_LIST` und ein `CLOCK`-Modus als croppbare Quelle mit permanent sichtbarer Uhr-Platte.
- Die Key-Farbe ist die vorhandene Kachel-Hintergrundfarbe (Vorgabe `#00FF00`); `solidOr()` erzwingt deckende Flächen, keine Halbtransparenz, Schatten oder Blur.
- Genau ein Lauf je Lower-Third; bei Parallelläufen der zuletzt gestartete. „Nur letztes Ergebnis" kommt aus der Ergebnisliste (Limit 1) statt aus Slot −1, weil −1 bei zwei fahrenden Läufen einen Lauf ohne Ergebnis trifft; Slot −1 bleibt Rückfall.
- Kein neuer Datenpfad: die Kachel nutzt `dataNeeds` und `resolveOffset` des Board-Endpunkts mit denselben Ergebnis-Toren ([ADR-0045](0045-oeffentliche-ergebnisse-live-tab-freigabe.md)). Die Laufuhr ist serverzeit-synchron.
- Kurzform für Wettkampf und Vereine getrennt schaltbar (`useShortClubNames` als JSON-Feld, ohne Migration rückwärtskompatibel). Panels passen sich der Höhe an (`FitToHeight`), statt Zeilen abzuschneiden; FLIP-Bewegungen und Tabellenziffern.

## Verworfene Alternativen

- **Eigene Route außerhalb des Board-Systems:** am 13.08. kein Datenpfad mehr zu bauen.
- **Raster-Zuschnitt und Flächen-Fades über der Key-Farbe:** Halbtransparenz keyt schlecht.
- **Neue Animations-Bibliothek:** FLIP mit Bordmitteln genügt.
- **Ein gemeinsamer Kurz/Lang-Schalter:** Wettkampfname und Vereinsnamen brauchen verschiedene Längen.
- **Später revidiert:** die eigene Stream-Domäne vom 27.08. ([ADR-0095](0095-eigene-stream-domaene-server-entscheidet-on-air.md)) ersetzt die Kachel für Livestreams funktional; Alpha statt Chroma, Server entscheidet „on air".

## Konsequenzen

- Die Kachel ist im Code noch vorhanden (`frontend/src/components/event/board/streamOverlay/`); der Rückbau ist bewusst auf ein Folge-Ticket nach dem bestandenen Regattatag verschoben. Bis dahin gibt es zwei Overlay-Welten.
- Ein `STREAM`-Element muss die einzige Kachel seines Boards sein.
- Chroma-Key verlangt deckende Farben überall; jede neue Fläche in der alten Kachel muss durch `solidOr()`.
- Die alte Kachel bleibt an die öffentlichen Ergebnis-Tore gebunden; die Stream-Domäne liefert dagegen auch nicht freigegebene Läufe an die Regie.

## Quellen

- Commits: `b5120dc8` (Design), `bdf44179` (STREAM-Element mit Overlay-Modus), `9924fdf3`, `657a62d8` (Vollbild ohne Chrome), `200a5e6b`, `50c50594` (CLOCK-Modus), `e0676193` (FitToHeight), `01937fba` (Kurz/Lang getrennt), `839bb734` (letztes Ergebnis aus der Liste), `45e11bb0` (Badge), `731fcb5c` (Merge), `14b9f8e2` (Board-Cursor)
- Specs: `docs/superpowers/specs/2026-08-13-stream-overlay-kachel-design.md`
- Verwandte ADRs: [ADR-0045](0045-oeffentliche-ergebnisse-live-tab-freigabe.md), [ADR-0078](0078-board-system-ersetzt-info-ansichten.md), [ADR-0095](0095-eigene-stream-domaene-server-entscheidet-on-air.md)
