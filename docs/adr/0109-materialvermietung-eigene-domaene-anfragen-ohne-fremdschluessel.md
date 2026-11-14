# ADR-0109: Materialvermietung als eigene Domäne: Anfragen ohne Fremdschlüssel, Freigabe durch die Meldung, Verursacher als Momentaufnahme, Ausfall nur über die Ausnahme je Lauf

- Status: angenommen
- Datum: 2026-11-14
- Bereich: domäne
- Spec: `docs/superpowers/specs/2026-09-07-materialvermietung-design.md`

## Kontext

Vereine mieten Boote und Zubehör bei Anbietern (Bootshäusern, Werften). Der Anbieter muss vor der
Regatta wissen, wer was anfragt, entscheiden, welches Stück an welches Team geht, und am Renntag
wissen, welches Stück ausgefallen ist. Veranstalter, Sprecher und Schiedsrichter wollen das
zugeteilte Boot neben der Startnummer sehen. Die Domäne entstand am 07.–09.09.2026 auf einem eigenen
Zweig und wurde am 14.11.2026 auf den Stand des Review-Zweigs übernommen (Befund:
`docs/superpowers/specs/2026-11-13-materialvermietung-uebernahme-befund.md`).

Eine Anfrage hängt an einer Meldung (`competition_registration`). Der Speicherpfad der Meldung löscht
beim erneuten Speichern alle Meldungen der Veranstaltung und legt sie mit **gleicher ID** neu an
(stabile IDs seit `62e6fb2a`). Ein Fremdschlüssel von der Anfrage auf die Meldung würde dabei
entweder kaskadieren (Anfragen weg) oder das Löschen verhindern.

## Entscheidung

**Eigene Domäne `app/material`** (Entity-Control-Boundary, ADR-0003) mit Anbieter, Materialart
(Kategorie `BOAT` oder `OTHER`), Stück (Nummer, Status aktiv/ausgemustert), Angebot je
Veranstaltung und Art, Anfrage (`REQUESTED`, `CONFIRMED`, `WAITLISTED`, `DECLINED`, `WITHDRAWN`),
Zuteilung und Schaden mit Ausfallfenster und Fotos. Eine **Zuteilung ohne Lauf** ist die
Grundzuteilung der Anfrage, eine **Zuteilung mit Lauf** die Ausnahme je Lauf.

**1. Anfragen ohne Fremdschlüssel auf die Meldung.** `material_request.competition_registration`
ist eine reine Spalte. Ein aufgeschobener Constraint-Trigger (`A0_material_request_orphan_cleanup`,
`V202611140800`) räumt beim Commit Anfragen weg, deren Meldung wirklich nicht mehr existiert. Er ist
**nur das Sicherheitsnetz**.

**2. Die Meldung gibt Anfragen vor dem Löschen ausdrücklich frei.** Alle Wege, auf denen eine Meldung
verschwindet, rufen vorher `MaterialService.releaseRequestsOfRemovedRegistrations` (Meldeformular,
`deleteCompetitionRegistration`, `deleteEventRegistration`). Die Funktion
- weist bei **geschlossener Vergabe** (`requests_closed` des Anbieters) das Entfernen einer Meldung
  mit aktiver Anfrage (angefragt, bestätigt, Warteliste) mit 409 `MATERIAL_REMOVAL_REQUESTS_CLOSED`
  ab, aber nur auf den **Vereinswegen** (Formular, Löschen mit OWN-Recht); der Anbieter will eine
  bestätigte Buchung nicht still verlieren,
- reiht für bestätigte Anfragen die **Rückzugs-Mail** an den Anbieter ein (auch auf den
  Veranstalter-Wegen mit GLOBAL-Recht, die weiter erlaubt sind),
- bumpt den Änderungsmarker (ADR-0111).

Die **Abmeldung** (`competitionDeregistration`) löscht keine Meldung; die Anfrage bleibt bestehen
(umkehrbar, das Boot bleibt verplant). Das Lesen der Meldung beim Anlegen einer Anfrage nimmt
`FOR KEY SHARE`, damit eine parallel gelöschte Meldung keine Waise hinterlässt (Test
`MaterialOrphanRaceTest`, ohne Sperre rot).

**2a. Das erneute Speichern der Meldung lässt bestehende Meldungen unverändert.** Der Speicherpfad
(`upsertRegistrationForEvent`) löscht die nicht gesperrten Meldungen der Art und legt sie neu an. Vor dem Löschen
macht er einen Schnappschuss (`ResaveCarryOver`); eine bestehen bleibende Meldung (gleiche ID, gleicher Wettkampf)
behält `team_number`, `created_at` und `created_by`, und ihr Name bleibt, solange sich die Meldungsmenge des Wettkampfs
nicht ändert (sonst Durchnummerierung „#n“ wie bisher). Ein neues Team bekommt seine Nummer erst bei der nächsten
Fixierung, ein entferntes gibt sie frei. Der Fehler (Nummer und Name gingen beim Speichern verloren) bestand schon im
Stand vor der Übernahme und betraf alle Veranstaltungen; die Regel gilt deshalb auch ohne Material. Test:
`EventRegistrationResaveKeepsDataTest`.

**3. Der Verursacher eines Schadens ist eine Momentaufnahme.** `material_damage` speichert
`caused_by_registration` (ohne Fremdschlüssel) sowie Team-, Vereins- und Wettkampfname als Text. Die
Akte ist historisch und verliert ihren Verursacher weder beim Neu-Speichern noch beim Löschen der
Meldung. Vorgeschlagen wird der Verursacher aus der zum Schadenszeitpunkt gültigen Zuteilung.

**4. Ein Ausfall wirkt nicht auf die Anzeigen, sondern nur über die Ausnahme je Lauf.** Kein
Lesepfad der Anzeigen liest `material_damage`. Ein Boot im Ausfallfenster (oder ausgemustert) steht
auf Boards, Startliste, Schiedsrichter-Dashboard und Stream, bis der Anbieter für den Lauf ein
Ersatzstück als Ausnahme setzt; das Anbieter-Dashboard zeigt die Konflikte rot (Überschneidung,
Ausfall), blockiert aber nichts. Die Ersatzwahl nach einem Schaden (Dialog „Betroffene Läufe“) legt
Ausnahmen an; die Grundzuteilung bleibt stehen. Schäden und Fotos bumpen den Marker deshalb nicht.

**5. Abgrenzung.** Nicht Teil der Domäne: Abrechnung der Miete (das Rechnungsmodul bleibt
unberührt), Übergabeprotokoll am Steg, Schadenskosten, **automatisches Nachrücken von der
Warteliste** (der Anbieter sieht die älteste Wartelisten-Anfrage hervorgehoben und bestätigt selbst),
Serverseitiges Verkleinern der Fotos.

**6. Warteliste und Ablehnung nehmen die Zuteilungen zurück.** Verlässt eine Anfrage `CONFIRMED`,
werden ihre Zuteilungen gelöscht; eine spätere Bestätigung beginnt ohne Stück (sie kehrten sonst still
zurück). Das Dashboard sagt das im Notizdialog an.

## Verworfene Alternativen

- **Meldungen beim Speichern neu anlegen und Nummer/Namen aus dem Formular ableiten (Altverhalten):** verlor die Fixierung
  und benannte gesperrte Meldungen um (H3-F1).
- **Fremdschlüssel mit `on delete cascade`:** Das Neu-Speichern der Meldungen löschte jede Anfrage samt
  Zuteilungen. Der Anbieter verlöre bestätigte Buchungen bei jedem Speichern der Veranstaltung.
- **Fremdschlüssel mit `restrict`:** Der Speicherpfad der Meldung könnte nicht mehr löschen.
- **Nur der Waisen-Trigger, ohne Freigabe im Service (so lief der Quellzweig):** Der Trigger löscht
  jede Anfrage jeder Meldung, die verschwindet, unabhängig von Status und Vergabeschluss. Ein Verein
  umginge mit „Team entfernen“ den Rückzug, die Sperre und die Mail (Schlussreview, Befund RB-01).
- **Rückzug im Trigger:** Ein Datenbank-Trigger kann weder Mail noch Sperre sauber auslösen.
- **Verursacher als Fremdschlüssel:** Die Akte verlöre ihn mit der Meldung.
- **Ausfall in die Sicht `effective_material_for_match_team` einrechnen:** Die Sicht wählte dann still
  ein anderes Boot; der Anbieter muss den Ersatz bewusst wählen (Spec Abschnitt 10: ohne Ersatzwahl
  bleiben die Konflikte rot). Ein Schaden-Bump hätte außerdem nichts aufzufrischen.
- **Automatisches Nachrücken:** Spec Abschnitt 3; der Anbieter entscheidet.
- **Beim Zurücknehmen einer Bestätigung die Zuteilungen behalten:** kehrten bei späterer Bestätigung
  unbemerkt zurück.

## Konsequenzen

- Bis zum Commit kann eine Waise existieren; die Sichten blenden sie aus, `capacityForOffers` und der
  Veranstalter-Zähler (`listForEvent.openRequests`) zählen nur Anfragen mit existierender Meldung.
  Restfall: Läuft parallel ein Neu-Speichern derselben Meldung, bekommt die Anfrage 404 statt Erfolg;
  das Formular ruft beides nacheinander.
- **Meldefrist:** Anlegen und Rückzug sind nur an „Vergabe geschlossen“ gebunden, nicht an die
  Meldefrist (Spec Abschnitt 7). Nach Meldeschluss kann ein Verein über die API noch anfragen oder
  zurückziehen, solange der Anbieter offen hat; der Anbieter steuert das mit dem Schalter.
- Löschsperren: Anbieter, Materialart, Stück und Angebot sind bei Verwendung nicht löschbar (409
  `MATERIAL_*_IN_USE`); ein Stück mit Schadensakte nur ausmustern (409 `MATERIAL_ITEM_HAS_DAMAGES`);
  die Art eines Angebots mit Anfragen und eines zugeteilten Stücks ist fest (409
  `MATERIAL_OFFER_TYPE_LOCKED`, `MATERIAL_ITEM_TYPE_LOCKED`); ein Anbieter mit zugeordneten Konten ist
  nicht löschbar (ADR-0110). Wettkampf und Veranstaltung lassen sich nur ohne Meldungen löschen.
- Rückzugs-Mail in der Sprache des Kontos mit der Kontaktadresse, sonst Deutsch. **Im Admin
  überschriebene Vorlagen behalten ihren alten Text** und zeigen die neue Zeile `##competitions##`
  nicht; Betriebshinweise: `docs/superpowers/specs/2026-11-14-materialvermietung-betriebshinweise.md`.
- Fotos liegen wie alle Binärdaten in Postgres (ADR-0021); Grenzen 10 MB je Datei, 50 MB je Anfrage,
  20 Dateien je Upload, Format an den Bytes (JPEG, PNG, WebP, GIF, HEIC; kein SVG).
- Einladungen, Angebote und die Dashboard-Übersicht bleiben unpaginierte Listen: Die Mengen sind durch
  Anbieter × Materialarten begrenzt, und die Konfliktrechnung im Frontend braucht die Übersicht in
  einem Aufruf (Abweichung von der Regel „Listen immer paginieren“, bewusst).
- Datenbanken, auf denen der alte Zweig lief (Migration `V202609071000__material_rental`), lassen sich
  nicht hochziehen; die Migration heißt jetzt `V202611140800__material_rental.sql`.

## Quellen

- Commits: `e9d466a1` (erneutes Speichern behält Nummer und Namen), `45a0abe3` (Härtung), `b90afce4` (Korrekturen aus dem Schlussreview: Freigabe durch die
  Meldung, Sperren, Sicht), `5f575b5e` (Übernahme), `62e6fb2a` (stabile Meldungs-IDs, Quellzweig)
- Specs: `docs/superpowers/specs/2026-09-07-materialvermietung-design.md`,
  `docs/superpowers/specs/2026-11-13-materialvermietung-uebernahme-befund.md`
- Verwandte ADRs: ADR-0003, ADR-0021, ADR-0110, ADR-0111
