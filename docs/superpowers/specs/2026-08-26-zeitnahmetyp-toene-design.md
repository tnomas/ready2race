# Der Zeitnahmetyp bekommt seine Töne

Stand 26.08.2026. Baut auf dem Zeitnahmeprofil-Baum, den Zwischenzeiten und der Scharfschaltung auf.

## Warum

Die Zeitnahme-Einstellungen der Veranstaltung tragen inzwischen alles: System, Genauigkeit,
Abruf-Takte, drei Ton-Editoren, die Einstellungen des Athleten-Startbildschirms, die
RaceClocker-Rennen, die Zeitnahmetypen und den Profil-Baum. 638 Zeilen in einer Datei, und beim
Scrollen findet niemand mehr, was er sucht.

Das ist aber nur das Symptom. Zwei Dinge stehen an der falschen Stelle:

1. **Die Töne gehören zum Zeitnahmetyp.** Ein Zeitnahmetyp beschreibt, wie ein Lauf gestartet und
   gemessen wird — die Töne sind Teil dieser Beschreibung, nicht der Veranstaltung. Heute hat der
   Typ nur den Startsequenz-Tonplan; Zwischenton, Fehlstart-Folge und Zielton liegen an der
   Veranstaltung und gelten stur für alle. Ein Zeitfahren und ein Massenstart klingen damit gleich,
   obwohl sie verschiedene Vorgänge sind.
2. **Die Einstellungen des Athleten-Startbildschirms gehören auf den Bildschirm.** Wer sie ändert,
   steht davor und sieht sofort, was passiert. In der Veranstaltungs-Seite verstopfen sie den Blick
   auf alles andere.

## Entscheidungen (26.08.2026, mit Thomas abgestimmt)

1. **Töne wandern zum Zeitnahmetyp** — alle vier: Startsequenz, Zwischenton, Fehlstart, Ziel.
2. **Ton-Sätze sind benannte Vorlagen an der Veranstaltung.** Ein Satz trägt alle vier Töne und
   einen Namen („Laut fürs Wasser", „Leise für die Halle"). Einer je Veranstaltung ist der
   **Vorgabesatz**.
3. **Ein Zeitnahmetyp wählt einen Satz — oder erbt.** Lässt er die Wahl leer, gilt der Vorgabesatz.
   Das ist beides zugleich: die Vorlage, die Thomas „Template" nannte, und die Vererbung, nach der
   er später fragte. Wer die Lautstärke aller Typen ändern will, ändert einen Satz statt sieben
   Typen.
4. **Die Startbildschirm-Einstellungen wandern auf den Bildschirm**, hinter ein Zahnrad. Die Daten
   bleiben an der Veranstaltung — es ist eine Einstellung der Regatta, nicht des Geräts —, nur der
   Ort der Bedienung wandert.
5. **Neu am Typ: „Startsequenz ja/nein".** Nicht jeder Lauf wird von der App gestartet.
6. **Neu am Typ: die Tastenbelegung.** `1`–`6` und `A`–`F` waren fest verdrahtet.
7. **Die Tonleiter je Boot gehört zum Ton-Satz** — die angehaltene Aufgabe aus dem
   Zwischenzeiten-Plan wandert hierher, an die richtige Stelle.
8. **Erklärtexte** für Startart und Fehlstart, direkt am Feld.

### „Fehlstart möglich" bleibt Bedienhilfe

`timing_mode.false_start_enabled` existiert bereits. Der Schalter sagt nur, ob am Startposten
überhaupt ein Fehlstart-Knopf erscheint — er greift **nicht** in die Wertung ein. Der Hinweistext
sagt das ausdrücklich: Ob ein Fehlstart eine Strafzeit oder eine Ausscheidung nach sich zieht,
entscheidet das Regelwerk und wird von Hand gewertet.

## Modell

### Neu: `timing_tone_set`

```sql
create table timing_tone_set
(
    id                 uuid      primary key,
    event              uuid      not null references event on delete cascade,
    name               text      not null,
    -- Der Vorgabesatz der Veranstaltung: Zeitnahmetypen ohne eigene Wahl erben ihn. Genau einer
    -- je Veranstaltung -- erzwungen ueber den partiellen Index unten, nicht ueber Anwendungslogik,
    -- weil zwei Vorgaben eine Frage aufwerfen, die niemand beantworten kann.
    is_default         boolean   not null default false,
    -- Die vier Toene. jsonb wie bisher an der Veranstaltung und am Typ; null heisst jeweils
    -- "eingebauter Standard", damit "Standard wiederherstellen" moeglich bleibt.
    sequence_tone_plan jsonb,
    split_tone         jsonb,
    false_start_tone   jsonb,
    finish_tone        jsonb,
    -- Unterscheidet der Erfassungston die Boote? Position 1 spielt den Zielton, die uebrigen fuenf
    -- eine feste pentatonische Leiter darueber. Gehoert hierher und nicht an die Veranstaltung:
    -- Es ist eine Eigenschaft dieses Klangbildes.
    tone_per_boat      boolean   not null default true,
    created_at         timestamp not null,
    created_by         uuid      references app_user on delete set null,
    updated_at         timestamp not null,
    updated_by         uuid      references app_user on delete set null,
    unique (event, name)
);

create unique index on timing_tone_set (event) where is_default;
```

### `timing_mode` wächst

```sql
alter table timing_mode
    -- null heisst "erbt den Vorgabesatz der Veranstaltung". set null beim Loeschen: Wer einen Satz
    -- wegwirft, soll nicht gehindert werden; die Typen fallen dann auf die Vorgabe zurueck.
    add column tone_set uuid references timing_tone_set on delete set null,
    -- Startet die App diesen Lauf? Vorgabe an -- das heutige Verhalten.
    add column start_sequence_enabled boolean not null default true,
    -- Die Tasten, die am Zielposten die Boote treffen, in Positionsreihenfolge. Zwei Reihen, weil
    -- man je nach Tastatur greift, was naeher liegt; die zweite ist optional.
    add column boat_keys_primary   text not null default '123456',
    add column boat_keys_secondary text default 'ABCDEF';
```

Der bisherige `timing_mode.tone_plan` entfällt — er geht in den Ton-Satz auf.

### Die Migration der Bestandsdaten

Das Verhalten muss **exakt** erhalten bleiben. Die Schwierigkeit: Der Startsequenz-Tonplan hängt
heute am Typ, die anderen drei Töne an der Veranstaltung. Ein Satz je Veranstaltung könnte
verschiedene Tonpläne nicht abbilden.

Regel:

1. Je Veranstaltung mit Zeitnahmetypen einen Satz **„Standard"** anlegen: `is_default = true`, die
   drei Veranstaltungs-Töne übernehmen, `sequence_tone_plan = null`.
2. Für **jeden Typ mit eigenem `tone_plan`** einen weiteren Satz anlegen, benannt nach dem Typ, mit
   dessen Tonplan und denselben drei Veranstaltungs-Tönen; der Typ zeigt darauf.
3. Typen ohne eigenen Tonplan bleiben auf `tone_set = null` und erben damit „Standard".

Danach klingt jeder Lauf wie zuvor. Die Veranstaltungs-Spalten `timing_finish_tone`,
`timing_split_tone` und `timing_false_start_tone` fallen **erst in einer zweiten Migration**, nach
dem Umbau des Lesewegs — sonst steht zwischen zwei Migrationen ein Zustand ohne Töne.

## Wie die Töne an die Boards kommen

Das ist die eingreifendste Änderung, und sie verdient eine eigene Überlegung.

Heute liefert `GET /timing/settings` **einen** Satz Töne je Veranstaltung. Künftig hängen sie am
Zeitnahmetyp, und den hat jede Partie einzeln — die Posten-Startliste (`/timing/matches`) liefert
ihn bereits als `timingMode`. Also:

- **`TimingMatchDto.timingMode` trägt den aufgelösten Ton-Satz mit** (die vier Töne und
  `tonePerBoat`, bereits auf den eingebauten Standard aufgelöst). Der Posten spielt die Töne der
  Partie, die er gerade führt.
- **`TimingSettingsDto` behält einen Rückfall**: den Vorgabesatz der Veranstaltung, aufgelöst. Den
  braucht der große Erfassungsknopf, wenn keine Partie geführt wird — eine Zeit ohne Zuordnung
  gehört zu keinem Typ. Ohne diesen Rückfall bliebe der Notausgang stumm, und Stille an der
  Ziellinie liest sich wie ein Fehler.

`showManualCapture`, `precision`, `autoApply` und `startDisplay` bleiben, wo sie sind — sie sind
Eigenschaften der Veranstaltung, nicht des Laufs.

## Oberfläche

**Veranstaltungs-Einstellungen** werden leichter, nicht schwerer:
- Die drei Ton-Editoren verschwinden von dort. An ihre Stelle tritt die Verwaltung der **Ton-Sätze**
  (Liste, anlegen, bearbeiten, einen als Vorgabe markieren) — ein Abschnitt statt dreier Editoren.
- Die **Startbildschirm-Einstellungen** verschwinden ersatzlos; ein Satz verweist auf das Zahnrad
  am Bildschirm.

**Zeitnahmetyp-Dialog** bekommt: Ton-Satz (Auswahl mit „Erbt (Standard)" als Vorgabe),
Startsequenz ja/nein, die Tastenbelegung, und die Erklärtexte an Startart und Fehlstart.

**Athleten-Startbildschirm** (`TimingStartDisplayPage`) bekommt ein **Zahnrad**, das die
vorhandenen Einstellungen in einem Dialog öffnet. Dasselbe Backend-Feld, derselbe Endpunkt — nur
der Ort. Auf einem Bildschirm, der im Vollbild an der Wand hängt, muss das Zahnrad zurückhaltend
sein und darf die Anzeige nicht stören: klein, in einer Ecke, und es verschwindet nach einigen
Sekunden ohne Mausbewegung.

## Tests

**Backend:**
- Migrationstest gegen Altdaten: Ein Typ mit eigenem Tonplan bekommt seinen eigenen Satz, ein Typ
  ohne bleibt auf `null`; der Vorgabesatz trägt die drei Veranstaltungs-Töne. **Das ist der
  wichtigste Test der ganzen Arbeit** — er belegt, dass niemandes Regatta anders klingt als gestern.
- Genau ein Vorgabesatz je Veranstaltung (der Index greift).
- Ein Typ ohne eigenen Satz löst auf den Vorgabesatz auf; einer mit Satz auf seinen.
- Ein gelöschter Satz lässt seine Typen auf die Vorgabe zurückfallen, statt sie unbrauchbar zu
  machen.
- Die Tastenbelegung wird geprüft: keine Doppelung innerhalb einer Reihe und nicht zwischen den
  beiden Reihen, Länge passend, kein Leerzeichen (die Leertaste hat ihre eigene Bedeutung).

**Frontend:** die Tonleiter (`boatPitch`) mit den Fällen aus dem angehaltenen Plan; die Auflösung
der Tastenbelegung auf eine Position (heute `finishKeyTarget` mit fest verdrahteten Bereichen).

## Reihenfolge

1. `timing_tone_set` samt Migration der Bestandsdaten, Domäne und Endpunkten.
2. Auflösung: Typ → Satz → eingebauter Standard; `TimingMatchDto` und `TimingSettingsDto` umbauen;
   die Boards auf die Töne der Partie umstellen.
3. Die zweite Migration: die drei Ton-Spalten der Veranstaltung fallen.
4. Zeitnahmetyp-Dialog: Ton-Satz, Startsequenz, Tastenbelegung, Erklärtexte.
5. Ton-Satz-Verwaltung in den Veranstaltungs-Einstellungen; die drei Editoren dort raus.
6. Zahnrad am Athleten-Startbildschirm; die Einstellungen aus der Veranstaltungs-Seite raus.
7. Die Tonleiter je Boot (aus dem angehaltenen Plan, jetzt am Ton-Satz).

## Risiken

- **Eine Regatta darf nach der Migration nicht anders klingen.** Das ist die eine Zusicherung, an
  der die ganze Arbeit hängt; deshalb der Migrationstest gegen Altdaten und deshalb die zwei
  getrennten Migrationen.
- **Der Notausgang muss hörbar bleiben.** Eine Zeit ohne Zuordnung gehört zu keinem Typ; ohne den
  Rückfall auf den Vorgabesatz bliebe genau der Griff stumm, der im Ernstfall zählt.
- **Die Tastenbelegung ist frei und kann sich selbst im Weg stehen.** Deshalb die Prüfung gegen
  Doppelungen und gegen die Leertaste — eine Belegung, die zwei Boote auf dieselbe Taste legt,
  fällt sonst erst am Renntag auf.
