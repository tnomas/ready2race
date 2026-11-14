# ADR-0086: Veranstaltungs-Modus im Zeitplan (Split-Layout) statt zweitem Zeitplan-Zugang; Wettkampfseite mit Rücklink; veranstaltungsweiter Hinweisbanner

- Status: angenommen
- Datum: 2026-08-09
- Bereich: frontend, api
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Beim Funktionstest des Zeitstrahls am 2026-08-04 fiel auf, dass von einem Wettkampf kein Weg zurück zur Veranstaltung führt außer über das Seitenmenü (Backlog C5, bewusst vertagt). Am Regattatag springt man ständig zwischen Zeitplan und Wettkampf. Ein erster Wurf gab der Wettkampfseite eine Seitenleiste mit Umschalter „Rennen | Zeitplan"; der Test sollte entscheiden, ob dieser zweite Zeitplan-Zugang taugt. Parallel sollte eine Wetterwarnung auf jeder öffentlichen Anzeige und dem Schiedsrichter-Dashboard erscheinen.

## Entscheidung

1. **Wettkampfseite mit Rücklink und Rail.** Kopfzeile mit Rücklink zur Veranstaltung, einklappbare Rail mit den Rennen (Zustand im `localStorage`, unter 1200 px als Drawer); der aktive Tab reist beim Rennwechsel mit, Rückfall auf „Allgemein". Die Rail aktualisiert sich nicht selbst – das Live-Dashboard bleibt die Sicht, die mithält.
2. **Veranstaltungs-Modus im Zeitplan-Tab** (2026-08-12). Der geräte-lokale Schalter `schedule_event_mode` (`frontend/src/components/event/deviceSettings.ts`) schaltet den Zeitplan-Tab in ein Split-Layout: Zeitplan links (~40 %), Durchführung des angeklickten Wettkampfs rechts (~60 %). Dafür ist der Execution-Teilbaum einbettbar (IDs als Props mit Route-Rückfall, `useCompetitionScope`), und der RootLayout-Container legt seine xl-Beschränkung per Kontext ab. Unterhalb `lg` fällt der Modus zurück. Aktionen rechts lösen entprellt (500 ms) den Zeitplan-Reload links aus.
3. **Der zweite Zeitplan-Zugang entfällt.** Der Umschalter „Rennen | Zeitplan" in der Wettkampf-Leiste, `CompetitionScheduleRail` und der Schlüssel `competition_nav_mode` wurden ausgebaut (Nutzerentscheidung 12.08.); in `CompetitionNavigation.tsx` steht nur noch der Hinweis auf den Vorgänger.
4. **Veranstaltungsweiter Hinweisbanner.** `event.notice_text` und `notice_severity` (`V202608111700__event_notice.sql`; Check auf INFO/WARNING/CRITICAL und Paarung: beide gesetzt oder beide leer). Eigener `PUT /event/{eventId}/notice` nach dem Muster der Zeitnahme-Konfiguration – setzen heißt beide Felder, löschen heißt beide null. Der Hinweis reist in `MyEventDto`, `BoardViewDto`, `LiveDashboardDto` und den Live-Matches, die dafür zu einem Envelope `LiveMatchesDto` wurden; ein gemeinsames Banner-Bauteil zeigt ihn.

## Verworfene Alternativen

- Zurück-Button und Breadcrumbs am 04.08.: bewusst vertagt, später durch Rücklink und Rail erledigt.
- Selbstaktualisierung der Rail (`3dae7d26`): das Live-Dashboard ist die mitlaufende Sicht; die Zeitplan-Liste bekam am 11.08. dennoch eine Auto-Aktualisierung alle 30 s bei sichtbarem Tab.
- Eigener Ort im Router für die Regie-Ansicht: Umbau an elf Dateien, darunter Durchführung und Auswechslungen; als Frage an den Test gegeben und nicht gemacht.
- Zweiter Zeitplan-Zugang in der Wettkampf-Leiste: ausgebaut.
- Pflege des Hinweises über das große Event-Update: ein kleiner dedizierter PUT stattdessen.

## Konsequenzen

- Der Split-Modus ist ein Geräte-Schalter; er darf niemanden festnageln und fällt auf kleinen Bildschirmen stumm zurück.
- Weil der Execution-Teilbaum einbettbar ist, dürfen seine Komponenten die Route nicht mehr als einzige Quelle für IDs annehmen.
- Jede gepollte Antwort, die auf einer Anzeige landet, muss den Hinweis tragen; neue Anzeige-DTOs müssen ihn aufnehmen.
- Die Auto-Aktualisierung des Zeitplans (30 s) läuft neben dem Push-Kanal (ADR-0082); beide sind zu pflegen.

## Quellen

- Commits: `84be823c`, `3dae7d26`, `d5af2667` (Rücklink, Rail); `37110c69`, `59fa03d4` (Umschalter, erster Wurf); `f7b4822c`, `5b57733a`, `335c0792`, `8e5235fb`, `49eada52` (Veranstaltungs-Modus, Ausbau); `f1bbc5fc` (Hinweisbanner)
- Migrationen: `V202608111700__event_notice.sql`
- Code: `frontend/src/components/event/deviceSettings.ts` (`SCHEDULE_EVENT_MODE_KEY`), `frontend/src/components/event/competition/CompetitionNavigation.tsx`
- Specs: `docs/superpowers/specs/2026-08-10-testfaelle-wettkampf-navigation.md`, `docs/superpowers/specs/2026-07-30-schiedsrichter-dashboard-backlog.md` (C5), `docs/testkatalog-11-08.md`
- Verwandte ADRs: [ADR-0058](0058-schiedsrichter-dashboard-eigene-ressource-nutzlast.md), [ADR-0063](0063-zeitstrahl-slots-feste-uhrzeit-import.md), [ADR-0067](0067-zeitnahme-konfiguration-je-wettkampf-vererbt.md), [ADR-0076](0076-mein-event-band-qr-ohne-anmeldung.md), [ADR-0078](0078-board-system-ersetzt-info-ansichten.md), [ADR-0082](0082-hintergrundaktualisierung-etag-polling-und-push.md)
