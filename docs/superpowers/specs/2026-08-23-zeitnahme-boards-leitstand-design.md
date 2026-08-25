# Zeitnahme: Posten-Boards und Leitstand — Design

Stand 23.08.2026, abgestimmt mit Thomas. Zwei Bauphasen: **A** Echtzeit-Rückschreibung und
Leitstand, **B** Posten-Boards (Start/Ziel). Backend-Verträge aus dem Zeitnahme-Umbau
(`/matches`, Zeitnahmetypen, Geräte-Token, Sequenzen) bleiben die Grundlage.

## Leitgedanken

1. **Echtzeit ist der Normalfall.** Eine genommene und zugeordnete Zielzeit steht sofort am
   Lauf — ohne Rechenknopf, ohne Übernahme-Schritt. Der Bediener greift nur ein, wenn etwas
   falsch ist.
2. **Das Board führt aus, die Einstellungen konfigurieren.** Sequenz-Parameter (Intervall,
   Vorlauf, Startform) leben ausschließlich am Zeitnahmetyp. Am Renntag wird nichts davon
   verstellt.
3. **Jede Handlung ist umkehrbar:** Zeiten umhängen, Rücknahmen reaktivieren, Starts
   zurücknehmen — Verklicken ist der Normalfall, nicht die Ausnahme.

## Phase A — Echtzeit-Rückschreibung und Leitstand

### Instant-Rückschreibung

- Jede Mutation an Marken/Zuordnungen/Strafen eines Laufs stößt serverseitig sofort die
  Berechnung der offiziellen Zeiten an und schreibt die Ergebnisse an den Lauf
  (`competition_match_team`) zurück — dieselbe Wirkung, die bisher der manuelle Schritt hatte.
- **Schalter im Leitstand** („Automatische Übernahme", Vorgabe **an**, je Veranstaltung
  persistiert): Aus heißt, Zeiten laufen weiter auf, aber nichts wird an die Läufe
  geschrieben; beim Wiedereinschalten wird der aufgelaufene Stand einmalig nachgezogen.
- Der Knopf „Neu berechnen" entfällt ersatzlos. Die Berechnung bleibt intern idempotent.

### Strafen mit Grund

- Strafe je Team: Sekunden **und Freitext-Grund**, gepflegt im Leitstand (Ergebnisbereich).
- Beides wird mit der Rückschreibung an den Lauf übertragen (vorhandene Straffelder der
  Teams nutzen; fehlt ein Grund-Feld, ergänzen — Migration ab dem nächsten freien Slot).

### Rücknahmen reaktivieren

- Eine zurückgenommene Zeitmarke (Status RETRACTED) kann wieder auf ACTIVE gestellt werden
  (Endpunkt + Knopf in der Zeitenliste). Ihre frühere Zuordnung bleibt erhalten, die
  Rückschreibung rechnet sofort nach. Das endgültige Entfernen bleibt als getrennte,
  bestätigte Aktion bestehen.

### Leitstand-Standardansicht „Übersicht"

- Neuer erster Reiter (Vorgabe beim Öffnen): **oben ein kompakter Posten-Streifen** — je
  Posten Typ, letzter Eingang, laufende Sequenz mit Fortschritt („Start Hafen: Sequenz
  Finale CF2x, 3/6 gestartet"), Gerätezustand.
- **Darunter, als Hauptfläche: die Ergebnisse** — die zuletzt aktiven Läufe mit ihren
  offiziellen Zeiten, live aktualisiert; von dort direkt Strafen pflegen und Zeiten
  korrigieren. Die bisherigen Reiter (Zeiten, Ergebnisse, Geräte) bleiben dahinter bestehen.

## Phase B — Posten-Boards Start und Ziel

### Gemeinsames Gerüst

- **Tagesablauf-Spalte** links (einklappbar, beide Posten): alle Partien des Tages
  chronologisch mit Typ-Chip und Status (offen / Sequenz läuft / gestartet / n/m im Ziel /
  fertig). Klick fokussiert.
- **Zeitenliste** unten: jede Zeit trägt Partie und Boot, gruppiert nach Partie.

### Startposten

- **Ein** Startknopf; die große Fläche trägt die Beschriftung der fokussierten Partie. Der
  doppelte Zweitknopf entfällt.
- Sequenzfortschritt als **schmale additive Leiste** (wer ist dran, Countdown-Ziffer,
  n/m, Abbrechen) — kein vollflächiges Overlay; die große Visualisierung bleibt der
  Anzeige-Route.
- **Abbruch/Neustart je Lauf**, auch nach Start (Menü mit Bestätigung; eindeutige
  Knopftexte — nie zweimal „Abbrechen"). Nur mit Nutzersitzung, nicht per Geräte-Token.
- „Sequenz von Hand einrichten" entfällt am Board.

### Zielposten

- **Eine Ansicht** (Reiter „Zwei-Schritt" und „Teams" entfallen; ihr Verhalten geht auf):
  große Taste/Leertaste = Zeit ohne Boot banken; Bootsknopf oder Taste = Zeit nehmen und
  zuordnen in einer Geste; wartet eine gebankte Zeit, ordnet der nächste Druck sie zu.
- **Tasten 1–6 und A–F** gleichwertig, ohne Scharfschalten, wirken auf die **fokussierte
  Partie** (sichtbarer Fokus, Wechsel per Tab/Klick, Tasten-Hinweise auf den Knöpfen).
- **Lokale Warteschlange:** Der Zeitstempel entsteht beim Tastendruck am Gerät; bei
  Netzabriss wird er vorgehalten und nachgesendet.

## Nicht Teil dieses Designs

Anzeige-Route (Vollbild-Countdown), Mobile-App-Überarbeitung, Rundenzeiten in der
offiziellen Zeit (`with_laps` bleibt Deklaration).

## Tests

Reine Logik (Rückschreibe-Entscheidung, Warteschlange, Tastenfokus, Reaktivierung) mit
Unit-Tests; DB-Wege mit Testcontainers; beide Phasen mit Browser-Beleg gegen den
CRF-Seed.
