# ADR-0111: Meldungsnummer und Startnummer im Lauf sind zwei Zahlen; das wirksame Material je Lauf-Team hat genau eine Ableitung

- Status: angenommen; die fachliche Teilfrage „Startnummer aus Meldungsnummer“ ist am 14.11.2026 entschieden (Abschnitt 4)
- Datum: 2026-11-14
- Bereich: domäne
- Spec: `docs/superpowers/specs/2026-09-07-materialvermietung-design.md` (Abschnitt 8)

## Kontext

Die Spec der Materialvermietung verspricht „Boot 3 fährt in jedem Rennen als #3“: Das Boot trägt eine
Nummer, das Team die gleiche. Zu dem Zeitpunkt gab es nur eine Zahl am Team,
`competition_registration.team_number`. Inzwischen führt der Stand zwei Zahlen:

- die **Meldungsnummer** `competition_registration.team_number`, je Wettkampf eindeutig, vergeben bei
  der Fixierung der Meldungen (`finalizeRegistrations`), danach fest, und
- die **Startnummer im Lauf** `competition_match_team.start_number` (überall `startNumber`): ohne den
  Schalter „Meldungsnummern nach Bootsnummern“ die Setzposition im Lauf, ab 1 je Lauf, in Folgerunden
  der Rang; mit ihm die Meldungsnummer (Abschnitt 4). Sie steht auf allen Anzeigen neben dem Boot.

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

**4. Startnummer aus Meldungsnummer (entschieden am 14.11.2026).** Vorher galt: Die Rundenanlage
vergab die Startnummer nach Setzliste, „Meldungsnummern nach Bootsnummern“ setzte nur `team_number`,
und jedes Mietboot, dessen Nummer nicht zufällig der Setzposition entsprach, stand als „abweichend“ auf
den Anzeigen – die Spec-Zusage „Boot 3 fährt in jedem Rennen als #3“ war nicht eingelöst. Entschieden:
**Bei gesetztem Schalter übernimmt die Rundenanlage die Meldungsnummer als Startnummer im Lauf.**

- **Dauerhafter Schalter an der Veranstaltung:** `event.team_numbers_as_start_numbers` (Migration
  `V202611141330`), lesbar als `EventDto.teamNumbersAsStartNumbers`. Die Fixierung ist
  veranstaltungsweit, eine Fixierung je Wettkampf gibt es nicht. **Jede Fixierung schreibt ihn** (mit
  Schalter an, ohne aus); die letzte Fixierung bestimmt, wie künftige Läufe nummeriert werden. Der
  Dialog belegt den Haken mit dem gespeicherten Stand vor. `PUT /event` kennt das Feld nicht.
- **Rundenanlage** (`createNewRound`: erste Runde, Folgerunden und damit die Folgerunden-Automatik)
  setzt mit Schalter `start_number := team_number` über die eine reine Funktion `StartNumberAssignment`:
  eindeutig je Lauf (die Datenbank erzwingt keine eindeutige Meldungsnummer); doppelte oder fehlende
  Nummern bekommen die nächste freie Zahl oberhalb der höchsten Meldungsnummer des Wettkampfs, bei
  Doppelten behält das besser gesetzte Boot die Zahl. Ohne Schalter bleibt es bei Setzposition bzw. Rang.
- **Die Abweichung rechnet weiter allein die Sicht gegen `start_number`** (Abschnitt 2, unverändert).
  Mit Schalter fallen Boot und Startnummer zusammen; „abweichend“ heißt dann: Ausnahme je Lauf, Stück
  mit anderer Nummer, überzähliges Mietteam.
- **RaceClocker-Abgleich:** Mit Schalter schreibt der Abruf keine Listenpositionen mehr in die
  Startnummern (`applyLanesFromFeed`). Die Startnummer ist dann die Bootsnummer und reist mit dem Boot
  wie die Bib in RaceClocker; ein Umsortieren dort ändert in R2R nichts. Zeiten, Zwischenzeiten,
  Start und Reset laufen unverändert.
- **Bestehende Läufe** ändert die Fixierung nicht – auch nicht ohne Ergebnisse. Sie können schon
  exportiert (RaceClocker, gedruckte Startliste) oder an Posten verteilt sein; eine stille
  Umnummerierung aus dem Meldungsdialog wäre am Renntag gefährlich. Weg: Runde löschen und neu anlegen
  (gesperrt, sobald Ergebnisse da sind). Die Veranstalter-Sicht sagt das unter „Meldungen fixieren“.
- **Grenzen:** In Folgerunden ordnen Listen (Boards, Posten, Startlisten) nach Bootsnummer statt nach
  Setzplatz – die erste Runde behält ihre Reihenfolge, weil die Setzliste nach Meldungsnummer ordnet
  und `getSeedingList` je Lauf aufsteigend setzt. Der Freilos-Chip findet in Folgerunden seine
  Setzungszahl nicht mehr (`MatchByeRepo` liest sie über `ranking = start_number`) und zeigt „Freilos“
  ohne Zahl; der materialisierte Laufname „Freilos n“ bleibt richtig. „Neu mischen“ im Dialog „Partie
  bearbeiten“ bleibt eine bewusste Handaktion und erzeugt ehrlich „abweichend“. Challenge-Veranstaltungen
  (keine Rundenanlage) bleiben unberührt.

## Verworfene Alternativen

- **Zu Abschnitt 4 – Schalter je Wettkampf:** Es gibt keine Fixierung je Wettkampf, also keinen Ort,
  an dem er gesetzt würde; Wettkämpfe ohne Leihboote vertragen die Meldungsnummer als Startnummer
  genauso.
- **Zu Abschnitt 4 – eigene Positions-/Bahnspalte neben der Startnummer:** eine zweite Zahl je Boot und
  Lauf, gegen das Glossar („die eine Zahl je Boot und Lauf“); keine Stelle braucht die Position zwingend.
- **Zu Abschnitt 4 – RaceClocker-Positionen auf die vorhandene Nummernmenge abbilden:** vertauschte die
  Bootsnummern zwischen Booten, genau die falsche Aussage.
- **Zu Abschnitt 4 – bestehende Läufe beim Fixieren angleichen:** siehe dort; eine eigene Aktion
  „Startnummern angleichen“ wäre nur ein zweiter Weg zu „Runde löschen und neu anlegen“.
- **Zu Abschnitt 4 – Abweichung gegen die Meldungsnummer prüfen** statt die Startnummer anzugleichen:
  wie die erste Alternative unten – Flag und angezeigte Zahl liefen auseinander.

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
  `startNumberInMatch` – auch mit Schalter, weil Läufe von vor der Fixierung oder Handänderungen die
  beiden Zahlen weiter trennen können. Der Glossareintrag „Startnummer“ in `AGENTS.md` nennt den Schalter.
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

- Commits: `bd0f50df` (Startnummer aus Meldungsnummer), `d945ebf3` (Vertrag), `ce50b7ba` (Fixierungsblock), `e9d466a1` (Meldungsnummer bleibt beim erneuten Speichern), `5436a245` (Abweichung gegen die Startnummer im Lauf), `7a911dc6` (Änderungsmarker),
  `c6b3cb8b` (Sicht deterministisch und je Lauf-Team eingegrenzt), `b90afce4` (Fixierung mit
  Grundzuteilung, Backend-Korrekturen), `f31310bd` und `9e5afc58` (zwei Nummern im Dashboard),
  `40039622` (Lauf-Karte der Durchführung), `ad263d04` und `91f548a1` (Meldungsnummer in der
  Meldungsliste)
- Specs: `docs/superpowers/specs/2026-09-07-materialvermietung-design.md`
- Verwandte ADRs: ADR-0015, ADR-0109
