# ADR-0111: Meldungsnummer und Startnummer im Lauf sind zwei Zahlen; das wirksame Material je Lauf-Team hat genau eine Ableitung

- Status: angenommen; eine fachliche Teilfrage ist offen (siehe „Offene Entscheidung“)
- Datum: 2026-11-14
- Bereich: domäne
- Spec: `docs/superpowers/specs/2026-09-07-materialvermietung-design.md` (Abschnitt 8)

## Kontext

Die Spec der Materialvermietung verspricht „Boot 3 fährt in jedem Rennen als #3“: Das Boot trägt eine
Nummer, das Team die gleiche. Zu dem Zeitpunkt gab es nur eine Zahl am Team,
`competition_registration.team_number`. Inzwischen führt der Stand zwei Zahlen:

- die **Meldungsnummer** `competition_registration.team_number`, je Wettkampf eindeutig, vergeben bei
  der Fixierung der Meldungen (`finalizeRegistrations`), danach fest, und
- die **Startnummer im Lauf** `competition_match_team.start_number` (überall `startNumber`): die
  Setzposition im Lauf, ab 1 je Lauf, in Folgerunden der Rang. Sie steht auf allen Anzeigen neben dem
  Boot und ist nicht eindeutig je Wettkampf.

Welches Boot ein Lauf-Team fährt, braucht jede Anzeige (Boards, Mein Event, Live-Läufe,
Schiedsrichter-Dashboard, Sprecher, Stream, Startliste, Lauf-Karte der Durchführung). Kopien dieser
Ableitung driften auseinander (Regel in `AGENTS.md`, Abschnitt 4).

## Entscheidung

**1. Zwei Nummern, zwei Aufgaben.**
- Mit der **Meldungsnummer** paart die **Grundzuteilung** (Boot n ↔ Meldungsnummer n): der Schalter
  „Meldungsnummern nach Bootsnummern vergeben“ bei der Fixierung (`TeamNumberAlignment`), „Nach
  Meldungsnummer zuteilen“ im Dashboard und die Abweichungsanzeige der Grundzuteilung („weicht von
  Meldungsnummer ab“). Im Backend paart sonst nichts über die erste Runde.
- Die **Startnummer im Lauf** steht auf den Anzeigen, und **gegen sie rechnet allein die Sicht
  `effective_material_for_match_team` die Abweichung je Lauf** (`deviates_from_start_number`). Die
  Übersicht liefert beide: `requests[].teamNumber` (Meldungsnummer) und `matches[].teams[].startNumber`
  (Startnummer je Meldung in diesem Lauf). `material_request_view.start_number` und `startNumber` der
  Anbieter-Übersicht sind reine Anzeige.
- Die Meldungsnummer bleibt nach der Fixierung fest, auch wenn die Meldung erneut gespeichert wird (ADR-0109, Absatz 2a).
- Die Fixierung stellt die Gleichheit nicht blind her: Eine Meldung mit bestätigter Grundzuteilung
  (BOAT, ohne Lauf, Stück mit Nummer; bei mehreren die kleinste) bekommt diese Nummer fest, die
  anderen gehen in die Verlosung, feste Nummern zählen für sie als vergeben. Kollidieren zwei
  Meldungen auf demselben Boot, behält eine (Zufall) die Nummer, die andere läuft als Mietteam bzw.
  mit eigenem Boot weiter.

**2. Eine Ableitung des wirksamen Stücks je Lauf-Team.** Die Sicht `effective_material_for_match_team`
(nur in `afterMigrate.sql`, ADR-0015) liefert je Lauf-Team **höchstens ein** BOAT-Stück: aus allen
zugeteilten Stücken der bestätigten Anfragen der Meldung, **Ausnahme je Lauf vor Grundzuteilung**,
dann die **kleinste Stücknummer** (Stücke ohne Nummer zuletzt), dann die Zuteilungs-ID. Gebaut ist sie
als `join lateral … order by … limit 1` je Lauf-Team, ohne `distinct on` und ohne äußeres `order by`.
Jeder Lesepfad (`CompetitionMatchTeamRepo`, Schiedsrichter-Dashboard, Mein Event, `startlist_team`,
`effectiveForMatchTeams`, Lauf-Karte) liest diese Sicht. Neue Oberflächen rufen sie, sie bauen keine
Kopie. Kategorie `OTHER` (Zubehör) erscheint auf keiner Anzeige.

**3. Der Änderungsmarker wird bei jeder Mutation gebumpt, die eine Anzeige ändert.** Bumpt:
Zuteilungen (Grundzuteilung, Ausnahme je Lauf, Ersatzwahl), jede Entscheidung über eine Anfrage
(Mein Event zeigt den Status, die Sicht nur `CONFIRMED`), Anlegen, Reaktivieren und Zurückziehen einer
Anfrage nur bei echter Änderung, Änderungen an Stück, Anbieter (Name in Mein Event), Materialart (Name,
Kategorie) und Angebot, soweit in einer Veranstaltung wirksam, die Fixierung und die Freigabe durch die
Meldung (ADR-0109). Kein Bump: Anlegen und Löschen von Anbieter, Art, Stück und Angebot (bei
Verwendung gesperrt), Ein- und Ausladen, „Vergabe geschlossen“ sowie die gesamte Schadensakte inklusive
Fotos und Ausfallfenster, weil keine Anzeige `material_damage` liest.

## Offene Entscheidung

**Solange die Rundenanlage die Startnummer im Lauf nach Setzliste vergibt, stimmen Boot und angezeigte
Startnummer nur in Sonderfällen überein** (lückenlose Nummerierung ab 1 in einem einzigen Lauf, oder
zufällig). „Meldungsnummern nach Bootsnummern“ setzt bei der Fixierung nur `team_number`; die erste
Runde vergibt `start_number` als Rang danach, und die Fixierung verändert vorhandene Läufe nicht (am
14.11.2026 gemessen: `competition_match_team.start_number` identisch vor und nach). Heute zeigen die
Anzeigen deshalb für jedes Mietboot, dessen Nummer nicht zufällig der Setzposition entspricht, den Chip
„abweichend“, auch unmittelbar nach einer Fixierung nach Bootsnummern. Die Spec-Zusage „Boot 3 fährt in
jedem Rennen als #3“ ist so **nicht eingelöst**.

Die Alternative **„Die Rundenanlage übernimmt die Meldungsnummer als Startnummer, wenn der Schalter
gesetzt ist“** (`start_number := team_number` im ersten Lauf) ist **nicht umgesetzt**. Sie griffe in
die Durchführung ein (Rundenanlage, Setzliste, Folgerunden mit Rang) und wartet auf eine fachliche
Entscheidung von Thomas. Bis dahin gilt die Zweiteilung dieses ADR; wird die Alternative gewählt, ersetzt
ein neues ADR den Absatz „Zwei Nummern, zwei Aufgaben“.

## Verworfene Alternativen

- **Eine Zahl: Abweichung gegen die Meldungsnummer prüfen** (Zustand des Quellzweigs): Die Anzeigen
  zeigen die Startnummer im Lauf neben dem Boot, Flag und angezeigte Zahl liefen auseinander.
- **Grundzuteilung gegen die Startnummer im ersten Lauf paaren** (Zwischenstand): Die Zahl beginnt je Lauf
  bei 1 und ist je Wettkampf nicht eindeutig; „Nach Startnummer zuteilen“ verteilte dasselbe Boot an
  mehrere Teams eines Wettkampfs (Schlussreview RF-01). Die Abweichung in Folgerunden (Rang) wäre falsch
  gerechnet (RF-02).
- **Keine Schätzung der Startnummer im Lauf**, wenn sie fehlt: lieber keine Zahl als die falsche.
- **`distinct on` mit äußerem `order by`** in der Sicht: wählte bei zwei Grundzuteilungen einer Anfrage
  planabhängig (Befund RB-02) und zwang Postgres, die Sicht über alle Lauf-Teams aller Veranstaltungen
  auszuwerten (RB-05). `EXPLAIN` nach dem Umbau: `Nested Loop Left Join` mit `Index Scan` auf
  `competition_match_team_pkey`, das Lateral nur je Team des Laufs (am Seed-Umfang gemessen).
- **SQL-Funktion je Lauf oder Nachladen je Repo:** zweite Abfrageform in allen Repos bzw. eine zweite
  Ableitung.
- **Den Ausfall in die Sicht einrechnen oder bei Schäden bumpen:** siehe ADR-0109.
- **Die Sicht in `competition_match_team_with_registration` einjoinen** (Lauf-Karte): viele Lesepfade,
  `afterMigrate` ohne Not; stattdessen eine Abfrage je Wettkampf in `getProgress`.

## Konsequenzen

- Neue Zahl im Frontend heißt immer ausdrücklich „Meldungsnr. n“ (Meldungsnummer) oder „Startnr. n“
  (Startnummer im Lauf); `frontend/src/components/material/materialNumbers.ts` trennt `teamNumberOf` und
  `startNumberInMatch`. Der bestehende Glossareintrag „Startnummer“ in `AGENTS.md` bleibt unverändert.
- Chips der Zuteilung: „weicht von Meldungsnummer ab“ (Grundzuteilung), „Startnummer weicht in n Läufen
  ab“ (gleiche Regel wie die Anzeigen), „ohne Nummerngleichheit“ (bestätigte BOAT-Anfrage, deren
  Meldungsnummer kein aktives Stück gleicher Art und Nummer dieses Anbieters trägt, typisch oberhalb des
  Bestands). Die Liste „Meldungen“ eines Wettkampfs zeigt den Chip „Meldungsnr. n“ (G1); die Liste
  „Teams“ liest aus der Sicht `competition_registration_team` und zeigt sie nicht.
- Ein Ausfall oder ein ausgemustertes Stück steht auf den Anzeigen, bis der Anbieter eine Ausnahme je Lauf
  setzt; ein ausgemustertes Stück ist nicht neu zuteilbar, ein bereits zugeteiltes darf stehen bleiben.
- Boote zweier Anbieter mit überlappenden Nummern: Gleichheit gilt nur für einen; Empfehlung,
  Bestände disjunkt zu nummerieren (Spec Abschnitt 8).
- Wer Mutationen im Material-Umfeld ergänzt, die eine Anzeige ändern, bumpt `EventChangeMarker` über
  `AfterCommit`.
- Nicht belegt: Messung der Sicht gegen Produktionsdaten (nur Seed-Umfang). Was an den Anzeigen mit
  Material in der laufenden App gesehen wurde, steht je Fall im Testkatalog
  (`docs/superpowers/specs/2026-11-14-materialvermietung-testkatalog.md`).

## Quellen

- Commits: `e9d466a1` (Meldungsnummer bleibt beim erneuten Speichern), `5436a245` (Abweichung gegen die Startnummer im Lauf), `7a911dc6` (Änderungsmarker),
  `c6b3cb8b` (Sicht deterministisch und je Lauf-Team eingegrenzt), `b90afce4` (Fixierung mit
  Grundzuteilung, Backend-Korrekturen), `f31310bd` und `9e5afc58` (zwei Nummern im Dashboard),
  `40039622` (Lauf-Karte der Durchführung), `ad263d04` und `91f548a1` (Meldungsnummer in der
  Meldungsliste)
- Specs: `docs/superpowers/specs/2026-09-07-materialvermietung-design.md`
- Verwandte ADRs: ADR-0015, ADR-0109
