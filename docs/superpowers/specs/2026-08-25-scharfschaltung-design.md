# Scharfschaltung der Erfassung („armed")

Stand 25.08.2026.

## Warum

Der Postenbildschirm erfasst heute bei jedem Druck. Das ist am Ziel richtig und unterwegs
gefährlich: Ein Tablet in der Tasche, ein Ärmel über der Tastatur, ein angelehnter Ellbogen — und
schon steht eine Zeit im System, die niemand genommen hat. Am schlimmsten trifft es die Tasten
`1`–`6` und `A`–`F`, denn die erfassen **mit Zuordnung**: Sie hängen die Falschzeit sofort an ein
bestimmtes Boot.

Die Gegenrichtung ist aber die eigentliche Gefahr, und sie bestimmt den ganzen Entwurf: **Ein
Zieleinlauf findet statt, und die Scharfschaltung wurde vergessen.** Eine Sicherung, die eine
echte Zielzeit verschluckt, ist schlimmer als gar keine. Deshalb muss der entschärfte Zustand
unübersehbar sein, und deshalb bleibt ein Weg immer offen.

## Entscheidungen (25.08.2026, mit Thomas abgestimmt)

1. **Zwei Betriebsarten je Posten.** `ONETOUCH` löst sofort aus, wie heute — das ist die Vorgabe,
   nichts ändert sich ungefragt. `ARMED` verlangt, dass der Posten sich vorher scharf schaltet.
2. **Der Posten entscheidet selbst**, wann er scharf ist. Der **Leitstand ist read-only**: Er zeigt
   den Zustand, er ändert ihn nicht. Wer am Wasser steht, weiß als Einziger, ob gleich ein Boot
   kommt.
3. **Scharf bleibt scharf**, bis jemand entschärft. Kein Selbst-Entschärfen nach der Erfassung und
   kein Zeitfenster: An der Ziellinie kommen sechs Boote in zwanzig Sekunden, und ein Knopf, der
   zwischendurch von selbst zufällt, ist unbrauchbar.
4. **Entschärft sperrt jede Erfassung mit Zuordnung** — die Boots-Knöpfe im Raster, die Tasten
   `1`–`6` und `A`–`F`, und die Leertaste.
5. **Der manuelle Zieleinlauf ohne Zuordnung bleibt immer erlaubt.** Das ist die Notlösung für
   genau den Fall, den Entscheidung 4 sonst zur Katastrophe machte: Wer das Scharfschalten
   verschlafen hat, greift den großen Knopf, bankt die Zeit und ordnet sie hinterher zu. Dieser
   Knopf wird nie gesperrt.
6. **Nichts wird gepuffert.** Ein entschärfter Posten merkt sich keine Drücke, um sie beim
   Scharfschalten nachzutragen. Eine Zeit, die Sekunden später „nachgereicht" wird, ist eine Zahl,
   der niemand trauen kann.

### Warum die Leertaste gesperrt wird, obwohl sie ohne Zuordnung bankt

Das ist die eine Stelle, an der die Regel nicht aus der Wirkung folgt, sondern aus der
Unfallfläche. Die Leertaste tut technisch dasselbe wie der große Knopf. Sie wird trotzdem
gesperrt, weil **Tasten** das sind, was versehentlich getroffen wird — ein Ärmel trifft eine
Tastatur, nicht einen bestimmten Knopf auf dem Bildschirm. Der Notausgang soll ein absichtlicher
Griff sein.

### Was ausdrücklich NICHT dazugehört

Die **Startsequenz** des Startpostens. Sie ist keine Zeiterfassung, sondern das Auslösen eines
Rennens, und sie hat ihre eigene Bedienung. Enger anzufangen lässt sich leichter erweitern als
zurücknehmen.

## Modell

```sql
alter table timing_station
    -- Die Betriebsart: ONETOUCH loest sofort aus (Vorgabe, heutiges Verhalten), ARMED verlangt
    -- das Scharfschalten. Gepflegt wird sie in den Veranstaltungs-Einstellungen beim Posten --
    -- das ist eine Entscheidung der Regattaleitung, keine des Zeitnehmers.
    add column capture_mode text not null default 'ONETOUCH'
        check (capture_mode in ('ONETOUCH', 'ARMED')),
    -- Der Betriebszustand, den der Posten selbst schaltet. Nur bei capture_mode = 'ARMED' von
    -- Bedeutung; im ONETOUCH-Betrieb liegt er brach und wird nicht gelesen.
    --
    -- Getrennt von der Betriebsart, weil die beiden verschiedene Besitzer haben: Die Art setzt die
    -- Regattaleitung einmal, den Zustand kippt der Zeitnehmer am Tag zwanzigmal. In einer Spalte
    -- ueberschriebe das Entschaerfen die Konfiguration.
    add column armed boolean not null default false;
```

Neu scharfgeschaltet wird nichts von selbst: Ein Posten, den die Leitung auf `ARMED` stellt, steht
danach auf `armed = false` und muss vor Ort scharf geschaltet werden. Das ist die sichere Richtung
— ein Posten, der sich still selbst scharf schaltet, ist genau das, was Entscheidung 1 verhindern
soll.

## Der Schalter

**Halten statt tippen.** Etwa eine Sekunde gedrückt halten, mit sichtbar mitlaufendem Ring. Ein
Tippen kann in der Tasche passieren, ein einsekündiges Halten nicht — und im Eifer des
Zieleinlaufs ebenso wenig. Dasselbe gilt fürs Entschärfen: Beide Richtungen brauchen dieselbe
bewusste Geste.

**Unübersehbar.** Der entschärfte Zustand ist kein kleines Abzeichen in einer Ecke, sondern
verändert den Bildschirm sichtbar: Die Boots-Knöpfe sind erkennbar tot, und über der
Erfassungsfläche steht ein Balken in Warnfarbe, der sagt, dass nicht erfasst wird und was zu tun
ist. Der Zustand muss aus drei Metern Entfernung ablesbar sein — ein Zeitnehmer schaut auf das
Wasser, nicht auf den Schirm.

**Der Notausgang wird benannt.** Im entschärften Zustand trägt der große Knopf eine eigene
Beschriftung: Zeit ohne Zuordnung banken, später zuordnen. Wer in dem Moment nicht liest, sondern
drückt, hat trotzdem das Richtige getan.

## Schnittstellen

| Methode | Pfad | Zweck |
|---------|------|-------|
| `PUT` | `/event/{eventId}/timing/stations/{stationId}/armed` | Scharf schalten und entschärfen |

Rechte wie bei der Posten-Startliste: **Sitzung oder Geräte-Token**. Der Zeitnehmer auf dem
geteilten Tablet hat keine Anmeldung, nur den Token, und muss trotzdem schalten können — ohne das
wäre die Sicherung genau dort nicht bedienbar, wo sie gebraucht wird.

Die **Betriebsart** wandert dagegen in den vorhandenen `TimingStationRequest` und bleibt bei
`UpdateEventGlobal`: Sie gehört zur Einrichtung der Veranstaltung, nicht zum Betrieb.

Jede Änderung sendet die vorhandene WebSocket-Nachricht `stationsChanged`. Ein neuer
Nachrichtentyp ist nicht nötig — Leitstand und Posten hören auf sie bereits und laden ihre
Postenliste daraufhin neu. Damit ist der Zustand im Leitstand ohne Zutun aktuell.

## Oberfläche

**Postenbildschirm** (`TimingBoardPage`): der Halte-Schalter über der Erfassungsfläche, der
Warnbalken im entschärften Zustand, tote Boots-Knöpfe, und der große Knopf mit seiner
Notlösungs-Beschriftung. Bei `ONETOUCH` erscheint kein Schalter — dort gibt es nichts zu schalten.

**Leitstand** (`LeitstandOverviewTab`): je Posten ein Abzeichen — „scharf", „entschärft",
„Onetouch". Read-only. Der Gewinn ist die Vorwarnung: Die Regattaleitung sieht vor dem Rennen,
dass Boje 1 noch entschärft ist, und kann anrufen.

## Die Entscheidung, was gesperrt ist, gehört in reine Logik

`frontend/src/utils/timing/armed.ts`:

```ts
/** Darf dieser Posten gerade mit Zuordnung erfassen? */
export const captureAllowed = (mode: TimingCaptureMode, armed: boolean): boolean =>
    mode === 'ONETOUCH' || armed
```

Eine Zeile, aber sie wird an vier Stellen gebraucht (Boots-Knöpfe, Boots-Tasten, Leertaste,
Warnbalken). An vier Stellen dieselbe Bedingung von Hand zu schreiben ist die Art Fehler, bei der
später genau eine davon vergessen wird.

## Tests

**Backend:** Vorgabe ist `ONETOUCH` und `armed = false`; der Schalt-Endpunkt wirkt mit Sitzung und
mit Geräte-Token; er sendet `stationsChanged`; ein Posten einer fremden Veranstaltung wird
abgelehnt.

**Frontend:** `armed.test.ts` — die vier Kombinationen aus Betriebsart und Zustand. Dazu in
`boardFocus.test.ts` bzw. am Aufrufer: Eine gesperrte Taste erfasst nichts.

## Risiken

- **Die Sicherung kann eine echte Zielzeit kosten.** Genau dagegen steht Entscheidung 5, und
  deshalb darf der große Knopf unter keinen Umständen mitgesperrt werden. Wer diese Arbeit später
  anfasst: Das ist die eine Zeile, die nicht verhandelbar ist.
- **`ARMED` als Vorgabe wäre ein Renntag-Ausfall.** Die Migration setzt deshalb `ONETOUCH` für
  alle bestehenden Posten. Wer die Vorgabe später dreht, dreht sie für Veranstaltungen, die davon
  nichts wissen.
- **Der Zustand liegt auf dem Server.** Ein Posten ohne Netz kann nicht schalten. Der Bildschirm
  muss deshalb den zuletzt bekannten Zustand weiterverwenden statt in eine Sperre zu fallen — im
  Zweifel erfassen, nicht verweigern.
