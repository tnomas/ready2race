# ADR-0098: Sprecher-Board als Drei-Spalten-Dashboard mit Push und festem Poll-Sicherheitsnetz; Standalone-Demo-Build

- Status: angenommen
- Datum: 2026-08-16
- Bereich: frontend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Die Sprecherinnen brauchten Tagesprogramm, Startlisten, Ergebnisse, Mehrfachstarts und Athletendetails an einem Ort. Die erste Fassung vom 16.08. bot Reiter und verschachtelte Dialoge; beim Ansagen im Betrieb störte jeder Dialog, und ein Nutzer-Regler für den Aktualisierungstakt lud dazu ein, den Server zu belasten oder Stände zu verpassen. Nach dem Zeitnahme-Modul sollte die Sprecherin außerdem die Echtzeit-Lage der Zeitnahme sehen.

## Entscheidung

- Öffentliche Route `/speaker` mit Veranstaltungswahl und `/speaker/event/$eventId` (`frontend/src/pages/speaker/SpeakerBoardPage.tsx`) als dunkles Vollbild-Board mit geräte-lokalen Einstellungen (Farbschema, Größe, Warnschwelle für kurze Wendezeiten).
- Seit dem 31.08. drei stehende Spalten: Programm und Ergebnisse, Laufdetails mit Live-Fortschritt, Echtzeit-Lage der Zeitnahme mit stummem Countdown (`SequenceCountdown` mit `tonePlan={[]}`), Fehlstart-Banner und Einlauf-Ticker; dazu ein Athlet:innen-Panel, „Live folgen" und der Zeitstrahl als einklappbarer Streifen. Die Zeitnahme kommt über die Leitstand-Hooks, Boote werden über die Startnummer verheiratet.
- Läufe in Klärung ([ADR-0070](0070-laufzustaende-preparing-running-klaerung.md)) sind sichtbar (Gold), zählen aber nicht als live; der Running-Endpunkt liefert sie nur auf ausdrückliche Bestellung (`includeClarification`).
- Aktualisierung: Event-Push plus Timing-Kanal ([ADR-0082](0082-hintergrundaktualisierung-etag-polling-und-push.md), [ADR-0088](0088-timing-websocket-und-geraete-token.md)); Polling ist ein festes Sicherheitsnetz mit `POLL_BASE_MS = 30_000`, gestreckt bei stehender Push-Verbindung. Der Nutzer-Regler entfällt.
- Standalone-Demo-Build: `npm run build:demo` (`vite.demo.config.ts`) erzeugt eine Vorschau ohne Backend zum Abstimmen mit den Sprecherinnen.

## Verworfene Alternativen

- **Reiter und verschachtelte Dialoge** (fcff4400, e88d93f7): durch das Dashboard ersetzt; `SpeakerMatchDialog` und Verwandte gelöscht.
- **Nutzer-Regler für den Takt:** entfernt mit af6b4476; Push und festes Netz.
- **Sprecher-Board als Teil des Board-Systems:** die Sprecherin bedient interaktiv, Boards sind passive Anzeigen ([ADR-0078](0078-board-system-ersetzt-info-ansichten.md)).
- **Läufe in Klärung als live zählen:** würde die Sprecherin zu Ansagen verleiten, die nicht gelten.

## Konsequenzen

- Drei Spalten brauchen Breite; das Board ist für Laptop oder Monitor gedacht, nicht für das Smartphone.
- Die Zeitnahme-Spalte hängt an denselben Hooks wie der Leitstand; Änderungen dort erreichen die Sprecherin ungefragt.
- Die Heirat über die Startnummer setzt voraus, dass Startnummer und Bahn dieselbe Zahl sind ([ADR-0081](0081-kurzbezeichner-kennung-kuerzel-sportneutral.md)); Team-Ids der Zeitnahme sind nicht die Team-Ids der Meldung.
- Der Demo-Build ist ein zweites Vite-Ziel, das beim Umbau von Komponenten mitbrechen kann; er ist nicht Teil des Standard-Builds.

## Quellen

- Commits: `fcff4400` (erstes Sprecher-Board), `e88d93f7` (Athletendialog, lokale Einstellungen), `b1f57fea` (Standalone-Vorschau), `ea87707f` (Merge), `89422c21` (Drei-Spalten-Dashboard), `af6b4476` (Klärungen sichtbar, Regler entfällt)
- Code: `frontend/src/pages/speaker/SpeakerBoardPage.tsx`, `frontend/src/components/speaker/speakerData.ts`, `frontend/vite.demo.config.ts`
- Verwandte ADRs: [ADR-0070](0070-laufzustaende-preparing-running-klaerung.md), [ADR-0078](0078-board-system-ersetzt-info-ansichten.md), [ADR-0081](0081-kurzbezeichner-kennung-kuerzel-sportneutral.md), [ADR-0082](0082-hintergrundaktualisierung-etag-polling-und-push.md), [ADR-0093](0093-betrieb-reiter-als-renntag-einstieg.md), [ADR-0097](0097-zeitnahme-livestream-sync-eine-sequenz-rechnung.md)
