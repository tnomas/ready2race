# ADR-0079: Siegerehrungsbogen und Ergebnisliste aus einem Generator; Seitenpassung gemessen statt geschätzt; Auswahl per ID

- Status: angenommen
- Datum: 2026-08-09
- Bereich: backend, domäne
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Die Sprecherin braucht am Pult ein Blatt je Ehrung: Plätze 1–3 mit Namen, Heimatvereinen, Zeiten und Lauf, in Vorlesereihenfolge. Ergebnis-PDF und Siegerurkunde (ADR-0051) sind dafür ungeeignet. Die PDF-DSL (ADR-0020) legt mit `page { }` still nach, wenn der Inhalt nicht passt, und Vereinsketten (ADR-0071) brechen um. Zwei Tage später wurde zusätzlich ein Aushang mit Aufstellung, Zeiten und Kategorien gebraucht.

## Entscheidung

1. **Ein Modul `awardCeremony`** (`app/awardCeremony`, Logic/Service/Pdf getrennt), keine Migration. `POST …/pdf` mit Auswahl im Body, weil der Query-String zu lang würde; GET nimmt optional `competitionId`.
2. **Eine A4-Seite je Ehrung** (Wettkampf × Wertungskategorie). Gruppierung über `RatingCategoryRanking.groupAndRank` (ADR-0072), keine eigene Zählung; Standard-Ranking mit Gleichstand (1., 2., 2. – keine Bronze). Gedruckt wird der Laufzeitpunkt, kein Ehrungstermin (`ceremonyTime` bleibt `null`, die Zeile entfällt).
3. **Auswahl per ID:** Schlüssel `(competitionId, ratingCategoryId?)`; `null` heißt „Wettkampf gesamt". Zwei gleichnamige Kategorien wären per Name ununterscheidbar.
4. **Seitenpassung wird gemessen.** `AwardCeremonyPdf` setzt jede Seite als Probelauf vom großzügigsten Schritt der Größenleiter abwärts und liest `numberOfPages`; gedruckt wird der erste passende Schritt. Boden ist 8,5 pt; darunter eine Fortsetzungsseite mit vollem Kopf und „Fortsetzung", Umbruch nur zwischen Rangblöcken.
5. Vereine werden über `ClubNameKey` verglichen und in voller Kette gedruckt (`ClubComposition.printedLine`); Runden werden je Bogen nur einmal geladen.
6. **Ein Generator für zwei Dokumente.** Der Siegerehrungsbogen ist das interne Preset `ResultListOptions.ceremony`; Endpoint, Seiten und Legacy-Tests blieben unverändert, ein Page-by-Page-Äquivalenztest belegt das. Neuer `GET /event/{eventId}/resultList/pdf` mit Schaltern und As-of-Fußzeile; nur bestätigte Platzierungen werden gedruckt. Bei Wertung je Partie (`PER_MATCH`) bildet der Bogen Blöcke nach (Partie, Platz) mit Podiumsschnitt je Partie. Später ergänzt: Zeiten und Zeitstrafen im Export, bei DNF/DSQ leer (`a571084c`).

## Verworfene Alternativen

- Schriftgröße aus der Personenzahl (`ecce7348`): beim Bau widerlegt, die Beziehung ist nicht monoton.
- Weiterschrumpfen bis 7 pt (`e99cd177`): vom Pult nicht lesbar.
- Harter Abbruch bei Überlauf: Fortsetzungsseite stattdessen.
- Name als Auswahlschlüssel (`828dcc84`).
- Ehrungstermin aus freien Zeitplan-Slots raten; Wochentag in der Laufangabe (CLDR-abhängig).
- Ersatzleute auf dem Bogen: gehören ins Protokoll.
- Vorlagen-Design, öffentlicher Zugriff, DOCX-Ausgabe: nicht gebaut.
- Eigene Gruppierung im Bogen: Dopplung, am 10.08. aufgelöst.
- Rundenzeiten auf der Ergebnisliste: die Datenbasis kennt eine Endzeit je Boot.

## Konsequenzen

- Jede Seite wird mehrfach gesetzt, bevor sie gedruckt wird; die Erzeugung ist entsprechend teurer als ein einfacher Durchlauf.
- Änderungen an `groupAndRank` schlagen direkt auf den Bogen durch – gewollt.
- Der Handtest am Ausdruck (Testkatalog Block O) ist die einzige offene Lücke.
- Wer die Ergebnisliste erweitert, ändert das Preset des Siegerehrungsbogens mit; der Äquivalenztest ist die Bremse.

## Quellen

- Commits: `5617a4aa`, `9d9b9479`, `7e9f932c`, `ecce7348`, `e99cd177`, `0834283c`, `c7d0a20d`, `828dcc84`, `4969aed9`, `489c9266`, `9df653ee`, `5a48937d` (Siegerehrungsbogen); `7fd8cf22`, `a571084c` (Ergebnisliste); `80395f36` (Partie-Blöcke)
- Code: `app/awardCeremony/boundary/AwardCeremonyPdf.kt`, `AwardCeremonyLogic.kt`, `entity/ResultListOptions.kt`
- Specs: `docs/superpowers/specs/2026-08-09-siegerehrungsbogen-design.md`, `docs/superpowers/plans/2026-08-09-siegerehrungsbogen.md`
- Verwandte ADRs: [ADR-0020](0020-pdf-dsl-auf-pdfbox-mit-dokumentvorlagen.md), [ADR-0051](0051-urkunden-lueckentext-pdf-word-vorlagenpakete.md), [ADR-0071](0071-vereinskette-statt-renngemeinschaft.md), [ADR-0072](0072-ergebnisse-nach-wertungskategorien-und-partie.md)
