# ADR-0093: Postenverwaltung und Renntag-Einstieg über den Reiter „Betrieb" mit einer Kachel je Rolle; die Boards-Seite als Ort verworfen

- Status: angenommen
- Datum: 2026-08-21
- Bereich: frontend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Die Zeitnahme-Spec plante einen eigenen Veranstaltungsbereich „Posten" als gemeinsamen Einstieg für alle Vor-Ort-Rollen (Zeitnahme-Boards, Schiedsrichter, später Sprecherin und Livestream) mit Vollbild-Arbeitsansichten ohne App-Chrome. Als das Modul auf den Sammelzweig traf, war das Board-System ([ADR-0078](0078-board-system-ersetzt-info-ansichten.md)) inzwischen gebaut, und die Postenverwaltung brauchte einen Ort. Sie wanderte zunächst auf die Boards-Seite und wurde dort nicht gefunden.

## Entscheidung

- Die Veranstaltungsseite bekommt neben dem Zeitplan den Reiter „Betrieb" (`frontend/src/pages/event/tabs/BetriebTab.tsx`, Kachel-Logik in `betriebTiles.ts`). Er ist der eine Renntag-Einstieg.
- Eine Kachel je Rolle: Schiedsrichter, Sprecher, Zeitnahme, Helfer, öffentliche Anzeigen (Board-Verwaltung) und Livestream (Szenen-Seite `/streamScenes`). Die Sichtbarkeit einer Kachel folgt den Rechten der Ziele hinter ihr; ohne sichtbare Kachel gibt es keinen Reiter.
- Anzeigen und Livestream sind seit dem 31.08. getrennte Kacheln, weil zwei Aufgaben mit zwei Rollen hinter einer Tür lagen und Stream-Rollen ihre Szenen unter dem Boards-Recht nicht fanden.
- Die Postenverwaltung liegt hinter der Zeitnahme-Kachel. Die Verlegung auf die Boards-Seite ist bewusst rückgängig gemacht und an beiden Stellen im Code kommentiert, damit niemand sie wiederholt.
- Der Schiedsrichter-Eintrag ist nur additiv: die bestehende Schiedsrichter-Kachel und ihr Rechte-Gating bleiben, wie sie sind.

## Verworfene Alternativen

- **Eigener „Posten"-Tab an der Veranstaltung** (Spec vom 17.08.): zu nah am Zeitnahme-Modul gedacht; die Rollen sind breiter.
- **Boards-Seite als Ort der Postenverwaltung** (cdd5fbc7): dort suchte niemand nach Posten; mit 19b42bff zurückgenommen.
- **Eine gemeinsame Kachel für Anzeigen und Livestream:** getrennt mit d0679c5b.
- **Entfernen der bestehenden Schiedsrichter-Karte:** hätte Nutzer mitten im Übergang gebrochen.
- **Lockerung des Gatings für Nutzer mit nur Wettkampf-Check-Rechten:** nicht Teil der Konsolidierung.

## Konsequenzen

- Jede neue Renntag-Rolle bekommt eine Kachel in `betriebTiles.ts` und eine Rechteprüfung; ohne Rechte-Regel erscheint sie nicht.
- Der Reiter verschwindet für Nutzer ohne passende Rechte vollständig; das ist gewollt, überrascht aber beim Handtest mit schwachen Rollen.
- Die Helfer-App hat ihren eigenen, scan-zentrierten Einstieg ([ADR-0099](0099-helfer-app-scannen-zuerst.md)); „Betrieb" ist der Einstieg der Verwaltung, nicht des Smartphones.
- Zwei Kommentare im Code markieren den Rückweg auf die Boards-Seite als Sackgasse; wer sie löscht, öffnet die Diskussion erneut.

## Quellen

- Commits: `043650d7` (Schiedsrichter-Eintrag in der Posten-Auswahl), `cdd5fbc7` (Postenverwaltung auf die Boards-Seite), `19b42bff` (Betrieb-Reiter, eine Kachel je Rolle), `d0679c5b` (Anzeigen und Livestream getrennt)
- Specs: `docs/superpowers/specs/2026-08-17-timing-module-design.md` („Posten concept"), `docs/superpowers/plans/2026-08-18-timing-armed-mode-and-posten.md` (Task 5)
- Code: `frontend/src/pages/event/tabs/BetriebTab.tsx`, `frontend/src/pages/event/tabs/betriebTiles.ts`
- Verwandte ADRs: [ADR-0058](0058-schiedsrichter-dashboard-eigene-ressource-nutzlast.md), [ADR-0078](0078-board-system-ersetzt-info-ansichten.md), [ADR-0086](0086-veranstaltungsmodus-zeitplan-split-und-hinweisbanner.md), [ADR-0095](0095-eigene-stream-domaene-server-entscheidet-on-air.md), [ADR-0099](0099-helfer-app-scannen-zuerst.md)
