# Testkatalog: Materialvermietung (Boote und Zubehör)

Stand 14.11.2026, Zweig `claude/materialvermietung-uebernahme-9cf945`. Handtests zur Spec
`docs/superpowers/specs/2026-09-07-materialvermietung-design.md`; Entscheidungen: ADR-0109 bis
ADR-0111. Jeder Fall hat Vorbedingung, Schritte, Erwartung und eine Zeile **Ergebnis 14.11.**
Was dort nicht „bestanden“ steht, ist **nicht verifiziert**.

## Wie die Ergebnisse zu lesen sind

- **Handtest H1** (Blöcke A bis C, 14.11.2026) lief gegen den Stand `a474ad89`, also **vor** den
  Korrekturen F1 (Backend: Sicht, Sperren, Fixierung mit Grundzuteilung, Mail-Text) und F2 (Frontend:
  zwei Nummern, Komplettlisten, Meldeformular, Fixierungsdialog). Fälle, deren Oberfläche oder
  Verhalten danach geändert wurde, tragen den Vermerk **nach Korrektur erneut zu prüfen**.
- **OK\*** = bestanden, aber der damalige Katalogtext stimmte nicht mehr (veraltete Testdaten oder
  Bedienweg); der Text hier ist nach H1 auf den heutigen Stand gebracht.
- **Vorbefund** = ein Entwickler hat es beim Bauen im Browser gesehen. Das ist kein Handtest und
  ersetzt keinen.
- **offen** = nie in der laufenden App gesehen (nur Code, Tests oder API). Dazu gehören ausdrücklich
  alle Fälle der Blöcke D bis F und die neu aufgenommenen Fälle (jeweils „neu“), bis ihre Berichte
  eingetragen sind (`Ergebnis 14.11.: (wird nachgetragen)`).
- Nicht getestet wurden bisher: en/da-Texte (nie gegengelesen), Breite 768 px, Netzfehlerpfade.

## Übersicht

| Fall | Kurz | H1 (14.11., vor F1/F2) |
|---|---|---|
| A1 | Abschnitt „Material“ je Team mit Bedarf | OK\* |
| A2 | Ampel verfügbar → knapp | OK\* |
| A3 | Wettkampf ohne Angebot | H1: nicht testbar; Seed nachgezogen, offen |
| A4 | Erneutes Speichern behält die Anfrage | OK |
| A5 | Vergabe geschlossen | OK\*, nach Korrektur erneut |
| A6 | Rückzug einer bestätigten Anfrage = Mail | OK\*, nach Korrektur erneut (Mailtext neu) |
| A7 | Dieselbe Art doppelt | OK\* |
| A8 neu | Ablehnung als Chip mit Notiz im Formular | offen |
| A9 neu | Team mit Buchung entfernen, Vergabe offen | offen |
| A10 neu | Team mit Buchung entfernen, Vergabe geschlossen | offen |
| A11 neu | Festgeschriebenes (gesperrtes) Team | offen (Vorbefund) |
| A12 neu | Meldeformular von nicht freigegebener Adresse | offen (Vorbefund) |
| B1 | Anfrage bestätigen | OK |
| B2 | Warteliste mit Notiz | OK\*, nach Korrektur erneut |
| B3 | Ablehnen mit Notiz | OK, nach Korrektur erneut |
| B4 | Sammelbestätigung | OK\*, nach Korrektur erneut (Rückfrage neu) |
| B5 | Wartelisten-Hervorhebung | H1: teilweise nicht testbar |
| B6 | „Nach Meldungsnummer zuteilen“ | OK\*, nach Korrektur erneut (umbenannt, neu gepaart) |
| B7 | Ausnahme je Lauf | OK, nach Korrektur erneut (Dialog) |
| B8 | Falsche Art wird abgewiesen | OK |
| B9 | Ausfall rot | OK, nach Korrektur erneut (Chips) |
| B10 | Hinweis vor der Fixierung | OK, nach Korrektur erneut (Zähler) |
| B11 neu | Sammelbestätigung über den Plan | offen |
| B12 neu | Warteliste/Ablehnung löschen Zuteilungen | offen (Vorbefund) |
| B13 neu | Art eines Angebots mit Anfragen gesperrt | offen |
| B14 neu | Kein Doppel-Zuteilen bei langsamem Netz | offen |
| B15 neu | Telefon (390 px) | offen (Vorbefund) |
| C1 | Schalter nur mit Anbieter | OK\*, nach Korrektur erneut |
| C2 | Gleichheit nach Fixierung | OK\*, nach Korrektur erneut (Grundzuteilung bleibt) |
| C3 | Überzählige Mietteams | OK\*; H1-F2 inzwischen behoben, erneut |
| C4 | „Nummern behalten“ | OK\* (teilweise), nach Korrektur erneut |
| C5 neu | Fixierung mit vorhandener Grundzuteilung | offen |
| C6 neu | Rückmeldung nach dem Fixieren, Meldungsnr.-Chip | offen (Vorbefund Chip) |
| D1–D7 | Schaden, Foto, Ersatzdialog, Reparatur, CSV | Ergebnis folgt |
| D8–D13 neu | Löschsperren, Foto-Grenzen, Ersatzwahl nur bei REPORTED | Ergebnis folgt |
| E1–E6 | Anzeigen (Mein Event, Sprecher, Schiedsrichter, Board, Startliste, Stream) | Ergebnis folgt |
| E7–E10 neu | Lauf-Karte, Live-Aktualisierung, Board-Detail, Freilos | Ergebnis folgt |
| F1–F4 | Rechte | Ergebnis folgt |
| F5–F9 neu | Anbieter mit Konten, Zuordnung und Rolle, nur Lesen, Anbieter-Wechsel | Ergebnis folgt |

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
- **Wettkampf „M1 Materialtest“** (CM 4x+ MT, mit Läufen, für die Anzeigen): Vorlauf 1 läuft seit dem
  Einspielen, Vorlauf 2 in 20 min, Finale in 90 min. MT 1 (DM-Verein 1): Grundzuteilung **Boot 7**, im
  Lauf #1, also abweichend. MT 2 (DM-Verein 2): **Vierer 2**, #2, passt. MT 3 (DM-Verein 3): Grundzuteilung
  **Boot 6 (Totalschaden)**, im Vorlauf 2 Ersatz **Boot 8** als Ausnahme (#1), im Finale Boot 6 (#3). MT 4
  (DM-Verein 4): eigenes Boot, offene Anfrage bei Ruderwerft Süd. Vorlauf 1 [1,2], Vorlauf 2 [1,2],
  Finale [1,2,3,4] Startnummern. Meldungsnummern 1–4 (MT 1 bis MT 4).
- **Wettkampf „M2 Anmeldetest“** (CF 2x AT, ohne Läufe, **das Meldeformular für Block A**, Bedarf C2x
  und Skull-Paar): Das C2x-Angebot plant **2** Stück. DM-Verein 1 #1 **bestätigt** (Rückzug = Mail), #2
  **angefragt**; DM-Verein 2 **bestätigt**; DM-Verein 3 **Warteliste** (älteste offene Anfrage). DM-Verein 2
  hat im DM-Wettkampf 1 eine **abgelehnte** Anfrage mit Notiz (nur im Dashboard sichtbar). Die DM-Wettkämpfe
  1–3 haben keine Teilnehmerplätze und erscheinen **nicht** im Meldeformular. Meldungen haben noch keine
  Meldungsnummer.
- **Wettkampf „M3 Gig-Vierer ohne Angebot“:** Meldeplätze, Bedarf „Gig-Vierer“, den kein Anbieter
  anbietet.
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
**Ergebnis 14.11. (H1, vor F1/F2):** OK\*. So gesehen; der Katalog nannte damals andere Wettkämpfe.

### A2 - Ampel wechselt von „verfügbar“ auf „knapp“

**Vorbedingung:** Wie A1. Das C2x-Angebot plant 2 Stück; bestätigt 2, offen 1 (Seed) ist bereits „knapp“. Für den
Wechsel dient das Skull-Paar (geplant 4, startet grün) oder das Herabsetzen der geplanten Anzahl durch den Anbieter.
**Schritte:** Als Anbieter 1 (Einstellungen, Angebot bearbeiten) die geplante Anzahl von C2x anpassen, im Formular
neu laden.
**Erwartung:** Sobald bestätigt plus offen die geplante Anzahl erreichen, steht der Chip bei allen Teams des
Wettkampfs auf „knapp“ (gelb). Es gibt kein Rot, auch nicht bei Überbuchung.
**Ergebnis 14.11. (H1):** OK\*. Wechsel von „verfügbar“ (grün) auf „knapp“ gesehen (geplante Anzahl auf 2 gesetzt),
nie rot. Der Verein hat nur zwei Teams; ein Zusatzanfragen-Weg über die Oberfläche fehlt.

### A3 - Wettkampf ohne Angebot: nur „eigenes Boot mitbringen“

**Vorbedingung:** Meldeformular, Wettkampf M3 (Bedarf „Gig-Vierer“ ohne Angebot).
**Schritte:** Team in M3 öffnen.
**Erwartung:** Nur der Hinweis „eigenes Boot mitbringen“, keine Schalter, keine Ampel. Ein Wettkampf ganz ohne Bedarf
zeigt gar keinen Abschnitt.
**Ergebnis 14.11. (H1):** nicht testbar (der Seed hatte keinen solchen Wettkampf mit Plätzen). Der Seed enthält M3
seit F1; per API belegt (erscheint im `registrationTemplate` des Vereins), **im Browser offen**.

### A4 - Erneutes Speichern behält bestehende Anfragen

**Vorbedingung:** M2: #1 bestätigt, #2 angefragt (DM-Verein 1).
**Schritte:** Meldung öffnen, nichts am Material ändern, auf der Prüfseite „Prüfen & absenden“ absenden.
**Erwartung:** Die Prüfseite listet je Team „C2x: mieten bei Bootshaus Nord“ mit „Bestätigt/Angefragt“ und
„Skull-Paar: Eigenes Material“. Nach dem Absenden bleiben Anfrage-IDs, Status und `decided_at` unverändert, keine
neue Zeile.
**Ergebnis 14.11. (H1):** OK. Per SQL vor und nach dem Absenden verglichen: gleiche IDs, Status unverändert.

### A5 - Vergabe geschlossen

**Vorbedingung:** Als Anbieter 1: Einstellungen, Schalter „Vergabe geschlossen“ an.
**Schritte:** Formular öffnen; bei einem Team ohne Anfrage und einem Team mit Anfrage nachsehen.
**Erwartung:** Teams ohne Anfrage: „Die Vergabe für dieses Angebot ist geschlossen.“, Schalter gesperrt. Team mit
Anfrage: Hinweis, dass sich die Anfrage nicht mehr ändern oder zurückziehen lässt. Ein direkter `PUT
…/materialRequests` mit neuer Anfrage ergibt 409 `MATERIAL_REQUESTS_CLOSED`. Schalter danach wieder öffnen.
**Ergebnis 14.11. (H1):** OK\*. Texte und 409 gesehen, Datenbank unverändert. **Nach Korrektur erneut zu prüfen:**
F1/F2 haben das Entfernen von Buchungen bei geschlossener Vergabe neu geregelt (A10).

### A6 - Rückzug einer bestätigten Anfrage löst eine E-Mail an den Anbieter aus

**Vorbedingung:** M2 #1 (C2x bestätigt), Kontaktadresse `kontakt@bootshaus-nord.de`. Mail-Ansicht
`/api/dev/emails` (nur `MODE=DEV`).
**Schritte:** Schalter bei Team 1 aus, Prüfseite („… wird zurückgezogen“), absenden.
**Erwartung:** Anfrage `WITHDRAWN`. Mail „Ready2Race - Materialanfrage zurückgezogen“ an den Anbieter in der Sprache
des Kontos mit dieser Adresse (sonst Deutsch); die Zeile `##competitions##` lautet „Kennung Name · Verein
Meldungsname · Menge × Art“, z. B. „M2 Frauen-Doppelzweier Anmeldetest · DM-Verein 1 #1 · 1 × C2x“. Die Grundzuteilung
verschwindet aus der Einteilung. Eine Anfrage bei Ruderwerft Süd (Sprache en) liefert die englische Fassung.
**Ergebnis 14.11. (H1, vor F1):** OK\*. Anfrage `WITHDRAWN`; Mail deutsch gesehen, **mit dem alten Text** (nannte weder
Anbieter noch Anzahl). **Nach Korrektur erneut zu prüfen:** neuer Text de/en/da und Sprachwahl; die englische Mail ist
nie ausgelöst worden (kein Rückzug bei Anbieter 2 möglich). Im Admin überschriebene Vorlagen behalten den alten Text.

### A7 - Dieselbe Art doppelt anfragen (API)

**Vorbedingung:** Eine Meldung ohne Anfrage auf C2x.
**Schritte:** `PUT …/materialRequests` mit zweimal derselben Angebots-ID senden (die Oberfläche bietet einen Schalter je
Art, das ist nicht herstellbar).
**Erwartung:** Genau eine Anfrage entsteht bzw. besteht (idempotent: 204, eine Zeile, eine zurückgezogene wird wieder
`REQUESTED`), kein Datenfehler.
**Ergebnis 14.11. (H1):** OK\*. 204, eine Zeile. Der alte Katalog erwartete eine Ablehnung; tatsächlich wird
dedupliziert.

### A8 (neu) - Ablehnung als Chip mit Notiz im Formular

**Vorbedingung:** Anbieter 1 lehnt die angefragte C2x-Anfrage von DM-Verein 1 #2 ab (B3, Notiz „Kein Boot mehr frei“).
**Schritte:** Als Vereinsvertretung Meldung öffnen, Team #2.
**Erwartung:** Chip „Abgelehnt von Bootshaus Nord“ mit der Notiz; der Schalter bleibt aus; erneutes Einschalten
zeigt „wird neu angefragt“.
**Ergebnis 14.11.:** (wird nachgetragen). Bisher nur durch Tests belegt (der Seed hat kein DECLINED beim Verein 1).

### A9 (neu) - Team mit Buchung entfernen, Vergabe offen

**Vorbedingung:** M2 #1 mit bestätigter C2x-Anfrage, Vergabe offen.
**Schritte:** Im Meldeformular Team 1 entfernen, Prüfseite ansehen, absenden.
**Erwartung:** Die Prüfseite nennt „… · Team 1 · C2x: Die Buchung bei Bootshaus Nord wird zurückgezogen, der Anbieter
wird benachrichtigt.“ Nach dem Absenden ist die Meldung weg, die Anfrage ist weg bzw. zurückgezogen, die Rückzugs-Mail
ist eingereiht. Dasselbe gilt, wenn der Wettkampf abgewählt wird.
**Ergebnis 14.11.:** (wird nachgetragen). Vorbefund (Entwickler, 390 px): Prüfseite zeigt den Hinweis; **nicht
abgesendet**.

### A10 (neu) - Team mit Buchung entfernen, Vergabe geschlossen

**Vorbedingung:** Wie A9, aber Anbieter 1 hat „Vergabe geschlossen“ gesetzt.
**Schritte:** Team 1 entfernen, Prüfseite ansehen, absenden.
**Erwartung:** Schon die Prüfseite meldet den Fehler vorab; das Absenden ergibt 409 `MATERIAL_REMOVAL_REQUESTS_CLOSED`
und nennt die betroffene Meldung in der Fehlerliste. Es wird nichts gespeichert, die Meldung und die Buchung bleiben.
**Ergebnis 14.11.:** (wird nachgetragen). Bisher nur durch Backend-Tests belegt, nicht über das Formular.

### A11 (neu) - Festgeschriebenes Team

**Vorbedingung:** M1 (Meldungen mit Läufen) im Formular, das Team ist „verbindlich“.
**Schritte:** Team öffnen.
**Erwartung:** Materialart, Anbieter („C4x+ (1 Stück) · Anbieter: Bootshaus Nord, Ruderwerft Süd“) und eine Erklärung,
warum nichts zu ändern ist, statt einer leeren Auswahlbox.
**Ergebnis 14.11.:** (wird nachgetragen). Vorbefund (Entwickler, 390 px): Text so gesehen.

### A12 (neu) - Meldeformular von nicht freigegebener Adresse

**Vorbedingung:** Frontend unter `anbieter1.localhost:5179` o. ä. (nicht `localhost`/`127.0.0.1`).
**Schritte:** Eine Meldung absenden.
**Erwartung:** 422 mit dem Text „Adresse nicht freigegeben (…)“ und der aufgerufenen Adresse, nicht „unerwarteter
Fehler“ (`CALLBACK_URL_NOT_ALLOWED`).
**Ergebnis 14.11.:** (wird nachgetragen). Backend per curl belegt (422 mit Code), die Oberfläche nie ausgelöst.

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
**Ergebnis 14.11. (H1):** OK. „Anfragen (3)“ → „(2)“, „Zuteilung (2)“ → „(3)“, Auslastung C2x „2 von 5 bestätigt · 0
offen“ (damals geplant 5).

### B2 - Warteliste mit Notiz

**Vorbedingung:** Eine offene Anfrage.
**Schritte:** ⋮ → „Auf Warteliste setzen“, Notiz eintragen, speichern.
**Erwartung:** Status „Warteliste“ mit Chip „rückt als Nächste nach“ an der ältesten; die Notiz steht unter dem
Vereinsnamen; Warteliste zählt unter „Offen“. **Neu:** Der Dialog sagt, dass vorhandene Zuteilungen der Anfrage gelöscht
werden (B12).
**Ergebnis 14.11. (H1, vor F1/F2):** OK\*. Notiz und Chip gesehen, DB `WAITLISTED`. **Nach Korrektur erneut zu prüfen**
(Zuteilungen werden gelöscht, neuer Dialogtext).

### B3 - Ablehnen mit Notiz

**Vorbedingung:** Eine offene Anfrage.
**Schritte:** ⋮ → „Ablehnen“, Notiz „Kein Boot mehr frei“.
**Erwartung:** Dialog „Die Anfrage wird abgelehnt. Die Notiz sieht der Verein bei seiner Meldung.“; Status
„abgelehnt“, zählt nicht mehr in der Auslastung, Filter „Abgelehnt“ zeigt die Notiz.
**Ergebnis 14.11. (H1):** OK. Dass der Verein die Notiz in der Meldung sieht, wurde **nicht** geprüft (A8); nach
Korrektur (Zuteilungen werden gelöscht) erneut.

### B4 - Sammelbestätigung

**Vorbedingung:** Mindestens zwei offene Anfragen (der Verein legt im Formular zusätzliche an).
**Schritte:** Über der Liste „N Anfragen bestätigen“ (alle Zeilen vorangekreuzt), ggf. abwählen, bestätigen.
**Erwartung:** „N Anfragen bestätigt“, Zeilen wechseln auf bestätigt. Schlägt eine fachlich fehl, nennt die Meldung die
Zahl der gescheiterten.
**Ergebnis 14.11. (H1):** OK\*. „3 Anfragen bestätigt“ ohne Rückfrage. Der Fehlerfall „N konnten nicht bestätigt
werden“ ließ sich nicht herstellen. **Nach Korrektur erneut zu prüfen** (Rückfrage über den Plan, B11).

### B5 - Wartelisten-Hervorhebung, wenn eine Bestätigung frei wird

**Vorbedingung:** C2x geplant 2, bestätigt 2 (DM-Verein 1 #1 und DM-Verein 2), DM-Verein 3 auf der Warteliste.
**Schritte:** A6 ausführen (Verein 1 zieht #1 zurück), Reiter „Anfragen“ neu laden.
**Erwartung:** Die älteste Wartelisten-Anfrage (DM-Verein 3) ist hervorgehoben; nichts wird automatisch bestätigt.
**Ergebnis 14.11. (H1):** teilweise nicht testbar. Gesehen: Chip „rückt als Nächste nach“, keine automatische
Bestätigung. Das Freiwerden-Szenario selbst nicht durchgespielt (damals fehlte die Wartelisten-Anfrage eines zweiten
Vereins sichtbar im Dashboard). Seed seitdem geändert; **erneut**.

### B6 - „Nach Meldungsnummer zuteilen“

**Vorbedingung:** Reiter „Zuteilung“, Ansicht „Nach Team“, bestätigte BOAT-Anfragen mit Meldungsnummer (nach der
Fixierung, C2).
**Schritte:** ⋮ → „Nach Meldungsnummer zuteilen“.
**Erwartung:** Jede bestätigte Anfrage ohne Stück bekommt das Stück gleicher Art mit der **Meldungsnummer** als Nummer
(ein Stück je Wettkampf höchstens einmal, auch gegen bestehende Grundzuteilungen; bei doppelter Nummer gewinnt die ältere
Anfrage). „N Zuteilungen nach Meldungsnummer übernommen“ oder „Keine passenden Vorschläge gefunden“.
**Ergebnis 14.11. (H1, vor F2):** OK\*. Der Knopf hieß „Nach Startnummer zuteilen“ und paarte über die Startnummer im
ersten Lauf. Gesehen: „Keine passenden Vorschläge“ ohne Nummern; nach der Fixierung „2 Zuteilungen … übernommen“ (Boot
5, Boot 4, per DB geprüft). **Nach Korrektur erneut zu prüfen** (umbenannt, Paarung über die Meldungsnummer), auch mit zwei
Vorläufen und doppelten Nummern.

### B7 - Ausnahme je Lauf

**Vorbedingung:** M1 MT 1 (bestätigt, Grundzuteilung Boot 7), Läufe Vorlauf 1/2, Finale.
**Schritte:** ⋮ → „Ausnahme je Lauf“, Lauf „Finale“ wählen, Boot 8 eintragen, „Hinzufügen“.
**Erwartung:** Der Dialog nennt je Lauf „Startnr. n“ (ohne Dopplung wie „Finale · Finale“), Stücke mit dieser Nummer
stehen zuerst und sind als „trägt die Startnummer“ markiert, nur Stücke der passenden Art. Die Ausnahme gilt nur für diesen
Lauf; Boot 7 bleibt für die anderen. „Nach Materialstück“ zeigt Boot 8 für das Finale.
**Ergebnis 14.11. (H1, vor F2):** OK. Dialog, DB und Sicht gesehen; Dopplungen „Vorlauf · Vorlauf 1“ fielen auf (seit
F2 behoben). **Nach Korrektur erneut zu prüfen.** Vorbefund (Entwickler): „Vorlauf 2 · Startnr. 1“, „Finale · Startnr. 3“.

### B8 - Falsche Art wird abgewiesen

**Vorbedingung:** M1.
**Schritte:** Die Oberfläche bietet nur Stücke der passenden Art an; per API ein Skull-Paar einer C4x+-Anfrage
zuteilen.
**Erwartung:** 409 („Material item does not match the offer's type“, ohne Fehlercode), Zuteilungen unverändert.
**Ergebnis 14.11. (H1):** OK.

### B9 - Ausfall rot

**Vorbedingung:** Boot 6 (Totalschaden, offenes Fenster) ist MT 3 zugeteilt.
**Schritte:** „Nach Team“ und „Nach Materialstück“ ansehen.
**Erwartung:** Rotes „Ausfall“ mit Chip „Startnummer abweichend“ bzw. „weicht in n Läufen ab“ und „1 Ausnahme“ am Team, roter Chip am Finale-Eintrag
des Stücks, „… 1 mit Konflikt“ im Kopf. Die Zuteilung ist nicht blockiert.
**Ergebnis 14.11. (H1, vor F2):** OK. Chip hieß „weicht von Startnummer ab“. **Nach Korrektur erneut zu prüfen**
(„Startnummer weicht in n Läufen ab“).

### B10 - Hinweis vor der Fixierung

**Vorbedingung:** Offene Anfragen (REQUESTED) bei eingeladenen Anbietern (seed: je eine bei Bootshaus Nord und
Ruderwerft Süd).
**Schritte:** Als Admin Veranstaltung → **Meldungen** (nicht „Durchführung“).
**Erwartung:** „N Materialanfragen sind noch nicht entschieden. Erst entscheiden, dann fixieren, sonst greift die
Nummerngleichheit nur zufällig.“ Der Zähler ist so hoch wie die Summe der „Offen“-Anfragen der Dashboards (nur
Anfragen mit existierender Meldung).
**Ergebnis 14.11. (H1, vor F1):** OK. Der Zähler enthielt damals eine hängende Seed-Anfrage (H1-F1: „3“ gegen „2“).
Seit F1 und neuem Seed zählt er nur existierende Meldungen (Seed: 1 und 1). **Nach Korrektur erneut zu prüfen.**

### B11 (neu) - Sammelbestätigung über den Plan

**Vorbedingung:** C2x geplant 2, bestätigt 2, dazu mehrere offene C2x-Anfragen.
**Schritte:** „N Anfragen bestätigen“ wählen.
**Erwartung:** Eine Rückfrage nennt, um wie viele Stücke der Plan überschritten wird (`capacityOverruns`); erst nach
Bestätigung wird entschieden.
**Ergebnis 14.11.:** (wird nachgetragen). Bisher nur durch Logik-Tests belegt (nie zwei angefragte Zeilen gleichzeitig).

### B12 (neu) - Warteliste und Ablehnung löschen die Zuteilungen

**Vorbedingung:** Bestätigte Anfrage mit Grundzuteilung (M1 MT 1, Boot 7).
**Schritte:** ⋮ → „Auf Warteliste setzen“, Dialog lesen, bestätigen; danach erneut bestätigen.
**Erwartung:** Der Dialog nennt „1 Zuteilung … wird gelöscht“. Nach der Warteliste ist die Zuteilung weg, eine spätere
Bestätigung beginnt ohne Stück (nichts kehrt still zurück). Die Anzeigen zeigen kein Boot mehr (Sicht und Marker).
**Ergebnis 14.11.:** (wird nachgetragen). Vorbefund (Entwickler, 390 px): Dialogtext gesehen, abgebrochen.

### B13 (neu) - Art eines Angebots mit Anfragen ist fest

**Vorbedingung:** Angebot C2x mit Anfragen, Reiter „Einstellungen“.
**Schritte:** Angebot bearbeiten, Materialart wechseln; danach nur Preis/Menge/Wechselzeit ändern.
**Erwartung:** Der Artwechsel ergibt 409 `MATERIAL_OFFER_TYPE_LOCKED` mit verständlichem Text; Preis, geplante Anzahl und
Wechselzeit bleiben änderbar. Nach einer Angebotsänderung lädt das Dashboard Tabelle und Übersicht neu.
**Ergebnis 14.11.:** (wird nachgetragen). Bisher nur Tests.

### B14 (neu) - Kein Doppel-Zuteilen bei langsamem Netz

**Vorbedingung:** Anfrage mit Menge 2; Netz im Browser auf „langsam“ gedrosselt.
**Schritte:** Stück A wählen, noch vor dem Nachladen Stück B wählen.
**Erwartung:** Die Bedienelemente bleiben gesperrt, bis die neue Übersicht da ist; A geht nicht verloren (beide Stücke
zugeteilt). Dasselbe bei Ausnahme- und Ausfall-Dialog.
**Ergebnis 14.11.:** (wird nachgetragen). Bisher nur Logik-Tests (`reloadGate`).

### B15 (neu) - Telefon (390 px)

**Vorbedingung:** Viewport 390 px, Anbieter 1.
**Schritte:** Alle vier Reiter, Flotte, Seitenleiste.
**Erwartung:** Kein horizontales Scrollen, Reiterleiste ohne abgeschnittene Beschriftung („Einstellungen“ ganz),
Primäraktion ein Klick.
**Ergebnis 14.11. (H1):** Vor F2 kappte der Reiterkopf „Einstellungen“ („E“ mit Pfeil). **Nach Korrektur erneut zu
prüfen.** Vorbefund (Entwickler): 358/358, `scrollWidth` 390.

---

## Block C: Fixierung (Veranstaltung → Meldungen)

### C1 - Schalter nur mit eingeladenem Anbieter

**Vorbedingung:** DM-Veranstaltung mit Anbietern; zum Vergleich eine Veranstaltung ohne Anbieter.
**Schritte:** Meldeseite öffnen (vor der ersten Fixierung direkt auf der Seite, danach im Dialog „Meldungen
refinalisieren“).
**Erwartung:** Schalter „Meldungsnummern nach Bootsnummern vergeben“ mit Erklärsatz Meldungs- ↔ Startnummer (nur mit
Anbieter); bei einer Veranstaltung ganz ohne Anbieter fehlt er.
**Ergebnis 14.11. (H1, vor F2):** OK\*. Schalter hieß „Startnummern nach Bootsnummern vergeben“; fehlte bei der
Veranstaltung ohne Anbieter. **Nach Korrektur erneut zu prüfen** (Text, Erklärsatz).

### C2 - Nummerngleichheit für bestätigte Bootsanfragen

**Vorbedingung:** Anfragen entschieden (B10), Bestände aktiv.
**Schritte:** Schalter an, „Meldungen finalisieren“.
**Erwartung:** Bestätigte BOAT-Teams bekommen Meldungsnummern aus dem Bestand ihrer Art, Teams mit eigenem Boot die
freien Nummern ab 1, die keine Bootsnummer sind.
**Ergebnis 14.11. (H1, vor F1):** OK\*. M1 {Boot-7-Team → 8, Vierer-2-Team → 2, Boot-6-Team → 7, eigenes Boot → 1}, M2
{5 und 4}; zweiter Lauf andere Zuordnung. Wichtig: Die Fixierung kannte damals vorhandene Grundzuteilungen **nicht** (Team
mit Boot 7 bekam 8, H1-F3). **Nach Korrektur erneut zu prüfen** (C5).

### C3 - Überzählige Mietteams

**Vorbedingung:** Mehr bestätigte Anfragen einer Art als aktive Stücke (Boote 4 und 5 ausmustern, beide C2x-Anfragen
bestätigen).
**Schritte:** Fixierung mit Schalter.
**Erwartung:** Ein Team bekommt 3, das zweite eine Nummer oberhalb des aktiven Bestands; Dashboard zeigt „ohne
Nummerngleichheit“ am Team und den Satz „N Teams ohne Nummerngleichheit …“.
**Ergebnis 14.11. (H1, vor F2):** OK\*. Nummern 3 und 4 vergeben; ein Hinweis „ohne Nummerngleichheit“ **fehlte** (H1-F2).
Seit F2 gebaut; **erneut zu prüfen**. Vorbefund (Entwickler, 390 px): Chip und Satz in der Einteilung gesehen.

### C4 - „Nummern behalten“

**Vorbedingung:** Meldungen schon einmal fixiert, einige Teams ohne Nummer.
**Schritte:** Dialog „Meldungen refinalisieren“, „Gesetzte Startnummern beibehalten“ plus Schalter.
**Erwartung:** Nur Teams ohne Nummer bekommen eine (ggf. Bootsnummer); vorhandene bleiben. Der Dialog erklärt, warum die
Beibehalten-Option fehlt, wenn alle Teams Nummern haben („würfelt alle neu aus“).
**Ergebnis 14.11. (H1, vor F2):** OK\* (teilweise). M1-Nummern blieben, M2-Teams bekamen 4 und 3. Ein echtes Nachmelder-Team
wurde nicht angelegt, „höher als die höchste“ nicht gemessen. **Nach Korrektur erneut zu prüfen** (Erklärtexte).

### C5 (neu) - Fixierung mit vorhandener Grundzuteilung

**Vorbedingung:** M1 mit Grundzuteilungen (MT 1 Boot 7, MT 2 Vierer 2, MT 3 Boot 6), Meldungen noch nicht fixiert oder
„neu mischen“.
**Schritte:** Schalter an, fixieren.
**Erwartung:** Meldungen mit bestätigter Grundzuteilung (BOAT, ohne Lauf, Stück mit Nummer) bekommen **genau diese Nummer**
(MT 1 → 7, MT 2 → 2, MT 3 → 6), das eigene Boot eine freie Nummer ohne Bootsnummer. Zwei Meldungen auf demselben Boot:
eine behält sie.
**Ergebnis 14.11.:** (wird nachgetragen). Bisher nur Backend-Tests.

### C6 (neu) - Rückmeldung nach dem Fixieren und Meldungsnr.-Chip

**Vorbedingung:** Nach C2 oder C5; Wettkampf M1 (Nummern 1–4) und M2.
**Schritte:** Fixieren, Rückmeldung lesen, Wettkampf → Reiter „Meldungen“.
**Erwartung:** Die Rückmeldung nennt, wo die Nummern stehen (zuerst Reiter „Meldungen“, dann das Meldeergebnis). In der
Namensspalte steht ein umrandeter Chip „Meldungsnr. n“ (Tooltip Meldungs- vs. Startnummer), nur bei gesetzter Nummer, auf
der mobilen Karte unter dem Namen. Die Liste „Teams“ zeigt ihn **nicht**.
**Ergebnis 14.11.:** (wird nachgetragen). Vorbefund (Entwickler): vier Chips „Meldungsnr. 1–4“ bei M1 (1280 und 390 px,
`scrollWidth` passt), M2 ohne Chips. Rückmeldung nach dem Fixieren, Tooltip-Text und en/da **nicht** gesehen.

---

## Block D: Schäden und Flotte

Schäden und Fotos bumpen den Änderungsmarker nicht (ADR-0109); ein Ersatz wirkt erst über die Ausnahme je Lauf.

### D1 - Schaden melden mit Pflichtfeldern

**Vorbedingung:** Anbieter 1, Reiter „Schäden“ oder Flotte, Boot 3 (C2x, ohne Schaden).
**Schritte:** „Schaden melden“, Stück Boot 3, Beschreibung, Schwere „leicht“, speichern.
**Erwartung:** Eintrag „gemeldet“, Melder und Zeitpunkt automatisch, kein Ausfallfenster (Vorschlag nur bei
„Totalschaden“ mit „Ausfall ab“). Der Verursacher wird aus der Zuteilung vorgeschlagen.
**Ergebnis 14.11.:** (wird nachgetragen). Vorbefund (Entwickler): Totalschaden setzt „Ausfall ab“, Verursacher
automatisch vorgeschlagen.

### D2 - Foto zum Schaden

**Vorbedingung:** Ein Schaden (Boot 6 oder D1).
**Schritte:** Ein Foto (JPEG/PNG, unter 10 MB) hinzufügen.
**Erwartung:** Foto erscheint; die Auslieferung bekommt einen passenden Typ (Endung aus den Bytes).
**Ergebnis 14.11.:** (wird nachgetragen).

### D3 - Totalschaden öffnet den Ersatzdialog

**Vorbedingung:** Ein zugeteiltes Boot (z. B. Boot 7, MT 1).
**Schritte:** Schaden „Totalschaden“ mit Ausfall ab jetzt speichern.
**Erwartung:** Dialog „Betroffene Läufe“ mit je einem Eintrag (Lauftitel ohne Dopplung, „Startnr. n“) und Ersatzwahl
(freie Stücke im Fenster, richtige Art, „Nummer passt“ markiert).
**Ergebnis 14.11.:** (wird nachgetragen). Vorbefund (Entwickler): Dialog mit zwei betroffenen Läufen gesehen, Ersatz „Boot 8“
für das Finale übernommen.

### D4 - Ersatzwahl legt eine Ausnahme an

**Vorbedingung:** D3, Ersatz gewählt, „Übernehmen“.
**Schritte:** „Zuteilung“ → „Nach Team“.
**Erwartung:** Grundzuteilung unverändert sichtbar, für den Lauf gilt die neue Ausnahme; bei Menge 2 wird nur das
ausgefallene Stück ersetzt, das zweite bleibt.
**Ergebnis 14.11.:** (wird nachgetragen).

### D5 - Reparatur: „Grundzuteilung wieder möglich“

**Vorbedingung:** Schaden an Boot 6 offen (Seed), Ausnahme für den Vorlauf 2.
**Schritte:** Schaden auf „repariert“ mit Reparaturzeitpunkt setzen.
**Erwartung:** Das Fenster endet am Reparaturzeitpunkt; bestehende Ausnahmen bleiben; die Einteilung zeigt „Grundzuteilung
wieder möglich“ mit „Ausnahme entfernen“. **Ein reparierter Schaden öffnet keinen Ersatzdialog.**
**Ergebnis 14.11.:** (wird nachgetragen).

### D6 - Schaden an ausgemustertem Stück

**Vorbedingung:** Skull-Paar 4 in der Flotte auf „Ausgemustert“.
**Schritte:** Schaden melden.
**Erwartung:** Wird angenommen und erscheint wie jeder Schaden.
**Ergebnis 14.11.:** (wird nachgetragen).

### D7 - CSV-Export der Schadensakte

**Vorbedingung:** Mindestens der Seed-Schaden.
**Schritte:** Reiter „Schäden“, ⋮ → „CSV-Export“.
**Erwartung:** Datei lädt herunter (`text/csv`, Name aus `Content-Disposition`) mit Boot 6, „Totalschaden“, „gemeldet“.
**Ergebnis 14.11.:** (wird nachgetragen). Vorbefund: Endpunkt per fetch 200 `text/csv`, Datei nicht heruntergeladen.

### D8 (neu) - Stück mit Schadensakte löschen

**Vorbedingung:** Boot 6 (Schadensakte), keine Zuteilung nötig (Ausnahme/Grundzuteilung vorher lösen) bzw. ein Stück ohne.
**Schritte:** In der Flotte „Löschen“.
**Erwartung:** 409 `MATERIAL_ITEM_HAS_DAMAGES` mit dem Hinweis, das Stück auszumustern; ein zugeteiltes Stück ergibt den
Zuteilungs-Text; ein Stück ohne beides lässt sich löschen.
**Ergebnis 14.11.:** (wird nachgetragen).

### D9 (neu) - Ausgemustertes Stück

**Vorbedingung:** Ein Stück auf „Ausgemustert“.
**Schritte:** Es einer Anfrage neu zuteilen (die Oberfläche bietet es nicht an; per API prüfen).
**Erwartung:** 409 `MATERIAL_ITEM_RETIRED`; eine bereits bestehende Zuteilung darf stehen bleiben; die Art eines
zugeteilten Stücks ist fest (409 `MATERIAL_ITEM_TYPE_LOCKED`).
**Ergebnis 14.11.:** (wird nachgetragen).

### D10 (neu) - Foto ist kein Bild

**Vorbedingung:** Schaden vorhanden.
**Schritte:** Eine Textdatei und eine SVG-Datei als Foto wählen.
**Erwartung:** Die Oberfläche sortiert sie mit Name und Grund aus („kein Bild“); per API 415
`MATERIAL_PHOTO_INVALID_TYPE` mit Text; die Meldung des Schadens bleibt erhalten.
**Ergebnis 14.11.:** (wird nachgetragen). Bisher nur Tests, nie ausgelöst.

### D11 (neu) - Foto zu groß, zu viele Fotos

**Vorbedingung:** Schaden vorhanden.
**Schritte:** Eine Datei über 10 MB, mehrere Dateien über 50 MB zusammen, mehr als 20 Dateien wählen.
**Erwartung:** Aussortiert mit Name und Grund („> 10 MB“, „> 50 MB zusammen“, „> 20“); per API 400
`MATERIAL_PHOTO_TOO_LARGE` (auch für die Summe); die Meldung bleibt.
**Ergebnis 14.11.:** (wird nachgetragen). Bisher nur Tests.

### D12 (neu) - 15 Handyfotos

**Vorbedingung:** Schaden, 15 Fotos von 12 MP am Telefon.
**Schritte:** Alle auswählen und hochladen.
**Erwartung:** Fortschritt „n von m“, die Fotos werden nacheinander verkleinert, der Tab bleibt stabil.
**Ergebnis 14.11.:** (wird nachgetragen). Bisher nur Logik-Tests.

### D13 (neu) - Ersatzwahl nur bei gemeldetem Ausfall

**Vorbedingung:** Ein Schaden mit „Ausfall ab“, zugeteilt.
**Schritte:** Schaden auf „repariert“ setzen und speichern.
**Erwartung:** Kein Ersatzdialog (er öffnet nur bei Status REPORTED).
**Ergebnis 14.11.:** (wird nachgetragen).

---

## Block E: Anzeigen

Die Anzeigen zeigen die **Startnummer im Lauf** neben dem Boot; „abweichend“ gilt gegen sie. Mit und ohne den Schalter
„Material immer zeigen“ prüfen (Standard aus). Anzeigen aktualisieren sich nach Neuladen; Pushes im verdeckten Tab kommen
nicht an. Kategorie `OTHER` erscheint auf keiner Anzeige.

### E1 - Mein Event

**Vorbedingung:** `/results/MATERIAL-MEINEVENT-1` (merkt den Code, springt auf `?tab=my-event`).
**Schritte:** Seite öffnen.
**Erwartung:** Materialblock für MT 1: „Boot 7“, Status, Anbieter; beim Lauf mit #1 Chip „weicht ab“ (Boot 7 ≠ Startnummer
1). Status für angefragte/Warteliste-Anfragen sichtbar.
**Ergebnis 14.11.:** (wird nachgetragen). API belegt (`info/my-event/MATERIAL-MEINEVENT-1` liefert „Boot 7“), im Browser
**nie** gesehen.

### E2 - Sprecher-Dashboard

**Vorbedingung:** `/speaker` → DM-Veranstaltung, Lauf M1 sichtbar.
**Schritte:** Ohne Schalter ansehen, dann „Boot-Material zeigen“.
**Erwartung:** Ohne Schalter zeigen nur Abweichungen das Boot („#1 · Boot 7“), eigene Boote nichts; mit Schalter zusätzlich
„eigenes Boot“.
**Ergebnis 14.11.:** (wird nachgetragen). Nur dieselben `info`-Endpunkte per API belegt.

### E3 - Schiedsrichter-Dashboard

**Vorbedingung:** `/event/<eventId>/liveDashboard`, M1.
**Schritte:** Einstellungs-Popover, „Material immer zeigen“ umschalten.
**Erwartung:** Wie E2 im Karten-Layout.
**Ergebnis 14.11.:** (wird nachgetragen). API: `liveDashboard` liefert sechs Materialobjekte; im Browser nie gesehen.

### E4 - Board

**Vorbedingung:** Board `5eed0009-0040-…0001` (`/board/<eventId>/<boardId>`), Kachel mit Material.
**Schritte:** Ansehen, Eigenschaft „Boot-Material zeigen“ je Kachel umschalten.
**Erwartung:** Wie E2, je Kachel konfigurierbar.
**Ergebnis 14.11.:** (wird nachgetragen). API: sechs Materialobjekte; im Browser nie gesehen.

### E5 - Startliste (PDF)

**Vorbedingung:** Durchführung → M1 → Vorlauf 2 → Startliste.
**Schritte:** PDF ohne und mit „Material immer zeigen“ (`showMaterial`).
**Erwartung:** Spalte „Boot“ nur bei Abweichung bzw. mit Schalter; Vorlauf 2 nennt „Boot 8“. CSV ohne Preset ergibt 400
`STARTLIST_CONFIG_NOT_CONFIGURED` (kein Fehler des Materials).
**Ergebnis 14.11.:** (wird nachgetragen). API: PDF 200 mit „Boot 8“; Datei nie angesehen.

### E6 - Livestream-Szene und Regie

**Vorbedingung:** Szene `5eed0009-0041-…0001`; Regie `/event/<eventId>/streamPanel`. In AUTO sind Grafiken unsichtbar,
solange kein Lauf „in Vorbereitung“ ist; Startliste im Regie-Panel erzwingen.
**Schritte:** Startliste erzwingen, „Material immer zeigen“ umschalten.
**Erwartung:** Boot-Angabe mit der Kürzungsleiter (fällt bei knappem Platz zuerst weg); mit erzwungener Startliste
Vorlauf 2: „Boot 8“, abweichend.
**Ergebnis 14.11.:** (wird nachgetragen). API belegt (ein Material „Boot 8“), Grafik nie gesehen; **Wirecast/OBS-Handtest
offen**.

### E7 (neu) - Lauf-Karte der Durchführung

**Vorbedingung:** Wettkampf M1 → Durchführung (`?tab=execution`).
**Schritte:** Läufe ansehen, bei 375, 768 und 1280 px.
**Erwartung:** Unter dem Verein „Boot 7/8/6“ mit Chip „abweichend“ (4 Chips), „Vierer 2“ ohne Chip, eigene Boote ohne
Zeile; die Freilos-Tabelle zeigt es ebenso.
**Ergebnis 14.11.:** (wird nachgetragen). Vorbefund (Entwickler, 375 px): sechs Materialzeilen, vier Chips, `scrollWidth`
375. 768/1280 px und Freilos-Tabelle (kein Freilos im Seed) **offen**.

### E8 (neu) - Live-Aktualisierung der Anzeigen

**Vorbedingung:** E4 (Board) und E3 offen, Tabs sichtbar, Anbieter 1 im zweiten Fenster.
**Schritte:** Eine Ausnahme je Lauf setzen, eine Anfrage bestätigen bzw. zurücknehmen.
**Erwartung:** Beide Anzeigen zeigen das neue Boot kurz danach ohne Neuladen (Änderungsmarker, Push plus Polling-Netz);
ein Schaden allein ändert nichts.
**Ergebnis 14.11.:** (wird nachgetragen). Nie im Browser gesehen.

### E9 (neu) - Board-Detail mit langem Bootsnamen

**Vorbedingung:** Board mit Lauf-Detail-Kachel (das Seed-Board hat keine); Stück mit sehr langer Bezeichnung.
**Schritte:** Board ansehen.
**Erwartung:** Das Boot steht als umbrechende Zeile unter dem Teamnamen, Abweichung in lesbarer Warnfarbe mit „abweichend“;
die Namensspalte wird nicht geschoben.
**Ergebnis 14.11.:** (wird nachgetragen). Nie gesehen.

---

## Block F: Rechte

### F1 - Anbieter sieht nur das Eigene

**Vorbedingung:** Anbieter 2 hat eine eigene Anfrage (MT 4).
**Schritte:** Als Anbieter 1 `/material/admin` aufrufen und `?provider=<Anbieter 2>` versuchen; per API die Übersicht von
Anbieter 2 holen.
**Erwartung:** `/material/admin` nicht erreichbar; das eigene Konto hat Vorrang vor `?provider=`; fremde Übersicht 403;
Anbieter 1 sieht die Anfrage von Anbieter 2 nie und von Meldungen nur Team, Verein, Wettkampf, Startnummer, Kontaktperson.
**Ergebnis 14.11.:** (wird nachgetragen). API: fremde Übersicht 403 belegt.

### F2 - Veranstalter ohne READ MATERIAL GLOBAL kann nicht einladen

**Vorbedingung:** Konto mit READ EVENT GLOBAL und UPDATE EVENT GLOBAL, ohne READ MATERIAL GLOBAL (eigene Rolle anlegen).
**Schritte:** Veranstaltung → Einstellungen → „Materialvermietung“.
**Erwartung:** Eingeladene Anbieter sichtbar, die Auswahl zum Einladen fehlt mit dem Hinweis, dass das Recht fehlt.
**Ergebnis 14.11.:** (wird nachgetragen). Kein Testkonto vorhanden.

### F3 - Ausladen

**Vorbedingung:** Veranstalter mit UPDATE EVENT GLOBAL.
**Schritte:** Bei einem Anbieter ohne Anfragen „Ausladen“, bestätigen; danach bei einem mit Anfragen.
**Erwartung:** Ohne Anfragen funktioniert es. Mit Anfragen 409 mit eigenem Text (keine Meldung „konnte nicht gelöscht
werden“): Ausladen ist nicht möglich, stattdessen schließt der Anbieter die Vergabe.
**Ergebnis 14.11.:** (wird nachgetragen). Vorbefund: Karte bei DM und r1test gesehen, Anbieter eingeladen; Ausladen mit
Anfragen **nie** ausgelöst.

### F4 - Admin verwaltet Anbieter und Materialarten

**Vorbedingung:** Admin.
**Schritte:** `/material/admin`, Anbieter und Art anlegen, bearbeiten.
**Erwartung:** Funktioniert; ohne UPDATE MATERIAL GLOBAL ist die Seite nicht erreichbar. Löschen bei Verwendung ist
gesperrt (409 `MATERIAL_*_IN_USE`) mit verständlichem Text.
**Ergebnis 14.11.:** (wird nachgetragen).

### F5 (neu) - Anbieter mit Konten löschen

**Vorbedingung:** Anbieter 1 hat ein zugeordnetes Konto.
**Schritte:** Auf `/material/admin` den Anbieter löschen.
**Erwartung:** 409 `MATERIAL_PROVIDER_HAS_USERS`, Text „… hat noch Konten“; erst nach Lösen der Zuordnungen löschbar.
**Ergebnis 14.11.:** (wird nachgetragen). Beide Texte (`hasUsers`, `photoInvalidType`) wurden nie in der Oberfläche
ausgelöst.

### F6 (neu) - Anbieter-Zuordnung und Rolle

**Vorbedingung:** Admin, Nutzerseite eines normalen Kontos, eines Anbieterkontos und des Systemkontos.
**Schritte:** Anbieter wählen und speichern; Zuordnung lösen; bei Fehlschlag Auswahl ansehen; Rollenfeld, Rollendialog und
Einladung ansehen.
**Erwartung:** Die Auswahl erscheint nur mit UPDATE STAFF, UPDATE USER, READ MATERIAL GLOBAL, UPDATE MATERIAL OWN; sie
nennt den Hinweis zur Rolle; Systemkonto zeigt den Sperrgrund. Setzen vergibt die Rolle „Materialanbieter“, Lösen entzieht
nur sie. Systemverwaltete Rollen stehen als Text, nicht als Auswahl; „Materialanbieter“ fehlt als Kopiervorlage im
Rollendialog und in der Einladung. Nach gescheiterter Zuordnung bleibt der gewählte Anbieter stehen.
**Ergebnis 14.11.:** (wird nachgetragen). Vorbefund (Entwickler): Nutzerseite des Anbieterkontos und des Systemkontos
gesehen, Rollendialog ohne Vorlage; **Speichern der Zuordnung** nicht gesehen.

### F7 (neu) - Konto nur mit Leserecht

**Vorbedingung:** Eigene Rolle mit READ MATERIAL (OWN bzw. GLOBAL), ohne UPDATE.
**Schritte:** Dashboard als dieses Konto öffnen.
**Erwartung:** Keine Entscheidungen, Zuteilung, Schadensmeldung, Vergabe-Schalter, Angebots- und Stückaktionen; keine 403 mit
Pauschaltext.
**Ergebnis 14.11.:** (wird nachgetragen). Kein Testkonto vorhanden.

### F8 (neu) - Anbieter-Wechsel für globale Konten

**Vorbedingung:** Admin ohne eigene Zuordnung.
**Schritte:** `/material`, Dashboard und Flotte mit dem Anbieter-Wechsler im Seitenkopf.
**Erwartung:** Der gewählte Anbieter steht im Seitenkopf, der Wechsel ist dort möglich; der Seitenleisten-Link verwirft
`?provider=` nicht mehr.
**Ergebnis 14.11.:** (wird nachgetragen). Nicht angesehen.

### F9 (neu) - Meldung gibt Anfragen frei (Veranstalter-Wege)

**Vorbedingung:** M2 #1 bestätigt, Vergabe **geschlossen**.
**Schritte:** Als Admin die Meldung des Teams über die Verwaltung löschen.
**Erwartung:** Das Löschen mit GLOBAL-Recht ist erlaubt (die Sperre gilt nur für Vereinswege), löst aber die Rückzugs-Mail
aus; Anfrage und Zuteilungen sind weg; der Marker wird gebumpt.
**Ergebnis 14.11.:** (wird nachgetragen). Bisher nur Backend-Tests.

---

## Nachtest nach den Korrekturen

Der Nachtest (H3) wiederholt die Fälle mit dem Vermerk **nach Korrektur erneut zu prüfen** gegen den Endstand und trägt hier
je Fall ein:

| Fall | Ergebnis Nachtest |
|---|---|
| A5, A6, B2, B3, B4, B5, B6, B7, B9, B10, C1 bis C5 | Ergebnis 14.11.: (wird nachgetragen) |

## Nicht belegt und offen (Stand der Berichte H1)

- Die offene fachliche Entscheidung zu Startnummer und Meldungsnummer (ADR-0111): Solange die Rundenanlage die Startnummer im
  Lauf nach Setzliste vergibt, zeigen die Anzeigen auch nach der Fixierung „abweichend“; ob die Rundenanlage die
  Meldungsnummer übernehmen soll, ist **nicht entschieden und nicht gebaut**. H1 hat das gemessen (Verein 1: Meldungsnummer 8,
  Startnummer 1, Grundzuteilung Boot 7).
- en/da-Texte (nie gegengelesen), Breite 768 px, Netzfehlerpfade, Formular-Login der Seed-Konten.
- Wirecast/OBS-Handtest der Stream-Grafik; TypeSpec ist nicht kompiliert.
- Messung der Sicht und der Abfragen gegen Produktionsdaten (nur Seed-Umfang, `EXPLAIN` lesend).
