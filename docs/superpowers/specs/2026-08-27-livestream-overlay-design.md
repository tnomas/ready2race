# Livestream-Overlay: eigene Stream-Domäne

Stand: 27.08.2026 · Zweig: `claude/livestream-architecture-redesign-09e118`

## Ausgangslage und Ziel

Das heutige Stream-Overlay ist ein Board-Element (`BoardStreamOverlayElement`) mit sieben
Modi, Chroma-Grün und einer Kachel je URL. Für eine ernsthafte Livestream-Anbindung wird es
durch eine eigene Stream-Domäne ersetzt: **transparente Vollbild-Szenen** (Alpha statt
Chroma), ein **server-seitiges Automatik-Regelwerk** mit Hand-Übersteuerung und ein
**Kontroll-Panel** für die Streamer. Die Streamer arbeiten mit **Wirecast**; dessen
Web-Display-Quelle unterstützt transparente Hintergründe. Jede Szene ist dort ein Shot.

Der Datenweg ist bereits gelöst und wird wiederverwendet: Der Board-WebSocket-Kanal pusht
fertige Ansichten (`BoardViewBroadcaster`, `useBoardViewSocket`), Token-Authentifizierung
per Subprotokoll existiert. Diese Muster werden 1:1 auf die Stream-Domäne übertragen.

## Getroffene Entscheidungen

1. **Eigene Domäne** `app/stream/` im Backend (Muster `liveDashboard`), nicht Teil des
   Board-Systems. Eigene Rechte, eigenes Panel. Die alte Stream-Kachel im Board-System
   bleibt vorerst unangetastet; Rückbau erst nach bestandenem Regattatag (Folge-Ticket).
2. **Alpha als Normalfall**, Chroma-Farbe als Option je Szene für Hardware-Mischer.
   Kein Fill+Key-Doppelausgang.
3. **On air entscheidet der Server** (Szenen-Resolver), nicht der Browser. Szene und
   Panel hören auf denselben Push-Kanal und zeigen deshalb per Konstruktion denselben Stand.
4. **Panel-Stufe 2**: Automatik als Grundzustand (die Streamer bedienen PTZ-Kameras und
   Schnitt), je Grafik `Auto | An | Aus`, bei Hand-Ein optional Inhaltswahl (bestimmter
   Lauf) und Auto-Out-Timer. Kein Preview/Programm, kein Multiviewer — das macht Wirecast.
5. **Mehrere Szenen je Veranstaltung**, jede mit eigener URL + Token: Renn-Szene(n) und
   Füllszenen (Tagesprogramm, Streckenbild). **Auch Füllszenen sind transparent** — sie
   liegen als Grafik über dem Kamerabild, keine opaken Vollbildkarten.
6. **Anker-Plätze statt Pixel-Freiheit**: fester Satz benannter Plätze, je Grafik
   konfigurierbar (nur designte Plätze wählbar), Größenvariante, Sicherheitsrand je Szene.
   Kein frei ziehbarer Layout-Editor.
7. **Broadcast-Verzögerung je Ausgang ist NICHT Teil dieses Umbaus** (eigenes Ticket,
   betrifft die öffentlichen Boards neben dem Player, nicht die Szenen — die laufen durch
   Wirecast und sind mit dem Video automatisch synchron verzögert).

## Backend: Modul `app/stream/`

Aufbau `boundary/` `control/` `entity/` wie bei `liveDashboard`.

### Tabellen (eine Migration, Slot `V202608271000__stream_scene.sql`)

**`stream_scene`** — eine Szene je Zeile:

| Spalte | Typ | Bemerkung |
|---|---|---|
| `id` | uuid pk | |
| `event` | uuid fk → event | |
| `name` | text | „Rennen", „Tagesprogramm", … |
| `background` | text | `TRANSPARENT` (Default) oder `CHROMA` |
| `chroma_color` | text null | nur bei CHROMA, Default `#00FF00` |
| `safe_area_percent` | int | Sicherheitsrand, Default 0 |
| `trial_mode` | boolean | Probemodus an/aus (siehe unten) |
| `created_at` / `updated_at` … | | wie üblich |

Der Szenen-Token liegt NICHT als Spalte hier, sondern in der bestehenden, bewusst
vereinheitlichten Token-Infrastruktur: `timing_device_token` trägt heute Posten- oder
Board-Tokens (genau ein Ziel, DB-Check-Constraint, siehe `V202608250900`). Die Migration
ergänzt ein drittes Ziel `stream_scene` (fk, on delete cascade) und weitet den Constraint
auf `num_nonnulls(station, board, stream_scene) = 1`. Ausstellen/Wiederverwenden/Widerrufen
laufen über `TimingDeviceTokenService` (neu: `validateForStreamScene`), wie beim Board.

**`stream_scene_graphic`** — je Szene und Grafiktyp eine Zeile, `unique(scene, type)`:

| Spalte | Typ | Bemerkung |
|---|---|---|
| `scene` | uuid fk | |
| `type` | text | `STARTLIST` `CLOCK` `LAPS` `RESULT` `FINISH_TICKER` `NEXT_UP` `SCHEDULE` `COURSE_IMAGE` |
| `enabled` | boolean | |
| `placement` | text | Anker-Platz, siehe Platzierungsmodell |
| `size` | text | `COMPACT` / `NORMAL` |
| `settings` | jsonb | typspezifisch: Einblenddauern, Auto-Out-Sekunden, Bildreferenz (COURSE_IMAGE), Listenlänge (SCHEDULE) |

**`stream_override`** — Regie-Eingriffe; AUTO = keine Zeile:

| Spalte | Typ | Bemerkung |
|---|---|---|
| `scene` | uuid fk | |
| `graphic_type` | text | |
| `state` | text | `FORCED_ON` / `FORCED_OFF` |
| `match` | uuid fk null | Inhaltswahl („Ergebnis von Lauf 12"); null = jüngster/aktueller Inhalt |
| `expires_at` | timestamp null | Auto-Out der Handschaltung; danach fällt die Grafik auf AUTO zurück |

In der DB, nicht im Speicher: Ein Server-Neustart am Regattatag darf keine Regie vergessen.

### Szenen-Resolver

Kern der Domäne, **rein funktional gehalten und so getestet**: Eingabe = Renn-Daten
(laufender/vorbereiteter Lauf, Runden, Ergebnisse, Sequenzzustand, Zeitplan) + Grafik-Konfiguration
+ Übersteuerungen + Jetzt-Zeitpunkt. Ausgabe = aufgelöster Szenenstand.

- Triggert auf dieselben Änderungsauslöser wie der `BoardViewBroadcaster` (Start,
  Zwischenzeit, Zieleinlauf, Zustandswechsel, Sequenzstart) **plus zeitgesteuerte
  Neuauswertung** für Auto-Out-Timer und Override-Abläufe (nächster fälliger Zeitpunkt,
  kein Sekundentakt).
- Datenbeschaffung über die vorhandene Board-Datenlogik (Bausteine von
  `BoardLogic`/`AthleteBoardLogic`) — keine zweite Datenaufbereitung. Die Inhalts-Payloads
  verwenden die bestehenden DTO-Typen (`AthleteBoardMatch`, `AthleteBoardResult`), damit
  die Frontend-Bausteine (`lastLaps`, `streamClock`) unverändert weiterarbeiten.
- **Platz-Regel:** Nie zwei Grafiken auf demselben Anker-Platz. Bei Konflikt gewinnt die
  höhere Priorität: `RESULT > LAPS > STARTLIST > NEXT_UP` (untere Bandposition); die
  unterlegene Grafik wartet und erscheint, sobald der Platz frei ist.
- `FORCED_ON` schlägt Automatik und Platz-Priorität; kollidieren zwei `FORCED_ON` auf
  einem Platz, gewinnt der jüngere Eingriff (der ältere fällt auf AUTO zurück und das
  Panel zeigt das).

### Aufgelöster Szenenstand (Push-DTO `StreamSceneViewDto`)

```
{ sceneId, background, chromaColor?, safeAreaPercent,
  serverTime,                    // für die Uhr-Korrektur wie bisher
  graphics: [{ type, placement, size,
               visible, visibleSince, visibleUntil?,   // Timer fürs Ausblenden
               overrideState,                          // AUTO | FORCED_ON | FORCED_OFF
               content }] }                            // typabhängige Payload
```

### WebSocket und HTTP

- Neuer Pfad `/api/ws/event/{eventId}/stream/{sceneId}` in `Sockets.kt`, Registrierung,
  Subprotokoll-Token und Broadcaster-Muster wie beim Board-Kanal. Zugelassen: Nutzersitzung
  (Panel) oder Szenen-Token (Wirecast). Der Token gilt für genau diese Szene.
- HTTP-Endpunkte (TypeSpec `api/src/stream.tsp`, danach `npm run generate` im Frontend):
  CRUD Szenen + Grafik-Konfiguration, Token neu erzeugen, Override setzen/löschen,
  Probemodus schalten, initialer Szenenstand (GET, damit Szene und Panel nicht auf den
  ersten Push warten).

### Rechte

Zwei neue Privilegien in `Privilege.kt`: Resource `STREAM`, `ReadStreamGlobal` und
`UpdateStreamGlobal` (Muster `BOARD`-Paar inkl. Kommentarstil; `UPDATE EVENT` gilt
weiterhin mit, damit bestehende Rollen nichts verlieren). Keine Migration nötig
(`initializeDatabase` sät), aber TypeSpec/OpenAPI nachziehen. Vergabe zunächst nur an die
Admin-Rolle; die Streamer bekommen einen Account mit `READ STREAM` + `UPDATE STREAM` und
sehen sonst nichts.

## Grafik-Katalog v1 und Automatik-Regelwerk

| Grafik | Standardplatz | Auto-Regel |
|---|---|---|
| `STARTLIST` — Bahnen/Startnummern, Vereine | unten-mitte | ein bei „In Vorbereitung" für N s (Setting, Default 15), danach gibt sie den Platz frei (→ NEXT_UP); aus spätestens bei Sequenzstart bzw. Start |
| `CLOCK` — Rennuhr | oben-rechts | ab **Sequenzstart negativ** („−3:00 …"), ab Start positiv laufend; Freeze-/Fade-Verhalten der bestehenden `streamClock`-Semantik |
| `LAPS` — Zwischenzeiten-Band mit Rang und Tempo | unten-mitte | bei eintreffender Zwischenzeit für N s (Setting, Default 8) |
| `RESULT` — Ergebnis mit Rückstand zum Sieger | unten-mitte | nach Laufende für N s (Default 20); Kennzeichen **„Vorläufig"**, solange der Lauf auf Klärung steht |
| `FINISH_TICKER` — kleine Einlauf-Grafik | seitlich-rechts | ab dem **ersten Zieleinlauf** des Laufs, wächst je Einlauf (Rang, Startnummer/Verein, Zeit), **bleibt stehen** bis RESULT erscheint |
| `NEXT_UP` — „Nächstes Rennen"-Band | unten-mitte | ein, sobald der vorige Lauf abgeschlossen ist (Folgelauf „In Vorbereitung"), aus bei Sequenzstart; niedrigste Platz-Priorität — sichtbar, wann immer RESULT/LAPS/STARTLIST den Platz nicht halten |
| `SCHEDULE` — Tagesprogramm | vollflächig-mitte | sichtbar solange enabled; aktualisiert sich mit den Daten |
| `COURSE_IMAGE` — Streckenbild | vollflächig-mitte | sichtbar solange enabled; Bild aus `settings` (Ablage über den bestehenden Dokument-/Bild-Mechanismus der Veranstaltung) |

Bewusst NICHT in v1: Rennverlaufsbalken, Head-to-Head, Bedingungen-Einblendung,
Athleten-Steckbriefe, Sponsorenrotation/-report — nachrüstbar als neue Grafiktypen,
sobald das Gerüst steht.

## Platzierungsmodell

- Benannte Anker-Plätze: `unten-mitte`, `unten-links`, `unten-rechts`, `oben-links`,
  `oben-rechts`, `seitlich-links`, `seitlich-rechts`, `vollflächig-mitte`.
- Je Grafiktyp ist die Menge **erlaubter** Plätze fest hinterlegt (ein Lower Third ist
  breit und flach — „seitlich" wird gar nicht angeboten). Die Verwaltungs-UI zeigt nur
  erlaubte Plätze.
- `size` (COMPACT/NORMAL) und `safe_area_percent` je Szene ergänzen das. Feinversatz
  ist bewusst nicht vorgesehen; die `settings`-jsonb kann später ohne Schemaänderung
  darum wachsen.
- Platzierung wird in der **Szenen-Verwaltung** eingestellt (Einrichtung), nicht im
  Kontroll-Panel (Regie).

## Frontend: Szene

- Route `/event/{eventId}/stream/{sceneId}` außerhalb des angemeldeten Layouts (Muster
  geteilter Board-Link); der Szenen-Token reist wie beim Board über den geteilten Link und
  wird lokal abgelegt.
- 16:9-Bühne, skaliert auf Fenstergröße, `body` transparent (bzw. Chroma-Farbe laut
  Szene). Schriften werden vorgeladen (`font-display: block` bzw. Preload), damit im
  Bild nichts springt.
- **Ein-/Ausblendungen gehören dem Client**: Der Stand sagt sichtbar/seit/bis, die
  Komponenten animieren (Slide+Fade, weiche Schatten — mit Alpha jetzt erlaubt).
  Verschwindet eine Grafik aus dem Stand, blendet sie aus statt hart zu verschwinden.
- Verbindungsabriss: letzter Stand bleibt stehen (Verhalten des Socket-Hooks), zusätzlich
  friert die Szene nach N s ohne Lebenszeichen **neue** Einblendungen ein — nichts
  Falsches einblenden ist wichtiger als irgendetwas einblenden.
- Wiederverwendung: `streamClock`, `lastLaps`/`streamOverlay`-Bausteine, Boot-Zeilen.
  Neue Komponenten unter `frontend/src/components/event/stream/`.

## Frontend: Kontroll-Panel

- Route im angemeldeten Bereich, verlangt `READ STREAM` (Schalten: `UPDATE STREAM`);
  für Tablet/Handy ausgelegt, Szenen-Auswahl oben.
- Je Grafik: Zustand jetzt (on air / bereit / aus — direkt aus dem gepushten Stand),
  Schalter `Auto | An | Aus`, bei „An" optional Lauf-Auswahl und Auto-Out („für 20 s"),
  Miniatur-Vorschau der Grafik mit dem gewählten Inhalt vor dem Schalten.
- Gesundheitssignal: Zeitpunkt des letzten Push, Warnung „Szene ‚X' seit N s ohne Daten".

## Probemodus

Je Szene ein Schalter (Panel, `UPDATE STREAM`): Der Resolver wird mit einem synthetischen
Demo-Lauf gefüttert (Start → Sequenz → Zwischenzeiten → Einläufe → Ergebnis im Zeitraffer,
Schleife), ohne echte Daten anzufassen. Damit sind alle Grafiken vor dem Regattatag und in
jedem Handtest durchklickbar. Der Probemodus ist im Szenenstand markiert und im Panel
deutlich sichtbar.

## Fehlerbehandlung

- Abgewiesener/widerrufener Token: Verhalten des Board-Kanals (Close-Code, langsamer
  Retry ohne Neuladen).
- Fehlende Daten für eine Grafik (z. B. kein Tempo-Bezug): Stelle bleibt leer, nie
  erfundene Werte — bestehende Konvention der `streamOverlay`-Bausteine.
- Abgelaufene Overrides räumt der Resolver bei der Auswertung auf (kein separater Job).

## Tests

- **Resolver rein funktional** (die fehleranfälligste Logik): Regelwerk × Übersteuerungen
  × Timer × Platz-Prioritäten, inkl. „FORCED_ON gegen FORCED_ON" und Override-Ablauf.
- Service-/Repo-Schicht über die Testcontainers-Schiene (`testComprehension`-Muster).
- Frontend-Aufbereitung als Vitest neben den Komponenten (Muster `streamOverlay.test.ts`).
- Nach Datenklassen-/DTO-Änderungen: `mvn clean test`.

## Nicht im Umfang (Folge-Tickets)

1. Broadcast-Verzögerung je geteiltem Board-Link (Spoiler-Schutz Website-Ticker).
2. Rückbau der alten Stream-Kachel aus dem Board-System (nach bestandenem Regattatag).
3. OBS-/Wirecast-Shot-Sammlung als Download, YouTube-Kapitelmarken, PNG-Ergebniskacheln.
4. Weitere Grafiktypen (Rennverlauf, Head-to-Head, Bedingungen, Steckbriefe, Sponsoren).
5. Kommentatoren-Ansicht.
