# ADR-0045: Öffentliche Ergebnisseite mit Live-Tab; Ergebnisfreigabe je Veranstaltung (Vorgabe: nur beendete Läufe) als einziges Tor

- Status: angenommen
- Datum: 2025-08-14
- Bereich: frontend, api, domäne
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Teilnehmende und Publikum sollen Ergebnisse ohne Anmeldung sehen. Upstream baute dafür im August 2025 eine öffentliche Ergebnisseite mit Live-Tab. Am Regattatag 2026 zeigte sich das eigentliche Problem: ein vollständig gewerteter, aber nicht formal beendeter Lauf erschien öffentlich bereits als Ergebnis, obwohl noch eine Zeitstrafe kommen konnte. Ein veröffentlichtes Ergebnis, das sich danach ändert, ist fotografiert und geteilt, bevor es korrigiert wird. Gleichzeitig sollte die Seite den Laufzustand genauso zeigen wie Schiedsrichter-Dashboard und Boards, ohne die Datenbank je Zuschauer zu treffen.

## Entscheidung

- **Öffentliche Routen** `/results` (Veranstaltung wählen, Wettkämpfe mit Ergebnissen, Live-Tab, Match-Dialog), erreichbar per QR-Code; eigener Endpoint „Wettkämpfe mit Match-Ergebnissen". Ist die API unerreichbar, zeigt das Frontend eine Panic-Seite. Seit 2026-08-13 gibt es zusätzlich einen Zeitplan-Tab, einen Feed „jüngste Ergebnisse" und teilbare Einstiege `?tab=live` und `?competition=`; Unbekanntes fällt auf den Default.
- **Ergebnisfreigabe je Veranstaltung**: `event.public_results_visibility` (Migration `V202608061210__event_public_results_visibility.sql`) mit `FINISHED_ONLY` (nur Läufe mit `finished_at`) oder `RESULTS_COMPLETE` (zusätzlich Läufe im Zustand `AWAITING_FINISH`, also alle Boote gewertet, aber niemand hat beendet). Vorgabe ist `FINISHED_ONLY`, bewusst **ohne Backfill** auf das alte Verhalten, auch für Bestandsveranstaltungen.
- **Diese Einstellung ist das einzige Tor.** Der Schutz gegen unveröffentlichte Ergebnisse hängt an der SQL-Auswahl und an ergebnisfeldlosen DTOs, nicht an einem Filter im Frontend. Der öffentliche Zeitplan-Endpunkt nutzt den Programm-Builder der SCHEDULE-Boards bewusst ohne Aufstellungen und Ergebnisse, damit keine zweite Sichtbarkeitsregel entsteht.
- **Live-Tab mit eigenem, gecachtem Endpunkt**: `GET /event/{id}/info/live-matches?limit=` (`eventInfo.kt`) liefert laufende und anstehende Läufe zusammen; `LiveMatchesLogic.merge` ordnet aktivierte vor anstehende, deckelt über das Ganze und lässt bei Doppelung den aktivierten gewinnen. Der Endpunkt ist wie das Board gecacht ([ADR-0062](0062-oeffentliche-anzeigen-cache-marker-rate-limit.md)). Nicht erstellte Runden bekommen einen Platzhalter statt einer leeren Karte; der Wortlaut für `PREPARING` deckt sich mit Dashboard und Board; überfällig-Labels entfallen, abgesagte Läufe werden durchgestrichen.
- Ein Zeitnahme-Rennen mit Zuordnung zu Wettkämpfen darf nicht gelöscht werden (`RACECLOCKER_RACE_STILL_ASSIGNED`); stilles Abhängen per `SET NULL` ist verworfen.

## Verworfene Alternativen

- **Freigabe als Filter je Anzeige** (`info_view_configuration.filters`): verworfen, weil `/latest-match-results` auch die öffentliche Ergebnisseite ohne View-Konfiguration bedient; die Regel muss am Event sitzen.
- **Unterdrücken der Doppelanzeige** („Aktueller Lauf" und „Letztes Ergebnis" gleichzeitig): verworfen; nicht die Doppelsichtbarkeit, sondern der Zeitpunkt war das Problem.
- **Schalter an `running-matches`** statt eigener Endpunkt: verworfen, weil `running-matches` auch den `running`-Block der Athletenanzeige speist.
- **Neue `MatchState`-Werte, neue Statusableitung, Eingriff in `PublicResultsVisibility`** im Zuge des Live-Tabs: ausdrücklich nicht Gegenstand ([ADR-0059](0059-laufzustand-eine-ableitung.md)).
- **Links auf noch nicht existierende Seiten** („coming soon"): entfernt (`40a2ad51`).

## Konsequenzen

- Preis der Vorgabe `FINISHED_ONLY`: Läufe, die vollständig gewertet, aber nie formal beendet wurden, verschwinden aus den öffentlichen Ergebnissen, bis sie beendet werden oder die Veranstaltung auf `RESULTS_COMPLETE` umgestellt wird. Der Beenden-Klick des Schiedsrichters ([ADR-0061](0061-lauf-endet-nur-durch-aktiven-input.md)) ist damit Teil der Veröffentlichung.
- Jede neue öffentliche Ansicht muss über dieselbe SQL-Auswahl gehen; wer Ergebnisse in ein DTO aufnimmt, das öffentlich ausgeliefert wird, öffnet ein zweites Tor.
- Die Aktivierungskette bleibt unberührt; `ChainSlot` kennt nur `finished_at` ([ADR-0064](0064-aktivierungskette-ganzer-zeitplan.md)).
- Die Website des Veranstalters kann direkt auf `?tab=live` verlinken; Änderungen an diesen Query-Parametern brechen externe Links.

## Quellen

- Commits: `a7588f19` (Results view), `cf139ab2` (Live-Tab), `40071e97` (Endpoint Wettkämpfe mit Ergebnissen), `812894dc`, `9fbbfe40` (Panic-Seite), `a6f4c10d`, `9f0a8e2e`, `40a2ad51` (coming soon entfernt), `af5465a3` („awaiting finish", Freigabe), `fe5a9a43`, `33070972`, `d70635a5`, `f7116be6` (eigener Live-Endpunkt), `88540591`, `797c9796` (Cache), `35446229`, `92edc556`, `85407386`, `3028e71c`, `16c978ef` (`?tab=live`), `9f84e6cd` (Zeitplan-Tab, teilbare Links), `e5052776`
- Migrationen: `V202608061210__event_public_results_visibility.sql`
- Specs: `docs/superpowers/specs/2026-08-09-einheitlicher-laufstatus-oeffentlich-design.md`, `docs/superpowers/specs/2026-08-05-testkatalog-crf-2026.md` (A23/A24)
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/eventInfo/boundary/eventInfo.kt`, `app/eventInfo/boundary/LiveMatchesLogic.kt`
- Verwandte ADRs: [ADR-0009](0009-rate-limiting-im-server.md), [ADR-0059](0059-laufzustand-eine-ableitung.md), [ADR-0061](0061-lauf-endet-nur-durch-aktiven-input.md), [ADR-0062](0062-oeffentliche-anzeigen-cache-marker-rate-limit.md), [ADR-0064](0064-aktivierungskette-ganzer-zeitplan.md), [ADR-0070](0070-laufzustaende-preparing-running-klaerung.md), [ADR-0078](0078-board-system-ersetzt-info-ansichten.md)
