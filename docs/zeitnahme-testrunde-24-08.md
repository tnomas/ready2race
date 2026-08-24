# Zeitnahme-Testrunde 24.08.2026 — Sammelliste

Punkte aus dem laufenden Handtest der Zeitnahme. Erst sammeln, Umsetzung in der Nacht
auf den 25.08. Reihenfolge = Eingangsreihenfolge, nicht Priorität.

---

## 1. Startbildschirm: Anzeige konfigurierbar machen

**Beobachtet** (Screenshot 20:26, Startanzeige Athleten, Sequenz DONE):
Liste zeigt `1. #1 · Hochschulrudern Flensburg` — die führende Zahl doppelt die Startnummer.

**Ursache:** [TimingStartDisplayPage.tsx:200](frontend/src/pages/app/TimingStartDisplayPage.tsx:200)
rendert `{entry.position + 1}. {label(entry)}`, und `teamLabel()` in
[teamLabel.ts](frontend/src/utils/timing/teamLabel.ts) setzt bereits `#<startNumber>` an den
Anfang. Zusätzlich fällt `teamLabel` auf `clubName` zurück — Athletennamen erscheinen nur, wenn
weder Teamname noch Verein gesetzt sind, deshalb steht dort heute *nur* der Verein.

**Gewünscht:** Die Ansicht wird einstellbar, u.a.
- Athletennamen zusätzlich anzeigen (nicht nur als Rückfall)
- Größe der Uhrzeit im Kopf (auch die synchrone Serverzeit) anpassbar
- Positionsnummer nicht doppelt

**Betroffen:** `TimingStartDisplayPage.tsx`, `teamLabel.ts`, `sequenceDisplay.ts`,
`BoardHeader.tsx`; je nach Antwort auf die offenen Fragen zusätzlich `TimingStationDialog.tsx`,
`api/src/timing.tsp` + Migration.

**Offen:**
- Wo wird eingestellt? Pro Posten (Station-Datensatz, serverseitig, gilt für alle Geräte an der
  Anzeige) — pro Veranstaltung — oder lokal im Browser des Anzeige-Geräts / per URL-Parameter?
- Welche Felder genau schaltbar: Startnummer, Bahn, Teamname, Verein, Athletennamen,
  Wettkampf/Lauf, Anzahl der sichtbaren „folgenden" Boote?
- Schriftgrößen: freie Werte, oder drei Stufen (klein/mittel/groß) je Bereich
  (Uhr, Countdown, nächstes Boot, Liste)?

---

## 2. Sequenz pausieren statt nur abbrechen

**Gewünscht:**
- Pause-Funktion neben Abbrechen.
- Aus der Pause heraus die Sequenz auf den letzten Schritt zurücksetzen (Anwendungsfall:
  Athletin kommt unverschuldet zu spät an den Start, Schiedsrichter üben Kulanz).
- Solange pausiert: Anzeige blinkt **orange**. Erst wenn auf den nächsten Start zurückgesetzt
  ist, wieder normale Darstellung.

**Stand heute:** `SequenceState` kennt nur `ARMED | RUNNING | DONE | ABORTED`
([timing.tsp:113](api/src/timing.tsp:113)). Feuern läuft serverseitig über `fireDueEntries()` in
[TimingSequenceService.kt](backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing/boundary/TimingSequenceService.kt)
gegen `plannedStartMillis` — Pause heißt also nicht „Timer anhalten", sondern
neuen Zustand `PAUSED` plus Verschieben aller geplanten Startzeiten beim Fortsetzen.
Routen heute: `POST /sequences/{id}/start|abort` und `.../entries/{id}/skip`.

**Umfang:** Migration (neuer Zustand + evtl. `pausedAtMillis`), TypeSpec, Service, neue Routen
`pause`/`resume`/`rewind`, Broadcast, Board-Bedienung, Anzeige-Blinken.

**Offen:**
- „Auf den letzten Schritt zurücksetzen" = den zuletzt **gestarteten** Eintrag wieder auf
  `PENDING` (dann muss dessen Zeitmarke zurückgenommen werden) — oder nur den Countdown des
  **nächsten** Eintrags neu ab Vorlauf laufen lassen?
- Verschieben sich beim Fortsetzen alle folgenden Intervall-Starts um die Pausendauer
  (Kette bleibt erhalten), oder läuft das ursprüngliche Raster weiter?
- Wer darf pausieren: Start-Posten und Leitstand, oder nur der Leitstand?
- Blinkt nur der Startbildschirm oder auch das Bedienboard/der Leitstand?

---

## 3. Fehlstart-Funktion in der Sequenz

**Gewünscht:**
- Fehlstart-Auslöser im Start-Screen, für **alle** Renntypen verfügbar.
- Athletenanzeige blinkt deutlich **rot**, sichtbarer Text „Fehlstart".
- Pro Renntyp (Zeitnahmetyp) deaktivierbar — Timetrials im Rudersport geben bei Fehlstart
  stattdessen 10 s Strafzeit.

**Stand heute:** „Fehlstart" existiert nur als **Ton**, und nur als Nebeneffekt zweier
Gesten (Sequenz-Abbruch RUNNING→ABORTED, Versuchs-Rücknahme) — siehe
[falseStart.ts](frontend/src/utils/timing/falseStart.ts) und
[useFalseStartTone.ts](frontend/src/utils/timing/useFalseStartTone.ts). Es gibt keine eigene
Aktion, keinen sichtbaren Zustand und keine Schaltmöglichkeit je Renntyp; die Fehlstart-Tonfolge
hängt heute an den Veranstaltungs-Einstellungen (`settings.falseStartTone`).
`TimingModeDto` (= Renntyp) hat kein Fehlstart-Feld.

**Offen:**
- Der Startbildschirm ist bewusst **reine Anzeige ohne Bedienelemente** (Kommentar in
  `TimingStartDisplayPage.tsx`). Soll der Auslöser aufs Erfassungsboard des START-Postens bzw.
  in den Leitstand, und der Startbildschirm zeigt nur das rote Blinken? Oder bekommt der
  Startbildschirm ausnahmsweise einen Knopf?
- Was macht der Fehlstart mechanisch: Sequenz abbrechen, pausieren, oder nur Signal + Anzeige,
  und der Starter entscheidet danach?
- Bei deaktiviertem Fehlstart (Timetrial): nur Knopf weg — oder soll R2R die 10 s Strafzeit
  automatisch auf das betroffene Boot buchen (`penaltyMillis` gibt es bereits)?

---

## 4. Durchführung und Zeitplan per WebSocket anbinden

**Gewünscht:** Beide Seiten hängen am Push-Kanal statt (nur) am Takt.

**Stand heute:**
- **Zeitplan**: [EventSchedule.tsx:188](frontend/src/components/event/schedule/EventSchedule.tsx:188)
  nutzt `useEventChangeSocket` bereits und streckt sein Polling per `stretchedPollMs(30_000, …)`
  auf den Sicherheitstakt. Hier ist also eher zu prüfen, ob der Kanal wirklich trägt (welche
  Änderungsmarker gepusht werden) als neu anzubinden — beim Test bitte sagen, welche Zeitplan-
  Fläche gemeint war.
- **Durchführung**: [CompetitionExecution.tsx:243](frontend/src/components/event/competition/excecution/CompetitionExecution.tsx:243)
  lädt ausschließlich getaktet (`autoReloadInterval` + ETag/304). Kein Push. Das ist die eigentliche
  Baustelle: `useEventChangeSocket` dazunehmen, Takt auf Sicherheitstakt strecken, ETag-Weg
  unverändert lassen (die 304-Ruhe ist das, was Scrollposition und offene Runden hält).

**Offen:**
- Reicht der öffentliche Kanal `/api/ws/event/{eventId}/info`, oder braucht die Durchführung
  eigene Marker (Ergebniseingang, Rundenwechsel, Bahnentausch)?
- Push auch bei offenem Dialog einspielen, oder wie heute den Takt anhalten
  (`refreshIntervalMs(autoRefresh, anyDialogOpen)`) und erst beim Schließen nachladen?

---

## 5. Start-Panel: manueller Stempel doppelt sich mit der Sequenz

**Beobachtet** (Screenshot 20:31, Posten „Start Hafen"): zwei grüne Flächen untereinander —
oben der große Sequenz-Knopf „Start: 16:46 · 12 Coastal Männer Einer …" (▶), darunter
nochmal „Start" (Flagge).

**Was das zweite ist:** der manuelle Stempel, [TimingBoardPage.tsx:938](frontend/src/pages/app/TimingBoardPage.tsx:938)
— ein kompakter `CaptureButton`, der am START-Posten fest unter dem Panel klebt („eine Zeit ohne
Boot banken (Fehlstart-Protokoll, Sonderfälle)"). Zwei Knöpfe, beide grün, beide „Start" — am
Wasser eine echte Verwechslungsgefahr.

**Gewünscht:**
- Wo es eine Sequenz gibt, braucht es den zweiten „Start" nicht.
- Umschaltbar für den Fall, dass spontan ohne Sequenz gestartet wird — aber als **Einstellung**,
  nicht als Knopf auf dem Board.
- Gespeicherte Einstellungen laufen über den WebSocket an die Boards.

**Stand heute:** Der Push-Weg existiert schon: `TimingSettingsDto` + `settingsChanged`
([useTimingSettings.ts](frontend/src/utils/timing/useTimingSettings.ts)) versorgt Boards und
Startbildschirm live (autoApply, precision, Töne). Ein Schalter „manuellen Stempel am
START-Posten zeigen" fügt sich dort ohne neuen Mechanismus ein — Migration für das Feld,
TypeSpec, Einstellungs-UI, und `TimingBoardPage` rendert den `CaptureButton` nur noch danach.

**Vorgehen, falls nichts anderes kommt:** Schalter in die Zeitnahme-Einstellungen der
Veranstaltung, Standard **aus** (Stempel verborgen), am START-Posten zusätzlich immer verborgen,
solange eine Sequenz läuft.

**Offen:**
- Veranstaltungsweit (wie die anderen Zeitnahme-Einstellungen) oder je Posten?
- Punkt 1 (Anzeige-Konfiguration) könnte im selben Datensatz landen — dann ist es ein
  Einstellungs-Umbau statt zwei.

---

## 6. Tagesablauf-Spalte: Tageswechsel sichtbar, Tag bleibt beim Scrollen oben hängen

**Beobachtet** (Screenshot 20:31, Spalte „Tagesablauf" am Posten Start Hafen): auf `18:48 · 18 -
NC CMix4x+ NC` folgt unmittelbar `09:00 · 11 CF1x · Viertelfinale VF1` — der Tageswechsel ist an
nichts zu erkennen außer daran, dass die Uhrzeit rückwärts springt. Am Wasser liest man das
falsch.

**Gewünscht:**
- Tageswechsel klar sichtbar in der Zeitleiste von Start UND Ziel.
- Die Tagesüberschrift bleibt beim Scrollen oben kleben (sticky), damit immer klar ist, welchen
  Tag man gerade sieht.

**Stand heute:** [DayScheduleColumn.tsx:132](frontend/src/components/timing/DayScheduleColumn.tsx:132)
rendert eine flache Liste über `matches.map(...)` in der Reihenfolge, die `/matches` liefert —
keine Gruppierung, kein Datum, nur `startTimeLabel()` mit `hour`/`minute`. Die Spalte heißt
„Tagesablauf", zeigt aber offensichtlich mehrere Tage. Beide Boards (Start und Ziel) nutzen
dieselbe Komponente, der Fix wirkt also einmal für beide.

**Umsetzung:** Gruppierung nach Kalendertag von `startTime` als reine Funktion in
`matchBoard.ts` (testbar, Muster wie `dayScheduleStatus`), Tages-Kopfzeile mit
`position: 'sticky', top: 0` im Scroll-Container (`overflowY: 'auto'` liegt bereits auf dem
richtigen Stack).

**Offen:**
- Beschriftung: „Sa · 15.08." oder ausgeschrieben „Samstag, 15. August"? (Die Spalte ist nur
  280 px breit, im Telefon-Drawer bis 85 vw.)
- Partien ohne `startTime` (`startTimeLabel` gibt heute `null` zurück): eigene Gruppe „ohne
  Zeit" am Ende, oder beim vorhergehenden Tag belassen?
- Nur ein Kopf je Tag, oder zusätzlich der Kopf des ersten (einzigen) Tages — bei nur einem
  Veranstaltungstag wäre er reine Zeilenverschwendung. Vorschlag: bei genau einem Tag weglassen.

---

## 7. Zeitplan-Leiste: Hinzufügen und Entfernen von Partien per WebSocket

**Gewünscht:** Kommt eine Partie in den Zeitplan dazu oder fällt eine raus, soll die
Tagesablauf-Leiste der Boards das live mitbekommen — ohne Neuladen.

**Stand heute:** Genau das fehlt, und zwar bewusst. `useTimingMatches` sagt es selbst:
„Es gibt keine eigene WebSocket-Nachricht für Partien — die vorhandenen Nachrichten dienen als
Auffrischungs-Trigger" ([useTimingMatches.ts:22](frontend/src/utils/timing/useTimingMatches.ts:22)).
Die Kanal-Nachrichten sind heute `timeMarkCreated`, `timeMarkRetracted`, `assignmentChanged`,
`stationsChanged`, `sequenceChanged` (+ `settingsChanged`, `attemptRetracted`) —
[timing.tsp:25](api/src/timing.tsp:25). Alle setzen voraus, dass die Partie bereits existiert.
Ein neu erzeugter Lauf (Folgerunden-Automatik), eine verschobene oder gelöschte Zeitplan-Zeile
oder ein nachträglich gesetzter Zeitnahmetyp erreichen die Boards deshalb **gar nicht** — erst
ein Sichtbarkeitswechsel oder Reconnect lädt neu.

**Umsetzung:** Neue Nachricht `{type: "matchesChanged"}` als reiner Auffrischungs-Trigger, kein
Rumpf — das passt zum vorhandenen Muster (`stationsChanged` macht es genauso) und nutzt die
schon gebaute 800-ms-Entprellung `bump()`. Serverseitig überall dort senden, wo sich die
Timing-relevante Partienmenge ändert: Zeitplan-Änderungen, Rundenerzeugung, Abmeldung/Freilos,
Zuweisung des Zeitnahmetyps.

Nicht vergessen: der Startbildschirm lädt `getTimingMatches` über ein eigenes `useFetch`
([TimingStartDisplayPage.tsx:89](frontend/src/pages/app/TimingStartDisplayPage.tsx:89)) ohne
`bump` — der braucht denselben Trigger, sonst zeigt er den Tonplan einer verschwundenen Partie.

**Offen:**
- Trigger ohne Rumpf (mein Vorschlag) oder die geänderte Partie mitschicken? Bei
  Rundenerzeugung ändern sich viele auf einmal, das spricht für den Trigger.
- Reicht ein Sammel-Trigger für alle Quellen, oder soll die Zeitplan-Änderung getrennt von der
  Rundenerzeugung gemeldet werden?

**Hängt zusammen mit Punkt 4** — dort geht es um denselben Umstand aus der anderen Richtung
(Durchführungs-/Zeitplan-*Seite* am Push-Kanal). Wenn das Backend an diesen Stellen ohnehin
Bescheid gibt, sollten beide Verbraucher aus derselben Quelle bedient werden.

---

## 8. Startbildschirm ohne Sequenz: nächsten Lauf ankündigen

**Gewünscht:** Läuft gerade keine Startsequenz, kündigt der Startbildschirm den nächsten Lauf
der Kette an. Oben weiterhin die Aussage, dass keine Sequenz aktiv ist — darunter aber sichtbar,
was als Nächstes kommt, und **prominent die Startnummer/Person, die als Erste in der Sequenz
steht**.

**Stand heute:** Der IDLE-Zweig zeigt genau einen Satz und sonst nichts:
`bigMessage(t('timing.startDisplay.idle'))` in
[TimingStartDisplayPage.tsx:275](frontend/src/pages/app/TimingStartDisplayPage.tsx:275). Die
Anzeige steht damit zwischen zwei Läufen komplett leer da, obwohl sie alle Daten schon geladen
hat: `matchesData` (`getTimingMatches`) und `teamsData` (`getTimingTeams`) hängen bereits an der
Seite.

**Umsetzung:** Es gibt schon ein Vorbild für „was kommt als Nächstes" — `expectedFinishMatches()`
in [matchBoard.ts:79](frontend/src/utils/timing/matchBoard.ts:79) bestimmt für den Zielposten
`upcoming = matches.find(progress === 'OPEN')`, und zwar nur, solange nichts auf dem Wasser ist.
Dieselbe Ableitung gehört als reine Funktion neben `deriveStartDisplay()`, damit der IDLE-Fall
zu `{kind: 'IDLE', upcoming?: …}` wird statt zu einer Sonderlocke in der Seite. Das erste Boot
ist `teams` nach `startNumber` sortiert, erster Eintrag — dieselbe Sortierung, die
`StartBoardPanel` für seine Bootsliste nutzt.

**Offen:**
- Was heißt „nächster Lauf in der Kette" genau: die erste OPEN-Partie der Liste, oder soll der
  Aufruf-Zustand (`phase`, aus `activated_at`) vorgehen — also die *aufgerufene* Partie, auch
  wenn im Zeitplan eine frühere noch offen steht?
- Auch nach DONE/ABORTED anzeigen? Die Zusammenfassung einer beendeten Sequenz bleibt heute
  zehn Minuten stehen (`SETTLED`). Vorschlag: Ankündigung erst zeigen, wenn die Zusammenfassung
  weggeklickt/abgelaufen ist — sonst konkurrieren zwei Botschaften.
- Ein reiner ANZEIGE-Posten ohne `linkedStation` spiegelt *jede* Sequenz der Veranstaltung; die
  Partienliste kennt gar keinen Posten. Die Ankündigung ist damit zwangsläufig
  veranstaltungsweit — bei zwei Startbereichen (z.B. Hafen und Steg) kündigt der Bildschirm
  womöglich einen fremden Lauf an. Reicht das, oder braucht die Ankündigung eine Postenbindung?

**Hängt zusammen mit Punkt 1** — welche Felder (Startnummer, Verein, Athleten) hier prominent
stehen, sollte dieselbe Anzeige-Einstellung entscheiden wie im laufenden Betrieb.

---

## Antworten (24.08., Rückfragen zu Punkt 8)

- **„Nächster Lauf" = der Lauf „in Vorbereitung"** — der zeitlich nächste, der auf Vorbereitung
  steht, sobald der vorherige abgehakt ist. Also `phase`/`activated_at`, nicht einfach die erste
  OPEN-Zeile.
- **Zusammenfassung** darf stehen bleiben, **bis der nächste Lauf „in Vorbereitung" ist** — dann
  löst die Ankündigung sie ab (nicht nach zehn Minuten).
- **Postenbindung**: Die Anzeige ist heute nur auf den Start ausgelegt. Zwischenzeiten und
  Zielzeiten sind ausdrücklich denkbar — deshalb wird der **Posten an der Anzeige konfigurierbar**
  gebaut (welcher Posten wird gezeigt). Fokus dieser Runde bleibt der Start.

---

## 9. Startsequenzen auf Schiedsrichter-Dashboard, Kachel-Dashboard und Livestream

**Gewünscht:**
- Startsequenzen auch im Schiedsrichter-Dashboard zeigen — „dann haben sie es alle".
- Ebenso im Kachel-Dashboard (Board-System) und im Livestream-Overlay.
- Die Uhr dort zählt **von minus hoch**: vor dem Start läuft der Countdown negativ, beim Start
  durch die Null, danach die Laufzeit aufwärts.

**Stand heute:**
- Schiedsrichter-Dashboard: [LiveDashboardPage.tsx](frontend/src/pages/event/LiveDashboardPage.tsx)
  hängt bereits an `useEventChangeSocket` + gestrecktem Polling, kennt aber keine Sequenzen.
- Kachel-Dashboard/Stream: [BoardClockElement.tsx](frontend/src/components/event/board/BoardClockElement.tsx)
  zeigt nur die Serveruhr (`hour:minute`).
  [streamClock.ts](frontend/src/components/event/board/streamClock.ts) kennt drei Phasen
  (`hidden`/`running`/`frozen`), beginnt erst mit `actualStartTime` und **klemmt auf ≥ 0**
  (`Math.max(0, serverNowMs - startMs)`). Ein negativer Vorlauf ist damit heute konstruktiv
  ausgeschlossen — es braucht eine vierte Phase `countdown` und den geplanten Startzeitpunkt.
- Die Board-Daten kommen aus dem **öffentlichen** Board-Endpunkt
  ([useBoardViewData.ts](frontend/src/components/event/board/useBoardViewData.ts), gepollt),
  die Sequenz lebt im Zeitnahme-Modul hinter Sitzung/Geräte-Token. Der geplante Startzeitpunkt
  muss also in die Board-Sicht durchgereicht werden — der Weg über den Timing-Kanal steht dem
  öffentlichen Board nicht offen.

**Größter Brocken der Liste.** Reihenfolge: erst Schiedsrichter-Dashboard (dieselbe Anmeldung wie
die Zeitnahme, also ohne neuen Datenweg), dann Kachel/Stream (braucht das Feld im Board-DTO).

---

# Umsetzungsstand (Nacht auf den 25.08.2026)

Alles auf dem Zweig `claude/sequence-visualization-controls-acb751`. Drei Migrationen:
`V202608242000` (Anzeige-Einstellungen), `V202608242010` (Sequenz-Pause),
`V202608242020` (Fehlstart je Renntyp).

| # | Punkt | Stand |
|---|---|---|
| 1 | Startbildschirm konfigurierbar | **gebaut** — doppelte Nummer weg, Athleten zuschaltbar, drei Größenfaktoren, Anzahl Folgeboote |
| 2 | Sequenz pausieren + zurücksetzen | **gebaut** — Zustand `PAUSED`, orange blinkend |
| 3 | Fehlstart | **gebaut** — Knopf am Start-Board, rotes Blinken, je Renntyp abschaltbar |
| 4 | Durchführung/Zeitplan per WebSocket | **gebaut** — Durchführung hängt am Push-Kanal |
| 5 | Doppelter „Start" am Start-Panel | **gebaut** — manueller Stempel standardmäßig aus |
| 6 | Tageswechsel in der Zeitleiste | **gebaut** — Tagesgruppen mit klebender Kopfzeile |
| 7 | Partien-Änderungen per WebSocket | **gebaut** — neue Nachricht `matchesChanged` |
| 8 | Ankündigung des nächsten Laufs | **gebaut** — der aufgerufene Lauf, prominent das erste Boot |
| 9 | Sequenzen auf Dashboards + Livestream-Uhr | **offen** |

## Was Punkt 9 noch braucht
Der größte Brocken und bewusst nicht angefangen, weil er einen neuen Datenweg verlangt: Die
Board-Daten kommen aus dem öffentlichen, gepollten Board-Endpunkt, die Sequenz lebt im
Zeitnahme-Modul hinter Sitzung/Geräte-Token. Für die Uhr, die „von minus hochzählt", muss der
geplante Startzeitpunkt in die Board-Sicht durchgereicht werden; zusätzlich klemmt
`streamClock.ts` heute konstruktiv auf `≥ 0` und kennt nur drei Phasen. Reihenfolge: erst
Schiedsrichter-Dashboard (gleiche Anmeldung wie die Zeitnahme, kein neuer Datenweg), dann
Kachel/Stream.

## Bewusste Entscheidungen (bei Widerspruch bitte melden)
- **Anzeige-Einstellungen sind veranstaltungsweit**, nicht je Posten — sie liegen bei den übrigen
  Zeitnahme-Einstellungen und laufen damit über den vorhandenen `settingsChanged`-Push. „Welcher
  Posten wird gezeigt" bleibt wie bisher die Verknüpfung des ANZEIGE-Postens.
- **Fehlstart-Knopf sitzt am Erfassungsboard**, nicht auf dem Startbildschirm — der ist
  ausdrücklich bedienelementfrei. Der Bildschirm blinkt nur.
- **Keine automatische 10-Sekunden-Strafzeit** bei Timetrials. Sie war die Begründung fürs
  Abschalten, nicht der Auftrag; der Weg dafür (`penaltyMillis`) stünde bereit.
- **Fehlstart-Mechanik**: laufende Sequenz abbrechen + Versuch zurücknehmen, beides über die
  vorhandenen Wege, plus neue `falseStart`-Nachricht fürs rote Blinken.
- **Zurücksetzen** trifft den zuletzt GESTARTETEN Eintrag und nimmt dessen Marke zurück; der
  Ist-Start der Partie bleibt stehen (beim Einzelstart ist das Boot selten das erste seiner
  Partie).
- **Roter Alarm** steht längstens zwei Minuten, wenn ihn kein neuer Start ablöst.

## Handtests, die ausstehen
Nichts davon wurde in der laufenden App geklickt — kein Server in diesem Worktree.
1. Anzeige-Einstellungen im Formular durchschalten und am Startbildschirm live prüfen
   (Athletennamen, Größenfaktoren, Anzahl Folgeboote, doppelte Nummer weg).
2. Sequenz pausieren: orangenes Blinken, „Letzten Start zurücknehmen", Fortsetzen — verschieben
   sich die folgenden Starts wirklich um die Pausendauer?
3. Fehlstart auslösen: rotes Blinken samt Text, Menüpunkt bei abgeschaltetem Renntyp unsichtbar,
   409 bei abgeschaltetem Typ.
4. Manueller Stempel: standardmäßig weg, über die Einstellung wieder da — und der Wechsel greift
   ohne Neuladen auf einem zweiten Gerät.
5. Tageswechsel in der Tagesablauf-Spalte, Kopfzeile klebt beim Scrollen.
6. Folgerunde erzeugen und zusehen, ob Board und Startbildschirm die neuen Läufe ohne Neuladen
   zeigen.
