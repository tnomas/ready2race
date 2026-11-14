# Design: Materialvermietung (Boote und Zubehör) mit Anbieter-Dashboard

**Stand:** 2026-09-07
**Branch:** `claude/boat-planning-dashboard-2b3537`
**Gilt für:** Anmeldung (Vereins-Meldung), neue Domäne `material` in Backend und API, neues
Anbieter-Dashboard im Frontend, Nummernvergabe bei der Fixierung, Anzeigen (Mein Event,
Sprecher- und Live-Dashboard, Boards, Startlisten, Livestream-Grafiken)

## 1. Problem

Bei Coastal-Regatten bringen viele Teams kein eigenes Boot mit, sondern mieten eines vor Ort,
vom Veranstalter oder von einem externen Anbieter. Heute passiert das komplett außerhalb des
Systems: per E-Mail, Liste und Zuruf. Der Anbieter weiß nicht verlässlich, wer wann welches Boot
braucht, der Verein weiß nicht, ob seine Anfrage angekommen ist, und beim Ausfall eines Bootes
am Regattatag beginnt die Suche nach allen Betroffenen von vorn.

Ein „Boot“ ist im System bislang nur ein gemeldetes Team. Ein physisches Boot, eine Bootsklasse
oder ein Anbieter existieren als Datenobjekte nicht.

## 2. Zielbild

- **Mieten bei der Anmeldung.** Der Verein sagt je Team und benötigter Materialart „eigenes
  Material“ oder „mieten bei Anbieter X“ und sieht dabei, ob es knapp wird.
- **Anfrage, nicht Buchung.** Der Anbieter bestätigt, setzt auf Warteliste oder lehnt ab. Er
  rechnet selbst ab, außerhalb des Systems.
- **Ein Dashboard für den Anbieter** mit allen Anfragen, der Einteilung der Materialstücke auf
  Teams und Läufe, der Flotte und einer Schadensakte je Stück.
- **Boots- und Startnummer bleiben zusammen, wo immer es geht.** Die Nummernvergabe bei der
  Fixierung kennt den Bootsbestand, die Zuteilung folgt der Startnummer. Abweichungen sind auf
  allen Anzeigen sichtbar.
- **Ausfall ist ein bekannter Fall.** Fällt ein Stück aus, zeigt das System alle betroffenen
  Läufe und lässt je Lauf ein Ersatzstück wählen, ohne die Grundzuteilung zu verlieren.
- **Generisch als Material**, nicht nur als Boot. Boote sind die erste Kategorie; Skulls,
  Bootswagen und Ähnliches laufen mit denselben Mechanismen.

## 3. Nicht Teil dieses Vorhabens

- Abrechnung der Miete über die Veranstalter-Rechnung. Das Rechnungsmodul bleibt unberührt.
- Übergabe-Protokoll am Steg (Zustand beim Rausgeben und Zurücknehmen quittieren). Das
  Datenmodell lässt es zu, gebaut wird es nicht.
- Kosten oder Rechnungsstellung für Schäden.
- Freie Angaben zum eigenen Boot. „Eigenes Material“ ist schlicht das Fehlen einer Anfrage.
- Selbstanmeldung einzelner Sportler mit Material; Mietanfragen ohne Meldung.
- Frei definierbare Attribute je Materialart; frei wählbare Mengen in der Anfrage; Verleih
  außerhalb der Rennzeiten.
- Verfolgen, welcher Startnummern-Aufkleber physisch auf welchem Boot klebt.
- Selbstregistrierung als Anbieter mit Freigabe-Schleife.
- Bild-Verkleinerung auf dem Server.
- Automatisches Nachrücken von der Warteliste.

## 4. Begriffe

| Begriff | Bedeutung |
|---|---|
| Anbieter (`material_provider`) | Organisation, die Material verleiht. Lebt über Veranstaltungen hinweg. Ein Anbieter, der auch Verein ist, bleibt ein getrennter Datensatz. |
| Materialart (`material_type`) | Globales Stammdatum, z. B. „Coastal Vierer C4x+“, „Skull-Paar“. Trägt eine Kategorie: `BOAT` oder `OTHER`. Pflegt der Admin. |
| Materialstück (`material_item`) | Konkretes Exemplar eines Anbieters: Materialart, Nummer (ganzzahlig, optional, je Anbieter und Art eindeutig), Bezeichnung (max. 20 Zeichen), Notiz, Status `ACTIVE` oder `RETIRED`. Für Boote ist die Nummer die am Rumpf. |
| Bedarf (`competition_properties_has_material_type`) | Am Wettkampf: welche Materialarten mit welcher Menge ein Team braucht. |
| Einladung (`event_has_material_provider`) | Der Veranstalter lädt einen Anbieter zu einer Veranstaltung ein. Erst dann kann der Anbieter dort Angebote anlegen. |
| Angebot (`material_offer`) | Je Veranstaltung, Anbieter und Materialart: Preistext zur Anzeige, geplante Anzahl (für die Ampel), Wechselzeit in Minuten (Standard 30). |
| Anfrage (`material_request`) | Je Meldung (`competition_registration`) und Angebot, Menge aus dem Bedarf. Status `REQUESTED`, `CONFIRMED`, `WAITLISTED`, `DECLINED`, `WITHDRAWN`. Entscheidungsnotiz, Zeitpunkte. |
| Zuteilung (`material_assignment`) | Je Anfrage ein Materialstück, optional mit Bezug auf einen Lauf (`competition_match`) als Ausnahme. Ohne Lauf gilt sie für den ganzen Wettkampf. Bei Menge > 1 mehrere Zeilen. |
| Schaden (`material_damage`) | Je Materialstück: Zeitpunkt, Beschreibung, Schwere `MINOR`, `MAJOR`, `TOTAL`, `OUTAGE_ONLY`, Status `REPORTED`, `REPAIRED`, optional verursachende Meldung, optional Ausfallfenster `out_of_service_from` / `out_of_service_until` (`until` leer = bis auf Weiteres). |
| Foto (`material_damage_photo` + `_data`) | Bilder zum Schaden als Bytes, nach dem Muster der Veranstaltungsdokumente. |
| Wirksames Stück | Je Lauf-Team: die Ausnahme je Lauf, sonst die Grundzuteilung, sonst nichts. Als Sicht in `afterMigrate.sql`. |
| Vergabe geschlossen | Schalter je Einladung. Danach können Vereine keine Anfragen mehr anlegen oder ändern. |

## 5. Datenmodell

Neue Tabellen in einer Migration `V202611140800__material_rental.sql` (ursprünglich `V202609071000`, bei der Übernahme am 14.11.2026 umnummeriert, weil die Nummer belegt war):

- `material_provider` (id, name, contact_name, contact_email, contact_phone, note, Audit-Spalten)
- `material_type` (id, name, category text check in ('BOAT','OTHER'), description, Audit)
- `material_item` (id, material_provider, material_type, number integer null, label text
  check (char_length(label) <= 20), note, status text, Audit); unique (material_provider,
  material_type, number) where number is not null
- `competition_properties_has_material_type` (competition_properties, material_type, count
  integer > 0); primary key (competition_properties, material_type)
- `event_has_material_provider` (event, material_provider, requests_closed boolean default
  false, Audit); primary key (event, material_provider)
- `material_offer` (id, event, material_provider, material_type, price_text, planned_count
  integer >= 0, changeover_minutes integer default 30, Audit); unique (event, material_provider,
  material_type); Fremdschlüssel auf `event_has_material_provider`
- `material_request` (id, competition_registration on delete cascade, material_offer,
  count integer > 0, status text, decision_note, requested_at, decided_at, Audit); unique
  (competition_registration, material_offer)
- `material_assignment` (id, material_request on delete cascade, material_item,
  competition_match null on delete cascade, Audit); unique (material_request, material_item,
  competition_match) mit `nulls not distinct`
- `material_damage` (id, material_item, reported_at, reported_by, description, severity text,
  status text, caused_by_registration null on delete set null, out_of_service_from null,
  out_of_service_until null, repaired_at null, Audit); check (until is null or until >= from)
- `material_damage_photo` (id, material_damage on delete cascade, name, content_type,
  created_at); `material_damage_photo_data` (material_damage_photo primary key, data bytea)
- `app_user` bekommt `material_provider uuid null references material_provider on delete set
  null`, parallel zum vorhandenen Vereinsfeld

Sichten in `afterMigrate.sql`:

- `material_request_view`: Anfrage mit Wettkampf, Team, Verein, Startnummer, Materialart,
  Anbieter, Zählung der Zuteilungen.
- `material_offer_capacity`: je Angebot bestätigte, offene und wartende Menge gegenüber
  `planned_count`.
- `effective_material_for_match_team`: je `competition_match_team` das wirksame Stück (Nummer,
  Bezeichnung, Kategorie, `deviates_from_start_number`).
- `material_item_schedule`: je Stück die Läufe mit Zeiten, Team und Startnummer, für die
  Sicht „nach Materialstück“ und die Konfliktprüfung.

Entscheidungen, die man leicht wieder aufwirft:

- Der Ausfall ist kein eigenes Objekt, sondern ein Zeitfenster am Schaden. Ein Stück, das ohne
  Schaden fehlt, wird als Schaden mit Schwere `OUTAGE_ONLY` erfasst. Das ist die einzige Quelle
  für „nicht verfügbar“.
- Eine Meldung hat je Materialart höchstens eine Anfrage, auch über mehrere Anbieter hinweg.
  Das prüft der Service, weil die Art am Angebot hängt.
- Die Menge der Anfrage kommt aus dem Bedarf des Wettkampfs.
- Löschen einer Meldung zieht Anfragen und Zuteilungen per Kaskade mit. Löschen eines Stücks
  ist nur ohne Zuteilungen erlaubt, sonst nur Ausmustern; Ausmustern mit Zuteilungen erzeugt
  Konflikte, keinen Fehler.
- Startnummer (`competition_registration.team_number`) bleibt getrennt von der Bootsnummer und
  gehört weiter dem Veranstalter.

## 6. Rechte und Konto

Neue Ressource `MATERIAL` in `Privilege.kt`, nach dem Muster von `BOARD` und `STREAM`:

| Recht | Wer | Bedeutung |
|---|---|---|
| READ MATERIAL OWN | Anbieter-Nutzer | Flotte, Anfragen, Einteilung, Schäden des eigenen Anbieters lesen |
| UPDATE MATERIAL OWN | Anbieter-Nutzer | dieselben Dinge ändern |
| READ MATERIAL GLOBAL | Admin, Veranstalter | alle Anbieter und Materialarten lesen, Veranstalter-Übersicht |
| UPDATE MATERIAL GLOBAL | Admin | Anbieter und Materialarten anlegen, Nutzer zuordnen |

- OWN wird über `app_user.material_provider` geprüft, wie heute über den Verein.
- Keine Migration für Rechte (Enum wird beim Start gesät); die handgepflegte OpenAPI-Yaml wird
  um die Werte ergänzt.
- Neue Rolle „Materialanbieter“, gesät mit den beiden OWN-Rechten.
- Der Admin legt Anbieter an und ordnet Nutzer zu (Nutzerverwaltung: Rolle plus Anbieter-Wahl;
  Einladung neuer Nutzer um die Anbieter-Wahl erweitert).
- Veranstalter laden Anbieter ein und pflegen den Bedarf über ihr Recht zum Ändern der
  Veranstaltung. Vereine stellen Anfragen über ihr Recht zur eigenen Anmeldung.
- Ein Anbieter-Nutzer sieht von fremden Meldungen nur, was eine Anfrage bei ihm hat, und davon
  nur Team, Verein, Wettkampf, Startnummer und die Kontaktperson des Vereins. Keine
  Teilnehmernamen, keine Geburtsdaten.
- Hauptmenü „Material“: mit OWN zum eigenen Dashboard, mit GLOBAL ohne Zuordnung zur Verwaltung.

## 7. Anmeldefluss

**Formular.** Jedes Team, dessen Wettkampf einen Bedarf hat, bekommt unter den Gebühren einen
Abschnitt „Material“ (bei Kategorie Boot in der Oberfläche „Boot“). Je benötigter Art eine
Zeile „C4x+ (1 Stück): eigenes Boot / mieten bei …“. Ein Angebot: Schalter. Mehrere Anbieter:
Auswahl. Kein Angebot: nur der Hinweis „eigenes Boot mitbringen“. Neben jedem Angebot Ampel und
Preistext.

**Ampel.** Grün, wenn bestätigte plus offene Menge unter `planned_count` liegt; gelb ab
Erreichen. Kein Rot. Rechnet mit Mengen, nicht mit Zeitfenstern.

**Speichern.** Das Formular speichert die Anmeldung wie heute. Danach ruft dieselbe Seite je
Team `PUT /event/{eventId}/eventRegistration/{registrationId}/competitionRegistration/{id}/materialRequests`
mit der vollständigen Liste gewünschter Angebote. Nicht mehr genannte Anfragen werden
`WITHDRAWN`, neue `REQUESTED`, bestehende bleiben unverändert (auch `CONFIRMED`). Der
Anmelde-Service selbst wird nicht angefasst.

**Änderbarkeit.** Anfragen sind anleg- und zurückziehbar, bis „Vergabe geschlossen“ gesetzt ist.
Zurückziehen einer bestätigten Anfrage ist erlaubt und löst eine E-Mail an den Anbieter aus.
Die Fixierung der Anmeldung berührt Anfragen nicht.

**Fehlerfälle.** Angebot passt nicht zum Bedarf des Wettkampfs, zwei Anfragen derselben Meldung
auf dieselbe Art, Anfrage nach Vergabe-Schluss: jeweils abgelehnt mit klarem Fehler; das
Formular blendet die Schalter nach Vergabe-Schluss aus.

## 8. Startnummer und Bootsnummer

Die Startnummer wird je Wettkampf bei der Fixierung vergeben (`finalizeRegistrations`), zufällig
von 1 aufwärts, eindeutig nur innerhalb des Wettkampfs. Das erlaubt „Boot 3 fährt in jedem Rennen
als #3“.

- **Schalter bei der Fixierung** „Startnummern nach Bootsnummern vergeben“. Je Wettkampf
  bekommen zuerst Teams mit bestätigter Anfrage auf eine Art der Kategorie Boot die Nummern aus
  dem Bestand des Anbieters (zufällig unter diesen), dann Teams mit eigenem Boot die übrigen
  Nummern von 1 aufwärts, die keine Bootsnummer sind. Überzählige Mietteams bekommen Nummern
  oberhalb des Bestands und werden dem Anbieter als „ohne Nummerngleichheit“ gemeldet. Mit
  „Nummern behalten“ gilt das nur für Teams ohne Nummer.
- **„Nach Startnummer zuteilen“** im Dashboard: jede bestätigte Anfrage bekommt das Stück mit
  gleicher Nummer und passender Art, falls vorhanden und frei. Der Rest bleibt offen.
- **Abweichung** (Nummer des Stücks ≠ Startnummer) wird überall markiert.
- **Reihenfolge:** erst Anbieter bestätigt, dann Veranstalter fixiert mit Schalter. Der
  Veranstalter sieht vor der Fixierung einen Hinweis, wenn Anfragen offen sind.
- **Grenzen:** Bei zwei Bootsanbietern mit überlappenden Nummern gilt die Gleichheit nur für
  einen; Empfehlung disjunkt nummerieren, nichts dafür bauen. Ausfall nach der Fixierung bricht
  die Gleichheit für die Betroffenen; dann greift die Ausnahme je Lauf.

## 9. Anbieter-Dashboard

**Adressen.** `/material` (Veranstaltungswahl, wie `/speaker`), `/material/event/$eventId`
(Dashboard mit Reitern), `/material/fleet` (Flotte), `/material/admin` (Anbieter und
Materialarten, nur GLOBAL).

**Reiter „Anfragen“.** Tabelle: Wettkampf, Team, Verein, Materialart, Menge, Status, Zeitpunkt.
Filter nach Status und Art. Aktionen: bestätigen, Warteliste, ablehnen mit Notiz,
Mehrfachauswahl „alle offenen bestätigen“. Oben je Angebot „bestätigt / offen / Warteliste
gegenüber geplant“. Wird eine Bestätigung frei, wird die älteste Wartelisten-Anfrage
hervorgehoben, nichts automatisch bestätigt.

**Reiter „Einteilung“.** Zwei Sichten: nach Team (je bestätigte Anfrage die Stücke, Startnummer
daneben, Abweichung markiert, Offene oben) und nach Materialstück (je Stück die Läufe in
Zeitfolge mit Team und Startnummer; ohne Zeitplan nur Teams). Aktionen: „Nach Startnummer
zuteilen“, manuelle Zuteilung, Ausnahme je Lauf über Dialog am Team. Konfliktprüfung bei jeder
Änderung: Überlappung zweier Läufe auf einem Stück rot, Wechselzeit unterschritten gelb, Stück
im Ausfallfenster rot, falsche Art wird nicht angeboten. Konflikte verhindern das Speichern
nicht, bleiben aber sichtbar.

**Reiter „Schäden“.** Siehe Abschnitt 10.

**Reiter „Einstellungen“.** Angebote (Preistext, geplante Anzahl, Wechselzeit) und der Schalter
„Vergabe geschlossen“.

**Flotte.** Stücke über alle Veranstaltungen: Nummer, Bezeichnung, Art, Status, offene Schäden.
Anlegen, bearbeiten, ausmustern, löschen (nur ohne Zuteilungen).

**Datenfluss.** Ein Endpunkt `GET /material/event/{eventId}/overview` liefert Anfragen,
Zuteilungen, Läufe mit Zeiten, Ausfallfenster und Angebote in einem Aufruf. Die Konfliktrechnung
und die Zuteilung nach Startnummer liegen als reine Funktionen im Frontend mit Tests. Das
Backend prüft beim Speichern nur das Harte: Art passt, Anfrage ist bestätigt, Stück gehört dem
Anbieter, Lauf gehört zur Meldung. Neuladen per Knopf und Reiterwechsel, kein Takt.

**Veranstalter-Sicht.** Im Tab „Organisation“ ein Bereich „Material“: Anbieter einladen, je
Anbieter offene Anfragen und offene Schäden als Zahl, Hinweis vor der Fixierung. Der Bedarf je
Wettkampf liegt bei den Wettkampf-Eigenschaften neben den Gebühren
(`CompetitionPropertiesFormInputs`).

## 10. Schäden und Ausfall

**Melden.** Im Reiter „Schäden“ und am Stück in der Flotte. Pflicht: Stück, Zeitpunkt
(vorbelegt jetzt), Beschreibung, Schwere. Optional: verursachende Meldung, vorgeschlagen aus der
zum Zeitpunkt gültigen Zuteilung. Melder und Zeitpunkt der Meldung automatisch. Fotos beim
Anlegen und nachträglich, mehrere je Schaden, Grenze 10 MB je Datei, das Frontend verkleinert
vor dem Hochladen auf etwa 2000 px Kantenlänge.

**Ausfallfenster.** An jedem Schaden setzbar. Vorschlag: bei `TOTAL` offen ab Zeitpunkt, bei
`MINOR` keins. Beim Speichern zeigt der Dialog die betroffenen Zuteilungen („#3 im Finale JM4x
So 14:00“) und erlaubt je Lauf die Wahl eines Ersatzstücks (frei im Fenster, richtige Art,
Nummerngleichheit markiert). Die Ersatzwahl legt eine Ausnahme je Lauf an; die Grundzuteilung
bleibt. Ohne Ersatzwahl bleiben die Konflikte in der Einteilung rot.

**Reparatur.** Status `REPAIRED` mit Zeitpunkt; endet das Fenster damit früher, wird `until`
gesetzt. Ausnahmen bleiben bestehen. Die Einteilung zeigt „Grundzuteilung wieder möglich“ mit
einem Knopf, der die Ausnahme entfernt.

**Sichtbarkeit.** Teams sehen nur die Folge (geändertes Stück je Lauf), nie den Schaden, auch
nicht die Verursacher-Zuordnung. Der Veranstalter sieht Zahlen, keine Details.

**Auswertung.** Schadensliste je Stück und je Veranstaltung, CSV-Export nach bestehendem Muster.

**Fehlerfälle.** `until` vor `from`: abgelehnt. Schaden an ausgemustertem Stück: erlaubt. Foto
über der Grenze: abgelehnt, Meldung bleibt erhalten.

## 11. Anzeigen

**Feld.** Die Sicht `effective_material_for_match_team` liefert je Lauf-Team Nummer, Bezeichnung,
Kategorie und `deviatesFromStartNumber`. Das wird als optionales Feld an die bestehenden
Team-DTOs der Anzeigen gehängt; keine neuen Endpunkte.

**Darstellungsregel**, überall gleich:

- Nummer = Startnummer: nichts Zusätzliches.
- Abweichung: „#3 · Boot 7“, hervorgehoben.
- Eigenes Boot: nichts; mit Schalter „Material immer zeigen“: „#3 · eigenes Boot“.
- Kategorie `OTHER`: nie auf Anzeigen, nur in Mein Event und im Dashboard.

**Schalter** „Material immer zeigen“, Standard aus, je Anzeige dort, wo ihre Einstellungen
liegen: Einstellungs-Popover bei Sprecher- und Live-Dashboard, Kachel-Eigenschaft in der
Board-Verwaltung, Szenen-Einstellung bei den Livestream-Grafiken. Startlisten-PDF: Spalte
„Boot“ nur bei Abweichung im Lauf oder mit Schalter.

**Mein Event.** Je Meldung ein Block „Material“: Anfragen mit Status, je Lauf das wirksame Stück,
Abweichungen hervorgehoben. Immer sichtbar.

**Kürzung.** In Livestream-Grafiken und Athleten-Boards nur in der Langform der Bootszeile; beim
Kürzen fällt die Bootsangabe zuerst.

**Reihenfolge.** Mein Event, dann Sprecher- und Live-Dashboard, dann Boards und Startlisten,
Livestream zuletzt. Jede Anzeige ein eigener Schritt.

## 12. Bausteine und Dateien

- API: `api/src/material.tsp` (Anbieter, Materialarten, Stücke, Angebote, Anfragen,
  Zuteilungen, Schäden, Übersicht), Import in `api/main.tsp`; Erweiterungen in
  `competitionProperties.tsp` (Bedarf), `eventRegistration.tsp` (Angebote und Ampel im
  Template), `event.tsp` (Einladungen), `appuser.tsp` (Anbieter-Feld).
- Backend: `app/material/{boundary,control,entity}` mit `MaterialService.kt`, `material.kt`
  (Routen), Repos je Tabelle, `Conversions.kt`, DTOs, `MaterialError.kt`. Ergänzungen in
  `Privilege.kt`, `AppUserService` (Anbieter-Zuordnung), `EventRegistrationService.finalizeRegistrations`
  (Schalter), `CompetitionPropertiesHasFeeRepo`-Nachbar für den Bedarf.
- Frontend: `pages/material/` (SelectMaterialEventPage, MaterialDashboardPage, MaterialFleetPage,
  MaterialAdminPage), `components/material/` mit reiner Logik in `.ts` plus `.test.ts`
  (`capacity.ts`, `conflicts.ts`, `assignByStartNumber.ts`, `materialLabel.ts`),
  `components/eventRegistration/EventRegistrationMaterialCard.tsx`, Routen in `routes.tsx`,
  Rechte in `authorization/privileges.ts`, Übersetzungen in `de`, `en`, `da`.
- Seed: `docs/seeds/seed-material.sql` mit einem Anbieter, zwei Materialarten, acht Booten und
  Anfragen auf das bestehende Förde-Programm.

## 13. Tests

- Vitest, reine Logik ohne DOM: Ampelrechnung, Konfliktprüfung (Überlappung, Wechselzeit,
  Ausfallfenster, Artpassung), Nummernvergabe nach Bootsnummern, Zuteilung nach Startnummer,
  Darstellungsregel der Anzeigen.
- Backend mit Testcontainers gegen echtes Postgres: Anfrage-Endpunkt (Liste ersetzen, Bestätigte
  bleiben, Vergabe geschlossen, Art passt nicht), Fixierung mit Schalter, OWN-Scope über den
  Anbieter, Kaskaden beim Löschen einer Meldung.
- Handtests im Testkatalog: Anmeldefluss mit Ampel, Dashboard-Reiter, Ausfall-Dialog mit
  Ersatzwahl, jede Anzeige mit und ohne Schalter.

## 14. Umsetzungsschritte

Jeder Schritt für sich lauffähig und mergebar:

1. Stammdaten: Anbieter, Materialarten, Materialstücke, Rechte, Rolle, Admin-Verwaltung,
   Nutzer-Zuordnung.
2. Veranstaltung: Einladung, Angebote, Bedarf am Wettkampf, Veranstalter-Bereich.
3. Anmeldung: Anfrage-Endpunkt, Abschnitt „Material“ im Formular, Ampel, Mein Event Status.
4. Dashboard: Anfragen, Einteilung mit Konfliktprüfung, Nummernvergabe mit Schalter, Zuteilung
   nach Startnummer.
5. Schäden und Ausfall mit Fotos und Ersatzwahl.
6. Anzeigen in der Reihenfolge aus Abschnitt 11.

## 15. Risiken

- Der Anmelde-Service ist mit 1300 Zeilen schon groß; der Schalter bei der Fixierung ist der
  einzige Eingriff dort und muss klein bleiben.
- `finalizeRegistrations` mischt heute zufällig; die Bootsnummern-Vergabe muss die Zufälligkeit
  innerhalb der Gruppen behalten, sonst entsteht eine unbeabsichtigte Reihenfolge.
- Fotos als Bytes in Postgres: mit Verkleinerung im Frontend tragbar, ohne nicht. Die Grenze
  ist im Backend hart.
- Zwei Anbieter mit überlappenden Nummern brechen die Nummerngleichheit; das wird dokumentiert,
  nicht gelöst.
- Die Anzeigen-Erweiterung berührt viele DTOs; das optionale Feld muss überall `null`-sicher
  sein, sonst reißen bestehende Anzeigen bei Teams ohne Material.
