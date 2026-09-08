# ADR-0072: Ergebnisse nach Wertungskategorien mit einer Rechenstelle; Wertung je Partie; der Urkundenplatz bleibt wettkampfweit

- Status: angenommen
- Datum: 2026-08-09
- Bereich: domäne, backend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Wertungskategorien hängen seit ADR-0043 an der Meldung, hatten aber keine Reihenfolge an der Veranstaltung. Wer in der Breitensportwertung Erster war, fand sich als Sechster in einer Rangliste wieder; öffentliche Ergebnisse, Dashboard, Board und Platzierungsansicht zählten jede für sich. Zehn Tage später zeigte sich ein zweites Zählproblem: Eine Runde ließ sich nur als Ganzes werten, bei getrennt gefahrenen Finals begann Finale B bei Platz 3, zwei Partie-Sieger wurden geteilter Erster, Ausgeschiedene sortierten vor Finale A.

## Entscheidung

1. **Eine Rechenstelle.** `RatingCategoryRanking.groupAndRank` (`app/ratingcategory/boundary`) ist die einzige Stelle, die gruppiert und je Abschnitt ab 1 zählt (Gleichstand 1/1/3). Boote ohne Wertung stehen am Ende ihres Abschnitts, „Ohne Wertungskategorie" immer zuletzt, leere Abschnitte entfallen. Ein laufender Lauf bleibt ungruppiert.
2. **Die Reihenfolge hängt an der Veranstaltung**, nicht an der Kategorie: `event_rating_category.sort_order` (`V202608091510`, Backfill alphabetisch). Nie konfigurierte Kategorien sortieren hinter allen konfigurierten (`Int.MAX_VALUE`), untereinander nach Name.
3. **DTOs bleiben flach**; ein gemeinsamer Frontend-Helfer gruppiert. Das Backend liefert keine verschachtelten Abschnitte.
4. **Der Urkundenplatz bleibt wettkampfweit.** `computeCompetitionPlaces` ist unverändert; die Urkunde erhält den optionalen Platzhalter `RATING_CATEGORY` und die Option „Wertungskategorie drucken" (Vorgabe: aus). Platzgrenzen für Urkunden gelten je Wettkampf, nicht je Kategorie.
5. **Wertung je Partie (`PER_MATCH`).** `CompetitionSetupPlacesOption` kennt seit 2026-08-20 den Wert `PER_MATCH`: Der Platz ist der Platz in der Partie, die Partie steht daneben (Platzierungsansicht, PDF, CSV-Spalte). `RatingCategoryRanking` führt die Partie als eigene Dimension: Partien nacheinander in Setup-Reihenfolge, Zählung je Partie neu ab 1, Gleichstand nur innerhalb einer Partie, Boote ohne Partie hinter allen Partien. Der Siegerehrungsbogen (ADR-0079) bildet Blöcke nach (Partie, Platz) mit Podiumsschnitt je Partie. Urkunden lesen den rohen Platz je Partie – der Sieger aus Finale B bekommt Platz 1 ohne Zusatz, so gemeint.
6. Die Partie-Wertung ging direkt gegen lambda9/main (#108, #110) und war am 2026-08-21 produktiv.

## Verworfene Alternativen

- Fehlende Sortierposition mit 0 belegen: schob Altkategorien ganz nach oben (`e38ffad1`).
- Verschachtelte Abschnitte aus dem Backend: drei DTO-Umbauten und größere Nutzlast am Steg.
- Ordnung an der globalen `rating_category`: dieselbe Kategorie hat je Regatta eine andere Bedeutung.
- Änderung von `computeCompetitionPlaces` oder eine zweite Platzspalte in der Platzierungs-CSV: bricht bestehende Auswertungen.
- Kategorieplatz auf der Urkunde als Standard: Urkunden werden mit denen aus zehn Jahren verglichen.
- Eigene Gruppierung im Siegerehrungsbogen: Dopplung, am 10.08. auf `groupAndRank` zusammengeführt.

## Konsequenzen

- Jede neue Anzeige, die Plätze zeigt, muss über `groupAndRank` gehen; eine eigene Zählung gilt als Fehler.
- Unkonfigurierte Kategorien fallen nicht auf, sie stehen hinten; Veranstalter müssen `sort_order` bewusst pflegen.
- Testkatalog L16/L17: Die Platzgrenze je Kategorie (L17) ist als Frage offen geblieben.
- Ein Gleichstand innerhalb eines Laufs ist unmöglich (`place_unique_in_match`); Gleichstände gibt es nur in Wettkampf-Platzierungen (`EQUAL`).
- Bei `PER_MATCH` steht in Exporten eine Partie-Spalte; wer Dateien weiterverarbeitet, muss sie kennen.

## Quellen

- Commits: `e402f457`, `d5ad6bb4`, `3401b820`, `e38ffad1`, `4969aed9`, `5c208a26` (Wertungskategorien); `041b3401`, `80395f36` (PER_MATCH)
- Migrationen: `V202608091510__rating_category_sort_order.sql`
- Code: `RatingCategoryRanking.groupAndRank`, `CompetitionSetupPlacesOption.PER_MATCH`, `TeamPlacement`
- Specs: `docs/superpowers/specs/2026-08-09-ergebnisse-nach-wertungskategorien-design.md`, `docs/superpowers/specs/2026-08-05-testkatalog-crf-2026.md` (L16, L17); Seed `docs/seeds/seed-block-l-wertungskategorien.sql`
- Verwandte ADRs: [ADR-0043](0043-wertungskategorien-je-meldung.md), [ADR-0029](0029-durchfuehrung-laeufe-startnummern-platzierung.md), [ADR-0051](0051-urkunden-lueckentext-pdf-word-vorlagenpakete.md), [ADR-0079](0079-siegerehrungsbogen-und-ergebnisliste-ein-generator.md)
