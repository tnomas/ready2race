# ADR-0071: Vereinskette statt „Renngemeinschaft"; Vereinskürzel und Kürzungsregeln als Daten, Sportwissen nicht im Produktkern

- Status: angenommen
- Datum: 2026-08-09
- Bereich: domäne, datenbank
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

42 von 100 Meldungen der Coastal-Regatta 2026 waren vereinsgemischte Boote. Alle zeigten auf Board, Dashboard und Zeitplan dieselbe Zeile „Renngemeinschaft" und waren im selben Rennen nicht unterscheidbar. Gastruderer tragen ihren Verein als Freitext; 46 freie Schreibweisen standen 58 Datensätzen gegenüber. Es gab keine Regel, die aus „Akademischer Ruderverein Kiel e.V." ein „ARV Kiel" macht, und Kürzungen wie „Ruderclub → RC" standen als Wissen über eine Sportart im Code – der Zweig geht aber als Merge-Request an das Upstream-Team lambda9, und ready2race ist keine Rudersoftware.

## Entscheidung

1. **Anzeigen tragen die Vereine der Athleten, nicht den meldenden Verein.** `ClubComposition` (Backend, `app/club/boundary`) baut die Kette der tatsächlich getragenen Vereine in Bootsreihenfolge, als volle und als kurze Form. Der meldende Verein ist reine Verwaltung (Rechnung) und wird nirgends angezeigt. Die Anzeige-Abfragen joinen `CLUB` ein zweites Mal über `PARTICIPANT.CLUB`. Welchen Verein eine Person trägt, entscheidet allein `ClubComposition.clubWorn`; eine parallel gewachsene Kopie im Dashboard wurde entfernt.
2. **Die Crew-Reihenfolge ist in allen Abfragen fest** (`NAMED_PARTICIPANT.NAME`, `LASTNAME`, `ID`), sonst mischte Postgres die Kette bei jedem Poll neu.
3. **Kürzel sind gepflegte Daten, geschlüsselt über den normalisierten Namen.** Tabelle `club_short_name` (`V202608091200`) hat `name_key` als Primärschlüssel, erzeugt von `ClubNameKey` (Rechtsform, Gründungsjahr, Trenner abgezogen) – ohne Fremdschlüssel auf `club`, weil 29 von 46 Gastvereinen gar keinen Datensatz haben. `ClubNameKey` bleibt bewusst fest einkompiliert: er ist Primärschlüssel der Kürzel, eine Regeländerung ließe sie verwaisen.
4. **Kürzungsregeln liegen in `club_name_rule`** (`V202608091300`): `kind` ∈ ABBREVIATION, REMOVE_TERM (mit Literal), REMOVE_YEARS, REMOVE_BRACKETED (Zeile vorhanden = Schalter aktiv), `sort_order` mit Reorder-Endpunkt. Wortpaare und Streichliste, keine regulären Ausdrücke. Regeln wirken nur auf die Kurzform, nie auf `ClubNameKey`.
5. **Die Migration liefert nur, was für jede Sportart gilt** (Rechtsformen, Schalter). Die elf Ruder-Abkürzungen kommen als Seed `docs/seeds/seed-club-name-rules-rowing.sql`.
6. Pflege über eine eigene Seite unter Stammdaten und ein Feld im Vereinsdialog (schreibt in denselben Store, eine Umbenennung nimmt das Kürzel mit); Rechte `ReadClubGlobal`/`UpdateClubGlobal`, kein neues Privileg (ADR-0010).
7. Karten entscheiden Kurz/Lang/Crew über ihre eigene Breite (Container-Query); die Crew wird erst ab 1440 px angefordert. Urkunde und Siegerehrungsbogen drucken die volle Kette ohne Kürzung (`ClubComposition.printedLine`), Umbruch an Vereinsgrenzen vor dem Rendern, gemeinsam für PDF und DOCX.
8. `event.mixed_team_term` bleibt für Startlisten und Ergebnisausgabe bestehen.

## Verworfene Alternativen

- Kollektiv-Label „Renngemeinschaft" in allen Anzeigen: macht Boote im selben Rennen ununterscheidbar.
- Frontend-Heuristik `shortClubName` samt Tabellen: zwei Kopien der Regel wären auseinandergelaufen (`e4e9b14e`).
- Kürzel als Spalte an `club` oder Fremdschlüssel auf `club`: schließt die Gastvereine ohne Datensatz aus.
- Kompilierte Abkürzungslisten im Kern (`e15ebf97`): Sportart-Wissen gehört nicht in ein Produkt, das an alle Sportarten geht.
- Reguläre Ausdrücke in der Oberfläche: ein Tippfehler zerlegt alle Vereine, ein Muster kann den Server hängen.
- Eigene Einstellungstabelle für die Schalter: die Regeltabelle trägt sie als Zeilen.
- Handschalter auf dem Board, Vorschlagsliste der 46 Kurzformen, frei eingegebener Mannschaftsname je Meldung: verworfen.
- Automatische Erkennung von Abkürzungsvarianten („ARV Kiel"): bewusste Grenze, als Test festgeschrieben.
- Neues Privileg: landet nur an der Admin-Rolle.

## Konsequenzen

- Vereinsgemischte Boote sind unterscheidbar; die Kette kann lang werden, daher gibt es die Kürzungsleiter der Livestream-Grafiken (ADR-0096) und die dreistufige Karte.
- Startlisten und Ergebnisausgabe zeigen weiter `mixed_team_term`; ein Nachzug ist vorgemerkt, nicht gebaut.
- Eine Ersatzperson steht in der Kette an ihrer Position nach der Aufstellung, nicht auf ihrem Bootsplatz; dokumentiert.
- Wer `ClubNameKey` ändert, muss `club_short_name` migrieren – die Schlüssel sind Daten.
- Der Ruder-Seed muss je Instanz eingespielt werden; ohne ihn werden Rudervereine nur um Rechtsform und Jahreszahl gekürzt.

## Quellen

- Commits: `0fe78720`, `a0774b73`, `3563314e`, `e4e9b14e`, `0551de10`, `08bfe0e4`, `489db085`, `3b770ece`, `95534763`, `edcfaafa`, `8c0c041a` (Vereinskette); `adc3dc0c`, `4e8ffdd8`, `87f45d2b`, `e15ebf97`, `f5bc34ef`, `815fe879`, `58310aa4`, `69573ed7` (Kürzel und Regeln)
- Migrationen: `V202608091200__club_short_names.sql`, `V202608091300__club_name_rules.sql`
- Code: `backend/.../app/club/boundary/ClubComposition.kt`, `ClubNameKey.kt`; Seed `docs/seeds/seed-club-name-rules-rowing.sql`
- Specs: `docs/superpowers/specs/2026-08-09-vereinskette-statt-renngemeinschaft-design.md`
- Verwandte ADRs: [ADR-0025](0025-vereine-teilnehmer-scope-own-stammverein.md), [ADR-0010](0010-privilegien-action-resource-scope.md), [ADR-0051](0051-urkunden-lueckentext-pdf-word-vorlagenpakete.md), [ADR-0079](0079-siegerehrungsbogen-und-ergebnisliste-ein-generator.md), [ADR-0081](0081-kurzbezeichner-kennung-kuerzel-sportneutral.md), [ADR-0096](0096-livestream-grafiken-designsystem-regie-board.md), [ADR-0101](0101-sprach-und-commit-regeln-keine-herkunftsangaben.md)
