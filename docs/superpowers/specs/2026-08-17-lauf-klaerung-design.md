# Laufzustand „Klärung"

Stand: 17.08.2026

## Das Problem

Ein Einspruch hält einen Lauf fest. Die Schiedsrichter geben ihn nicht frei, also wird er
nicht beendet — und weil `deriveMatchState` die Aktivierung **vor** dem Beenden prüft, steht
er auf `RUNNING`, bis der Einspruch entschieden ist. Ein einziger strittiger Lauf hält damit
den ganzen Betrieb der Anzeigen an:

- Die Stream-Uhr zählt weiter auf ein Rennen, das längst im Ziel ist.
- Der Board-Cursor (`BoardLogic.cursorIndex` sucht den letzten `RUNNING`) bleibt auf ihm
  stehen; Lower-Third, Ergebnis-Kachel und Athleten-Anzeige rücken nicht nach.
- Die Live-Spalte des Schiedsrichter-Dashboards führt ihn in voller Kartenhöhe weiter, obwohl
  dort nichts mehr zu tun ist außer zu warten.

**Die tragende Anforderung: ein Lauf in Klärung darf keinen anderen Lauf blockieren.** Alles
Übrige in diesem Papier ist Mittel zum Zweck.

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Was ist ein Lauf in Klärung? | Offen (nicht beendet), aber aus den laufenden Anzeigen heraus und ohne Sperrwirkung |
| Ergebnisse während der Klärung | Gehen nach der bestehenden Freigaberegel raus, sichtbar als **vorläufig** |
| Bedienung | Schiedsrichter-Dashboard **und** Durchführungsseite |
| Grund | Pflichtfeld, kurzer Text |
| Recht | Kein neues Privileg |
| Darstellung fürs Dashboard | Eigener, eingeklappter Sammelabschnitt statt voller Karten |

## 1. Datenmodell

Migration `V202608171200__match_clarification.sql`, drei Spalten auf `competition_match`:

| Spalte | Bedeutung |
|---|---|
| `clarification_since timestamp` | wann die Klärung begann |
| `clarification_reason varchar(255)` | der Pflichtgrund. Check-Constraint: `clarification_since is null or (clarification_reason is not null and btrim(clarification_reason) <> '')` — eine Klärung ohne Grund darf es nicht geben |
| `clarification_resolved_at timestamp` | wann sie aufgehoben wurde; null = noch offen. Zweiter Constraint: nur setzbar, wenn `clarification_since` gesetzt ist |

**Die eine Regel, aus der alles Weitere folgt:**

```
in Klärung  ⇔  clarification_since is not null  und  clarification_resolved_at is null
```

Beim Aufheben bleiben `clarification_since` und `clarification_reason` **stehen**, nur
`clarification_resolved_at` kommt dazu. Der beendete Lauf trägt damit die Spur „war in
Klärung: …" — für Siegerehrung und Protokoll das eigentlich Wertvolle, und billiger als eine
eigene Protokolltabelle. Deshalb darf **keine** Abfrage und keine Ableitung auf
`clarification_since is not null` allein prüfen: das hielte jeden je geklärten Lauf für ewig
in Klärung. Die drei Stellen, die es betrifft, sind der Zweig in `deriveMatchState`, der
SQL-Filter in `CompetitionMatchRepo` und das Feld in `ChainSlot`.

`activated_at` wird **nicht** angefasst. Der Lauf bleibt an den Start gerufen; wird die
Klärung aufgehoben, steht er ohne Zutun wieder auf `RUNNING`.

## 2. Zustandsableitung

Neuer Wert `CLARIFICATION` in `LiveDashboardMatchState` (Alias `MatchState`) und in
`LiveDashboardLogic.deriveMatchState` **genau ein neuer Zweig, ganz oben**:

```kotlin
inClarification && finishedAt == null    -> CLARIFICATION
activatedAt != null && startedAt == null -> PREPARING
activatedAt != null                      -> RUNNING
finishedAt != null                       -> FINISHED
// Rest unverändert
```

`inClarification` ist die Regel aus Abschnitt 1 (`since` gesetzt **und** `resolvedAt` null) —
die Ableitung bekommt sie als ein Argument übergeben, nicht als zwei Zeitstempel. So kann sie
in keiner Aufruferstelle falsch zusammengesetzt werden.

Klärung schlägt die Aktivierung — das ist der ganze Zweck. Das Beenden schlägt die Klärung:
freigegeben ist freigegeben. Die bestehende Reihenfolge `activated` vor `finished` bleibt
unangetastet.

### Warum ein echter Enum-Wert und keine Ablesung

`MatchStatusDto` warnt ausdrücklich davor, die Aufzählung zu erweitern: neue Werte fallen
still in jedes `else`, das über sie verzweigt. „Überfällig", „Teilweise gewertet" und
„Freilos" sind deshalb bewusst Ablesungen aus Zahlenfeldern, keine Zustände.

Hier ist genau dieses Durchfallen **erwünscht**. Jede Anzeige, die heute `state === 'RUNNING'`
fragt, hört mit dem neuen Wert von selbst auf, den Lauf als laufend zu zeigen — das ist die
Lösung, nicht das Risiko. Eine Ablesung (`clarification` als Zusatzfeld neben `state`) hätte
den umgekehrten Effekt: jede Anzeige, die das neue Feld noch nicht kennt, zeigte den Lauf
weiter als laufend, und die Sperre bliebe genau dort bestehen, wo sie weh tut.

Der Preis ist eine einmalige Durchsicht jeder Verzweigung über die Aufzählung. Die Liste ist
endlich und steht in Abschnitt 4.

## 3. Der Beleg für „blockiert nichts mehr"

Der Livestream (und mit ihm jede Board-Kachel) baut alle Slots relativ zum Cursor:
`BoardLogic.resolveOffset` löst Offset 0 über `currentMatch(running)` auf, positive Offsets
über die späteren Läufe des Running-Blocks und danach das Programm, negative über die
früheren und danach die Ergebnisse.

Fällt der strittige Lauf aus dem Running-Block:

- **Slot 0** springt auf den nächsten Lauf des Blocks (fahrend vor vorbereitet, wie gehabt);
  ist keiner da, ist Slot 0 leer und die Stream-Kachel fällt im Auto-Modus auf das jüngste
  Ergebnis zurück (`streamOverlay.autoContent`).
- **Slot −1** fällt auf die Ergebnisliste — das eben gefahrene Rennen ist wieder lesbar.
- **Die Uhr** hat keinen laufenden Lauf mehr und blendet sich nach ihrer eigenen Regel aus,
  statt ins Endlose zu zählen.

Herausgenommen wird er über die Abfrage, nicht über die Anzeige: In
`CompetitionMatchRepo.getRunningMatches` (Bedingung `ACTIVATED_AT.isNotNull`, Zeilen 364 und
528) kommt die Bedingung „nicht in Klärung" aus Abschnitt 1 dazu. Aus `getUpcomingMatchesForBoard` fällt er
ohnehin heraus, weil die Abfrage `ACTIVATED_AT.isNull` verlangt — er taucht also **nicht**
als „als nächstes" wieder auf. Für die öffentlichen Anzeigen ist er damit vollständig aus dem
laufenden Betrieb heraus und nur noch über den Ergebnis-Block zu sehen.

### Die Kette

`ScheduleChain.decideNext` behandelt einen Lauf in Klärung wie einen erledigten: weder
`matchOpen` noch blockierender `matchStartedAt`. `ChainSlot` bekommt dafür das Feld
`matchInClarification`, `EventScheduleRepo` liest die Spalte mit.

Die Kette hing an einem Einspruch übrigens nur im Nebenfall fest — ein durchgewerteter Lauf
gilt ihr schon heute als nicht mehr offen. Blockiert hätte sie ein Lauf, bei dem der Streit
noch vor der vollständigen Wertung ausbricht. Genau der ist jetzt abgedeckt.

## 4. Alle Stellen, die den Zustand lesen

**Verschwindet von selbst** (fällt aus `RUNNING` heraus, keine Änderung nötig):
Stream-Overlay `autoContent` / Modus `CLOCK` / Modus `LAPS`, `BoardLogic.cursorIndex`,
Athleten-Board-Laufkarte, `BoardMatchDetailElement`.

**Muss angefasst werden:**

| Stelle | Änderung |
|---|---|
| `CompetitionMatchRepo` (364, 528) | `and not (clarification_since is not null and clarification_resolved_at is null)` — nur die Anzeige-Abfragen |
| `ScheduleChain` / `ChainSlot` / `EventScheduleRepo` | Klärung zählt wie erledigt |
| `LiveDashboardLogic.selectForScope(LIVE)` | `CLARIFICATION` **aufnehmen** — die Schiedsrichter müssen ihn behalten |
| `common.ts` `isLiveMatch` | dito |
| `common.ts` `matchControls` | „Lauf beenden" ja, „Aktivieren" nein, „Läuft" nein, dazu „Klärung aufheben" |
| `matchStatusChip.ts` | eigener Chip „Klärung" (warning-orange), Grund als Tooltip |
| `timelineIndicator.ts` | eigener `case` samt Farbe, sonst neutral im Zeitstrahl |
| `RoundCountersDto` / `MatchStatusLogic.roundCounters` | eigener Zähler `clarification`; jeder Lauf zählt weiter in genau einen Topf |
| `roundDeletion.ts` | zählt als „auf Anzeigen sichtbar", wie `RUNNING` / `AWAITING_FINISH` |
| Ergebnis-DTOs (Athleten-Board, Stream-Panel, Ergebnisseite, Mein Event) | Flag `clarification` am Ergebnis → Badge „vorläufig · in Klärung" |
| `LiveMatchesLogic.notLive` | unverändert — der Lauf ist über den Ergebnis-Zweig zu sehen, nicht über den Live-Zweig |

`PublicResultsVisibility` bleibt unberührt. Ein Lauf in Klärung wird nicht strenger und nicht
großzügiger behandelt als jeder andere; er wird nur als vorläufig ausgewiesen.

## 5. Bedienung

### Schiedsrichter-Dashboard

- Knopf „In Klärung" auf der Laufkarte → Dialog mit Pflicht-Grundfeld. Absendbar erst bei
  nicht-leerem Text (`trim() !== ''`, dieselbe Regel wie `canSubmitNote`): der Knopf bietet
  nicht an, was der Server ohnehin ablehnt.
- Läufe in Klärung verlassen die Live-Liste und sammeln sich darunter in einem eigenen,
  standardmäßig **eingeklappten** Abschnitt `Klärung (2)`. Aufgeklappt je Lauf **eine Zeile**
  statt einer Karte: Wellenname · Wettkampf · Grund · „seit 14:37", rechts „Klärung aufheben"
  und „Lauf beenden". Keine Boote, keine Bedingungen, keine Crew — das ist der Zweck der
  kompakten Form.
- Der Abschnitt erscheint nur, wenn es etwas zu klären gibt, und bleibt stehen, auch wenn die
  Live-Spalte sonst leer ist.
- In der Gesamtliste bleibt der Lauf an seiner chronologischen Stelle mit dem Klärungs-Chip.

### Durchführungsseite

Derselbe Knopf und derselbe Dialog am Laufkopf, Chip zeigt „Klärung".

### Recht

Kein neues Privileg. Der Endpoint nimmt
`authenticateAny(UpdateLiveDashboardGlobal, UpdateEventGlobal)` — die Form gibt es bereits in
`calls/requests/Extensions.kt`. Nötig, weil die beiden Oberflächen unterschiedlich geschützt
sind: Dashboard über `UpdateLiveDashboardGlobal`, Durchführung über `UpdateEventGlobal`. Ohne
das könnte das Regattabüro den Knopf auf seiner eigenen Seite nicht drücken.

## 6. Schnittstelle

```
PUT    /event/{eventId}/live-dashboard/match/{matchId}/clarification   { reason }
DELETE /event/{eventId}/live-dashboard/match/{matchId}/clarification
```

- `PUT` auf einen Lauf, der bereits in Klärung ist, aktualisiert nur den Grund (ein Einspruch
  wird präzisiert); `clarification_since` bleibt der erste Zeitpunkt. Auf einen Lauf, dessen
  frühere Klärung aufgehoben wurde, beginnt er eine neue: `since = jetzt`,
  `resolved_at = null`, neuer Grund. Ein zweiter Einspruch ist ein zweiter Fall.
- `DELETE` setzt `clarification_resolved_at`; `since` und Grund bleiben als Spur stehen.
- `/finish` hebt eine offene Klärung implizit auf (setzt `resolved_at`) — Beenden **ist** die
  Freigabe, kein zweiter Klick.
- Beide bumpen `EventChangeMarker`, sonst hängen Board- und Live-Cache bis zur TTL hinterher.
- `documentation.yaml` ist handgepflegt; der neue Enum-Wert und beide Endpoints müssen dort
  von Hand eingetragen werden, danach `types.gen.ts` / `sdk.gen.ts` neu erzeugen.
- jOOQ gegen die **eigene** Build-DB neu generieren.

## 7. Tests

| Datei | was |
|---|---|
| `LiveDashboardLogicTest` | Klärung schlägt Aktivierung, Beenden schlägt Klärung — Zweigreihenfolge festnageln. Dazu der Rückweg: ein Lauf mit gesetztem `resolved_at` steht wieder auf `RUNNING` und nicht auf `CLARIFICATION` |
| `MatchStatusLogicTest` | neuer Zähler `clarification`, jeder Lauf in genau einem Topf |
| `ScheduleChainTest` | eine Startgruppe mit einem Lauf in Klärung hält die nächste nicht auf |
| `BoardLogicTest` | Cursor und `resolveOffset` rücken vor, wenn der strittige Lauf fehlt |
| `matchStatusChip.test.ts`, `timelineIndicator.test.ts` | Chip und Zeitstrahl-Farbe, kein Durchfallen auf neutral |
| `common.test.ts` | `matchControls` bei Klärung, `isLiveMatch` behält ihn |
| `streamOverlay.test.ts` | ein Lauf in Klärung verdrängt das jüngste Ergebnis nicht |
| `testComprehension` (Testcontainers) | Setzen, leerer Grund → 400, Aufheben, erneutes Setzen beginnt einen neuen Fall, Beenden hebt implizit auf |

## 8. Risiken und bewusste Lücken

- **RaceClocker läuft weiter.** Der Abruf ordnet über `activated_at` zu
  (`RaceClockerPollService`, Zeile ~516). Der neue SQL-Filter darf deshalb **nur** die
  Anzeige-Abfragen treffen, nicht die Zeitnahme-Zuordnung. Zeiten und Strafen sollen während
  der Klärung weiter eintreffen — darum geht der Streit ja oft.
- **Vorläufige Ergebnisse gehen raus.** Bei `RESULTS_COMPLETE` sind Plätze und Zeiten des
  strittigen Laufs öffentlich, mit Badge, aber sichtbar. Bei `FINISHED_ONLY` bleiben sie
  zurück, bis freigegeben wird. Das ist die bewusste Entscheidung, nicht ein Nebeneffekt.
- **Backend und Frontend müssen zusammen ausgeliefert werden.** Die Migration fügt nur
  Spalten hinzu und ist gutartig; der neue Enum-Wert in einem alten Frontend ist es nicht.
- **Kein Zwang zur Klärung.** Niemand muss den Knopf drücken; ein Einspruch, den die
  Schiedsrichter sofort entscheiden, läuft weiter wie bisher.
