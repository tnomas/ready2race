# Backlog: Schiedsrichter-Dashboard & Zeitplanung

**Stand:** 2026-07-30
**Status:** Sammlung zum Brainstormen — nichts davon ist entschieden oder umgesetzt.
**Kontext:** Entstanden am Ende der Session, in der das Schiedsrichter-Dashboard, Teilergebnisse,
Zeitstrafen und die Lauf-Kette gebaut wurden (siehe
`2026-07-29-live-dashboard-schiedsrichter-design.md`).

Wo RaceClocker eine Rolle spielt, stützen sich die Aussagen auf die Mail-Korrespondenz mit Cees
(Juni–Juli 2026): Startzeiten gehören in den Wave-Namen, versteckte Teilnehmer-IDs gibt es nur für
Integrationspartner, und Inhalte in „Extra info" sind für Endnutzer sichtbar.

Jeder Punkt hat drei Teile: **Wunsch** (was gesagt wurde), **Ausgangslage** (was heute im Code
existiert, damit die Recherche nicht neu anfängt) und **Offene Fragen** (was beim Brainstormen zu
entscheiden ist).

---

## A. Anpassungen am bestehenden Ablauf

### A1. Ergebnis-Eingabe: „Speichern" vs. „Speichern und Lauf inaktiv setzen"

**Wunsch:** Beim Eintragen eines Ergebnisses in der Web-UI soll man zwischen „Speichern" und
„Speichern und Lauf inaktiv setzen" wählen können. Damit beendet der Schiedsrichter das Rennen
aktiv aus der Ergebnis-Maske heraus.

Zusatzgedanke: Ein Flag, dass ein Schiedsrichter sein OK für den Lauf gegeben hat — danach ist das
Ergebnis nicht mehr änderbar.

**Ausgangslage:**
- Der Ergebnis-Dialog (`frontend/src/components/event/competition/excecution/CompetitionExecution.tsx`)
  hat heute „Speichern" und „Speichern und Weiter" (`saveAndNext`).
- `prepareForNewPlaces` im `CompetitionExecutionService` setzt `currently_running = false`
  **automatisch, sobald alle Boote ein Ergebnis haben** (Teilergebnis-PR). Ein Teilergebnis lässt
  den Lauf laufen. Ein manueller Schalter wäre also die dritte Variante neben Automatik und dem
  „Lauf beenden"-Button im Dashboard — Überschneidungen prüfen.
- **Prüfen:** `competition_match_team` hat bereits `result_verified_by` und `result_verified_at`.
  Möglicherweise existiert das Freigabe-Konzept in Teilen schon; vor einem neuen Flag klären, wofür
  diese Spalten heute genutzt werden.

**Offene Fragen:**
- Freigabe pro Lauf oder pro Mannschaft (die vorhandenen Spalten sind pro Mannschaft)?
- Wer darf eine Freigabe wieder aufheben — und wird das protokolliert?
- Was passiert bei einem RaceClocker-Pull auf einen freigegebenen Lauf: blockieren oder überschreiben?

### A2. „Läuft seit X Minuten" kollidiert mit dem Begriff „aktiv"

**Wunsch:** Die Anzeige rechnet stumpf ab Startzeit. Im mentalen Modell heißt „aktiv" aber
„bereits gestartet" — beides passt nicht zusammen, weil Schiedsrichter einen Lauf schon in der
Vorbereitung aktiv sehen wollen. Sauber aufräumen.

**Ausgangslage:**
- `currently_running` ist heute ein Boolean und trägt zwei Bedeutungen gleichzeitig: „vom
  Schiedsrichter in Bearbeitung" und „läuft auf dem Wasser".
- `elapsedMinutes` = `Duration.between(startTime, now)`, auf ≥ 0 geklemmt
  (`LiveDashboardService`). Vor der Startzeit steht dort also „0 min".
- Die Kiosk-Anzeige (`EventInfoPage`) nutzt dasselbe Flag.

**Offene Fragen:**
- Zwei getrennte Zustände (z.B. „in Vorbereitung" / „gestartet") oder ein abgeleiteter Zustand aus
  Startzeit + Flag?
- Woher käme der echte Start? Denkbar: RaceClocker liefert pro Teilnehmer eine `Start`-Zeit — daraus
  ließe sich „ist wirklich losgefahren" ableiten. Seit Juli 2026 gibt es dort einen Countdown-Start
  in der Wave-Startliste, der Startzeitpunkt ist also sauber gesetzt.
- Was zeigt das Dashboard vor dem Start statt „Läuft seit 0 min" — Countdown bis Start?

### A3. DNS und DQ zusätzlich zu DNF

**Wunsch:** Bei den Ergebnissen soll es nicht nur DNF geben, sondern auch DNS und DQ. RaceClocker
kann das und liefert es; wir sollen es übernehmen.

**Ausgangslage:**
- Heute gibt es nur `competition_match_team.failed` (Boolean) + `failed_reason` (Freitext).
- Das Dashboard zeigt hart „DNF" (`event.liveDashboard.team.failedShort`).
- Der RaceClocker-Pull (`origin/issue/94`) erkennt den Status bereits: Ein Result-Feld, das keine
  Zeit ist, landet als `noResultReason` — dort stehen genau „DNS", „DNF", „DQ".
- Der Excel-Import macht dasselbe (`timeIsValid`-Logik im `CompetitionExecutionService`).

**Offene Fragen:**
- Enum-Spalte (`DNS | DNF | DQ`) neben `failed`, oder `failed` durch einen Status ersetzen
  (Migration bestehender Daten)?
- Wie werden unbekannte Statustexte aus dem Feed behandelt — als Freitext behalten?
- Zählen DNS-Boote bei der Platzberechnung anders als DNF (Startgeld, Wertung)?

### A4. Beenden mit offenen Ergebnissen: nachfragen

**Wunsch:** Wenn der Schiedsrichter ein Rennen beendet und es noch offene Ergebnisse gibt, soll er
gefragt werden, was mit den restlichen passiert.

**Ausgangslage:**
- Heute nur ein Hinweistext in der Karte („Es fehlen noch Ergebnisse — beenden aktiviert trotzdem
  die nächsten Läufe"), keine Rückfrage. Der „Lauf beenden"-Button hat 5 s Undo.

**Offene Fragen:**
- Welche Optionen bietet der Dialog? Denkbar: alle offenen als DNS/DNF markieren, offen lassen,
  abbrechen.
- Hängt mit A3 zusammen: Die Auswahl braucht die Statuswerte.

### A5. Datenvolumen des Pollings

**Wunsch:** Das Dashboard hat bei 5-Sekunden-Takt in rund drei Stunden etwa 200 MB verbraucht. Das
ist zu viel — insbesondere für Schiedsrichter im Mobilfunknetz. Schlanker machen.

**Ausgangslage (gemessen am 2026-07-30 mit dem Seed-Szenario: 5 Läufe, 30 Mannschaften,
150 Teilnehmer):**
- Eine Antwort von `GET /event/{id}/liveDashboard`: **103.731 Bytes** unkomprimiert.
- Hochgerechnet: 3 h ÷ 5 s = 2160 Abrufe × ~101 KB ≈ **210 MB** — deckt sich exakt mit der
  Beobachtung.
- Dieselbe Antwort **gzip-komprimiert: 4.860 Bytes** — Faktor 21.
- Im Backend ist **keine Kompression installiert** (kein `install(Compression)` in
  `backend/src/main/kotlin/.../plugins/`). Das ist der größte und billigste Hebel.
- Zweitgrößter Posten im Payload: Für **jeden** Teilnehmer jedes Teams jedes Laufs werden alle
  Teilnahmebedingungen mit Zeitstempel, Notiz und Ampel ausgeliefert (im Seed: 150 Personen ×
  3 Bedingungen). Die Liste zeigt davon nur ein Aggregat (ein Ampel-Icon pro Mannschaft); die
  Details braucht erst der Detail-Dialog nach dem Antippen.

**Lösungsideen, grob nach Wirkung:**
1. **gzip aktivieren** (Ktor `Compression`-Plugin) — ~200 MB auf ~10 MB, eine Zeile Konfiguration,
   wirkt für alle Endpoints.
2. **Bedingungen aus dem Listen-Poll nehmen**: pro Mannschaft nur Ampel-Severity und „x von y
   erfüllt" liefern, die Details per eigenem Endpoint beim Öffnen des Dialogs nachladen.
3. **ETag / 304**: Wenn sich seit dem letzten Abruf nichts geändert hat, Antwort ohne Body. Braucht
   ein verlässliches Änderungskriterium (z.B. `max(updated_at)` über die beteiligten Tabellen).
4. **Nur laden, was der Tab braucht**: Der Live-Tab benötigt die laufenden Läufe und den nächsten —
   die vollständige Läufe-Liste könnte seltener oder auf Anforderung geladen werden.

**Offene Fragen:**
- Reicht 1 + 2, oder lohnt der Aufwand für ETags?
- Soll der Standard-Poll-Takt (heute 10 s, konfigurierbar 5/10/30/60 s) angepasst werden?

---

## B. Neue Bausteine

### B1. Athleten-Dashboard an Start und Ziel

**Wunsch:** Ein Dashboard für die Athleten, sichtbar am Start/Ziel. Schlicht: „Aktueller Lauf" und
„Nächster Lauf".

**Ausgangslage:**
- Die öffentliche, rotierende Kiosk-Anzeige gibt es schon: `EventInfoPage`
  (`/event/$eventId/info`) mit den View-Typen `RUNNING_MATCHES`, `UPCOMING_MATCHES`,
  `LATEST_MATCH_RESULTS`, konfigurierbar pro Veranstaltung, ohne Login erreichbar.
- Die Daten kommen aus den öffentlichen `eventInfo`-Endpoints — **ohne** die sensiblen Felder des
  Schiedsrichter-Dashboards (keine Rechnungen, keine Teilnahmebedingungen).

**Offene Fragen:**
- Reicht eine weitere Info-View („Aktuell & Nächster"), oder braucht es eine eigene, sehr reduzierte
  Seite für einen fest montierten Bildschirm?
- Was genau sehen Athleten: Bahn, Team, Startzeit — und Ergebnisse des gerade beendeten Laufs?
- Ein Bildschirm pro Position (Start vs. Ziel) mit unterschiedlichem Inhalt?

### B2. Zeitstrahl als Grundkonzept

**Wunsch (der große Brocken):** Ein Blanko-Zeitstrahl, in dem Läufe *vorbereitet* werden können und
dem ein konkreter Lauf (wie er heute existiert) zugeordnet wird. Die Uhrzeit leitet sich aus dem
Zeitstrahl ab — nicht pro Runde neu setzen. Daran orientiert sich vieles, unter anderem die
Information „das nächste Rennen ist noch nicht gesetzt" — und genau das wird zum **Breakpoint**.

Damit löst sich das Problem, dass zu früh ein Qualifying aktiv gesetzt wird.

**Ausgangslage:**
- Heute hängt die Startzeit am erzeugten Lauf (`competition_match.start_time`) und kann erst
  gepflegt werden, wenn die Runde gesetzt wurde (`createNextRound`). Bis dahin hat der Zeitplan
  Lücken.
- `competition_setup_match.start_time_offset` existiert bereits im Setup (Planungsebene!) und
  scheint ungenutzt — **das ist der erste Ort, an dem zu recherchieren ist**: Vielleicht ist die
  halbe Struktur für den Zeitstrahl schon da.
- Wegen der Lücken ist die automatische Lauf-Kette pro Veranstaltung abschaltbar
  (`event.auto_activate_next_match`, Default aus). Mit einem Zeitstrahl könnte diese Krücke
  entfallen.
- Für den Export zur Zeitnahme relevant: Laut Cees gehört die Startzeit **in den Wave-Namen** — nur
  dort ist sie auch in der Timer-App sichtbar. Ein Zeitstrahl bei uns wäre damit zugleich die Quelle
  für diesen Namensbestandteil.

**Offene Fragen:**
- Was ist ein Slot: fixe Uhrzeit, Dauer + Abstand, oder Reihenfolge mit abgeleiteten Zeiten?
- Zeitstrahl pro Veranstaltung, pro Renntag oder pro Bahn/Strecke?
- Wie verhält sich der Strahl bei Verzug — schiebt sich alles Folgende automatisch?
- Was passiert mit Slots, deren Lauf noch nicht gesetzt ist: Platzhalter mit Wettkampf/Runde, der
  später mit dem echten Lauf verknüpft wird?
- Zusammenspiel mit der Kette: Der Breakpoint stoppt die automatische Aktivierung — reicht das als
  Regel, oder braucht es zusätzlich eine Bestätigung?

---

## Reihenfolge-Vorschlag zum Diskutieren

Nicht entschieden, nur als Gesprächseinstieg: A5 Punkt 1 (gzip) ist eine Zeile und spart sofort
95 % des Traffics — unabhängig von allem anderen. A3 (DNS/DQ) ist klein und blockiert A4. A2 und A1
hängen beide am Zustandsmodell von `currently_running` und sollten zusammen gedacht werden. B2
(Zeitstrahl) ist Voraussetzung dafür, dass die Kette ohne Abschalter verlässlich wird — und damit
das eigentliche Fundament. B1 ist unabhängig und könnte jederzeit dazwischen.
