# Testkatalog: Materialvermietung (Boote und Zubehör)

Handtests zur Spec `docs/superpowers/specs/2026-09-07-materialvermietung-design.md`. Jeder Fall
mit Vorbedingung, Schritten und Erwartung. Wo nichts anderes steht, ist die Vorbedingung
"Backend und Frontend laufen gegen eine Datenbank mit `docs/seeds/seed-dm-coastal-2026.sql` und
danach `docs/seeds/seed-material.sql`".

## Testdaten auf einen Blick

- **Veranstaltung:** DM Coastal Rowing 2026, Event-ID `5eed0001-0000-0000-0000-000000000001`. Der
  Seed stellt die Meldefrist offen (gestern bis in 14 Tagen).
- **Konten** (Passwort jeweils `material123`, Pepper siehe unten): `material@test.de` (Bootshaus
  Nord), `material2@test.de` (zweiter Anbieter „Ruderwerft Süd", Sprache en - für F1 und die
  englische Rückzugs-Mail), `verein@material.test` (Vereinsvertretung DM-Verein 1 - für Block A).
- **Wettkampf mit Läufen für Block E:** „M1 Männer-Doppelvierer Materialtest" (CM 4x+ MT) mit
  Vorlauf 1 (läuft seit dem Einspielen), Vorlauf 2 (in 20 min) und Finale (in 90 min). MT 1: Boot 7
  bei Startnummer 1 (Abweichung); MT 2: „Vierer 2" bei Startnummer 2 (passt); MT 3: Grundzuteilung
  Boot 6 (Totalschaden), im Vorlauf 2 Ersatz Boot 8 als Ausnahme; MT 4: eigenes Boot, offene
  Anfrage beim zweiten Anbieter. Dazu das Board „Materialtest-Board", die Stream-Szene
  „Materialtest" und Mein Event unter `/event/<eventId>/my-event/MATERIAL-MEINEVENT-1`.
- **Abweichung** heißt seit dem 14.11.2026: Bootsnummer ≠ Startnummer **im jeweiligen Lauf**
  (`competition_match_team.start_number`), nicht die Meldungsnummer aus der Fixierung.
- **Anbieter:** Bootshaus Nord, eingeladen, Vergabe offen (`requests_closed = false`).
- **Anbieter-Login:** `material@test.de` / `material123` (Rolle Materialanbieter, `READ`/`UPDATE MATERIAL OWN`).
  Der Passwort-Hash im Seed ist mit Pepper `pepper` erzeugt (siehe Kopfkommentar der Seed-Datei)
  - klappt der Login nicht, steht `SECURITY_PEPPER` in der lokalen `.env` auf einem anderen Wert;
  dann Passwort über "Passwort vergessen" neu setzen.
- **Materialarten:** C1x (2 Boote, Angebot "35 € pro Tag"), C2x (3 Boote, "55 € pro Tag"),
  C4x+ (3 Boote, "95 € pro Tag"), Skull-Paar (4 Stück, OTHER, "15 € pro Tag").
- **Flotte:** Boot 1/2 = C1x, Boot 3/4/5 = C2x, Boot 6/7/8 = C4x+, Skullpaar 1-4 = Skull-Paar.
- **Bedarf:** Wettkampf 1 "CF 2x" braucht 1× C2x, Wettkampf 2 "CM 4x+" braucht 1× C4x+,
  Wettkampf 3 "CF 1x" braucht 1× C1x (je Team).
- **Anfragen:**
  - REQUESTED: Bremerhaven, Wettkampf 1 (CF 2x), Startnummer 1, Angebot C2x.
  - CONFIRMED: Bremerhaven, Wettkampf 2 (CM 4x+), Startnummer 1, Angebot C4x+ - **bereits
    Boot 7 zugeteilt** (Grundzuteilung, Abweichung von Startnummer 1).
  - WAITLISTED: Bremerhaven, Wettkampf 3 (CF 1x), Startnummer 1, Angebot C1x.
  - DECLINED: ARV Kiel, Wettkampf 1 (CF 2x), Startnummer 2, Angebot C2x.
- **Schaden:** Boot 6 (C4x+), Totalschaden, gemeldet 15.08.2026 18:30, Ausfallfenster offen
  (`bis auf Weiteres`), Verursacher-Momentaufnahme "ARV Kiel CM 4x+".
- **Adressen:** `/material` (Veranstaltungswahl), `/material/event/<eventId>?tab=requests|
  assignment|damages|settings`, `/material/fleet`, `/material/admin` (nur GLOBAL). Anmeldung
  unter `/event/<eventId>/registration/...` (Materialabschnitt je Team mit Bedarf). Einladung im
  Veranstalter-Tab "Organisation" der Veranstaltungsseite.

---

## Block A: Anmeldung

### A1 - Formularabschnitt "Material" erscheint je Team mit Bedarf

**Vorbedingung:** Als Verein/Admin an der Anmeldung für München (Wettkampf 1 "CF 2x",
Registrierung `5eed0001-0020-0000-0000-000000000005`) angemeldet, Vergabe für Bootshaus Nord
offen.

**Schritte:** Anmeldeformular für München öffnen, zum Team "CF 2x" scrollen.

**Erwartung:** Unter den Gebühren erscheint ein Abschnitt "Material" mit einer Zeile
"C2x (1 Stück)". Schalter/Auswahl "Eigenes Boot" / "mieten bei Bootshaus Nord". Daneben Ampel
(grün) und Preistext "55 € pro Tag". Wettkämpfe ohne Bedarf (kein Wettkampf im Seed) zeigen
keinen Materialabschnitt.

### A2 - Ampel wechselt von Grün auf Gelb

**Vorbedingung:** Wie A1. Angebot C4x+ hat `planned_count = 3`, aktuell zählt nur die
CONFIRMED-Anfrage von Bremerhaven (Summe 1) - Ampel steht auf Grün.

**Schritte:** Für zwei weitere Teams im Wettkampf 2 "CM 4x+" (z. B. ARV Kiel und Bergedorf,
Registrierungen `...0008` und `...0009`) "mieten bei Bootshaus Nord" wählen und speichern, bis
die Summe aus bestätigten und offenen Anfragen 3 erreicht.

**Erwartung:** Sobald die Summe `planned_count` erreicht, wechselt die Ampel für C4x+ bei allen
Teams dieses Wettkampfs auf Gelb. Es gibt kein Rot, auch bei Überbuchung nicht.

### A3 - Kein Angebot: nur Hinweis "eigenes Boot mitbringen"

**Vorbedingung:** Ein Wettkampf ohne `competition_properties_has_material_type`-Zeile (z. B.
Wettkampf 4 "CM 2x" - kein Bedarf im Seed hinterlegt).

**Schritte:** Anmeldeformular für ein Team in Wettkampf 4 öffnen.

**Erwartung:** Kein Materialabschnitt, kein Angebot, keine Ampel - Wettkampf 4 hat keinen
Bedarf hinterlegt.

### A4 - Erneutes Speichern behält bestehende Anfrage

**Vorbedingung:** Bremerhaven hat eine CONFIRMED-Anfrage auf C4x+ (Wettkampf 2, Registrierung
`...0007`).

**Schritte:** Anmeldeformular für Bremerhaven öffnen (ohne am Materialabschnitt für Wettkampf 2
etwas zu ändern) und speichern.

**Erwartung:** `PUT .../materialRequests` wird mit der vollständigen Liste aufgerufen, die
CONFIRMED-Anfrage bleibt unverändert bestehen (Status, Zuteilung Boot 7 unangetastet) - nicht
neu angelegt, nicht zurückgezogen.

### A5 - Vergabe geschlossen: Formular blendet Schalter aus

**Vorbedingung:** Als `material@test.de` im Reiter "Einstellungen" (`/material/event/<eventId>?
tab=settings`) den Schalter "Vergabe geschlossen" für Bootshaus Nord aktivieren.

**Schritte:** Anmeldeformular für ein Team ohne bestehende Anfrage öffnen (z. B. München,
Wettkampf 3 "CF 1x", Registrierung `...0011`).

**Erwartung:** Kein Schalter zum Anfragen mehr sichtbar, nur der Hinweis, dass die Vergabe
geschlossen ist. Ein direkter `PUT .../materialRequests`-Aufruf mit einer neuen Anfrage wird
serverseitig abgelehnt.

### A6 - Zurückziehen einer bestätigten Anfrage löst E-Mail an den Anbieter aus

**Vorbedingung:** Bremerhavens CONFIRMED-Anfrage auf C4x+ (`5eed0009-0006-0000-0000-000000000002`)
besteht, Bootshaus Nord hat `contact_email = kontakt@bootshaus-nord.de` gesetzt. SMTP/Mail-Log
ist einsehbar (Dev-Mailtrap oder Server-Log).

**Schritte:** Im Anmeldeformular für Bremerhaven die Materialauswahl für Wettkampf 2 auf
"Eigenes Boot" zurücksetzen und speichern.

**Erwartung:** Die Anfrage wird `WITHDRAWN`. `notifyProviderOfWithdrawal` verschickt eine Mail
mit dem Template `MATERIAL_REQUEST_WITHDRAWN` an `kontakt@bootshaus-nord.de`, mit Verein
"Bremerhaven", Veranstaltung und "C4x+ (Männer-Doppelvierer mit Steuerfrau/-mann)". Die
Grundzuteilung auf Boot 7 verschwindet aus der Einteilung des Anbieters.

### A7 - Fehlerfall: Anfrage doppelt auf dieselbe Art

**Vorbedingung:** München hat noch keine Anfrage für Wettkampf 1 "CF 2x" (Registrierung
`...0005`).

**Schritte:** Im Materialabschnitt zweimal "mieten bei ..." für dieselbe Materialart über die
API erzwingen (`PUT .../materialRequests` zweimal mit derselben Art) oder über die UI, falls
sie das zulässt.

**Erwartung:** Die zweite Anfrage auf dieselbe Materialart derselben Meldung wird abgelehnt
(unique index `competition_registration, material_offer` bzw. Service-Prüfung "höchstens eine
Anfrage je Materialart").

---

## Block B: Anbieter-Dashboard

### B1 - Anfragen entscheiden: bestätigen

**Vorbedingung:** Login `material@test.de`, `/material/event/5eed0001-0000-0000-0000-000000000001?tab=requests`.
Die REQUESTED-Anfrage von Bremerhaven (Wettkampf 1 "CF 2x", C2x) ist sichtbar.

**Schritte:** Zeile öffnen, "Bestätigen" klicken.

**Erwartung:** Status wechselt zu "bestätigt" (grüner Chip), `decidedAt` wird gesetzt. Die
Kopfzeile "C2x: 2 bestätigt / 0 offen / 0 Warteliste von 3" (Zahlen nach der Aktion) aktualisiert
sich.

### B2 - Anfragen entscheiden: Warteliste mit Notiz

**Vorbedingung:** Wie B1, eine offene Anfrage vorhanden (z. B. eine neu über A2 angelegte).

**Schritte:** "Auf Warteliste setzen" klicken, im Dialog eine Notiz eintragen, speichern.

**Erwartung:** Status "Warteliste", die Notiz erscheint in der Detailansicht der Anfrage.

### B3 - Anfragen entscheiden: ablehnen mit Notiz

**Vorbedingung:** Wie B1.

**Schritte:** Bei einer offenen Anfrage "Ablehnen" wählen, Notiz "Kein Boot mehr frei" eintragen.

**Erwartung:** Status "abgelehnt", zählt nicht mehr in der Kapazitätsanzeige des Angebots.

### B4 - Mehrfachauswahl "Alle offenen bestätigen"

**Vorbedingung:** Mindestens zwei REQUESTED-Anfragen vorhanden (z. B. A2-Zusatzanfragen).

**Schritte:** Mehrere Zeilen mit Status "angefragt" markieren, "Alle offenen bestätigen"
klicken.

**Erwartung:** Erfolgsmeldung "N Anfragen bestätigt", alle markierten Zeilen wechseln auf
"bestätigt". Bei einzelnen Fehlern (z. B. Art passt nicht mehr) erscheint "N Anfragen konnten
nicht bestätigt werden" mit korrekter Zahl.

### B5 - Warteliste-Hervorhebung, wenn eine Bestätigung frei wird

**Vorbedingung:** Angebot C1x hat `planned_count = 2`. Zwei Teams zusätzlich zur bestehenden
WAITLISTED-Anfrage (Bremerhaven) auf CONFIRMED setzen, bis die Kapazität voll ist, dann eine der
CONFIRMED-Anfragen zurückziehen (über die Anmeldung, siehe A6) oder ablehnen.

**Schritte:** Nach dem Freiwerden eines Platzes den Reiter "Anfragen" neu laden.

**Erwartung:** Die älteste WAITLISTED-Anfrage (Bremerhaven, `requestedAt` 21.07.2026) wird optisch
hervorgehoben. Es wird **nichts automatisch bestätigt** - der Anbieter muss selbst "Bestätigen"
klicken.

### B6 - Einteilung "Nach Startnummer zuteilen"

**Vorbedingung:** `/material/event/<eventId>?tab=assignment`, Ansicht "Nach Team". Bremerhavens
CONFIRMED-Anfrage auf C4x+ hat bereits Boot 7 (Abweichung). Boot 6 (C4x+, Nummer 6) ist durch den
Totalschaden im Ausfallfenster.

**Schritte:** "Nach Startnummer zuteilen" klicken.

**Erwartung:** Meldung "Keine passenden Vorschläge gefunden", weil das einzige C4x+-Team mit
Startnummer 1 bereits eine Grundzuteilung hat (Boot 1 existiert ohnehin nicht in C4x+) und Boot 1
gar nicht zur Art passt. Zusätzliche CONFIRMED-Anfragen mit passender Startnummer (z. B. ein
Team mit Startnummer 8 und C4x+-Anfrage) werden dagegen automatisch auf Boot 8 vorgeschlagen und
übernommen; Erfolgsmeldung "N Zuteilungen nach Startnummer übernommen".

### B7 - Ausnahme je Lauf

**Vorbedingung:** Bremerhavens CONFIRMED-Anfrage (C4x+, Boot 7 als Grundzuteilung) hat einen
Lauf "Finale DM" (`5eed0001-0013-0000-0000-000000000002`).

**Schritte:** In der Zeile "Ausnahme je Lauf" öffnen, Lauf "Finale DM" wählen, ein anderes
C4x+-Boot (z. B. Boot 8) als Ersatz für genau diesen Lauf eintragen, speichern.

**Erwartung:** Die Ausnahme gilt nur für "Finale DM"; die Grundzuteilung (Boot 7) bleibt für
alle anderen Läufe bestehen. Die Sicht "Nach Materialstück" zeigt Boot 8 für diesen Lauf, Boot 7
bleibt ohne Lauf für den Rest.

### B8 - Konfliktprüfung: falsche Art

**Vorbedingung:** Wie B6.

**Schritte:** Versuchen, Bremerhavens C4x+-Anfrage manuell einem Skull-Paar-Stück zuzuteilen
(z. B. über einen direkten API-Aufruf, falls die UI die Auswahl schon filtert).

**Erwartung:** Wird abgelehnt ("falsche Art wird nicht angeboten"); die UI bietet in der
Zuteilungs-Auswahl von vornherein nur Stücke der passenden Materialart (C4x+) an.

### B9 - Konfliktprüfung: Ausfallfenster rot

**Vorbedingung:** Boot 6 ist wegen des Totalschadens im offenen Ausfallfenster (ab 15.08.2026
18:30, kein Ende).

**Schritte:** Reiter "Einteilung", Ansicht "Nach Materialstück", Boot 6 auswählen bzw. versuchen,
Boot 6 einem Team zuzuteilen.

**Erwartung:** Boot 6 wird mit Konflikt "Ausfall" (rot) markiert; eine Zuteilung ist zwar nicht
technisch verhindert (Konflikte verhindern das Speichern nicht), bleibt aber sichtbar rot markiert.

### B10 - Veranstalter-Hinweis vor der Fixierung

**Vorbedingung:** Die REQUESTED-Anfrage von Bremerhaven (Wettkampf 1) ist noch nicht entschieden.

**Schritte:** Als Admin/Veranstalter zur Veranstaltungsseite, Reiter "Durchführung" (Fixierung),
Meldungen (re-)finalisieren öffnen.

**Erwartung:** Warnhinweis "1 Materialanfrage ist noch nicht entschieden. Erst entscheiden, dann
fixieren, sonst greift die Nummerngleichheit nur zufällig." erscheint, solange offene Anfragen
bei eingeladenen Anbietern existieren.

---

## Block C: Fixierung (Startnummern nach Bootsnummern)

### C1 - Schalter nur sichtbar mit eingeladenem Anbieter

**Vorbedingung:** Veranstaltung mit Bootshaus Nord eingeladen (Coastal Regatta Flensburg 2026).

**Schritte:** Veranstaltungsseite → Durchführung → Meldungen (re-)finalisieren öffnen.

**Erwartung:** Checkbox "Startnummern nach Bootsnummern vergeben" ist sichtbar. Bei einer
Veranstaltung ganz ohne Materialanbieter (`getEventMaterialProviders` liefert leer) fehlt sie.

### C2 - Nummerngleichheit für bestätigte Bootsanfragen

**Vorbedingung:** Bremerhavens CONFIRMED-Anfrage (C4x+) existiert; alle drei Boote der Art C4x+
(6/7/8) sind aktiv.

**Schritte:** Checkbox aktivieren, "Meldungen refinalisieren" ausführen.

**Erwartung:** Teams mit bestätigter Bootsanfrage (Kategorie BOAT) bekommen zuerst - zufällig
unter den vorhandenen Bootsnummern (6/7/8) - ihre Startnummer; danach erst Teams mit eigenem
Boot die restlichen freien Nummern ab 1 aufwärts, die keine Bootsnummer sind.

### C3 - Überzählige Mietteams

**Vorbedingung:** Mehr bestätigte Bootsanfragen einer Art als Boote vorhanden (z. B. vier
CONFIRMED-Anfragen auf C1x bei nur zwei Booten - über B1 zusätzlich anlegen).

**Schritte:** Fixierung mit aktivem Schalter ausführen.

**Erwartung:** Die überzähligen Mietteams bekommen Startnummern oberhalb des Bootsbestands
(nicht 1 oder 2) und werden dem Anbieter als "ohne Nummerngleichheit" gemeldet (z. B. als Hinweis
im Dashboard oder in der Einteilung).

### C4 - "Nummern behalten" beschränkt die Angleichung auf neue Teams

**Vorbedingung:** Meldungen bereits einmal fixiert (Startnummern vergeben).

**Schritte:** Ein neues Team meldet sich nach; "Meldungen refinalisieren" mit "Gesetzte
Startnummern beibehalten" UND "Startnummern nach Bootsnummern vergeben" aktivieren.

**Erwartung:** Nur das neue Team bekommt (ggf. nach Bootsnummer) eine neue Startnummer,
bestehende Startnummern bleiben unverändert.

---

## Block D: Schäden

### D1 - Schaden melden mit Pflichtfeldern

**Vorbedingung:** Login `material@test.de`, Reiter "Schäden" oder Flotte, Boot 3 (C2x, bisher
ohne Schaden).

**Schritte:** "Schaden melden", Stück Boot 3, Beschreibung "Riss im Rumpf", Schwere "leicht"
wählen, speichern.

**Erwartung:** Neuer Schadeneintrag mit Status "gemeldet", Melder und Zeitpunkt automatisch
gesetzt, kein Ausfallfenster vorbelegt (Vorschlag nur bei "Totalschaden").

### D2 - Foto zum Schaden hochladen

**Vorbedingung:** Ein Schaden existiert (z. B. der aus D1 oder der Totalschaden auf Boot 6 aus
dem Seed).

**Schritte:** Foto (< 10 MB) hinzufügen.

**Erwartung:** Foto erscheint in der Liste; ein Foto über 10 MB wird abgelehnt, die Meldung
selbst bleibt erhalten ("Foto ist zu groß (max. 10 MB)").

### D3 - Totalschaden öffnet den Ersatzdialog

**Vorbedingung:** Der Seed-Totalschaden auf Boot 6 hat ein offenes Ausfallfenster; Bremerhaven
hat für Wettkampf 2 eine Ausnahme, die zufällig auch Boot 6 nutzen könnte (zur Vorbereitung in
B7 stattdessen Boot 6 als Ausnahme für einen Lauf setzen, dann diesen Fall prüfen) - oder direkt
einen neuen Totalschaden auf ein Boot mit laufender Zuteilung melden.

**Schritte:** Schaden mit Schwere "Totalschaden" und Ausfallfenster ab jetzt speichern, während
das betroffene Boot einem Lauf zugeteilt ist.

**Erwartung:** Beim Speichern zeigt der Dialog "Betroffene Läufe" alle betroffenen Zuteilungen
(z. B. "#3 im Finale JM4x So 14:00"-artige Zeile) und erlaubt je Lauf die Wahl eines
Ersatzstücks (nur freie Stücke im Fenster, richtige Art, "Nummer passt" markiert bei
Nummerngleichheit).

### D4 - Ersatzwahl legt Ausnahme an, Grundzuteilung bleibt

**Vorbedingung:** Wie D3, ein Ersatzstück gewählt und "Übernehmen" geklickt.

**Schritte:** Reiter "Einteilung" → Ansicht "Nach Team" für das betroffene Team öffnen.

**Erwartung:** Die Grundzuteilung (beschädigtes Stück) ist weiterhin als Grundzuteilung
sichtbar; für den betroffenen Lauf gilt jetzt die neue Ausnahme (Ersatzstück).

### D5 - Reparatur: "Grundzuteilung wieder möglich"

**Vorbedingung:** Der Seed-Totalschaden auf Boot 6 ist noch offen (`REPAIRED` nicht gesetzt).

**Schritte:** Schaden öffnen, Status auf "repariert" setzen mit Reparaturzeitpunkt.

**Erwartung:** `out_of_service_until` wird auf den Reparaturzeitpunkt gesetzt (Fenster endet
früher). Bestehende Ausnahmen bleiben unangetastet; die Einteilung zeigt bei betroffenen Läufen
"Grundzuteilung wieder möglich" mit einem Knopf "Ausnahme entfernen", der die Ausnahme löscht und
wieder Boot 6 wirksam macht.

### D6 - Schaden an ausgemustertem Stück ist erlaubt

**Vorbedingung:** Ein Stück auf Status "Ausgemustert" setzen (z. B. Skullpaar 4 in der Flotte).

**Schritte:** Schaden auf dieses Stück melden.

**Erwartung:** Wird angenommen (kein Fehler), erscheint in der Schadensliste wie jeder andere
Schaden.

### D7 - CSV-Export der Schadensakte

**Vorbedingung:** Mindestens der Seed-Schaden (Boot 6, Totalschaden) vorhanden.

**Schritte:** Reiter "Schäden" → "CSV-Export" klicken.

**Erwartung:** Datei `Schaeden-<eventId>.csv` (oder Dateiname aus `Content-Disposition`) lädt
herunter, enthält u. a. Boot 6, Schwere "Totalschaden", Status "gemeldet", ohne
Verursacher-Klarnamen für Teams (nur intern für den Anbieter/Veranstalter sichtbar - siehe F1).

---

## Block E: Anzeigen

Alle Fälle mit und ohne Schalter "Material immer zeigen" (Standard: aus) prüfen, da die
Kürzungsleiter je Anzeige unterschiedlich reagiert.

### E1 - Mein Event zeigt den Materialblock

**Vorbedingung:** Über QR-Code/Link "Mein Event" für Bremerhaven öffnen (Registrierungen
`...0001`, `...0007`, `...000d`).

**Schritte:** Seite öffnen, zu den drei Meldungen scrollen.

**Erwartung:** Je Meldung ein Materialblock: "C2x · angefragt · Bootshaus Nord" (Wettkampf 1),
"C4x+ · bestätigt · Bootshaus Nord" (Wettkampf 2), "C1x · Warteliste · Bootshaus Nord"
(Wettkampf 3) - immer sichtbar, kein Schalter nötig. Beim Lauf "Finale DM" von Wettkampf 2 steht
neben der Startnummer 1 zusätzlich der Hinweis "weicht ab" (Chip), weil Boot 7 zugeteilt ist.

### E2 - Sprecher-Dashboard mit Schalter "Material immer zeigen"

**Vorbedingung:** Sprecher-Dashboard für die Veranstaltung offen, Lauf "Finale DM" (Wettkampf 2,
CM 4x+) mit Bremerhaven (Startnummer 1, Boot 7) sichtbar.

**Schritte:** Ohne Schalter: Lauf ansehen. Danach Einstellungen öffnen, "Boot-Material zeigen"
aktivieren, erneut ansehen.

**Erwartung:** Ohne Schalter zeigt nur Bremerhaven (Abweichung) den Hinweis "#1 · Boot 7"; Teams
mit eigenem Boot zeigen nichts. Mit Schalter zeigen zusätzlich Teams mit eigenem Boot "eigenes
Boot".

### E3 - Live-Dashboard mit Schalter

**Vorbedingung:** Wie E2, Live-Dashboard (`/event/<id>/live`) statt Sprecher-Ansicht.

**Schritte:** Einstellungs-Popover öffnen, "Material immer zeigen" umschalten.

**Erwartung:** Gleiches Verhalten wie E2, aber im Live-Dashboard-Layout (Karten statt Tabelle).

### E4 - Board zeigt Boot-Material je Kachel-Eigenschaft

**Vorbedingung:** Ein Board mit einer Match-Detail-Kachel für Wettkampf 2 "CM 4x+" ist
eingerichtet (Board-Verwaltung).

**Schritte:** In der Board-Verwaltung an der Kachel die Eigenschaft "Boot-Material zeigen"
umschalten, Board unter `/board/<code>` oder in der Vorschau ansehen.

**Erwartung:** Analog zu E2/E3, aber pro Kachel konfigurierbar statt global je Anzeige.

### E5 - Startlisten-PDF zeigt Spalte "Boot" nur bei Abweichung oder Schalter

**Vorbedingung:** Startlisten-PDF für Wettkampf 2 "CM 4x+" exportieren (Bremerhaven mit Boot 7
zugeteilt, restliche Teams ohne Materialanfrage).

**Schritte:** PDF ohne Schalter exportieren, danach mit Schalter "Material immer zeigen" (falls
an dieser Stelle vorhanden) erneut exportieren.

**Erwartung:** Ohne Schalter erscheint die Spalte "Boot" nur, weil mindestens eine Abweichung im
Lauf vorliegt (Bremerhaven #1 → Boot 7); mit Schalter erscheint sie immer, auch ohne Abweichung
in anderen Läufen. Kategorie `OTHER` (Skull-Paar) erscheint auf keiner dieser Anzeigen.

### E6 - Livestream-Grafik/Szene mit Schalter

**Vorbedingung:** Livestream-Regie geöffnet, Szene mit Wettkampf 2 "CM 4x+" aktiv.

**Schritte:** In den Szenen-Einstellungen "Material immer zeigen" umschalten, Vollbild-Board
ansehen.

**Erwartung:** Wie E2, zusätzlich mit der bestehenden Kürzungsleiter - bei knappem Platz fällt
die Bootsangabe zuerst weg, bevor andere Kürzungen greifen (siehe
`docs/superpowers/specs/2026-09-02-livestream-grafiken-redesign-design.md`).

---

## Block F: Rechte

### F1 - Anbieter-Nutzer sieht nur eigenes

**Vorbedingung:** Ein zweiter Anbieter (nicht Bootshaus Nord) mit eigenem Nutzer existiert, oder
`material@test.de` versucht, Daten eines fremden Anbieters/einer fremden Veranstaltung zu sehen
(z. B. `/material/admin` direkt aufrufen).

**Schritte:** Als `material@test.de` einloggen, `/material/admin` aufrufen (nur `READ MATERIAL
GLOBAL`), sowie `/material/event/<eventId>?provider=<fremde-provider-id>` versuchen.

**Erwartung:** `/material/admin` ist nicht erreichbar (keine `READ MATERIAL GLOBAL`, Redirect/
403). Für eine fremde `provider`-ID zeigt das Dashboard keine Daten - `materialProviderId` am
eigenen Konto hat immer Vorrang vor der URL-Auswahl (siehe `MaterialDashboardPage`). In der
Team-Detailansicht sieht der Anbieter von Meldungen mit Anfrage bei ihm nur Team, Verein,
Wettkampf, Startnummer und Kontaktperson - keine Teilnehmernamen, keine Geburtsdaten.

### F2 - Veranstalter ohne READ MATERIAL GLOBAL kann nicht einladen

**Vorbedingung:** Ein Veranstalter-Nutzer mit `UPDATE EVENT GLOBAL`, aber ohne
`READ MATERIAL GLOBAL` (z. B. eine reduzierte Rolle testweise anlegen oder das Recht temporär
entziehen).

**Schritte:** Veranstaltungsseite → Reiter "Organisation" öffnen, Bereich "Materialanbieter"
ansehen.

**Erwartung:** Die Liste der eingeladenen Anbieter (inkl. Bootshaus Nord mit "Offene Anfragen"/
"Offene Schäden") ist trotzdem sichtbar (reines Lesen über `UPDATE EVENT GLOBAL` genügt dafür
nicht - Vorsicht: Anzeige der Liste hängt an anderen Daten, siehe Code); die Auswahl-Box zum
Einladen fehlt jedoch, stattdessen der Hinweis "Zum Einladen fehlt das Recht, Anbieter zu
lesen." Erst mit `READ MATERIAL GLOBAL` zusätzlich zu `UPDATE EVENT GLOBAL` erscheint die
Einladen-Auswahl.

### F3 - Ausladen bleibt Veranstalter-Sache

**Vorbedingung:** Wie F2, aber Veranstalter MIT `UPDATE EVENT GLOBAL` (unabhängig von
`READ MATERIAL GLOBAL`).

**Schritte:** Bei Bootshaus Nord auf "Ausladen" klicken, Sicherheitsabfrage bestätigen.

**Erwartung:** Ausladen funktioniert bereits mit `UPDATE EVENT GLOBAL` allein (`mayManage`),
unabhängig von `READ MATERIAL GLOBAL` - anders als das Einladen selbst (F2).

### F4 - Admin verwaltet Anbieter und Materialarten global

**Vorbedingung:** Login als Admin (`UPDATE MATERIAL GLOBAL`).

**Schritte:** `/material/admin` öffnen, einen neuen Anbieter anlegen, einem bestehenden Nutzer
die Rolle "Materialanbieter" und Bootshaus Nord zuordnen.

**Erwartung:** Anlegen/Bearbeiten funktioniert; die Nutzerverwaltung zeigt bei der Rollenwahl
zusätzlich die Anbieter-Auswahl. Ohne `UPDATE MATERIAL GLOBAL` ist die Seite nicht erreichbar.
