# Der Name einer Mannschaft schlägt die Vereinskette

**Datum:** 26.08.2026
**Vorgänger:** `2026-08-09-vereinskette-statt-renngemeinschaft-design.md`,
`2026-08-26-vereinskette-in-listen-design.md`
**Belegte Migrationsnummern:** `V202608261300`

## Anlass

Die Vereinskette beantwortet die Frage des Schiedsrichters: *Welche Boote sind das?* Sie beantwortet
nicht die des Meldenden. Eine Renngemeinschaft führt einen **Namen**, unter dem sie ausgeschrieben,
aufgerufen und geehrt wird — „RG Eckernförde/Kappeln“ —, und der ist kürzer und anders geschrieben
als die Aneinanderreihung ihrer Vereine („Ruderverein Eckernförde / Ruderclub Kappeln“).

Der Entwurf vom 09.08. hatte das ausdrücklich offengelassen: „ein frei eingegebener
Mannschaftsname je Meldung“ stand unter „Nicht in diesem Entwurf“, mit dem Hinweis, dass
`competition_registration.name` bleibt, was es ist.

## Entscheidung

**Der vergebene Name schlägt die Kette überall.** Nicht „zusätzlich zu“, nicht „auf manchen
Anzeigen“: Wer einen Namen vergibt, hat sich etwas dabei gedacht, und ein Boot, das auf dem Board
anders heißt als auf der Urkunde, ist schlimmer als eines ohne Namen.

Die Rückfallkette lautet damit durchgehend:

```
vergebener Name  →  Vereine der Crew als Kette  →  meldender Verein
```

Zwei Dinge bleiben davon unberührt:

- **Die Crew behält ihre Vereine.** Der Name benennt das Boot, er verschweigt nicht, wer darin
  sitzt: Mannschaftstabellen, Urkunden-Crewzeilen und Siegerehrungsbogen nennen weiterhin je Person
  ihren Verein.
- **Der meldende Verein bleibt, wo er war** — als „gemeldet von“ unter der Zeile, und in den
  Datensätzen, weil die Verwaltung ihn braucht.

## Eine zweite Spalte, nicht die Übernahme der vorhandenen

`competition_registration.name` ist der automatische Zähler („#1“, „#2“), den
`CompetitionRegistrationService` beim Anlegen vergibt und beim **Löschen der Reihe nach neu**
vergibt (`:253` und `:611`). Eine Handeingabe darin wäre beim nächsten gelöschten Boot desselben
Vereins im selben Wettkampf still überschrieben — der Fehler fiele Wochen später auf und niemand
wüsste, wohin der Name verschwunden ist.

Deshalb `display_name` daneben, und der Zähler bleibt unangetastet.

## Wo der Name eingegeben wird

Ein Feld, zwei Masken — beide gehen durch `CompetitionRegistrationTeamUpsertDto`:

- die Meldemaske des Vereins (`EventRegistrationTeamsForm`), vor der Crew, weil er die Mannschaft
  benennt statt ihre Besetzung zu beschreiben
- der Meldungs-Dialog des Ausrichters (`CompetitionRegistrationDialog`)

Im Dialog steht das Feld nur bei Booten mit **mehr als einem Platz**: Ein Einer fährt unter dem
Verein seines Ruderers, und eine Renngemeinschaft aus einer Person gibt es nicht. Die Meldemaske
braucht diese Prüfung nicht — sie zeigt Mannschaftswettkämpfe ohnehin getrennt.

Angezeigt wird der Name zusätzlich als eigene Spalte in der Mannschaftstabelle des Ausrichters,
damit er ohne Öffnen des Dialogs sichtbar ist.

**Leer ist der Normalfall und heißt „kein Name“** — auch eine Eingabe aus lauter Leerzeichen. Sonst
verdeckte ein versehentliches Leerzeichen die Vereinskette durch nichts. Getrimmt wird an drei
Stellen, weil drei Wege hineinführen: die beiden Dienste beim Schreiben und `ClubComposition` beim
Lesen; der Leseweg deckt auch Bestandsdaten ab, die auf anderem Weg entstanden sind.

Gedeckelt auf **80 Zeichen**. Die Kette bricht an ihren ` / `-Grenzen um; ein Name hat keine und
fiele auf den Umbruch an Wortgrenzen zurück. 80 Zeichen sind rund das Doppelte des längsten
Vereinsnamens der echten Meldedaten und passen auf der Urkunde noch in zwei Zeilen.

## Umsetzung

Die Regel steht an **einer** Stelle — `ClubComposition.of` und `fullLine` nehmen den Namen als
dritten Parameter und geben ihn zurück, wenn er gesetzt ist. Bei `of` in **beiden** Schreibweisen
(`full` wie `short`): Die Stufen des Schiedsrichter-Boards hängen an der Kartenbreite, und dasselbe
Boot darf auf dem Telefon nicht anders heißen als am Laptop. Ein Name wird nie gekürzt — er ist
bereits kurz.

Damit blieb nur, `display_name` bis zu den zehn Aufrufern zu tragen:

| Weg | Woher |
|---|---|
| Urkunde, Siegerehrungsbogen, Ergebnisse, Rundenansicht, Plätze, Plätze-CSV | `CompetitionMatchTeamWithRegistration.displayName` (View `competition_match_team_with_registration`) |
| Startliste (PDF und CSV) | `startlist_team.display_name` |
| Meldeansicht / Meldeergebnis-PDF | `registered_competition_team.display_name` |
| Athleten-Anzeige | `CompetitionMatchTeamRepo`, drei Abfragen |
| Schiedsrichter-Board | `LiveDashboardRepo` |

Sechs der zehn hängen am selben Datensatz — die Platzberechnung speist Urkunde, Bogen, Ergebnisse
und die Durchführungsansichten gemeinsam.

## Tests

Je Anzeige eine Zusage, dort wo die Anzeige schon geprüft wird — nicht in einer eigenen Datei, die
neben den bestehenden Zusagen zur Kette herliefe:

- `ClubCompositionTest` — die Regel selbst: Name schlägt Kette in beiden Schreibweisen; leer und
  aus Leerzeichen ist kein Name; der Name schlägt auch den meldenden Verein
- `ClubChainInListsTest` — Meldeansicht, Startliste, Ergebnisse, Rundenansicht: der Name steht da,
  die Kette nicht mehr, und die Crew behält ihre Vereine
- `ClubChainInDisplaysTest` — Athleten-Anzeige (beide Schreibweisen) und Urkunde
- `LiveDashboardClubChainTest` — Schiedsrichter-Board, beide Stufen
- `AwardCeremonyLogicTest` — was die Sprecherin vorliest

## Nicht in diesem Entwurf

- **Ein Namensvorschlag aus den Vereinen der Crew** („RG Eckernförde/Kappeln“ aus den Kurzformen
  zusammengesetzt, als Vorbelegung des leeren Feldes). Verlockend, aber die Kurzformen sind für
  Bildschirmbreite gepflegt, nicht für Renngemeinschaftsnamen — und ein Vorschlag, den niemand
  prüft, steht am Ende auf der Urkunde.
- **Ein Name je Verein statt je Meldung.** Eine Renngemeinschaft, die zwei Boote meldet, trägt
  ihren Namen heute zweimal ein. Erst wenn das im Betrieb stört, lohnt eine eigene Verwaltung.
