# ADR-0089: Startsequenzen laufen serverseitig; Fehlstart-Rückruf ohne automatische Strafe; die Zeitnahme stempelt Laufzustände, stößt aber keine Kette an; Posten-Boards mit einem Startknopf

- Status: angenommen
- Datum: 2026-08-18
- Bereich: backend, domäne, frontend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Der Startposten braucht Countdown, Einzel- und Wellenstarts, die auf mehreren Geräten synchron laufen und einen Gerätewechsel oder Absturz überleben. Zeitfahren ahnden Fehlstarts je nach Regelwerk mit Strafzeit oder Rückruf. Boards und Dashboards sollen bei interner Zeitnahme genauso „Läuft" zeigen wie beim externen Abruf ([ADR-0070](0070-laufzustaende-preparing-running-klaerung.md)). Das erste Erfassungsboard hatte Reiter „Zwei-Schritt" und „Teams" und ein Formular, um Sequenzen am Board zu parametrieren; am Wasser war das unübersichtlich.

## Entscheidung

**Sequenzen leben in der Datenbank.**
- `timing_start_sequence` und `timing_start_sequence_entry` (V202608180030) mit Zuständen `ARMED | RUNNING | PAUSED | DONE | ABORTED`; Modi `MASS` und `INTERVAL`, wobei der Massenstart keine dritte Ausprägung ist, sondern eine Welle mit allen Booten.
- Ein Server-Scheduler-Job (Sekundentakt, [ADR-0013](0013-scheduler-und-datenbank-warteschlangen.md)) feuert fällige Einträge idempotent in einer Transaktion: Marke, Zuordnung, Status. `SKIPPED` behält die Kadenz; Überspringen gibt dem nächsten Boot wieder den vollen Abstand.
- Ein partieller Unique-Index (V202608180815) verhindert zwei aktive Sequenzen je Posten auch ohne Service-Vorprüfung.
- `lead_in_millis` (V202608180845, Vorgabe 10 s, Grenzen 3 s bis 10 min, Ableitung geklemmt) gibt den Boards ein Countdown-Fenster. Boards rechnen Countdowns aus Feuerzeitpunkt und Uhr-Offset; sie sind nie Referenz.
- `GET …/sequences/active` liefert zusätzlich die zuletzt beendete Sequenz (10 min), damit ein verpasster Terminal-Broadcast nachlesbar bleibt.
- Pause (V202608242010): `PAUSED` mit pause/resume/rewind; Fortsetzen verschiebt die Kette exakt um die Pausendauer; `rewind` trifft den zuletzt gestarteten Eintrag und nimmt seine Marke zurück, der Ist-Start der Partie bleibt.

**Der Zeitnahmetyp konfiguriert, das Board führt aus.**
- Startart, Intervall, Vorlauf, Tastenbelegung (`boat_keys_primary/secondary`) und der Schalter `start_sequence_enabled` stehen am Zeitnahmetyp `timing_mode` (V202608211400, V202608261200), nicht am Board. Die Sperre wird serverseitig in `TimingSequenceService.ensureStartSequenceAllowed` durchgesetzt (Typ hergeleitet über das erste Team, die Setup-Partie und den Profil-Baum aus [ADR-0080](0080-zeitnahmeprofil-baum-vier-ebenen.md)). Lässt sich kein Typ herleiten, wird durchgelassen: der Spalten-Default ist „an", und eine Sperre im Zweifel hielte am Renntag Läufe an, die niemand gesperrt hat. Im Frontend liegt die Regel in reinen Funktionen (`sequenceRequestFromMode`, `startSequenceOffByMode`).
- Startposten: ein Startknopf mit der fokussierten Partie, Sequenzfortschritt als schmale Leiste; der manuelle Stempel am Startposten ist standardmäßig aus (zwei grüne Flächen „Start" waren eine Verwechslungsfalle); gestartete Läufe bleiben angepinnt.
- Zielposten: eine Ansicht, Ziffern `1`–`6` und `A`–`F` treffen die Position nach Startnummer, Boote im Ziel reagieren nicht mehr auf ihre Taste; die lokale Warteschlange sendet in Erfassungsreihenfolge.
- `retractAttempt` nimmt Start-, Ziel- und Rundenmarken der Partie gemeinsam zurück, weil alte Zielzeiten sich sonst mit neuen Startmarken verrechnen; Zuordnungen bleiben, Reaktivierung stellt den Versuch wieder her.
- Startbildschirm-Einstellungen (Athletenanzeige) werden an der Veranstaltung gespeichert und am Bildschirm hinter einem Zahnrad bedient, nur für Sitzungen mit `UPDATE.EVENT.GLOBAL`; Geräte-Token dürfen dort nicht schreiben. Einstellungen gelten veranstaltungsweit, nicht je Posten.

**Fehlstart-Rückruf ohne automatische Strafe.**
- Der Rückruf ist eine ausdrückliche Handlung am Erfassungsboard: Sequenz abbrechen, Versuch zurücknehmen, eigene WebSocket-Nachricht `falseStart` (bzw. `attemptRetracted`); die Athletenanzeige blinkt rot und bleibt bedienelementfrei.
- `timing_mode.false_start_enabled` (V202608242020) schaltet nur den Knopf am Startposten. Ob ein Fehlstart Strafzeit oder Ausscheidung bedeutet, wird von Hand gewertet; das Produkt bucht keine Strafzeit automatisch.
- Seit V202609021000 hinterlässt der Rückruf den Stempel `competition_match.false_start_at`, damit Anzeigen ohne Zeitnahme-Kanal den Grund sehen.

**Die Zeitnahme stempelt Laufzustände, stößt aber keine Kette an.**
- Sequenz einrichten oder starten setzt `activated_at` (nur wenn leer). Die erste zugeordnete Startmarke stempelt `started_at`; ein vorhandener Schiedsrichter-Stempel wird nie verschoben. Die Rücknahme nimmt nur den eigenen Stempel zurück, erkannt daran, dass `started_at` exakt der Markenzeit entspricht; ein Provenienz-Flag gibt es nicht. `activated_at` bleibt bei Rücknahme stehen, `finished_at` fasst die Zeitnahme nie an.
- Alles läuft im selben Request- und Transaktionszyklus; der Scheduler bumpt den Änderungsmarker erst nach Commit über das `FireResult`. Die Aktivierungskette ([ADR-0064](0064-aktivierungskette-ganzer-zeitplan.md)) wird bewusst nicht angestoßen.

## Verworfene Alternativen

- **Client-seitige Sequenzsteuerung:** überlebt weder Gerätewechsel noch Absturz; „die Sequenz lebt serverseitig".
- **Sequenz-Parameter am Board** („Sequenz von Hand einrichten"): am Renntag eingetippte Intervalle sind eine Fehlerquelle; das Formular entfiel mit aeff9c4c.
- **Reiter „Zwei-Schritt" und „Teams" am Board:** ersatzlos weg; eine Ansicht je Posten.
- **Vollflächiges Sequenz-Overlay am Erfassungsboard:** bleibt der Anzeige-Route vorbehalten.
- **Sperre nur als Bedienhilfe im Board:** zwei Schalter desselben Typs verschieden ernst zu nehmen wäre nicht erklärbar; die Sperre gilt auch auf dem Server.
- **Automatische 10-s-Strafzeit bei Zeitfahren:** war eine Begründung in der Testrunde, kein Auftrag; die Wertung folgt dem Regelwerk und wird von Hand getroffen.
- **Fehlstart-Knopf auf dem Startbildschirm:** der Startbildschirm ist Anzeige, kein Bedienelement.
- **Eigenes Provenienz-Feld für `started_at`:** der Wertvergleich mit der Markenzeit genügt.
- **Kette aus der Zeitnahme heraus weiterschalten:** die Kette hat genau einen Auslöser, den Zeitstrahl.
- **Geräte-lokale Startbildschirm-Einstellungen:** wer sie ändert, steht vor dem Bildschirm, aber die Einstellung ist eine Regatta-Entscheidung.

## Konsequenzen

- Der Scheduler ist Betriebsvoraussetzung: ohne laufenden Job feuert keine Sequenz. Beim lokalen Betrieb mit mehreren Backends (Port-Kollisionen) feuert womöglich das falsche.
- Das Durchlassen ohne herleitbaren Typ ist eine bewusste Lücke: ein Lauf ohne Profil-Zuordnung lässt sich immer per Sequenz starten.
- `retractAttempt` verwirft auch Zwischenzeiten der Partie; wer nur eine Marke korrigieren will, nutzt die Einzelrücknahme.
- Der Stempelvergleich `started_at == Markenzeit` bricht, wenn jemand `started_at` von Hand auf exakt dieselbe Millisekunde setzt; praktisch irrelevant, aber nicht ausgeschlossen.
- Der Startbildschirm-Block bleibt unsichtbar im Zeitnahme-Formular, weil der Endpunkt die ganze Konfiguration in einem Stück schreibt; Änderungen am Endpunkt müssen beide Bedienorte mitdenken.
- Handtests am Wasser standen zum Zeitpunkt der Rekonstruktion noch aus (`docs/zeitnahme-testrunde-24-08.md`).

## Quellen

- Commits: `f9f69cc3` (Tabellen), `c8ea920e` (Service und Scheduler), `fe4fb064` (Routen und API), `37cd3386` (Einmaligkeit, Terminal-Sichtbarkeit), `7f6bdb98`, `b05990a4` (Vorlauf), `4837be73` (Anzeige einstellbar, Pause, Fehlstart; V202608242020), `9e55283c` (Überspringen), `39c5c972` (Typ trägt Tasten und Töne), `05cd0c32`, `b0391975`, `1e0343c1` (Startsequenz-Sperre), `d8c82096` (Laufzustände stempeln), `baa3053a` (Übernahme weckt Anzeigen), `2e46c526` (Design Posten-Boards), `aeff9c4c` (ein Startknopf, eine Zielansicht), `c5d4d0a2`, `198dc2ad` (retractAttempt), `4c0c0fa0` (Zielposten-Fokus), `b4f26448` (reine Logik der Boards), `a46bbf36` (angepinnte Läufe), `85767218` (Zahnrad), `5ff17d2d` (false_start_at, V202609021000)
- Migrationen: `V202608180030__timing_start_sequences.sql`, `V202608180815__timing_sequence_unique_active.sql`, `V202608180845__timing_sequence_lead_in.sql`, `V202608242000__timing_anzeige_einstellungen.sql`, `V202608242010__timing_sequence_pause.sql`, `V202608242020__timing_mode_fehlstart.sql`, `V202609021000__competition_match_false_start.sql`
- Specs: `docs/superpowers/plans/2026-08-18-timing-start-sequences.md`, `docs/superpowers/specs/2026-08-23-zeitnahme-boards-leitstand-design.md`, `docs/zeitnahme-testrunde-24-08.md`
- Verwandte ADRs: [ADR-0013](0013-scheduler-und-datenbank-warteschlangen.md), [ADR-0059](0059-laufzustand-eine-ableitung.md), [ADR-0064](0064-aktivierungskette-ganzer-zeitplan.md), [ADR-0070](0070-laufzustaende-preparing-running-klaerung.md), [ADR-0080](0080-zeitnahmeprofil-baum-vier-ebenen.md), [ADR-0087](0087-eigenes-zeitnahme-modul-append-only.md), [ADR-0091](0091-toene-gehoeren-dem-zeitnahmetyp.md), [ADR-0097](0097-zeitnahme-livestream-sync-eine-sequenz-rechnung.md)
