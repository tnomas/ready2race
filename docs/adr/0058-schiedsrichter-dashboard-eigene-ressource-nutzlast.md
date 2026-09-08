# ADR-0058: Schiedsrichter-Live-Dashboard als eigene Ressource mit Privileg; Nutzlast statt Takt (gzip, ETag, Crew-Endpunkt); Notizen append-only; Einstellungen geräte-lokal

- Status: angenommen
- Datum: 2026-07-29
- Bereich: api, backend, frontend, betrieb
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Schiedsrichter am Steg brauchen mobil alle prüfrelevanten Informationen (Rechnung, Teilnahmebedingungen, Zeiten, laufende und anstehende Läufe) ohne Zuruf der Regie und ohne Zugriff auf die Veranstaltungsverwaltung. Die öffentliche Kiosk-Anzeige darf keine sensiblen Daten tragen. Die erste Fassung pollte rund 100 KB alle paar Sekunden, etwa 200 MB je Schiedsrichter über drei Regattastunden, weil jede Mannschaft ihre komplette Crew samt Anforderungen und Zeitstempeln mitschickte.

## Entscheidung

1. **Eigenes Modul, eigenes Privileg, ein Poll-Request.** Package `app/liveDashboard/` mit `Privilege.Resource.LIVE_DASHBOARD` (READ/UPDATE, GLOBAL); ein aggregierter Endpunkt `GET /event/{eventId}/liveDashboard` liefert alles in einer Antwort; Match-Abfragen aus `CompetitionMatchRepo` werden wiederverwendet, nicht dupliziert. Kiosk und Dashboard koexistieren; die öffentlichen `eventInfo`-Endpunkte bleiben frei von sensiblen Daten. Wer `UPDATE LIVE_DASHBOARD` ohne `UPDATE EVENT` hat, darf Rennslots entfallen lassen, aber keine Programmpunkte (Pausen, Siegerehrungen).
2. **Nutzlast statt Takt.** Der Poll-Takt bleibt bei 10 s; verkleinert wird die Antwort: gzip für alle HTTP-Antworten (Ktor-Plugin in `plugins/HTTP.kt`, Ausnahmen für PDF, xlsx, zip, octet-stream und Antworten unter 1 KB; gemessen 1849 B → 655 B). `participants` fliegt aus dem Listen-DTO, ersetzt durch Zähler (`requirements`, `substituted`); ein Detail-Endpunkt `…/match/{matchId}/team/{teamId}` liefert die Crew erst beim Öffnen des Dialogs. Die Antwort ist ETagged (`ApiResponse.ETagged`, Hash über den serialisierten Rumpf, 304 ohne Body); `scope=LIVE|ALL` beschränkt den Live-Reiter auf laufende Läufe. Felder, die sich ständig ändern, aber nicht angezeigt werden (`raceclocker_polled_at`), bleiben aus dem DTO, damit das ETag greift.
3. **Verbindungsverlust ist sichtbar:** Ein „veraltet"-Hinweis erscheint auch bei Connection refused (`onPanic`). Fehler nennen dem Steghelfer den Grund statt „konnte nicht geändert werden" (ErrorCode-Muster, ADR-0011).
4. **Schiedsrichter-Notizen sind append-only** (`match_team_notes`, V202608111400): Kommunikation, nicht Wertung, bewusst getrennt von `failed_reason` und Check-in-Notizen. Einträge sind unveränderlich (Korrektur = löschen und neu), daher kein Locking; Adressierung über `competition_match_team`. Sie reisen nur im gepollten `LiveDashboardDto`, nie in öffentlichen Endpunkten. Löschen verlangt dasselbe Privileg wie andere Schiedsrichter-Aktionen und ist nicht auf den Autor beschränkt (der ist womöglich auf dem Wasser).
5. **Alle Einstellungen des Dashboards sind geräte-lokal** (`deviceSettings.ts`, localStorage plus Window-Event zur Tab-Synchronisation, ein gemeinsames `SettingsPopover` für Zeitplan und Dashboard). Veranstaltungs-Einstellungen (Kettenmodus, Folgerunden, Auto-Refresh) gehören auf den Einstellungen-Reiter der Veranstaltung, nicht ins Popover.
6. **Layout ab `md` (900 px) zweispaltig:** Live und Läufe nebeneinander, immer Scope `ALL` (`dashboardScope(wide, tab)` als reine Funktion), Karten messen sich per Container-Query (`@container (min-width: 480px)`), nicht am Viewport. iPad hochkant bleibt bewusst in der Handy-Ansicht.

## Verworfene Alternativen

- Erweiterung der öffentlichen `eventInfo`-Endpunkte um sensible Daten: verworfen, Abgrenzungstabelle in der Spec §2.
- Poll-Takt erhöhen oder Detaildaten im Dialog mitpollen: verworfen zugunsten der kleineren Nutzlast.
- ETag über `max(updated_at)`: müsste jede Tabelle erfassen und wäre bei Löschungen still falsch; deshalb Hash über den Rumpf.
- Manueller „Start"-Knopf auf der Laufkarte (`beba5b33`): entfernt, der echte Start kommt aus der Zeitnahme; am 09.08. als Bestätigungsknopf „Läuft" neu verdrahtet (ADR-0070).
- Editierbare Notizen und Autor-Bindung beim Löschen: verworfen.
- Abschnitt „Dieses Gerät" und die Einstellung `live_dashboard_critical_checks_only`: entfielen zugunsten einer Fußzeile und „Prüfungen anzeigen" (Key nie veröffentlicht).
- Veranstaltungs-Einstellungen im Popover (`8ec4de7c`, `72355add`): auf den Einstellungen-Reiter verschoben (`29692285`).
- Ausgeschriebene Vereinsnamen oder Statuslabel auf breiten Schirmen: Kurzformen sind fachlich gewollt.
- Zweite Aktivierungskette im Dashboard (`activateNext`): ersatzlos entfernt (ADR-0064).

## Konsequenzen

- Das Privileg `LIVE_DASHBOARD` erreicht beim Ausrollen nur die Admin-Rolle; die Rolle „Schiedsrichter:in" in Produktion musste von Hand nachgezogen werden (ADR-0010). Deshalb vermeiden Folgeentwürfe neue Privilegien, wo es geht.
- Wer dem Listen-DTO ein Feld hinzufügt, das sich je Poll ändert, zerstört das ETag; das ist am `raceclocker_polled_at`-Fall dokumentiert.
- Der Fetch-Umfang hängt an der Breite; der ETag-Reset liegt im Effekt auf `scope`, nicht im Klick (sonst zeigt die zweite Spalte kurz alte Daten).
- Notizen werden nie verändert; wer eine Korrektur braucht, löscht und schreibt neu; zwei gleichzeitige Autoren erzeugen zwei Einträge.
- gzip gilt für das ganze Backend; ein neuer komprimierter Dateityp muss in die Ausnahmeliste, sonst wird er doppelt gepackt.
- Das Dashboard blieb die mitlaufende Beobachtungsansicht, während die Wettkampf-Leiste und der Veranstaltungs-Modus (ADR-0086) sich nicht selbst aktualisieren.

## Quellen

- Commits: `4d37cd7e` (Privileg LIVE_DASHBOARD), `2ec433ec`, `d2776692` (aggregierter Endpunkt), `9f4d555f`, `1c53c453` (Seite mit Live- und Laufliste-Reiter), `d4686d14` (veraltet-Warnung), `6ed00563` (Programmpunkte nur Veranstaltungsbüro), `e46d6b30` (Fehlergrund im Dashboard), `48f6509c` / `ed10ee3c` (gzip), `8dcea681` (Nachmessung), `045671f6` (Nutzlast zugeschnitten), `2ea729e7` (Poll-Zeitstempel aus dem ETag), `6f4fa8eb` (Scope-Logik testbar), `f193dc63` (Tablet/Laptop-Layout), `a7681381` (Kürzel-Umschaltung), `f509335e`, `f288bedf`, `046ad8a4`, `3ad46f9c` (Notizen), `ddefde8e`, `72355add`, `8ec4de7c`, `e3aadf66`, `29692285` (Einstellungen)
- Migrationen: `V202608111400__match_team_notes.sql`
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/liveDashboard/`, `…/plugins/HTTP.kt`, `…/calls/responses/ApiResponse.kt` (`ETagged`), `backend/src/test/kotlin/…/plugins/CompressionTest.kt`
- Specs: `docs/superpowers/specs/2026-07-29-live-dashboard-schiedsrichter-design.md` (§2, §4, §5), `docs/superpowers/specs/2026-08-02-live-dashboard-payload-design.md`, `docs/superpowers/specs/2026-08-09-schiedsrichter-board-grossbildschirm-design.md`, `docs/superpowers/specs/2026-07-30-schiedsrichter-dashboard-backlog.md` (A5)
- Verwandte ADRs: [ADR-0009](0009-rate-limiting-im-server.md), [ADR-0010](0010-privilegien-action-resource-scope.md), [ADR-0011](0011-http-fehlersemantik-und-errorcode-muster.md), [ADR-0059](0059-laufzustand-eine-ableitung.md), [ADR-0062](0062-oeffentliche-anzeigen-cache-marker-rate-limit.md), [ADR-0064](0064-aktivierungskette-ganzer-zeitplan.md), [ADR-0069](0069-pruefungsschweregrad-je-wettkampf.md), [ADR-0082](0082-hintergrundaktualisierung-etag-polling-und-push.md), [ADR-0086](0086-veranstaltungsmodus-zeitplan-split-und-hinweisbanner.md), [ADR-0097](0097-zeitnahme-livestream-sync-eine-sequenz-rechnung.md)
