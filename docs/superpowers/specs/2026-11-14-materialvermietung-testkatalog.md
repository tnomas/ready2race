# Testkatalog: Materialvermietung (Boote und Zubehör)

Stand 14.11.2026, Zweig `claude/materialvermietung-uebernahme-9cf945`. Handtests zur Spec
`docs/superpowers/specs/2026-09-07-materialvermietung-design.md`; Entscheidungen: ADR-0109 bis
ADR-0111. Jeder Fall hat Vorbedingung, Schritte, Erwartung und eine Zeile **Ergebnis 14.11.**
Was dort nicht „bestanden“ steht, ist **nicht verifiziert**.

## Wie die Ergebnisse zu lesen sind

Stand der Berichte: Handtest **H1** (Blöcke A bis C, vor den Korrekturen F1/F2), **H2** (Blöcke D bis F, vor F3), **H3**
(Nachtest von 16 Pflichtfällen nach F1/F2/F3) und **F4** (Fall 17, nach der Korrektur `e9d466a1`), alle am 14.11.2026 im Browser
gegen den Seed. Je Fall steht in „Ergebnis 14.11.“ das konkret Gesehene und die Quelle.

- **bestanden** = so gesehen. **bestanden mit Einschränkung** = gesehen, aber ein Teil des Falls fehlt (steht im Ergebnis).
- **nicht testbar** = im Seed oder mit dem Werkzeug nicht herstellbar. **nicht gelaufen** = nicht versucht oder ohne passendes
  Konto bzw. Netz nicht möglich. Beides gilt als **nicht verifiziert**; nur Tests oder API belegen dann allenfalls etwas.
- Fälle, die H1 vor den Korrekturen sah und die H3 nicht abdeckt, tragen das H1-Ergebnis mit dem Vermerk, was nach F1/F2 nicht
  erneut gesehen wurde.

## Übersicht

75 Fälle: **42 bestanden**, **17 bestanden mit Einschränkung**, **1 nicht testbar**, **6 nicht gelaufen**, **9 offen**
(Block G, nach der Entscheidung vom 14.11.2026 gebaut, noch von keinem Tester gesehen).

| Fall | Kurz | Ergebnis | Quelle |
|---|---|---|---|
| A1 | Abschnitt „Material“ je Team mit Bedarf | bestanden | H1 |
| A2 | Ampel wechselt von „verfügbar“ auf „knapp“ | bestanden | H1 |
| A3 | Wettkampf ohne Angebot: nur „eigenes Boot mitbringen“ | bestanden | H3 |
| A4 | Erneutes Speichern behält bestehende Anfragen | bestanden | H1, H3 |
| A5 | Vergabe geschlossen | bestanden | H1 (Entfernen: H3) |
| A6 | Rückzug einer bestätigten Anfrage löst eine E-Mail an den Anbieter aus | bestanden mit Einschränkung | H3 |
| A7 | Dieselbe Art doppelt anfragen (API) | bestanden | H1 |
| A8 neu | Ablehnung als Chip mit Notiz im Formular | bestanden | H3 |
| A9 neu | Team mit Buchung entfernen, Vergabe offen | bestanden | H3 |
| A10 neu | Team mit Buchung entfernen, Vergabe geschlossen | bestanden | H3 |
| A11 neu | Festgeschriebenes Team | bestanden | H3 |
| A12 neu | Meldeformular von nicht freigegebener Adresse | nicht gelaufen | - |
| B1 | Anfrage bestätigen | bestanden | H1, H3 |
| B2 | Warteliste mit Notiz | bestanden | H1, H3 |
| B3 | Ablehnen mit Notiz | bestanden | H1, H3 |
| B4 | Sammelbestätigung | bestanden mit Einschränkung | H1, H3 |
| B5 | Wartelisten-Hervorhebung, wenn eine Bestätigung frei wird | bestanden | H3 |
| B6 | „Nach Meldungsnummer zuteilen“ | bestanden mit Einschränkung | H3 |
| B7 | Ausnahme je Lauf | bestanden | H1, H3 |
| B8 | Falsche Art wird abgewiesen | bestanden | H1 |
| B9 | Ausfall rot | bestanden mit Einschränkung | H1, H3 |
| B10 | Hinweis vor der Fixierung | bestanden mit Einschränkung | H1, F4 |
| B11 neu | Sammelbestätigung über den Plan | bestanden | H3 |
| B12 neu | Warteliste und Ablehnung löschen die Zuteilungen | bestanden mit Einschränkung | H3 |
| B13 neu | Art eines Angebots mit Anfragen ist fest | bestanden | H3 |
| B14 neu | Kein Doppel-Zuteilen bei langsamem Netz | nicht gelaufen | - |
| B15 neu | Telefon (390 px) | bestanden | H3 |
| C1 | Schalter nur mit eingeladenem Anbieter | bestanden mit Einschränkung | H1, H3 |
| C2 | Nummerngleichheit für bestätigte Bootsanfragen | bestanden | H3 |
| C3 | Überzählige Mietteams | bestanden mit Einschränkung | H1, H3 |
| C4 | „Nummern behalten“ | bestanden mit Einschränkung | H1, H3 |
| C5 neu | Fixierung mit vorhandener Grundzuteilung | bestanden | H3, F4 |
| C6 neu | Rückmeldung nach dem Fixieren und Meldungsnr.-Chip | bestanden | H3 |
| C7 neu | Erneutes Speichern der Meldung behält Nummer und Namen | bestanden | F4 |
| D1 | Schaden melden mit Pflichtfeldern | bestanden | H2, H3 |
| D2 | Foto zum Schaden | bestanden | H2, H3 |
| D3 | Totalschaden öffnet den Ersatzdialog | bestanden | H2 |
| D4 | Ersatzwahl legt eine Ausnahme an | bestanden | H2 |
| D5 | Reparatur: „Grundzuteilung wieder möglich“ | bestanden mit Einschränkung | H2, H3 |
| D6 | Schaden an ausgemustertem Stück | bestanden | H2, H3 |
| D7 | CSV-Export der Schadensakte | bestanden mit Einschränkung | H2, H3 |
| D8 neu | Stück mit Schadensakte löschen | bestanden | H2 |
| D9 neu | Ausgemustertes Stück | bestanden mit Einschränkung | H2, H3 |
| D10 neu | Foto ist kein Bild | bestanden | H2, H3 |
| D11 neu | Foto zu groß, zu viele Fotos | nicht testbar | - |
| D12 neu | 15 Handyfotos | nicht gelaufen | - |
| D13 neu | Ersatzwahl nur bei gemeldetem Ausfall | bestanden | H2 |
| E1 | Mein Event | bestanden | H2, H3 |
| E2 | Sprecher-Dashboard | bestanden | H2 |
| E3 | Schiedsrichter-Dashboard | bestanden | H2 |
| E4 | Board | bestanden mit Einschränkung | H2, H3 |
| E5 | Startliste (PDF) | bestanden mit Einschränkung | H2, H3 |
| E6 | Livestream-Szene und Regie | bestanden | H2 |
| E7 neu | Lauf-Karte der Durchführung | bestanden mit Einschränkung | H2, H3 |
| E8 neu | Live-Aktualisierung der Anzeigen | bestanden mit Einschränkung | H2 |
| E9 neu | Board-Detail mit langem Bootsnamen | nicht gelaufen | - |
| F1 | Anbieter sieht nur das Eigene | bestanden | H2, H3 |
| F2 | Veranstalter ohne READ MATERIAL GLOBAL kann nicht einladen | bestanden | H2, H3 |
| F3 | Ausladen | bestanden | H2, H3 |
| F4 | Admin verwaltet Anbieter und Materialarten | bestanden | H2 |
| F5 neu | Anbieter mit Konten löschen | bestanden | H2 |
| F6 neu | Anbieter-Zuordnung und Rolle | bestanden mit Einschränkung | H2 |
| F7 neu | Konto nur mit Leserecht | nicht gelaufen | - |
| F8 neu | Anbieter-Wechsel für globale Konten | bestanden | H2 |
| F9 neu | Meldung gibt Anfragen frei (Veranstalter-Wege) | nicht gelaufen | - |
| F10 neu | Einladen braucht zusätzlich READ MATERIAL GLOBAL | bestanden | H3 |
| G1 neu | Fixieren mit Schalter → Runde anlegen: Startnummer = Meldungsnummer | offen | - |
| G2 neu | Folgerunde (Finale) behält die Meldungsnummer | offen | - |
| G3 neu | Schalter aus: Setzposition wie bisher | offen | - |
| G4 neu | Bestehende Läufe bleiben beim Fixieren unverändert | offen | - |
| G5 neu | Anzeigen ohne „abweichend“ im Normalfall | offen | - |
| G6 neu | Echte Abweichung bleibt sichtbar | offen | - |
| G7 neu | Startlisten-Export und RaceClocker | offen | - |
| G8 neu | Zeitnahme-Posten und Startanzeige mit großen Nummern | offen | - |
| G9 neu | Freilos in einer Folgerunde mit Schalter | offen | - |

## Testdaten

Quelle ist der Seed `docs/seeds/seed-material.sql` (UUID-Präfix `5eed0009`; hängt sich an die
Veranstaltung des DM-Seeds `docs/seeds/seed-dm-coastal-2026.sql` und braucht ein einmal gestartetes
Backend, weil der `JobSeeder` die Rolle `…0040` sät). Einspielen, Zeiten relativ zum Einspielzeitpunkt
(nach etwa 1,5 Stunden neu einspielen):

```sh
docker exec -i backend-db-1 psql -U developer -d <lokale-db> -v ON_ERROR_STOP=1 --single-transaction \
  < docs/seeds/seed-material.sql
```

Zugangsdaten stehen nur im Seed-Kopf. Die Anmeldung der Seed-Konten per Formular scheitert, wenn der
Pepper der lokalen `.env` nicht dem des Seeds entspricht; dann „Passwort vergessen“ (mit Captcha, Mail in
`/api/dev/emails`) oder ein Sitzungs-Token per SQL in `app_user_session` (`AGENTS.md`, Abschnitt 9) und
`localStorage['session.admin']`. Rollen testet man in getrennten Origins (`localhost`, `127.0.0.1`,
`anbieter1.localhost` …); **das Meldeformular lässt sich nur von `localhost` und `127.0.0.1`
absenden** (Rückruf-Adresse gegen `FRONTEND_ORIGINS`, ADR-0106). Der Seed stellt die Meldefrist der
DM-Veranstaltung offen und setzt sie beim Cleanup nicht zurück.

- **Veranstaltung** „DM Coastal Rowing 2026“: `5eed0001-0000-0000-0000-000000000001`.
- **Konten:** Bootshaus Nord (Anbieter 1, `material@test.de`), Ruderwerft Süd (Anbieter 2,
  `material2@test.de`, Sprache en), Vereinsvertretung DM-Verein 1 (`verein@material.test`), Admin
  (System-Admin). Weitere Vereinskonten der Läufe (DM-Verein 2–4) haben keine Sitzung.
- **Anbieter 1 Bootshaus Nord:** Flotte Boot 1/2 = C1x, Boot 3/4/5 = C2x, Boot 6/7/8 = C4x+, „Vierer 2“ =
  C4x+ mit Nummer 2, vier Skull-Paare (Art `OTHER`, ohne Nummer); eingeladen, Vergabe offen.
  **Anbieter 2 Ruderwerft Süd:** zwei C4x+, eigenes Konto, eingeladen, eigenes Angebot.
- **Schalter an der Veranstaltung:** Der Seed setzt `event.team_numbers_as_start_numbers = true` (wie nach einer
  Fixierung mit „Meldungsnummern nach Bootsnummern vergeben“, ADR-0111). Startnummer im Lauf = Meldungsnummer.
- **Wettkampf „M1 Materialtest“** (CM 4x+ MT, mit Läufen, für die Anzeigen): Vorlauf 1 läuft seit dem
  Einspielen, Vorlauf 2 in 20 min, Finale in 90 min. MT 1 (DM-Verein 1, Meldungsnr. **7**): Grundzuteilung
  **Boot 7**, überall #7, **passt** (Normalfall). MT 2 (DM-Verein 2, Meldungsnr. **3**): **Vierer 2**, #3,
  **abweichend** (Stück mit anderer Nummer, „ohne Nummerngleichheit“). MT 3 (DM-Verein 3, Meldungsnr. **6**):
  Grundzuteilung **Boot 6 (Totalschaden)**, im Vorlauf 2 Ersatz **Boot 8** als Ausnahme (#6, **abweichend**), im
  Finale Boot 6 (#6, passt; der Ausfall ist ein Konflikt im Dashboard). MT 4 (DM-Verein 4, Meldungsnr. **1**):
  eigenes Boot, offene Anfrage bei Ruderwerft Süd. Startnummern: Vorlauf 1 [7, 3], Vorlauf 2 [6, 1],
  Finale [1, 3, 6, 7].
- **Wettkampf „M2 Anmeldetest“** (CF 2x AT, ohne Läufe, **das Meldeformular für Block A**, Bedarf C2x
  und Skull-Paar): Das C2x-Angebot plant **2** Stück. DM-Verein 1 #1 **bestätigt** (Rückzug = Mail), #2
  **angefragt**; DM-Verein 2 **bestätigt**; DM-Verein 3 **Warteliste** (älteste offene Anfrage). DM-Verein 2
  hat im DM-Wettkampf 1 eine **abgelehnte** Anfrage mit Notiz (nur im Dashboard sichtbar). Die DM-Wettkämpfe
  1–3 haben keine Teilnehmerplätze und erscheinen **nicht** im Meldeformular. Meldungen haben noch keine
  Meldungsnummer.
- **Wettkampf „M3 Gig-Vierer ohne Angebot“:** Meldeplätze, Bedarf „Gig-Vierer“, den kein Anbieter
  anbietet.
- **Wettkampf „M4 Rundentest“** (CM 4x+ RT, `5eed0009-0010-0000-0000-000000000004`, für Block G): Setup Vorlauf
  (2 Läufe à 2) → Finale (4 Plätze), **ohne Läufe und ohne Meldungsnummern**, keine Meldeplätze (nicht im
  Meldeformular). DM-Verein 1 und 2 je ein **bestätigtes** C4x+ bei Ruderwerft Süd mit Grundzuteilung **Süd 21**
  bzw. **Süd 22**; DM-Verein 3 und 4 eigene Boote. Das Süd-Angebot plant 3 Stück.
- **Schaden:** Boot 6, Totalschaden, Ausfallfenster offen, Verursacher als Momentaufnahme „ARV Kiel CM 4x+“.
- **Mein Event:** QR-Code `MATERIAL-MEINEVENT-1` (Mats Boysen, MT 1), Einstieg `/results/MATERIAL-MEINEVENT-1`.
  Board `5eed0009-0040-0000-0000-000000000001`, Stream-Szene `5eed0009-0041-0000-0000-000000000001`.
- **Fixierung:** Der Seed löscht den Meldebericht der DM-Veranstaltung; die Meldeseite zeigt „fixieren“, nicht
  „refinalisieren“. Meldungsnummern der DM-Seed-Wettkämpfe stellt nur der DM-Seed her.
- **Adressen:** Material `/material`, `/material/event/<eventId>?tab=requests|assignment|damages|settings`
  (global zusätzlich `&provider=<id>`), `/material/fleet`, `/material/admin` (nur GLOBAL); Veranstalter-Karte:
  Veranstaltung → Einstellungen → „Materialvermietung“ (`#material`); Bedarf: Wettkampf → Allgemein;
  Anbieter-Zuordnung: Nutzerseite des Kontos; Meldeformular `/event/<eventId>/register`; Fixierung:
  Veranstaltung → Meldungen; Lauf-Karte: Durchführung des Wettkampfs `M1`.
- **Abweichung** heißt: Nummer des Stücks ≠ Startnummer **im jeweiligen Lauf**
  (`competition_match_team.start_number`); die **Grundzuteilung** paart dagegen mit der
  **Meldungsnummer** (`team_number`), ADR-0111.

---

## Block A: Anmeldung (Verein, Origin `localhost`)

### A1 - Abschnitt „Material“ je Team mit Bedarf

**Vorbedingung:** Angemeldet als Vereinsvertretung DM-Verein 1, Meldeformular, Wettkampf M2.
**Schritte:** Schritt „Teamwettkämpfe“ öffnen, zu einem Team scrollen.
**Erwartung:** Je Team Abschnitte „C2x (1 Stück)“ und „Skull-Paar (2 Stück)“ mit Schalter „mieten bei Bootshaus
Nord“, Chip „verfügbar“/„knapp“ und Preistext („55 € pro Tag“). Bei bestehender Anfrage Chip „Bestätigt“ bzw.
„Angefragt“ und der Satz „Zum Zurückziehen den Schalter ausschalten und die Meldung absenden.“ Wettkämpfe ohne
Bedarf zeigen keinen Abschnitt.
**Ergebnis 14.11.:** bestanden (H1, vor F1/F2). Abschnitt, Chips und Zurückziehen-Hinweis so gesehen. Nach F2/F4 nicht erneut durchgeklickt; H3 Nr. 5 hat nur das gesperrte Team M1 neu gesehen.

### A2 - Ampel wechselt von „verfügbar“ auf „knapp“

**Vorbedingung:** Wie A1. Das C2x-Angebot plant 2 Stück; bestätigt 2, offen 1 (Seed) ist bereits „knapp“. Für den
Wechsel dient das Skull-Paar (geplant 4, startet grün) oder das Herabsetzen der geplanten Anzahl durch den Anbieter.
**Schritte:** Als Anbieter 1 (Einstellungen, Angebot bearbeiten) die geplante Anzahl von C2x anpassen, im Formular
neu laden.
**Erwartung:** Sobald bestätigt plus offen die geplante Anzahl erreichen, steht der Chip bei allen Teams des
Wettkampfs auf „knapp“ (gelb). Es gibt kein Rot, auch nicht bei Überbuchung.
**Ergebnis 14.11.:** bestanden (H1). „verfügbar“ → „knapp“ gesehen (geplante Anzahl auf 2), nie rot; ein Zusatzanfragen-Weg über die Oberfläche fehlt (der Verein hat nur zwei Teams). Nicht erneut getestet.

### A3 - Wettkampf ohne Angebot: nur „eigenes Boot mitbringen“

**Vorbedingung:** Meldeformular, Wettkampf M3 (Bedarf „Gig-Vierer“ ohne Angebot).
**Schritte:** Team in M3 öffnen.
**Erwartung:** Nur der Hinweis „eigenes Boot mitbringen“, keine Schalter, keine Ampel. Ein Wettkampf ganz ohne Bedarf
zeigt gar keinen Abschnitt.
**Ergebnis 14.11.:** bestanden mit Textabweichung (H3 Nr. 4). Neues Team in M3: „Gig-Vierer (1 Stück) · Eigenes Boot“, keine Schalter, keine Ampel (der Katalogtext „eigenes Boot mitbringen“ ist die Anzeige „Eigenes Boot“). H1: nicht testbar (Seed hatte den Fall nicht).

### A4 - Erneutes Speichern behält bestehende Anfragen

**Vorbedingung:** M2: #1 bestätigt, #2 angefragt (DM-Verein 1).
**Schritte:** Meldung öffnen, nichts am Material ändern, auf der Prüfseite „Prüfen & absenden“ absenden.
**Erwartung:** Die Prüfseite listet je Team „C2x: mieten bei Bootshaus Nord“ mit „Bestätigt/Angefragt“ und
„Skull-Paar: Eigenes Material“. Nach dem Absenden bleiben Anfrage-IDs, Status und `decided_at` unverändert, keine
neue Zeile.
**Ergebnis 14.11.:** bestanden (H1; H3 Nr. 5 wiederholt). Erneutes Speichern ohne Änderung (zweimal): Anfrage-IDs und `updated_at` identisch, Meldung behält ihre ID. Zur Meldung selbst siehe C7.

### A5 - Vergabe geschlossen

**Vorbedingung:** Als Anbieter 1: Einstellungen, Schalter „Vergabe geschlossen“ an.
**Schritte:** Formular öffnen; bei einem Team ohne Anfrage und einem Team mit Anfrage nachsehen.
**Erwartung:** Teams ohne Anfrage: „Die Vergabe für dieses Angebot ist geschlossen.“, Schalter gesperrt. Team mit
Anfrage: Hinweis, dass sich die Anfrage nicht mehr ändern oder zurückziehen lässt. Ein direkter `PUT
…/materialRequests` mit neuer Anfrage ergibt 409 `MATERIAL_REQUESTS_CLOSED`. Schalter danach wieder öffnen.
**Ergebnis 14.11.:** bestanden (H1: Texte und 409 `MATERIAL_REQUESTS_CLOSED`, DB unverändert). Der Entfernen-Teil ist über A10 (H3 Nr. 2) belegt. Die Formularansicht bei geschlossener Vergabe wurde nach F2 **nicht** erneut angesehen.

### A6 - Rückzug einer bestätigten Anfrage löst eine E-Mail an den Anbieter aus

**Vorbedingung:** M2 #1 (C2x bestätigt), Kontaktadresse `kontakt@bootshaus-nord.de`. Mail-Ansicht
`/api/dev/emails` (nur `MODE=DEV`).
**Schritte:** Schalter bei Team 1 aus, Prüfseite („… wird zurückgezogen“), absenden.
**Erwartung:** Anfrage `WITHDRAWN`. Mail „Ready2Race - Materialanfrage zurückgezogen“ an den Anbieter in der Sprache
des Kontos mit dieser Adresse (sonst Deutsch); die Zeile `##competitions##` lautet „Kennung Name · Verein
Meldungsname · Menge × Art“, z. B. „M2 Frauen-Doppelzweier Anmeldetest · DM-Verein 1 #1 · 1 × C2x“. Die Grundzuteilung
verschwindet aus der Einteilung. Eine Anfrage bei Ruderwerft Süd (Sprache en) liefert die englische Fassung.
**Ergebnis 14.11.:** bestanden (H3 Nr. 1; H1 lief mit altem Mailtext). Rückzug über „Team entfernen“: Mail „Ready2Race - Materialanfrage zurückgezogen“ an kontakt@bootshaus-nord.de mit „M2 Frauen-Doppelzweier Anmeldetest · DM-Verein 1 #1 · 1 × C2x“ (Mail-Tabelle und `/api/dev/emails`). **Nicht belegt:** die englische Mail (Anbieter 2 hatte keine bestätigte Anfrage), Rückzug über den Schalter (nur H1 mit altem Text).

### A7 - Dieselbe Art doppelt anfragen (API)

**Vorbedingung:** Eine Meldung ohne Anfrage auf C2x.
**Schritte:** `PUT …/materialRequests` mit zweimal derselben Angebots-ID senden (die Oberfläche bietet einen Schalter je
Art, das ist nicht herstellbar).
**Erwartung:** Genau eine Anfrage entsteht bzw. besteht (idempotent: 204, eine Zeile, eine zurückgezogene wird wieder
`REQUESTED`), kein Datenfehler.
**Ergebnis 14.11.:** bestanden (H1). 204, eine Zeile; der alte Katalog erwartete eine Ablehnung, tatsächlich wird dedupliziert. Nicht erneut getestet.

### A8 (neu) - Ablehnung als Chip mit Notiz im Formular

**Vorbedingung:** Anbieter 1 lehnt die angefragte C2x-Anfrage von DM-Verein 1 #2 ab (B3, Notiz „Kein Boot mehr frei“).
**Schritte:** Als Vereinsvertretung Meldung öffnen, Team #2.
**Erwartung:** Chip „Abgelehnt von Bootshaus Nord“ mit der Notiz; der Schalter bleibt aus; erneutes Einschalten
zeigt „wird neu angefragt“.
**Ergebnis 14.11.:** bestanden (H3 Nr. 3). Nach Ablehnung durch Anbieter 1 zeigt das Formular „Abgelehnt von Bootshaus Nord – Notiz des Anbieters: …“; Schalter wieder an: „Beim Absenden wird bei Bootshaus Nord neu angefragt; der Anbieter entscheidet erneut.“ (nicht abgesendet).

### A9 (neu) - Team mit Buchung entfernen, Vergabe offen

**Vorbedingung:** M2 #1 mit bestätigter C2x-Anfrage, Vergabe offen.
**Schritte:** Im Meldeformular Team 1 entfernen, Prüfseite ansehen, absenden.
**Erwartung:** Die Prüfseite nennt „… · Team 1 · C2x: Die Buchung bei Bootshaus Nord wird zurückgezogen, der Anbieter
wird benachrichtigt.“ Nach dem Absenden ist die Meldung weg, die Anfrage ist weg bzw. zurückgezogen, die Rückzugs-Mail
ist eingereiht. Dasselbe gilt, wenn der Wettkampf abgewählt wird.
**Ergebnis 14.11.:** bestanden (H3 Nr. 1). Prüfseite „… Team 1 · C2x: Die Buchung bei Bootshaus Nord wird zurückgezogen, der Anbieter wird benachrichtigt.“; nach dem Absenden „Meldung gespeichert“, Anfrage …0015 weg, …0016 bleibt, Mail eingereiht. Abwahl eines ganzen Wettkampfs nicht eigens getestet.

### A10 (neu) - Team mit Buchung entfernen, Vergabe geschlossen

**Vorbedingung:** Wie A9, aber Anbieter 1 hat „Vergabe geschlossen“ gesetzt.
**Schritte:** Team 1 entfernen, Prüfseite ansehen, absenden.
**Erwartung:** Schon die Prüfseite meldet den Fehler vorab; das Absenden ergibt 409 `MATERIAL_REMOVAL_REQUESTS_CLOSED`
und nennt die betroffene Meldung in der Fehlerliste. Es wird nichts gespeichert, die Meldung und die Buchung bleiben.
**Ergebnis 14.11.:** bestanden (H3 Nr. 2). Die Prüfseite warnt vorab („So lässt sich die Meldung nicht absenden …“); Absenden: „Nicht gespeichert: Entfernt wurde eine Meldung mit Materialanfrage, deren Anbieter die Vergabe geschlossen hat …“; DB: Anfrage CONFIRMED, M2-Meldungen unverändert.

### A11 (neu) - Festgeschriebenes Team

**Vorbedingung:** M1 (Meldungen mit Läufen) im Formular, das Team ist „verbindlich“.
**Schritte:** Team öffnen.
**Erwartung:** Materialart, Anbieter („C4x+ (1 Stück) · Anbieter: Bootshaus Nord, Ruderwerft Süd“) und eine Erklärung,
warum nichts zu ändern ist, statt einer leeren Auswahlbox.
**Ergebnis 14.11.:** bestanden (H3 Nr. 5). „C4x+ (1 Stück) · Anbieter: Bootshaus Nord, Ruderwerft Süd“ plus „Diese Meldung ist festgeschrieben; die Materialwahl lässt sich hier nicht mehr ändern. Den Stand der Anfrage zeigt „Mein Event“ …“.

### A12 (neu) - Meldeformular von nicht freigegebener Adresse

**Vorbedingung:** Frontend unter `anbieter1.localhost:5179` o. ä. (nicht `localhost`/`127.0.0.1`).
**Schritte:** Eine Meldung absenden.
**Erwartung:** 422 mit dem Text „Adresse nicht freigegeben (…)“ und der aufgerufenen Adresse, nicht „unerwarteter
Fehler“ (`CALLBACK_URL_NOT_ALLOWED`).
**Ergebnis 14.11.:** nicht gelaufen. Backend per curl belegt (422 `CALLBACK_URL_NOT_ALLOWED`), der Text im Formular nie ausgelöst (Test-Origins `*.localhost` wurden nur für Anbieter und Admin benutzt).

---

## Block B: Anbieter-Dashboard (Anbieter 1, `/material/event/<eventId>?tab=…`)

Der Reiterkopf zählt offene Arbeit („Anfragen“: Offen, „Zuteilung“: ohne Stück plus Konflikt). Die Arbeitsliste hat die
Primäraktion „Bestätigen“; Seltenes (Warteliste, Ablehnen, Ausnahme je Lauf, weiteres Stück, CSV) liegt im ⋮-Menü.
Filter „Offen/Bestätigt/Abgelehnt/Zurückgezogen/Alle“; „Auslastung je Angebot“ zeigt bestätigt/offen/Warteliste gegen
geplant.

### B1 - Anfrage bestätigen

**Vorbedingung:** Reiter „Anfragen“, M2 #2 (DM-Verein 1, C2x angefragt).
**Schritte:** „Bestätigen“.
**Erwartung:** „Entscheidung gespeichert“, Status „bestätigt“, `decidedAt` gesetzt; Zähler im Reiterkopf und die
Auslastung aktualisieren sich.
**Ergebnis 14.11.:** bestanden (H1; H3 Nr. 6 am Telefon). Bestätigen: Toast „Entscheidung gespeichert“, Zähler und Auslastung aktualisieren sich (H3: „2 von 4“).

### B2 - Warteliste mit Notiz

**Vorbedingung:** Eine offene Anfrage.
**Schritte:** ⋮ → „Auf Warteliste setzen“, Notiz eintragen, speichern.
**Erwartung:** Status „Warteliste“ mit Chip „rückt als Nächste nach“ an der ältesten; die Notiz steht unter dem
Vereinsnamen; Warteliste zählt unter „Offen“. **Neu:** Der Dialog sagt, dass vorhandene Zuteilungen der Anfrage gelöscht
werden (B12).
**Ergebnis 14.11.:** bestanden (H1; H3 Nr. 6). Notiz in der Liste; bestätigte Anfrage mit Zuteilung (MT 1, Boot 7) auf Warteliste: Dialog „Die Anfrage hat 1 Zuteilung. Sie wird dabei gelöscht; eine spätere Bestätigung beginnt ohne Stück.“, danach DB: Zuteilung weg, `WAITLISTED`. Siehe B12.

### B3 - Ablehnen mit Notiz

**Vorbedingung:** Eine offene Anfrage.
**Schritte:** ⋮ → „Ablehnen“, Notiz „Kein Boot mehr frei“.
**Erwartung:** Dialog „Die Anfrage wird abgelehnt. Die Notiz sieht der Verein bei seiner Meldung.“; Status
„abgelehnt“, zählt nicht mehr in der Auslastung, Filter „Abgelehnt“ zeigt die Notiz.
**Ergebnis 14.11.:** bestanden (H1; H3 Nr. 6: Ablehnen mit Notiz, DB `DECLINED`). Die Notiz sieht der Verein jetzt im Formular (A8).

### B4 - Sammelbestätigung

**Vorbedingung:** Mindestens zwei offene Anfragen (der Verein legt im Formular zusätzliche an).
**Schritte:** Über der Liste „N Anfragen bestätigen“ (alle Zeilen vorangekreuzt), ggf. abwählen, bestätigen.
**Erwartung:** „N Anfragen bestätigt“, Zeilen wechseln auf bestätigt. Schlägt eine fachlich fehl, nennt die Meldung die
Zahl der gescheiterten.
**Ergebnis 14.11.:** bestanden (H1: „3 Anfragen bestätigt“; H3 Nr. 7 für die Rückfrage). Der Fehlerfall „N Anfragen konnten nicht bestätigt werden“ ließ sich nie herstellen: **nicht belegt**.

### B5 - Wartelisten-Hervorhebung, wenn eine Bestätigung frei wird

**Vorbedingung:** C2x geplant 2, bestätigt 2 (DM-Verein 1 #1 und DM-Verein 2), DM-Verein 3 auf der Warteliste.
**Schritte:** A6 ausführen (Verein 1 zieht #1 zurück), Reiter „Anfragen“ neu laden.
**Erwartung:** Die älteste Wartelisten-Anfrage (DM-Verein 3) ist hervorgehoben; nichts wird automatisch bestätigt.
**Ergebnis 14.11.:** bestanden (H3 Nr. 10). Nach Rückzug bei C2x (bestätigt 1 von 2) trägt DM-Verein 3 (Warteliste, älteste) und die C4x+-Warteliste „rückt als Nächste nach“; nichts wurde automatisch bestätigt. H1 hatte das nur halb sehen können.

### B6 - „Nach Meldungsnummer zuteilen“

**Vorbedingung:** Reiter „Zuteilung“, Ansicht „Nach Team“, bestätigte BOAT-Anfragen mit Meldungsnummer (nach der
Fixierung, C2).
**Schritte:** ⋮ → „Nach Meldungsnummer zuteilen“.
**Erwartung:** Jede bestätigte Anfrage ohne Stück bekommt das Stück gleicher Art mit der **Meldungsnummer** als Nummer
(ein Stück je Wettkampf höchstens einmal, auch gegen bestehende Grundzuteilungen; bei doppelter Nummer gewinnt die ältere
Anfrage). „N Zuteilungen nach Meldungsnummer übernommen“ oder „Keine passenden Vorschläge gefunden“.
**Ergebnis 14.11.:** bestanden mit Einschränkung (H3 Nr. 8). Nach der Fixierung „1 Zuteilung nach Meldungsnummer übernommen“ (Nr. 5 → Boot 5), je Wettkampf höchstens eine Grundzuteilung je Stück, Boot 3 bleibt; vor der Fixierung „Keine passenden Vorschläge: Kein freies Stück trägt die Meldungsnummer …“. **Nicht belegt:** doppelte Meldungsnummern (zwei Teams, ein Stück) und zwei Vorläufe ließen sich im Seed nicht herstellen.

### B7 - Ausnahme je Lauf

**Vorbedingung:** M1 MT 1 (bestätigt, Grundzuteilung Boot 7), Läufe Vorlauf 1/2, Finale.
**Schritte:** ⋮ → „Ausnahme je Lauf“, Lauf „Finale“ wählen, Boot 8 eintragen, „Hinzufügen“.
**Erwartung:** Der Dialog nennt je Lauf „Startnr. n“ (ohne Dopplung wie „Finale · Finale“), Stücke mit dieser Nummer
stehen zuerst und sind als „trägt die Startnummer“ markiert, nur Stücke der passenden Art. Die Ausnahme gilt nur für diesen
Lauf; Boot 7 bleibt für die anderen. „Nach Materialstück“ zeigt Boot 8 für das Finale.
**Ergebnis 14.11.:** bestanden (H1; H3 Nr. 8/9). Ausnahme für das Finale (Boot 8) gesetzt, in der DB zwei Zeilen, wieder entfernt; Dialog „Vorlauf 2 · Startnr. 1“ / „Finale · Startnr. 3“ ohne Dopplung. „trägt die Startnummer“ nicht eigens notiert.

### B8 - Falsche Art wird abgewiesen

**Vorbedingung:** M1.
**Schritte:** Die Oberfläche bietet nur Stücke der passenden Art an; per API ein Skull-Paar einer C4x+-Anfrage
zuteilen.
**Erwartung:** 409 („Material item does not match the offer's type“, ohne Fehlercode), Zuteilungen unverändert.
**Ergebnis 14.11.:** bestanden (H1: 409 ohne Fehlercode, Zuteilungen unverändert). Nicht erneut getestet.

### B9 - Ausfall rot

**Vorbedingung:** Boot 6 (Totalschaden, offenes Fenster) ist MT 3 zugeteilt.
**Schritte:** „Nach Team“ und „Nach Materialstück“ ansehen.
**Erwartung:** Rotes „Ausfall“ mit Chip „Startnummer abweichend“ bzw. „weicht in n Läufen ab“ und „1 Ausnahme“ am Team, roter Chip am Finale-Eintrag
des Stücks, „… 1 mit Konflikt“ im Kopf. Die Zuteilung ist nicht blockiert.
**Ergebnis 14.11.:** bestanden (H1: Ausfall rot, „1 Ausnahme“, „… 1 mit Konflikt“, Zuteilung nicht blockiert). H3 Nr. 8 hat den neuen Chip „Startnummer weicht in 2 Läufen ab“ gesehen; der Ausfall-Konflikt selbst wurde nach F2 **nicht** erneut gesehen.

### B10 - Hinweis vor der Fixierung

**Vorbedingung:** Offene Anfragen (REQUESTED) bei eingeladenen Anbietern (seed: je eine bei Bootshaus Nord und
Ruderwerft Süd).
**Schritte:** Als Admin Veranstaltung → **Meldungen** (nicht „Durchführung“).
**Erwartung:** „N Materialanfragen sind noch nicht entschieden. Erst entscheiden, dann fixieren, sonst greift die
Nummerngleichheit nur zufällig.“ Der Zähler ist so hoch wie die Summe der „Offen“-Anfragen der Dashboards (nur
Anfragen mit existierender Meldung).
**Ergebnis 14.11.:** teilweise bestanden. H1: Hinweis vor der Fixierung gesehen (damals mit hängender Seed-Anfrage). Nach F1: „2 Materialanfragen sind noch nicht entschieden …“ gesehen (F4 Fall 17); dass die Zahl genau der Summe der „Offen“-Anfragen der Dashboards entspricht, wurde **nicht** erneut verglichen.

### B11 (neu) - Sammelbestätigung über den Plan

**Vorbedingung:** C2x geplant 2, bestätigt 2, dazu mehrere offene C2x-Anfragen.
**Schritte:** „N Anfragen bestätigen“ wählen.
**Erwartung:** Eine Rückfrage nennt, um wie viele Stücke der Plan überschritten wird (`capacityOverruns`); erst nach
Bestätigung wird entschieden.
**Ergebnis 14.11.:** bestanden (H3 Nr. 7). „3 Anfragen bestätigen“ (C2x 2/2 + zwei Skull-Paar): Rückfrage „Über die geplante Anzahl bestätigen? – C2x: danach 3 bestätigt bei 2 geplanten (1 mehr als geplant) …“, Abbrechen / „Trotzdem bestätigen“; Abbrechen: nichts bestätigt. „Trotzdem bestätigen“ nicht ausgeführt.

### B12 (neu) - Warteliste und Ablehnung löschen die Zuteilungen

**Vorbedingung:** Bestätigte Anfrage mit Grundzuteilung (M1 MT 1, Boot 7).
**Schritte:** ⋮ → „Auf Warteliste setzen“, Dialog lesen, bestätigen; danach erneut bestätigen.
**Erwartung:** Der Dialog nennt „1 Zuteilung … wird gelöscht“. Nach der Warteliste ist die Zuteilung weg, eine spätere
Bestätigung beginnt ohne Stück (nichts kehrt still zurück). Die Anzeigen zeigen kein Boot mehr (Sicht und Marker).
**Ergebnis 14.11.:** bestanden (H3 Nr. 6). Dialogtext „Die Anfrage hat 1 Zuteilung …“; nach dem Speichern DB: Zuteilung Boot 7 weg, Status `WAITLISTED`. Die spätere Bestätigung (beginnt ohne Stück) und die Anzeigen danach wurden **nicht** angesehen. Beobachtung: der Dialogtitel sprang beim Schließen kurz auf „Anfrage ablehnen“ (danach korrigiert, im Browser nicht erneut angesehen).

### B13 (neu) - Art eines Angebots mit Anfragen ist fest

**Vorbedingung:** Angebot C2x mit Anfragen, Reiter „Einstellungen“.
**Schritte:** Angebot bearbeiten, Materialart wechseln; danach nur Preis/Menge/Wechselzeit ändern.
**Erwartung:** Der Artwechsel ergibt 409 `MATERIAL_OFFER_TYPE_LOCKED` mit verständlichem Text; Preis, geplante Anzahl und
Wechselzeit bleiben änderbar. Nach einer Angebotsänderung lädt das Dashboard Tabelle und Übersicht neu.
**Ergebnis 14.11.:** bestanden (H3 Nr. 12). Angebot C2x auf Gig-Vierer: „Zu diesem Angebot gibt es schon Anfragen; die Materialart bleibt deshalb fest. Preis, geplante Anzahl und Wechselzeit lassen sich weiter ändern.“ Dass Preis/Anzahl/Wechselzeit danach änderbar bleiben und die Übersicht neu lädt, wurde nicht eigens gesehen.

### B14 (neu) - Kein Doppel-Zuteilen bei langsamem Netz

**Vorbedingung:** Anfrage mit Menge 2; Netz im Browser auf „langsam“ gedrosselt.
**Schritte:** Stück A wählen, noch vor dem Nachladen Stück B wählen.
**Erwartung:** Die Bedienelemente bleiben gesperrt, bis die neue Übersicht da ist; A geht nicht verloren (beide Stücke
zugeteilt). Dasselbe bei Ausnahme- und Ausfall-Dialog.
**Ergebnis 14.11.:** nicht gelaufen (kein gedrosseltes Netz). Nur Logik-Tests (`reloadGate`).

### B15 (neu) - Telefon (390 px)

**Vorbedingung:** Viewport 390 px, Anbieter 1.
**Schritte:** Alle vier Reiter, Flotte, Seitenleiste.
**Erwartung:** Kein horizontales Scrollen, Reiterleiste ohne abgeschnittene Beschriftung („Einstellungen“ ganz),
Primäraktion ein Klick.
**Ergebnis 14.11.:** bestanden (H3 Nr. 6/16, F3). Bei 390 px kein horizontales Scrollen, Reiter vollständig; Entscheidungsdialoge, Überbuchungs-Rückfrage und Textknopf „Ausnahme entfernen“ am Telefon lesbar. 768 px nicht getestet.

---

## Block C: Fixierung (Veranstaltung → Meldungen)

### C1 - Schalter nur mit eingeladenem Anbieter

**Vorbedingung:** DM-Veranstaltung mit Anbietern; zum Vergleich eine Veranstaltung ohne Anbieter.
**Schritte:** Meldeseite öffnen (vor der ersten Fixierung direkt auf der Seite, danach im Dialog „Meldungen
refinalisieren“).
**Erwartung:** Schalter „Meldungsnummern nach Bootsnummern vergeben“ mit Erklärsatz Meldungs- ↔ Startnummer (nur mit
Anbieter); bei einer Veranstaltung ganz ohne Anbieter fehlt er.
**Ergebnis 14.11.:** bestanden (H1; H3 Nr. 14). Block „Meldungsnummern nach Bootsnummern vergeben“ mit neuem Erklärtext, Refinalisieren-Dialog erklärt Behalten/Nicht behalten und Nummer gegen Startnummer. Das Fehlen bei einer Veranstaltung **ohne** Anbieter wurde nach F2 nicht erneut gesehen (H1: fehlte). Beobachtung: die erste Fixierung ohne eingeschalteten Schalter öffnet keinen Dialog, der Erklärtext steht im Seitenblock (vermutlich beabsichtigt).

### C2 - Nummerngleichheit für bestätigte Bootsanfragen

**Vorbedingung:** Anfragen entschieden (B10), Bestände aktiv.
**Schritte:** Schalter an, „Meldungen finalisieren“.
**Erwartung:** Bestätigte BOAT-Teams bekommen Meldungsnummern aus dem Bestand ihrer Art, Teams mit eigenem Boot die
freien Nummern ab 1, die keine Bootsnummer sind.
**Ergebnis 14.11.:** bestanden (H3 Nr. 14). Mit Schalter an: M1 MT 1 → 7 (Boot 7), MT 2 → 2, MT 3 → 6, MT 4 (eigenes Boot) → 1; M2 #1 mit Boot 3 → 3, übrige 1, 2, 5; je Wettkampf eindeutig. H1 hatte die Grundzuteilung noch nicht berücksichtigt (Boot 7 → Nr. 8).

### C3 - Überzählige Mietteams

**Vorbedingung:** Mehr bestätigte Anfragen einer Art als aktive Stücke (Boote 4 und 5 ausmustern, beide C2x-Anfragen
bestätigen).
**Schritte:** Fixierung mit Schalter.
**Erwartung:** Ein Team bekommt 3, das zweite eine Nummer oberhalb des aktiven Bestands; Dashboard zeigt „ohne
Nummerngleichheit“ am Team und den Satz „N Teams ohne Nummerngleichheit …“.
**Ergebnis 14.11.:** teilweise. Der Hinweis „ohne Nummerngleichheit“ (Chip und Satz „1 Team ohne Nummerngleichheit: Seine Meldungsnummer trägt kein aktives Stück der Flotte.“) wurde in H3 Nr. 8 für ein Team (V1 #1, Nr. 6, Boot 3) gesehen. Das eigentliche Szenario „überzähliges Mietteam oberhalb des Bestands bei der Fixierung“ ist im Seed nicht herstellbar und **nicht belegt** (H1: Nummern 3 und 4 vergeben, damals ohne Hinweis).

### C4 - „Nummern behalten“

**Vorbedingung:** Meldungen schon einmal fixiert, einige Teams ohne Nummer.
**Schritte:** Dialog „Meldungen refinalisieren“, „Gesetzte Startnummern beibehalten“ plus Schalter.
**Erwartung:** Nur Teams ohne Nummer bekommen eine (ggf. Bootsnummer); vorhandene bleiben. Der Dialog erklärt, warum die
Beibehalten-Option fehlt, wenn alle Teams Nummern haben („würfelt alle neu aus“).
**Ergebnis 14.11.:** bestanden mit Einschränkung (H1; H3 Nr. 14). Zweites Fixieren mit „behalten“ nach Neumeldung: Nummern von DM-Verein 2/3/4 unverändert, neues M3-Team Nr. 1, Teams ohne Nummer bekamen höhere (6, 7). Ein echtes Nachmelder-Team mit Altbestand und „höher als die höchste“ nicht gemessen. Die Boot-Nummerngleichheit dieser Nachmelder war in H3 durch H3-F1 gestört (behoben, C7).

### C5 (neu) - Fixierung mit vorhandener Grundzuteilung

**Vorbedingung:** M1 mit Grundzuteilungen (MT 1 Boot 7, MT 2 Vierer 2, MT 3 Boot 6), Meldungen noch nicht fixiert oder
„neu mischen“.
**Schritte:** Schalter an, fixieren.
**Erwartung:** Meldungen mit bestätigter Grundzuteilung (BOAT, ohne Lauf, Stück mit Nummer) bekommen **genau diese Nummer**
(MT 1 → 7, MT 2 → 2, MT 3 → 6), das eigene Boot eine freie Nummer ohne Bootsnummer. Zwei Meldungen auf demselben Boot:
eine behält sie.
**Ergebnis 14.11.:** bestanden (H3 Nr. 14; F4 Fall 17). Mit Schalter: MT 1 → 7, MT 2 → 2, MT 3 → 6, eigenes Boot → 1; M2 #1 mit zugeteiltem Boot 3 → 3. Zwei Meldungen auf demselben Boot: nur Backend-Test, nicht im Browser.

### C6 (neu) - Rückmeldung nach dem Fixieren und Meldungsnr.-Chip

**Vorbedingung:** Nach C2 oder C5; Wettkampf M1 (Nummern 1–4) und M2.
**Schritte:** Fixieren, Rückmeldung lesen, Wettkampf → Reiter „Meldungen“.
**Erwartung:** Die Rückmeldung nennt, wo die Nummern stehen (zuerst Reiter „Meldungen“, dann das Meldeergebnis). In der
Namensspalte steht ein umrandeter Chip „Meldungsnr. n“ (Tooltip Meldungs- vs. Startnummer), nur bei gesetzter Nummer, auf
der mobilen Karte unter dem Namen. Die Liste „Teams“ zeigt ihn **nicht**.
**Ergebnis 14.11.:** bestanden (H3 Nr. 14). Rückmeldung „Vergeben wurden Meldungsnummern je Wettkampf. Sie stehen bei jedem Wettkampf im Reiter „Meldungen“ („Meldungsnr. n“ beim Team) und im Meldeergebnis …“ und Toast „Meldungen finalisiert“; Chip „Meldungsnr. 6“ im Reiter „Meldungen“ gesehen (G1: 1280 und 390 px). Tooltip-Text und en/da nicht gesehen.

### C7 (neu) - Erneutes Speichern der Meldung behält Nummer und Namen

**Vorbedingung:** Fixierung mit Schalter nach einer Grundzuteilung (M2 #1 mit Boot 3 → Meldungsnummer 3); Vereinsvertretung DM-Verein 1.
**Schritte:** Meldeformular ohne Änderung durchklicken („Weiter“, „Weiter“, „Meldung abschicken“); danach `id`, Name, `team_number`, `created_at` der Material-Meldungen per SQL vergleichen.
**Erwartung:** Alle Spalten identisch, auch der Name (M2 „#1“/„#2“, gesperrtes M1 „MT 1“); nur `updated_at` ist neu. Anfragen und Zuteilung bleiben. Das gilt für **alle** Veranstaltungen, nicht nur mit Material. Ein neues Team bekommt seine Nummer erst bei der nächsten Fixierung, ein entferntes gibt sie frei.
**Ergebnis 14.11.:** bestanden (F4 Fall 17, nach der Korrektur `e9d466a1`). Vor der Korrektur (H3-F1) verloren M2 #1/#2 ihre Nummer und M1 MT 1 den Namen (Fehler schon im Stand vor der Übernahme). **Nicht belegt:** Einzelmeldungen (eigener Pfad ohne eigenen Test), Durchnummerierung bei geänderter Meldungsmenge (positionsabhängig, wie vorher).

---

## Block D: Schäden und Flotte

Schäden und Fotos bumpen den Änderungsmarker nicht (ADR-0109); ein Ersatz wirkt erst über die Ausnahme je Lauf.

### D1 - Schaden melden mit Pflichtfeldern

**Vorbedingung:** Anbieter 1, Reiter „Schäden“ oder Flotte, Boot 3 (C2x, ohne Schaden).
**Schritte:** „Schaden melden“, Stück Boot 3, Beschreibung, Schwere „leicht“, speichern.
**Erwartung:** Eintrag „gemeldet“, Melder und Zeitpunkt automatisch, kein Ausfallfenster (Vorschlag nur bei
„Totalschaden“ mit „Ausfall ab“). Der Verursacher wird aus der Zuteilung vorgeschlagen. **Regel der Schadensliste:** Der Reiter zeigt Schäden der Veranstaltung, wenn ihre Meldung zur Veranstaltung gehört, **oder** der Schaden offen (gemeldet) ist, **oder** er an einem Veranstaltungstag gemeldet wurde, **oder** sein Ausfallfenster die Tage berührt; ein „jetzt“ gemeldeter Schaden bleibt also auch außerhalb der Veranstaltungstage sichtbar (gilt auch für die CSV).
**Ergebnis 14.11.:** bestanden (H2; H3 Nr. 11). Pflichtfelder, „Schaden gespeichert“, `reported_by` und `reported_at` gesetzt, Vorschläge bei Totalschaden. H2-F1 (neuer Schaden „jetzt“ außerhalb der Veranstaltungstage fehlte in der Liste) ist behoben: in H3 bleibt der Schaden („leicht · gemeldet“, 1 Foto) in der Liste, 390 px ohne Überlauf.

### D2 - Foto zum Schaden

**Vorbedingung:** Ein Schaden (Boot 6 oder D1).
**Schritte:** Ein Foto (JPEG/PNG, unter 10 MB) hinzufügen.
**Erwartung:** Foto erscheint, Format an den Bytes erkannt (PNG wird als JPEG gespeichert). Jedes Foto wird einzeln hochgeladen; ein ungültiges Foto im Stapel stoppt die gültigen nicht, die Meldung nennt „Nicht hochgeladen: Name (Grund)“.
**Ergebnis 14.11.:** bestanden (H2; H3 Nr. 11). JPEG und PNG (als JPEG gespeichert) mit Vorschau und Löschen; mit Textdatei `kaputt.jpg` im Stapel: Toast „Nicht hochgeladen: kaputt.jpg (kein Bild)“ plus „Schaden gespeichert“, das gültige Foto bleibt (SQL: 1 Foto). H2-F3 damit behoben. 10-MB-Grenze **nicht testbar** (der Client verkleinert vorher).

### D3 - Totalschaden öffnet den Ersatzdialog

**Vorbedingung:** Ein zugeteiltes Boot (z. B. Boot 7, MT 1).
**Schritte:** Schaden „Totalschaden“ mit Ausfall ab jetzt speichern.
**Erwartung:** Dialog „Betroffene Läufe“ mit je einem Eintrag (Lauftitel ohne Dopplung, „Startnr. n“) und Ersatzwahl
(freie Stücke im Fenster, richtige Art, „Nummer passt“ markiert).
**Ergebnis 14.11.:** bestanden (H2). Boot 7: Dialog „Betroffene Läufe“ mit „Startnr. 1 · DM-Verein 1 · M1 · Vorlauf 1 10:35“ und „… Finale 12:07“, angeboten nur freie Stücke der Art (Boot 8). „Nummer passt“ nicht gesehen (kein Stück mit Startnummer 1).

### D4 - Ersatzwahl legt eine Ausnahme an

**Vorbedingung:** D3, Ersatz gewählt, „Übernehmen“.
**Schritte:** „Zuteilung“ → „Nach Team“.
**Erwartung:** Grundzuteilung unverändert sichtbar, für den Lauf gilt die neue Ausnahme; bei Menge 2 wird nur das
ausgefallene Stück ersetzt, das zweite bleibt.
**Ergebnis 14.11.:** bestanden (H2). Boot 8 für beide Läufe übernommen, „Keine betroffenen Läufe.“; Boot 7 bleibt Grundzuteilung, „2 Ausnahmen“, „Nach Materialstück“ zeigt Boot 7 „Keine wirksame Zuteilung“. Menge 2 nicht getestet.

### D5 - Reparatur: „Grundzuteilung wieder möglich“

**Vorbedingung:** Schaden an Boot 6 offen (Seed), Ausnahme für den Vorlauf 2.
**Schritte:** Schaden auf „repariert“ mit Reparaturzeitpunkt setzen.
**Erwartung:** Das Fenster endet am Reparaturzeitpunkt; bestehende Ausnahmen bleiben; die Einteilung zeigt den Satz „Vorlauf 2: Grundzuteilung wieder möglich“ und den lesbaren Textknopf „Ausnahme entfernen“ (kein Chip mit Kreuz). **Ein reparierter Schaden öffnet keinen Ersatzdialog.**
**Ergebnis 14.11.:** bestanden (H2, H3 Nr. 9/11). Reparatur öffnet keinen Ersatzdialog; „Vorlauf 2: Grundzuteilung wieder möglich“ mit Textknopf „Ausnahme entfernen“ (H2-F2: Chip unlesbar, nur Kreuz klickbar – behoben, H3: 36 px, lesbar, Klick am Rand löst die Ausnahme). „Ausfall bis“ wird beim Speichern aus „Repariert am“ übernommen (SQL), „Ende vor Beginn“ wird abgewiesen. **Nicht belegt:** dass „Ausfall bis“ im Dialog sofort mitläuft (nur Vitest; die Datumseingabe kam im Pane nicht an).

### D6 - Schaden an ausgemustertem Stück

**Vorbedingung:** Skull-Paar 4 in der Flotte auf „Ausgemustert“.
**Schritte:** Schaden melden.
**Erwartung:** Wird angenommen und erscheint wie jeder Schaden.
**Ergebnis 14.11.:** bestanden (H2; H3 Nr. 9). Schaden an ausgemustertem Skullpaar 4 wird angenommen. Ausgemusterte Stücke werden in „Stück zuteilen“ nicht mehr angeboten (H3: Boot 5 RETIRED, nur Boot 3 und 4).

### D7 - CSV-Export der Schadensakte

**Vorbedingung:** Mindestens der Seed-Schaden.
**Schritte:** Reiter „Schäden“, ⋮ → „CSV-Export“.
**Erwartung:** Datei lädt herunter (`text/csv`, UTF-8 mit BOM, Dateiname `<Zeitstempel>-Schaeden-<Veranstaltung>.csv` ohne Leerzeichen) mit Boot 6, „Totalschaden“, „gemeldet“ im Klartext. (Alle CSV-Exporte der App schreiben jetzt ausdrücklich UTF-8; nur diese CSV bekommt zusätzlich die BOM.)
**Ergebnis 14.11.:** bestanden mit Einschränkung (H2, H3 Nr. 11). CSV 200 `text/csv`; nach F3: Datei beginnt mit BOM (`efbbbf`), Schwere/Status im Klartext („Totalschaden“, „leicht“, „gemeldet“, „repariert“), Dateiname `2026-11-14_11-46-03-Schaeden-DM_Coastal_Rowing_2026.csv`. **Nicht belegt:** Öffnen in Excel, Speichern der Datei im Browser (nur Netzwerkantwort und curl), `Content-Type` weiter ohne `charset`.

### D8 (neu) - Stück mit Schadensakte löschen

**Vorbedingung:** Boot 6 (Schadensakte), keine Zuteilung nötig (Ausnahme/Grundzuteilung vorher lösen) bzw. ein Stück ohne.
**Schritte:** In der Flotte „Löschen“.
**Erwartung:** 409 `MATERIAL_ITEM_HAS_DAMAGES` mit dem Hinweis, das Stück auszumustern; ein zugeteiltes Stück ergibt den
Zuteilungs-Text; ein Stück ohne beides lässt sich löschen.
**Ergebnis 14.11.:** bestanden (H2). Löschen von Skullpaar 4 (Schadensakte): Toast „Zu diesem Stück gibt es eine Schadensakte; es kann nicht gelöscht werden. Stattdessen bearbeiten und „ausgemustert“ einschalten.“ Der Zuteilungs-Text und das erfolgreiche Löschen eines Stücks ohne beides wurden nicht eigens gesehen.

### D9 (neu) - Ausgemustertes Stück

**Vorbedingung:** Ein Stück auf „Ausgemustert“.
**Schritte:** Es einer Anfrage neu zuteilen (die Oberfläche bietet es nicht an; per API prüfen).
**Erwartung:** 409 `MATERIAL_ITEM_RETIRED`; eine bereits bestehende Zuteilung darf stehen bleiben; die Art eines
zugeteilten Stücks ist fest (409 `MATERIAL_ITEM_TYPE_LOCKED`).
**Ergebnis 14.11.:** bestanden mit Einschränkung (H2, H3 Nr. 9/12). Zuteilen eines ausgemusterten Stücks: Toast „Das Stück ist ausgemustert und kann nicht neu zugeteilt werden …“ (H2, vor der Korrektur noch angeboten); jetzt wird es gar nicht angeboten. Artwechsel eines zugeteilten Stücks: Text „Das Stück ist zugeteilt; seine Materialart bleibt deshalb fest. Erst die Zuteilungen lösen.“ (H3). Der Fall „bestehende Zuteilung eines ausgemusterten Stücks darf stehen bleiben“ nicht gesehen.

### D10 (neu) - Foto ist kein Bild

**Vorbedingung:** Schaden vorhanden.
**Schritte:** Eine Textdatei und eine SVG-Datei als Foto wählen.
**Erwartung:** Die Oberfläche sortiert sie mit Name und Grund aus („kein Bild“); per API 415
`MATERIAL_PHOTO_INVALID_TYPE` mit Text; die Meldung des Schadens bleibt erhalten.
**Ergebnis 14.11.:** bestanden (H2, H3 Nr. 11). Textdatei als `.jpg` im Stapel: Toast „Nicht hochgeladen: kaputt.jpg (kein Bild)“, das gültige Foto wird gespeichert (je Foto ein Aufruf); H2 hatte den 415 mit „Nur Bilder (z. B. JPEG, PNG) …“ gesehen. SVG nicht probiert.

### D11 (neu) - Foto zu groß, zu viele Fotos

**Vorbedingung:** Schaden vorhanden.
**Schritte:** Eine Datei über 10 MB, mehrere Dateien über 50 MB zusammen, mehr als 20 Dateien wählen.
**Erwartung:** Aussortiert mit Name und Grund („> 10 MB“, „> 50 MB zusammen“, „> 20“); per API 400
`MATERIAL_PHOTO_TOO_LARGE` (auch für die Summe); die Meldung bleibt.
**Ergebnis 14.11.:** nicht testbar. Der Client verkleinert Bilder vorher; eine Datei über 10 MB, eine Summe über 50 MB und mehr als 20 Dateien wurden nie hergestellt (nur Tests).

### D12 (neu) - 15 Handyfotos

**Vorbedingung:** Schaden, 15 Fotos von 12 MP am Telefon.
**Schritte:** Alle auswählen und hochladen.
**Erwartung:** Fortschritt „n von m“, die Fotos werden nacheinander verkleinert, der Tab bleibt stabil.
**Ergebnis 14.11.:** nicht gelaufen (Handykamera, 15 Fotos). Nur Logik-Tests.

### D13 (neu) - Ersatzwahl nur bei gemeldetem Ausfall

**Vorbedingung:** Ein Schaden mit „Ausfall ab“, zugeteilt.
**Schritte:** Schaden auf „repariert“ setzen und speichern.
**Erwartung:** Kein Ersatzdialog (er öffnet nur bei Status REPORTED).
**Ergebnis 14.11.:** bestanden (H2). Ein auf „repariert“ gesetzter Totalschaden öffnet keinen Ersatzdialog.

---

## Block E: Anzeigen

Die Anzeigen zeigen die **Startnummer im Lauf** neben dem Boot; „abweichend“ gilt gegen sie. Mit und ohne den Schalter
„Material immer zeigen“ prüfen (Standard aus). Anzeigen aktualisieren sich nach Neuladen; Pushes im verdeckten Tab kommen
nicht an. Kategorie `OTHER` erscheint auf keiner Anzeige.

### E1 - Mein Event

**Vorbedingung:** `/results/MATERIAL-MEINEVENT-1` (merkt den Code, springt auf `?tab=my-event`).
**Schritte:** Seite öffnen.
**Erwartung:** Block „Leihmaterial“ je Meldung mit Anfragen (auch bei Meldungen mit Lauf): „M1 … · C4x+ · Bootshaus Nord · bestätigt“; bei den Läufen „#1 · Boot 7“ mit Chip „abweichend“ (Boot 7 ≠ Startnummer 1). Status für angefragte/Warteliste-Anfragen sichtbar.
**Ergebnis 14.11.:** bestanden (H2; H3 Nr. 15). `/results/MATERIAL-MEINEVENT-1`: „LÄUFT GERADE“ Vorlauf 1 „#1 · Boot 7“ mit „abweichend“, „MEINE LÄUFE“ Vorlauf 1 und Finale ebenso. Der Block „LEIHMATERIAL · M1 … · C4x+ · Bootshaus Nord · bestätigt“ fehlte in H2 bei Meldungen mit Lauf und ist seit F3 da (H3 gesehen, 390 px ohne Überlauf). Die Status „angefragt“/„Warteliste“ im Block nicht eigens angesehen.

### E2 - Sprecher-Dashboard

**Vorbedingung:** `/speaker` → DM-Veranstaltung, Lauf M1 sichtbar.
**Schritte:** Ohne Schalter ansehen, dann „Boot-Material zeigen“.
**Erwartung:** Ohne Schalter zeigen nur Abweichungen das Boot („#1 · Boot 7“), eigene Boote nichts; mit Schalter zusätzlich
„eigenes Boot“.
**Ergebnis 14.11.:** bestanden (H2). Ohne Schalter „MT 1 · Boot 7 abweichend“, Nr. 2 ohne Zusatz; mit „Material immer zeigen“ zusätzlich „Vierer 2“ und „eigenes Boot“.

### E3 - Schiedsrichter-Dashboard

**Vorbedingung:** `/event/<eventId>/liveDashboard`, M1.
**Schritte:** Einstellungs-Popover, „Material immer zeigen“ umschalten.
**Erwartung:** Wie E2 im Karten-Layout.
**Ergebnis 14.11.:** bestanden (H2). Ohne Schalter Vorlauf 1 #1 „Boot 7 abweichend“, Vorlauf 2 #1 „Boot 8 abweichend“, Finale #1/#3; mit Schalter zusätzlich „Vierer 2“ und „eigenes Boot“; 390 px ohne Überlauf.

### E4 - Board

**Vorbedingung:** Board `5eed0009-0040-…0001` (`/board/<eventId>/<boardId>`), Kachel mit Material.
**Schritte:** Ansehen; im Board-Editor die Eigenschaft „Boot-Material zeigen“ an der Sprecher-Kachel und der Livestream-Overlay-Kachel ansehen.
**Erwartung:** Das Board (eine Sprecher-Kachel) zeigt wie E2 „Boot 7 · abweichend“, „Vierer 2“. Listen- und Lauf-Detail-Kacheln kennen kein Material.
**Ergebnis 14.11.:** bestanden mit Einschränkung (H2, H3 Nr. 15). Boot-Material zeigen nur Sprecher-Kachel (Vollbild) und die Livestream-Overlay-Kachel; das Seed-Board ist seit F3 eine Sprecher-Kachel (zeigt „Boot 7 · abweichend“, „Vierer 2“). Der Schalter „Boot-Material zeigen“ an beiden Kacheln wurde im Editor gesehen, aber nicht gespeichert; Lauf-Detail-/Listenkacheln kennen kein Material.

### E5 - Startliste (PDF)

**Vorbedingung:** Durchführung → M1 → Vorlauf 2 → Startliste.
**Schritte:** PDF mit und ohne den Schalter „Startlisten-Download (PDF/CSV je Lauf): Boot immer zeigen“ (`showMaterial`, an der Durchführungsseite).
**Erwartung:** Das Boot steht einmal je Team in der Kopfzeile („Boot / Boat Boot 8 (abweichend / differs)“), ohne Schalter nur bei Abweichung; Vorlauf 2 nennt „Boot 8“. CSV ohne Preset ergibt 400
`STARTLIST_CONFIG_NOT_CONFIGURED` (kein Fehler des Materials).
**Ergebnis 14.11.:** bestanden mit Einschränkung (H2, H3 Nr. 15). Schalter „Startlisten-Download (PDF/CSV je Lauf): Boot immer zeigen“ vorhanden; PDF (curl + pdftotext): Kopfzeile je Team „Startnummer / Start number 1  Boot / Boat Boot 8 (abweichend / differs)“, ohne Schalter nur Abweichungen, mit Schalter zusätzlich „Vierer 2“ / „eigenes Boot“. **Nicht belegt:** das PDF wurde nie als Bild angesehen; CSV-Startliste nicht ausprobiert (ohne Preset 400).

### E6 - Livestream-Szene und Regie

**Vorbedingung:** Szene `5eed0009-0041-…0001`; Regie `/event/<eventId>/streamPanel`. In AUTO sind Grafiken unsichtbar,
solange kein Lauf „in Vorbereitung“ ist; Startliste im Regie-Panel erzwingen.
**Schritte:** Startliste erzwingen, „Material immer zeigen“ umschalten.
**Erwartung:** Boot-Angabe mit der Kürzungsleiter (fällt bei knappem Platz zuerst weg); mit erzwungener Startliste
Vorlauf 2: „Boot 8“, abweichend.
**Ergebnis 14.11.:** bestanden (H2). Szene mit Schalter an: Finale „Boot 7 / Vierer 2 / Boot 6 / eigenes Boot“, Schalter aus: nur Nr. 1 und 3; die Grafik zeigt kein „abweichend“. **Nicht belegt:** Wirecast/OBS (nur Browserquelle gelesen), Kürzungsleiter bei knappem Platz.

### E7 (neu) - Lauf-Karte der Durchführung

**Vorbedingung:** Wettkampf M1 → Durchführung (`?tab=execution`).
**Schritte:** Läufe ansehen, bei 375, 768 und 1280 px.
**Erwartung:** Unter dem Verein „Boot 7/8/6“ mit Chip „abweichend“ (4 Chips), „Vierer 2“ ohne Chip, eigene Boote ohne
Zeile; die Freilos-Tabelle zeigt es ebenso.
**Ergebnis 14.11.:** bestanden mit Einschränkung (H2, H3 Nr. 15). Finale #1 „Boot 7 abweichend“, #2 „Vierer 2“, #3 „Boot 6 abweichend“, #4 ohne Zeile; Vorlauf 2 #1 „Boot 8 abweichend“; Entwickler bei 375 px: `scrollWidth` 375. **Nicht belegt:** 768/1280 px und die Freilos-Tabelle (kein Freilos im Seed).

### E8 (neu) - Live-Aktualisierung der Anzeigen

**Vorbedingung:** E4 (Board) und E3 offen, Tabs sichtbar, Anbieter 1 im zweiten Fenster.
**Schritte:** Eine Ausnahme je Lauf setzen, eine Anfrage bestätigen bzw. zurücknehmen.
**Erwartung:** Beide Anzeigen zeigen das neue Boot kurz danach ohne Neuladen (Änderungsmarker, Push plus Polling-Netz);
ein Schaden allein ändert nichts.
**Ergebnis 14.11.:** bestanden mit Einschränkung (H2). Bei sichtbarem Tab zeigt das Schiedsrichter-Dashboard eine Ausnahme nach ca. 2 s, das Board nach ca. 3 s, Mein Event nach ≤ 5 s, Rücknahme ebenso, ohne Neuladen. Die Änderung kam per API mit der Anbieter-Sitzung, nicht aus einem Anbieter-Fenster; verdeckter Tab **nicht** gemessen.

### E9 (neu) - Board-Detail mit langem Bootsnamen

**Vorbedingung:** Board mit Lauf-Detail-Kachel (das Seed-Board hat keine); Stück mit sehr langer Bezeichnung.
**Schritte:** Board ansehen.
**Erwartung:** Das Boot steht als umbrechende Zeile unter dem Teamnamen, Abweichung in lesbarer Warnfarbe mit „abweichend“;
die Namensspalte wird nicht geschoben.
**Ergebnis 14.11.:** nicht gelaufen. Das Seed-Board hat keine Lauf-Detail-Kachel (H2: Boot-Material gibt es nur in Sprecher- und Overlay-Kachel); langer Bootsname nie getestet.

---

## Block F: Rechte

### F1 - Anbieter sieht nur das Eigene

**Vorbedingung:** Anbieter 2 hat eine eigene Anfrage (MT 4).
**Schritte:** Als Anbieter 1 `/material/admin` aufrufen und `?provider=<Anbieter 2>` versuchen; per API die Übersicht von
Anbieter 2 holen.
**Erwartung:** `/material/admin` nicht erreichbar; das eigene Konto hat Vorrang vor `?provider=`; fremde Übersicht 403;
Anbieter 1 sieht die Anfrage von Anbieter 2 nie und von Meldungen nur Team, Verein, Wettkampf, Startnummer, Kontaktperson.
**Ergebnis 14.11.:** bestanden (H2; H3 Nr. 16). Anbieter 2: `?provider=` fremder Anbieter zeigt nur die eigene Anfrage, `/material/admin` leitet um; API gegen Anbieter 1: overview, Schadensliste, Schaden, Foto, CSV je 403, ohne Token 401, Schreiben 403. Seit F3 enthält die Übersicht nur Meldungen mit Anfrage beim eigenen Anbieter (Vorlauf 1 `teams: []`, Vorlauf 2/Finale nur MT 4). Eine „Kontaktperson“ am Anfrage-DTO gibt es nicht (Katalog war ungenau).

### F2 - Veranstalter ohne READ MATERIAL GLOBAL kann nicht einladen

**Vorbedingung:** Konto mit READ EVENT GLOBAL und UPDATE EVENT GLOBAL, ohne READ MATERIAL GLOBAL (eigene Rolle anlegen).
**Schritte:** Veranstaltung → Einstellungen → „Materialvermietung“.
**Erwartung:** Eingeladene Anbieter sichtbar, die Auswahl zum Einladen fehlt mit dem Hinweis, dass das Recht fehlt. Einladen verlangt UPDATE EVENT GLOBAL **und** READ MATERIAL GLOBAL (API ohne Letzteres 403, F10).
**Ergebnis 14.11.:** bestanden (H2; H3 Nr. 13). Mit Hilfsrolle „Wettkampfleitung“ (UPDATE EVENT GLOBAL, kein MATERIAL GLOBAL): Anbieter sichtbar, Auswahl-Box fehlt, Hinweis „Zum Einladen fehlt das Recht, Anbieter zu lesen.“ Die API-Lücke aus H2 (Einladen mit nur UPDATE EVENT war 204) ist behoben: 403 (H3). Rolle danach per SQL wieder entfernt.

### F3 - Ausladen

**Vorbedingung:** Veranstalter mit UPDATE EVENT GLOBAL.
**Schritte:** Bei einem Anbieter ohne Anfragen „Ausladen“, bestätigen; danach bei einem mit Anfragen.
**Erwartung:** Ohne Anfragen funktioniert es, die Toasts lauten „Anbieter eingeladen“ / „<Name> ausgeladen“. Mit Anfragen 409 mit eigenem Text (keine Meldung „konnte nicht gelöscht
werden“): Ausladen ist nicht möglich, stattdessen schließt der Anbieter die Vergabe.
**Ergebnis 14.11.:** bestanden (H2; H3 Nr. 13). Ausladen mit Anfragen: „Ruderwerft Süd hat schon Anfragen von Vereinen und kann deshalb nicht ausgeladen werden. Sollen keine neuen Anfragen mehr kommen, schließt der Anbieter in seinem Dashboard die Vergabe.“ Ohne Anfragen: Toasts „Anbieter eingeladen“ / „h3test Anbieter ausgeladen“ (H2-F6, falsche Texte „angelegt/gelöscht“, behoben).

### F4 - Admin verwaltet Anbieter und Materialarten

**Vorbedingung:** Admin.
**Schritte:** `/material/admin`, Anbieter und Art anlegen, bearbeiten.
**Erwartung:** Funktioniert; ohne UPDATE MATERIAL GLOBAL ist die Seite nicht erreichbar. Löschen bei Verwendung ist
gesperrt (409 `MATERIAL_*_IN_USE`) mit verständlichem Text.
**Ergebnis 14.11.:** bestanden (H2). Anbieter und Materialart anlegen, ändern, löschen; Löschen bei Verwendung mit verständlichen Texten (Konten, Stücke/Einladung, Materialart in Verwendung); 390 px ohne Überlauf. Der Zugriff ohne UPDATE MATERIAL GLOBAL wurde über F1 (Anbieter-Konto) gesehen.

### F5 (neu) - Anbieter mit Konten löschen

**Vorbedingung:** Anbieter 1 hat ein zugeordnetes Konto.
**Schritte:** Auf `/material/admin` den Anbieter löschen.
**Erwartung:** 409 `MATERIAL_PROVIDER_HAS_USERS`, Text „… hat noch Konten“; erst nach Lösen der Zuordnungen löschbar.
**Ergebnis 14.11.:** bestanden (H2). „Dem Anbieter sind noch Konten zugeordnet. Bitte erst auf den Seiten dieser Konten die Anbieter-Zuordnung lösen, dann löschen.“; nach Lösen der Zuordnung ließ sich der Anbieter löschen.

### F6 (neu) - Anbieter-Zuordnung und Rolle

**Vorbedingung:** Admin, Nutzerseite eines normalen Kontos, eines Anbieterkontos und des Systemkontos.
**Schritte:** Anbieter wählen und speichern; Zuordnung lösen; bei Fehlschlag Auswahl ansehen; Rollenfeld, Rollendialog und
Einladung ansehen.
**Erwartung:** Die Auswahl erscheint nur mit UPDATE STAFF, UPDATE USER, READ MATERIAL GLOBAL, UPDATE MATERIAL OWN; sie
nennt den Hinweis zur Rolle; Systemkonto zeigt den Sperrgrund. Setzen vergibt die Rolle „Materialanbieter“, Lösen entzieht
nur sie. Systemverwaltete Rollen stehen als Text, nicht als Auswahl; „Materialanbieter“ fehlt als Kopiervorlage im
Rollendialog und in der Einladung. Nach gescheiterter Zuordnung bleibt der gewählte Anbieter stehen.
**Ergebnis 14.11.:** bestanden mit Einschränkung (H2). Zuordnung speichern vergibt die Rolle, „Kein Anbieter“ entzieht nur sie (DB geprüft, nie Superadmin); Hinweis „… über eigene Abläufe vergeben: Materialanbieter“; Systemkonto: „Das Systemkonto kann keinem Anbieter zugeordnet werden.“; „Materialanbieter“ fehlt in Rollenliste und als „Kopie von“. **Nicht belegt:** Sperre am eigenen Konto (einziges globales Konto ist das Systemkonto), Einladung mit der Rolle, Verhalten nach gescheiterter Zuordnung.

### F7 (neu) - Konto nur mit Leserecht

**Vorbedingung:** Eigene Rolle mit READ MATERIAL (OWN bzw. GLOBAL), ohne UPDATE.
**Schritte:** Dashboard als dieses Konto öffnen.
**Erwartung:** Keine Entscheidungen, Zuteilung, Schadensmeldung, Vergabe-Schalter, Angebots- und Stückaktionen; keine 403 mit
Pauschaltext.
**Ergebnis 14.11.:** nicht gelaufen. Es gab kein Konto nur mit READ MATERIAL; nur Logik-Tests.

### F8 (neu) - Anbieter-Wechsel für globale Konten

**Vorbedingung:** Admin ohne eigene Zuordnung.
**Schritte:** `/material`, Dashboard und Flotte mit dem Anbieter-Wechsler im Seitenkopf.
**Erwartung:** Der gewählte Anbieter steht im Seitenkopf, der Wechsel ist dort möglich; der Seitenleisten-Link verwirft
`?provider=` nicht mehr.
**Ergebnis 14.11.:** bestanden (H2). Als Admin: „Bitte zuerst einen Anbieter auswählen.“, danach Seitenkopf „Anbieter: Bootshaus Nord · Anbieter wechseln“; Wechsel löscht die Wahl (ein Klick mehr als ein direktes Umschalten).

### F9 (neu) - Meldung gibt Anfragen frei (Veranstalter-Wege)

**Vorbedingung:** M2 #1 bestätigt, Vergabe **geschlossen**.
**Schritte:** Als Admin die Meldung des Teams über die Verwaltung löschen.
**Erwartung:** Das Löschen mit GLOBAL-Recht ist erlaubt (die Sperre gilt nur für Vereinswege), löst aber die Rückzugs-Mail
aus; Anfrage und Zuteilungen sind weg; der Marker wird gebumpt.
**Ergebnis 14.11.:** nicht gelaufen (nur Backend-Tests).

### F10 (neu) - Einladen braucht zusätzlich READ MATERIAL GLOBAL

**Vorbedingung:** Konto mit UPDATE EVENT GLOBAL, ohne READ MATERIAL GLOBAL (Hilfsrolle „Wettkampfleitung“).
**Schritte:** Per API `PUT /event/<id>/materialProvider/<providerId>`; danach Ausladen; zum Vergleich als Admin einladen.
**Erwartung:** Einladen 403, Ausladen 204 (nur UPDATE EVENT GLOBAL), Admin 204. Die Oberfläche versteckt die Auswahl (F2).
**Ergebnis 14.11.:** bestanden (H3 Nr. 13). 403 / 204 / 204 wie erwartet; Hilfsrolle danach per SQL entfernt. Vor F3 war das Einladen mit nur UPDATE EVENT GLOBAL erlaubt (H2).

---

## Block G: Startnummer aus Meldungsnummer (Entscheidung 14.11.2026)

Hintergrund: ADR-0111, Abschnitt 4. Mit dem Schalter „Meldungsnummern nach Bootsnummern vergeben“ speichert die
Fixierung den Wunsch an der Veranstaltung; jede **danach** angelegte Runde gibt jedem Boot seine Meldungsnummer als
Startnummer. Wettkampf **M4 Rundentest** ist dafür vorbereitet (siehe Testdaten). Vor dem Block den Seed frisch einspielen;
Fixieren wirkt veranstaltungsweit (auch M1/M2 und die DM-Wettkämpfe bekommen neue Meldungsnummern).

### G1 (neu) - Fixieren mit Schalter → Runde anlegen: Startnummer = Meldungsnummer

**Vorbedingung:** Frischer Seed, Admin-Sitzung; M4 ohne Läufe.
**Schritte:** Veranstaltung → Meldungen: Haken „Meldungsnummern nach Bootsnummern vergeben“ setzen, „Meldungen
finalisieren“. Danach Wettkampf M4 → Meldungen (Chips „Meldungsnr. n“), dann M4 → Durchführung → „Runde anlegen“.
**Erwartung:** Nach dem Fixieren steht im Block der Hinweis „Startnummer = Meldungsnummer …“. M4: DM-Verein 1 und 2
haben Meldungsnr. **21** und **22** (ihre Süd-Boote), DM-Verein 3 und 4 **1** und **2**. Die Lauf-Karten des Vorlaufs zeigen
die Meldungsnummern als Startnummern: Vorlauf 1 **#1** und **#22**, Vorlauf 2 **#2** und **#21**; „Süd 21“/„Süd 22“ ohne
Chip „abweichend“.
**Ergebnis 14.11.:** offen

### G2 (neu) - Folgerunde (Finale) behält die Meldungsnummer

**Vorbedingung:** G1.
**Schritte:** In M4 beide Vorläufe werten (Plätze eintragen, Lauf beenden), dann „Runde anlegen“ (bzw. die Folgerunden-
Automatik, falls eingeschaltet).
**Erwartung:** Im Finale starten alle vier Boote unter ihrer Meldungsnummer (**#1, #2, #21, #22**), nicht unter dem Rang 1–4;
kein „abweichend“. Die Liste ist nach Startnummer geordnet (nicht nach Setzplatz – bewusst, ADR-0111).
**Ergebnis 14.11.:** offen

### G3 (neu) - Schalter aus: Setzposition wie bisher

**Vorbedingung:** Frischer Seed.
**Schritte:** Veranstaltung → Meldungen: Haken **weg**, finalisieren. M4 → Runde anlegen.
**Erwartung:** Hinweis im Block „Die Rundenanlage vergibt die Startnummer je Lauf nach Setzposition …“. Vorläufe mit
Startnummern **#1/#2** je Lauf; die Süd-Boote mit Nummer ≠ Startnummer tragen den Chip „abweichend“.
**Ergebnis 14.11.:** offen

### G4 (neu) - Bestehende Läufe bleiben beim Fixieren unverändert

**Vorbedingung:** Frischer Seed (M1 hat Läufe mit #7/#3/#6/#1).
**Schritte:** Refinalisieren mit „Nummern behalten“ aus und Schalter an; danach M1 → Durchführung ansehen. Variante: G3 ausführen
(Runde in M4 ohne Schalter), dann mit Schalter refinalisieren und M4 ansehen; Runde löschen und neu anlegen.
**Erwartung:** Startnummern bestehender Läufe ändern sich durch das Fixieren **nicht** (M1 bleibt [7, 3], [6, 1], Finale
[1, 3, 6, 7], auch wenn MT 2 jetzt Meldungsnr. 2 hat). In M4 gleicht erst „Runde löschen“ + „Runde anlegen“ an.
**Ergebnis 14.11.:** offen

### G5 (neu) - Anzeigen ohne „abweichend“ im Normalfall

**Vorbedingung:** Frischer Seed.
**Schritte:** M1 auf Lauf-Karte (Durchführung), Board, Schiedsrichter-Dashboard, Sprecher, Mein Event (`MATERIAL-MEINEVENT-1`),
Stream-Szene ansehen.
**Erwartung:** MT 1 überall „#7 · Boot 7“ **ohne** „abweichend“; MT 3 im Finale „#6 · Boot 6“ ohne „abweichend“.
**Ergebnis 14.11.:** offen

### G6 (neu) - Echte Abweichung bleibt sichtbar

**Vorbedingung:** Frischer Seed.
**Schritte:** Wie G5, dazu Anbieter-Dashboard (Bootshaus Nord) → Einteilung.
**Erwartung:** MT 3 im Vorlauf 2 „#6 · Boot 8“ **abweichend** (Ausnahme wegen Ausfall); MT 2 „#3 · Vierer 2“ **abweichend**
in Vorlauf 1 und Finale, im Dashboard „ohne Nummerngleichheit“. Dashboard trennt „Meldungsnr.“ und „Startnr.“.
**Ergebnis 14.11.:** offen

### G7 (neu) - Startlisten-Export und RaceClocker

**Vorbedingung:** G1 (M4 mit Vorlauf), Startlisten-Konfiguration der Veranstaltung mit Spalte „Bib“; optional ein RaceClocker-
Rennen als Zeitnahmeprofil.
**Schritte:** Startliste (CSV und PDF) für Vorlauf 1 von M4 herunterladen. Mit RaceClocker: Liste importieren, dort zwei Boote
umsortieren, Ergebnisse abrufen.
**Erwartung:** CSV/PDF tragen die Meldungsnummern als Startnummer/Bib (#1, #22). Nach dem Abruf stehen in R2R weiter #1/#22
(das Umsortieren in RaceClocker ändert keine Startnummer); Zeiten kommen an. Ohne Schalter (G3) schreibt der Abruf wie bisher
die Listenpositionen.
**Ergebnis 14.11.:** offen

### G8 (neu) - Zeitnahme-Posten und Startanzeige mit großen Nummern

**Vorbedingung:** G1; ein Zeitnahme-Posten für M4.
**Schritte:** Posten (Helfer-App) und Startanzeige/Leitstand für Vorlauf 1 öffnen, eine Marke einem Boot zuordnen.
**Erwartung:** Boote erscheinen als „#1“ und „#22“, nach Startnummer geordnet; Zuordnen klappt; zweistellige Nummern werden
nicht abgeschnitten (auch Stream-Zeile).
**Ergebnis 14.11.:** offen

### G9 (neu) - Freilos in einer Folgerunde mit Schalter

**Vorbedingung:** Ein Setup, in dem eine Folgerunde ein Freilos erzeugt (nicht im Seed; z. B. M4-Finale mit einem abgemeldeten
Boot).
**Schritte:** Folgerunde anlegen, Freilos-Chip und Laufnamen ansehen.
**Erwartung:** Laufname „Freilos n“ stimmt; der Chip zeigt mit Schalter nur „Freilos“ ohne Zahl (bekannte Grenze, ADR-0111).
**Ergebnis 14.11.:** offen

---

## Nachtest (H3, F4)

H3 hat 16 Pflichtfälle nach den Korrekturen F1 bis F3 wiederholt, F4 den Fall 17 (siehe C7). Zuordnung zu den Fällen: Nr. 1 → A6/A9,
2 → A10, 3 → A8, 4 → A3, 5 → A4/A11, 6 → B1 bis B3/B12/B15, 7 → B4/B11, 8 → B6, 9 → B7/D5/D6, 10 → B5, 11 → D1/D2/D5/D7/D10, 12 → B13/D9,
13 → F2/F3/F10, 14 → C1 bis C6, 15 → E1/E4/E5/E7, 16 → F1. **H3 deckt nicht ab:** A1, A2, A7, A12, B8, B14 sowie den
Ausfall-Konflikt in B9, die Formularansicht bei geschlossener Vergabe (A5) und den Zähler-Abgleich in B10.

## Nicht belegt und offen (Endstand 14.11.2026)

- **Startnummer aus Meldungsnummer** (ADR-0111, Abschnitt 4): am 14.11.2026 entschieden und gebaut; Block G ist **offen**
  (nur Backend-Tests und ein kurzer Blick der Entwicklung, kein Handtest). Die Fälle B6, C2, C4, E4, E5, E7 sahen noch den
  alten Seed (Startnummer = Setzposition, MT 1 #1 mit Boot 7 abweichend); der neue Seed zeigt dort andere Zahlen.
- **Anmeldung über das Login-Formular wurde nie getestet:** Die Seed-Passwörter passen nicht zum lokalen Pepper, „Passwort vergessen“
  verlangt ein Captcha. Alle Rollen liefen über Sitzungs-Token in `localStorage`.
- **Nicht herstellbar im Seed (nicht belegt):** überzähliges Mietteam oberhalb des Bestands bei der Fixierung (C3), doppelte
  Meldungsnummern mit einem Stück (B6), Freilos-Tabelle mit Material (E7), Fehlerfall „N Anfragen konnten nicht bestätigt werden“ (B4),
  Sperre am eigenen globalen Konto (F6), Konto nur mit READ MATERIAL (F7).
- **Nicht gelaufen:** Meldeformular von nicht freigegebener Adresse in der Oberfläche (A12), langsames Netz (B14, nur Logik-Tests),
  15 Handyfotos (D12), langer Bootsname im Board (E9), Löschen einer Meldung durch den Veranstalter bei geschlossener Vergabe (F9).
- **Teilweise:** Fotos über 10 MB, Summe über 50 MB, mehr als 20 Dateien (D11; der Client verkleinert vorher); CSV nicht in Excel
  geöffnet und nicht als Datei im Browser gespeichert (D7); PDF-Startliste nie als Bild angesehen (E5); englische Rückzugs-Mail nie
  ausgelöst (A6); „Ausfall bis“ im Dialog nur durch Vitest belegt (D5); „Trotzdem bestätigen“, spätere Bestätigung nach Warteliste und
  Anzeigen danach nicht angesehen (B11, B12).
- **Nie getestet:** en/da-Texte (nie gegengelesen), Breite 768 px, Netzfehlerpfade, verdeckter Tab (Live-Aktualisierung E8 nur sichtbar
  gemessen, Änderung per API statt aus einem Anbieter-Fenster), Wirecast/OBS mit der Grafik (E6), Fotos von der Handykamera.
- Messung der Sicht und der Abfragen gegen Produktionsdaten (nur Seed-Umfang, `EXPLAIN` lesend); TypeSpec nicht kompiliert.
- Bekannte Beobachtungen ohne Material-Bezug: React-Warnung „Cannot update a component while rendering a different component“ im
  Meldeformular (`AutocompleteElement`), 404 auf `/static/theme.json` im Dev-Server.
