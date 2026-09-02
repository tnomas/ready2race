# Livestream-Regie: eigenes Board und schaltbarer Probemodus

Stand: 02.09.2026 · Zweig: `claude/livestream-elements-redesign-08f789`

## Ausgangslage

Das Kontroll-Panel (`/event/{id}/streamPanel`) ist eine Formularseite: Szenen-Dropdown,
darunter je Grafik eine Karte mit Miniatur, Auto/An/Aus, Lauf- und Dauerwahl. Der Probemodus
speist die Szene mit einer 3-Minuten-Schleife, deren Phasen allein aus der Uhr wechseln — für
die Regie wirkt das wie zufällige Anzeigenwechsel, und eine bestimmte Grafik lässt sich nicht
gezielt ansehen. Was eine Grafik gerade NICHT zeigt (kein Lauf in Vorbereitung, kein
Ergebnis), erfährt man nur indirekt.

## Entscheidungen

1. **Probemodus mit Phasen statt Schleife.** `stream_scene` bekommt `trial_phase` (Text,
   Vorgabe `PREPARING`) und `trial_phase_since` (Zeitstempel). Acht Phasen in der Reihenfolge
   eines Laufs: `PREPARING` (Aufstellung am Steg), `COUNTDOWN` (Startsequenz, feuert 90 s
   nach Phasenbeginn), `RUNNING` (Uhr läuft, keine Marke), `SPLIT` (Zwischenzeiten eben
   eingetroffen), `FINISH` (zwei von vier im Ziel), `FINISHED` (alle im Ziel, Uhr
   eingefroren), `RESULT` (Ergebnis, vorläufig), `IDLE` (nichts läuft — nur Tagesprogramm
   und Streckenbild). `trialInput(now, phase, phaseSince, …)` bleibt rein; alle Zeitfenster
   (Startliste 15 s, Zwischenzeiten 8 s, Ergebnis 20 s) laufen ab Phasenbeginn — ein
   erneutes Setzen derselben Phase löst sie neu aus. Der Loop-Wecker entfällt; die
   Einblendfenster kommen wie im Echtbetrieb aus `visibleUntil`.
2. **API:** `PUT …/stream/{sceneId}/trialPhase?phase=` (UPDATE STREAM oder UPDATE EVENT),
   `StreamSceneDto.trialPhase`, `StreamSceneViewDto.trialPhase`. Einschalten des Probemodus
   setzt den Phasenbeginn auf jetzt.
3. **Regie-Board** (`StreamDirectorPage`, ersetzt `StreamPanelPage` unter derselben Route):
   dunkler Vollbild-Arbeitsplatz wie Leitstand und Sprecher-Board. Kopf: Zurück, Titel,
   Szenen-Reiter, Kanal-Zustand, Vollbild. Links: Programmvorschau (die ganze Szene live über
   einem neutralen Schachbrett), darunter der Probemodus mit Phasenliste. Rechts: je aktive
   Grafik eine Karte mit Live-Miniatur, Zustand, Auto/An/Aus, Lauf- und Dauerwahl; nicht
   aktivierte Grafiken als gedämpfte Zeile mit Sprung zur Konfiguration.
4. **Feed-Zustand je Grafik** (`graphicFeed.ts`, rein, Vitest): `onAir`, `ready`, `off`,
   `noFeed` — letzterer mit Grund je Typ (kein Lauf in Vorbereitung, kein laufender Lauf,
   keine Zwischenzeit, noch kein Ergebnis, noch kein Zieleinlauf, kein Programm, kein
   Streckenbild). „An" ist bei `noFeed` gesperrt: erzwingen ohne Inhalt blendet nichts ein.
5. Szenen-Verwaltung (Anlegen, Grafiken, Link teilen) bleibt auf `/streamScenes`; das Board
   verlinkt dorthin und öffnet die Grafik-Konfiguration direkt als Dialog.

## Nicht im Umfang

Preview/Programm-Umschaltung wie in einem Mischer (Wirecast macht den Schnitt), Layout-Editor,
neue Grafiktypen.
