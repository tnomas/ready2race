# ADR-0095: Eigene Stream-Domäne: der Server entscheidet „on air", Alpha statt Chroma, Anker-Plätze statt Layout-Editor, Szenen-Token, Herzschlag-Kanal

- Status: angenommen (ersetzt [ADR-0094](0094-stream-overlay-als-board-kachel.md))
- Datum: 2026-08-27
- Bereich: domäne, backend, frontend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Die Stream-Kachel im Board-System ([ADR-0094](0094-stream-overlay-als-board-kachel.md)) mit sieben Modi und Chroma-Grün reichte für einen ernsthaften Livestream mit Regie nicht. Wer streamt, bedient Kameras und Schnitt im Mischer (Wirecast, OBS) und braucht eine Automatik, in die man gezielt eingreifen kann. Außerdem froren Sichtbarkeits-Gates die Aufnahmequellen im Mischer ein: eine Browser-Quelle meldet ihr Dokument dauerhaft als verdeckt, obwohl sie aktiv aufnimmt, und `requestAnimationFrame` läuft dort nie.

## Entscheidung

**Modul und Rechte**
- Eigenes Modul `app/stream/` nach dem Muster von `liveDashboard` mit den Tabellen `stream_scene`, `stream_scene_graphic` (unique je Szene und Typ; Anker-Platz, Größe, `settings` als jsonb) und `stream_override` (V202608271000). `AUTO` heißt „keine Zeile"; Overrides tragen `expires_at` und liegen in der Datenbank, damit ein Neustart keine Regie vergisst.
- Rechtepaar `READ STREAM` / `UPDATE STREAM` (Ressource `STREAM` in `Privilege.kt`); `UPDATE EVENT` gilt weiter mit. Neue Privilegien erreichen nur die Admin-Rolle ([ADR-0010](0010-privilegien-action-resource-scope.md)).
- Mehrere Szenen je Veranstaltung, jede mit eigener URL und Szenen-Token als drittem Ziel in `timing_device_token` ([ADR-0088](0088-timing-websocket-und-geraete-token.md)). Szenen-Verwaltung unter `/streamScenes`, Regie unter eigener Route.

**Der Server entscheidet, was on air ist**
- `StreamSceneResolver` ist rein funktional: Platz-Prioritäten `RESULT > LAPS > STARTLIST > NEXT_UP`, der jüngere `FORCED_ON` gewinnt. Regie-Stufe: Automatik als Grundzustand, je Grafik `Auto | An | Aus` mit optionaler Laufwahl und Auto-Out-Timer.
- Der Resolver respektiert eine fremde Klärung ([ADR-0070](0070-laufzustaende-preparing-running-klaerung.md)). `FORCED_ON` auf einen nicht auflösbaren Lauf blendet aus, statt still auf Automatik zu fallen: falscher Inhalt wäre schlimmer als keiner.
- Bühne und Regie hören auf denselben Push-Kanal `/api/ws/event/{eventId}/stream/{sceneId}` (`StreamSceneBroadcaster`, Board-Muster) und zeigen per Konstruktion denselben Stand. Timer arbeiten mit dem nächsten fälligen Zeitpunkt, nicht im Sekundentakt.
- Ein Endpunkt `GET …/stream/matches` liefert beendete, laufende und anstehende Läufe unabhängig von der öffentlichen Ergebnis-Sichtbarkeit.

**Darstellung**
- Szenen sind transparente 1920×1080-Flächen: Alpha als Normalfall, Chroma-Farbe als Option, kein Fill+Key-Doppelausgang. Auch Füllszenen sind transparent.
- Anker-Plätze statt Pixel-Freiheit: nur designte Plätze je Grafiktyp, kein Feinversatz; Platzierung in der Verwaltung, nicht in der Regie. Ein- und Ausblendungen gehören dem Client.
- Die Datenaufbereitung der Boards wird wiederverwendet; es gibt keine zweite.

**Herzschlag-Kanal**
- Der Broadcaster sendet einen inhaltslosen Herzschlag-Rahmen im festen Takt (20 s), ohne je einen Stand neu aufzulösen; eine ruhige, gesunde Szene ist damit von einer gestörten Verbindung unterscheidbar. Bleibt das Lebenszeichen aus, friert die Szene neue Einblendungen ein.
- Eingehende Stände werden sofort angewendet, nie bei `document.hidden` zurückgestellt (`dispatchStreamSceneFrame`, getestet). Uhr und Übergänge haben Intervall- und Timeout-Fallbacks; verdeckt springen Übergänge in den Endzustand. Compositing-Hinweise (`willChange`) statt eines wirkungslosen Blur-Filters.

## Verworfene Alternativen

- **Weiterbau im Board-System:** Regie, Rechte und Token passten nicht in eine Kachel; die alte Kachel bleibt bis nach dem Regattatag stehen.
- **Fill+Key-Doppelausgang:** Alpha genügt modernen Mischern.
- **Preview/Programm-Umschaltung und Multiviewer:** macht der Mischer.
- **Frei ziehbarer Layout-Editor mit Feinversatz:** zerstört die Bildsprache; Anker-Plätze.
- **Sichtbarkeitsabhängiges Zurückstellen von Ansichten:** friert Aufnahmequellen ein.
- **Auto-Inhalt bei `FORCED_ON` ohne auflösbaren Lauf:** falscher Inhalt.
- **Nicht in v1:** Broadcast-Verzögerung je Ausgang (eigenes Ticket), Rennverlaufsbalken, Head-to-Head, Bedingungen-Einblendung, Steckbriefe, Sponsorenrotation, Kommentatoren-Ansicht, Streckenbild für Token-Szenen.

## Konsequenzen

- Zwei Overlay-Welten (`board/streamOverlay/*` und `event/stream/graphics/*`) bis zum Rückbau der Kachel; Änderungen an der Bildsprache betreffen nur die neue.
- Overrides mit `expires_at` müssen ablaufen; ein hängender Override zeigt nach dem Neustart weiter „An". Das ist gewollt, verlangt aber Aufmerksamkeit in der Regie.
- Der Herzschlag ist Verkehr auf jeder offenen Szene, auch ohne Änderungen.
- Der Resolver liegt einmal auf dem Server; wer im Client „ein bisschen mitentscheidet", bricht die Garantie, dass Regie und Bühne dasselbe zeigen.
- Weitere Runden bauen darauf auf: Designsystem und Regie-Board ([ADR-0096](0096-livestream-grafiken-designsystem-regie-board.md)), Sequenz-Sync ([ADR-0097](0097-zeitnahme-livestream-sync-eine-sequenz-rechnung.md)). Der Wirecast-Handtest (`docs/stream-handtests-wirecast.md`) war zum Zeitpunkt der Rekonstruktion offen.

## Quellen

- Commits: `16477d2a` (Spec), `c108b85d` (Plan), `6b21ed0b` (Tabellen und Token-Ziel, V202608271000), `95f20631` (Check-Constraints), `3f67752f` (Rechtepaar), `aead60cc` (Begriffe und DTOs), `c23ecc14` (Resolver), `f30669be` (fremde Klärung), `1e2107cb` (Verwaltung, Regie-Eingriffe, Token), `aa7aa99b` (API), `8c0a94a9` (Szenen-Kanal), `152436f7` (Widerruf, Constraint, Regie-Fallback), `d5f77782`, `ebe9db67` (Herzschlag), `32bde499` (verdeckter Aufnahme-Tab), `16d31b9a` (Animationen verdeckt), `b28ffee6` (Übergänge)
- Migrationen: `V202608271000__stream_scene.sql`
- Specs: `docs/superpowers/specs/2026-08-27-livestream-overlay-design.md`, `docs/superpowers/plans/2026-08-27-livestream-overlay.md`, `docs/stream-handtests-wirecast.md`
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/stream/`, `frontend/src/components/event/stream/streamScenePush.ts`
- Verwandte ADRs: [ADR-0010](0010-privilegien-action-resource-scope.md), [ADR-0070](0070-laufzustaende-preparing-running-klaerung.md), [ADR-0078](0078-board-system-ersetzt-info-ansichten.md), [ADR-0088](0088-timing-websocket-und-geraete-token.md), [ADR-0094](0094-stream-overlay-als-board-kachel.md), [ADR-0096](0096-livestream-grafiken-designsystem-regie-board.md), [ADR-0097](0097-zeitnahme-livestream-sync-eine-sequenz-rechnung.md)
