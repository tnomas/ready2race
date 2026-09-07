# ADR-0081: Kurzbezeichner überall: Kennung plus Kürzel; Startnummer ist die Bahn; sportneutrale Begriffe und deutsche Umlaute

- Status: angenommen
- Datum: 2026-08-07
- Bereich: domäne, frontend, api, prozess
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Am Steg zählt, welches Rennen dran ist, nicht sein voller Titel; die Kennung allein ist nur eine Nummer. `competition_match_team.start_number` ist eindeutig je Lauf, doch nur die Athletenanzeige nannte sie `lane`/„Bahn", und im Ergebnisblock stand an derselben Stelle der Platz. Mehrere Sitzungen schrieben deutsche Kommentare mit ae/oe/ue, und Begriffe wie „auf dem Wasser" oder „Ruderclub" sind Sportwissen – das Produkt ist keine Rudersoftware und der Zweig geht an das Upstream-Team.

## Entscheidung

1. **Kennung und Kürzel sind zwei Felder.** `competition_properties.identifier` ist die Rennnummer (i18n „Kennung", z. B. `11`, `16 - NC`; Pflicht, sortiert die Liste). `short_name` ist das Bootsklassen-Kürzel (i18n „Kurzname", z. B. `CM 4x+`; optional). Sagt jemand „Kürzel", ist `short_name` gemeint. `competitionLabelName()` baut `identifier | name`, `competitionTag()` baut `17 CM 4x+`.
2. **Zeitplan und Wettkampfliste führen mit dem Kurzbezeichner.** Die Endpunkte tragen `competitionIdentifier` und `competitionShortName`. Die Wahl Lang/Kurz liegt in `frontend/src/components/event/shortLabels.ts`, dreiwertig gespeichert: unset = „die Oberfläche entscheidet" (Board kurz, Zeitplan lang); ein Klick gilt ab dann für beide. Der Zustand reist per `window`-Event, weil `storage` nur in anderen Tabs feuert. Außerhalb der Tabellen bleibt der volle Text.
3. **Startnummer und Bahn sind dieselbe Zahl.** Es gibt eine Zahl je Boot und Lauf: `start_number`, auf dem ganzen Pfad `startNumber` (Kotlin-DTOs, `documentation.yaml`, generierte Typen, i18n „Nr."), nicht nullbar. Das Wort „Bahn" ist verschwunden; ein Bahnentausch ist ein Tausch der Startnummern im Dialog „Partie bearbeiten". Der öffentliche Endpoint ist unversioniert, seine einzigen Verbraucher liegen im Repo.
4. **Sportneutrale Begriffe.** „Arena" statt „Wasser" (ADR-0041, ADR-0070); Kürzungsregeln als Daten statt Ruder-Abkürzungen im Kern (ADR-0071); „Betrieb ab" statt „Akkreditierung" (ADR-0085).
5. **Deutsche Texte mit echten Umlauten** in Kommentaren, Testnamen und Commit-Texten des Forks (ä, ö, ü, ß; nie ae/oe/ue/ss). Siehe ADR-0101 für die vollständigen Sprachregeln.

## Verworfene Alternativen

- Feld `lane` behalten und nur die Anzeige ändern: „dieselbe Falle mit umgekehrtem Vorzeichen".
- Separater Bahn-Begriff neben der Startnummer: zwei Namen für eine Zahl.
- Platzhalter-Logik (`pendingSlotOrNull`) um Board-only-Felder erweitern: die Rohzeile bleibt daneben (`a7681381`).
- Ruder-Abkürzungen im Produktkern (`e15ebf97`): Sportwissen gehört in Daten.

## Konsequenzen

- Wer ein Rennen nennt, nutzt `competitionTag()`; eigene Verkettungen von Nummer und Name gelten als Fehler.
- Weil `startNumber` nicht nullbar ist, muss jeder Lauf-Team-Datensatz eine Nummer haben, bevor er in eine öffentliche Antwort darf.
- Die dreiwertige Speicherung bedeutet: Ein einmal gesetzter Schalter überschreibt die Oberflächen-Vorgabe dauerhaft auf diesem Gerät.
- Neue Fachbegriffe müssen die Sportart-Probe bestehen: Gilt der Begriff für Kanu, Triathlon und Laufen gleichermaßen?

## Quellen

- Commits: `3563e2b2`, `8438c853`, `28d10b18`, `a7681381`, `634dfde3`, `bc8ef333` (Kurzbezeichner); `e70d288b`, `66a70461`, `85714b09`, `8c9a16fd`, `cb685df6`, `558e981f`, `a104ece7`, `e15ebf97` (Namensregeln)
- Code: `frontend/src/components/event/shortLabels.ts`
- Specs: `docs/superpowers/specs/2026-08-09-athletenanzeige-27zoll-design.md` („Entscheidung 1")
- Verwandte ADRs: [ADR-0022](0022-veranstaltungsstruktur-event-tage-wettkaempfe.md), [ADR-0029](0029-durchfuehrung-laeufe-startnummern-platzierung.md), [ADR-0041](0041-checkin-checkout-ereignisprotokoll-arena.md), [ADR-0055](0055-feed-schluessel-lauf-team-id-bahn-aus-rank.md), [ADR-0070](0070-laufzustaende-preparing-running-klaerung.md), [ADR-0071](0071-vereinskette-statt-renngemeinschaft.md), [ADR-0078](0078-board-system-ersetzt-info-ansichten.md), [ADR-0085](0085-betrieb-ab-je-veranstaltungstag.md), [ADR-0101](0101-sprach-und-commit-regeln-keine-herkunftsangaben.md)
