# ADR-0078: Konfigurierbare Boards ersetzen Info-Ansichten und Athleten-Board; eigenes Recht BOARD; Boards hinter Auth mit Geräte-Token; Timeline-Cursor

- Status: angenommen
- Datum: 2026-08-10
- Bereich: domäne, datenbank, api, frontend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Bis August 2026 gab es vier Info-View-Typen, davon das Athleten-Board als fest verdrahtete Kombination dreier Listen, und genau eine Bühne je Veranstaltung. Sprecherinnen, Steg und Zuschauerbildschirme brauchten verschiedene Zusammenstellungen auf verschiedenen Bildschirmen. Auf dem montierten 27-Zoll-Bildschirm musste gescrollt werden. Wer nur Anzeigen pflegte, bekam mit `UPDATE EVENT` auch Wettkämpfe, Gebühren, Urkunden und Zeitnahme. Und die Boards waren öffentlich abrufbar, obwohl Anzeigegeräte ohne Sitzung laufen sollen, aber nicht jeder alles sehen soll.

## Entscheidung

### Datenmodell und Timeline (2026-08-10)

1. Tabelle `board(id, event_id, name, config jsonb)` (`V202608102000__boards.sql`). Die gesamte Struktur – Raster, Kacheln, Elemente – ist ein JSON-Dokument; kein Fremdschlüssel zeigt aus der Konfiguration heraus, geschrieben wird immer im Ganzen. Die Migration erzeugt aus jeder aktiven Athleten-Anzeige ein Default-Board und droppt `info_view_configuration` samt Enum; die alte URL leitet auf das erste Board um. `/info/athlete-board` und `/info-views` entfallen.
2. **Freies Raster** mit 1–4 Spalten, `colSpan`/`rowSpan`, bis 16 Kacheln (die festen Layouts des ersten Wurfs wurden noch am selben Tag ersetzt; Altkonfigurationen werden beim Lesen normalisiert). Elemente: MATCH (Timeline-Offset −6…+6), MATCH_LIST, CLOCK, TEXT, AWARD_CEREMONY, SCHEDULE; Rotation je Kachel; Kopfzeile mit Name und Serveruhr abschaltbar; Takt bis herunter zu 3 s. Kacheln haben Hintergrund plus unabhängige Randfarbe (keine Deckkraft); Alarmfarben (Pause, Fehlstart) stehen fest im Code, nicht im Theme.
3. **Timeline:** beendete → laufende (Arena-Reihenfolge nach Start) → anstehende Läufe. Die Darstellung folgt dem Laufzustand, nicht dem Vorzeichen des Offsets. **Cursor 0 nimmt den zuletzt gestarteten fahrenden Lauf**, sonst den vorbereiteten; +1 ist der Lauf am Steg, danach das Programm; ein bloß aktivierter Lauf verdrängt nicht das jüngste Ergebnis (Regel seit 2026-08-15, `14b9f8e2`).
4. **Bühne ohne Scrollen:** Die reine Funktion `selectBoardCards()` wählt drei bis vier gleich breite Spalten, Überlauf steht als „+n weitere Läufe" in der Kopfzeile; CSS-Grid mit `1fr`-Zeilen und `densityScale` statt JavaScript-Messung; Bootszeilen docken oben an. Plätze als Ordnungszahlen, damit sie nicht wie Startnummern lesen; die eine Zahl je Boot heißt `startNumber` (ADR-0081).
5. Öffentliche Endpunkte `/info/boards` und `/info/board/{id}` mit Cache 5 s, Board-Cache-TTL 2 s, Abfragetakt-Untergrenze 3 s (ADR-0062); Karten, Polling und SQL blieben beim Umbau unangetastet.

### Eigenes Recht (2026-08-14)

6. Privilegpaar `READ BOARD GLOBAL` / `UPDATE BOARD GLOBAL` (`Privilege.kt`, `Resource.BOARD`). Verwaltungsrouten prüfen per `authenticateAny` daneben weiter die Event-Rechte; bestehende Rollen verlieren nichts. Keine Migration: `initializeDatabase` sät fehlende Privilegien und hängt sie an die Admin-Rolle (ADR-0010). Dasselbe Muster wiederholte sich für STREAM und APP_TIMING.

### Boards hinter Auth (2026-08-24/25)

7. `GET /event/{id}/info/boards` und `…/board/{boardId}` verlangen eine Sitzung (`ReadBoardGlobal` oder `ReadEventGlobal`) oder ein Board-Geräte-Token im Header `X-Timing-Device-Token`. `timing_device_token` trägt entweder Posten oder Board (`check (num_nonnulls(station, board) = 1)`, `V202608250900`) – keine zweite Token-Tabelle. Ein Share-Link liefert zweimal denselben Link; das Anzeigegerät legt Tokens je Board ab, ein Bildschirm kann mehrere Boards zeigen.
8. Kanal `/api/ws/event/{eventId}/board/{boardId}` liefert beim Verbinden den vollen Stand und danach bei jeder Änderung die fertige Ansicht (kein HTTP-Nachschlag); je Board eine Render-Coroutine mit 150-ms-Sammelfenster, ohne Abonnent wird nie gerechnet, Boards ohne Echtzeit-Kachel verbinden gar nicht. Polling bleibt als Sicherheitsnetz und streckt sich (ADR-0082).

## Verworfene Alternativen

- Feste Layout-Enums (1/2/3 Spalten, 3×2): innerhalb eines Tages durch das freie Raster ersetzt (`a82adb9f`); nur noch als Alt-Lesart.
- Relationale Speicherung der Konfiguration: der Editor schreibt immer im Ganzen, kein FK nötig.
- Beibehalten der alten View-Rotation: ein 1-Spalten-Board mit mehreren Elementen ersetzt sie.
- Automatisch rotierende Seiten und scrollende Ansicht auf großen Bildschirmen: ausdrücklich ausgeschlossen.
- `1fr`-Verteilung der Bootszeilen: riss Lücken.
- Hintergrund-Deckkraft je Kachel (`172c7666`): am selben Tag durch Randfarbe ersetzt (`d783596c`).
- Cursor 0 = zuletzt gerufener Lauf: sprang vor der Kamera auf das nächste Rennen; revidiert.
- Sonderrolle für Offset 0 bei Parallelläufen: nicht gebaut.
- Spaltenreihenfolge des alten Athleten-Boards: zweimal gedreht (`e75be105`, `b765b11d`), dann durch Boards ersetzt.
- Weiter `UPDATE EVENT` verlangen; Privilegien per Migration anlegen.
- Öffentliche Board-Links: Folge ist, dass alte Links in „nicht freigegeben" laufen.
- Neue Auslöser für den Board-Kanal im Code verteilen: der vorhandene Änderungsmarker triggert; themeabhängige Alarmfarben.
- Stream-Overlay als Board-Kachel (ADR-0094) wurde durch eine eigene Stream-Domäne ersetzt (ADR-0095).

## Konsequenzen

- Die JSON-Konfiguration ist nicht referenziell geprüft; ein gelöschter Wettkampf oder Lauf in einer Kachel muss beim Lesen abgefangen werden.
- Alte öffentliche Board-Links funktionieren seit dem 25.08. nicht mehr ohne Token; montierte Bildschirme müssen neu eingerichtet werden.
- Eine Liste der vergebenen Board-Tokens („Geräte"-Reiter) fehlt noch; alle übrigen öffentlichen Anzeigen bleiben offen.
- Die Athleten-Anzeige ist nur ab `lg` sinnvoll; Mobil- und Individualansicht sind „Mein Event" (ADR-0076).
- Handtests des Board-Editors und des Sprecherinnen-Durchlaufs mit dem neuen Recht sind offen.

## Quellen

- Commits: `34560e76`, `d38b360f`, `771b8aea`, `9622b5c0`, `231f739f`, `dc60f7a6`, `a82adb9f`, `81979ff8`, `43ebc713`, `fe6c62de`, `4d7a2f90`, `317c7f10` (Boards); `e75be105`, `b765b11d` (Athleten-Board); `172c7666`, `d783596c`, `ba20bb21`, `7bc0b34d`, `6b158f58`, `675521a6` (Kacheln); `14b9f8e2` (Cursor); `ad903edb`, `3f67752f`, `4e62cf83` (Recht); `0001fab9` (hinter Auth, Board-Kanal)
- Migrationen: `V202608102000__boards.sql`, `V202608250900__board_device_token.sql`
- Code: `Privilege.kt` (`ReadBoardGlobal`), `plugins/Sockets.kt` (`BOARD_VIEW_WS_PATH`)
- Specs: `docs/superpowers/specs/2026-08-10-boards-design.md`, `docs/superpowers/specs/2026-08-09-athletenanzeige-27zoll-design.md`, `docs/superpowers/specs/2026-08-10-athletenanzeige-27zoll-testkatalog.md`, `docs/zeitnahme-testrunde-24-08.md` (Nachtrag 25.08.), `docs/superpowers/plans/2026-08-10-boards.md`
- Verwandte ADRs: [ADR-0010](0010-privilegien-action-resource-scope.md), [ADR-0062](0062-oeffentliche-anzeigen-cache-marker-rate-limit.md), [ADR-0076](0076-mein-event-band-qr-ohne-anmeldung.md), [ADR-0081](0081-kurzbezeichner-kennung-kuerzel-sportneutral.md), [ADR-0082](0082-hintergrundaktualisierung-etag-polling-und-push.md), [ADR-0088](0088-timing-websocket-und-geraete-token.md), [ADR-0094](0094-stream-overlay-als-board-kachel.md), [ADR-0095](0095-eigene-stream-domaene-server-entscheidet-on-air.md), [ADR-0098](0098-sprecher-board-drei-spalten-dashboard.md)
