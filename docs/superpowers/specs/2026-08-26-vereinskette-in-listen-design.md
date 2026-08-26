# Vereinskette in den Listen — der Nachzug

**Datum:** 26.08.2026
**Vorgänger:** `2026-08-09-vereinskette-statt-renngemeinschaft-design.md`
**Belegte Migrationsnummern:** keine — nur Sichten in `afterMigrate.sql`

## Anlass

Aus dem Betrieb, 26.08.2026:

> Ich konnte jetzt zwar auch Personen aus anderen Vereinen finden und ins Boot packen, leider
> werden die dann aber nur unter dem Hauptverein angezeigt. […] Das hat funktioniert. Aber es wird
> leider nicht als Renngemeinschaft angezeigt.

Der Schalter ist der richtige (`event.cross_club_registration`, V202608142000), die Meldung
entsteht auch — angezeigt wird sie trotzdem unter dem meldenden Verein. Weder eine Vereinskette
noch das alte pauschale „Renngemeinschaft".

## Zwei Ursachen, die zusammenfallen

**1. Die Listen waren nie umgestellt.** Der Entwurf vom 09.08.2026 nahm Startlisten, Ergebnisse
und Meldeansicht ausdrücklich aus („möglicher Nachzug im Laufe der Woche"). Sie blieben bei
`singletonOrFallback(clubs, mixedTeamTerm)`.

**2. Diese Ableitung kannte nur Gastruderer.** Sie bildete die Menge aus
`participant.external_club_name`:

```kotlin
singletonOrFallback(participants.map { it.externalClubName }.toSet(), mixedTeamTerm)
```

Für ein Boot aus mehreren **gepflegten** Vereinen steht dort bei jeder Person `null`. Die Menge ist
damit einelementig, gilt als eindeutig — und die Anzeige bekommt `null` zurück und fällt auf
`team.clubName` zurück, den meldenden Verein. „Renngemeinschaft" erschien nur, wenn im Boot
*Gastruderer verschiedener Freitext-Vereine* saßen.

Solange die vereinsübergreifende Meldung nicht existierte, fiel das nicht auf: Ein Boot aus zwei
Vereinen entstand nur über Gastruderer. Seit V202608142000 ist der Normalfall genau der andere.

## Umfang

Umgestellt werden die vier Anzeigen, die der Vorgänger ausgenommen hatte, plus die beiden Listen,
in denen eine *Person* unter dem falschen Verein stand:

| Anzeige | Zeile des Bootes | Verein je Person |
|---|---|---|
| Meldeansicht / Meldeergebnis-PDF | Kette | eigener Verein statt meldender |
| Startliste (PDF und CSV) | Kette | eigener Verein statt meldender |
| Ergebnisausgabe | Kette | eigener Verein statt meldender |
| Durchführung: Rundenansicht, Plätze, Plätze-CSV | Kette | — |
| Meldungen-Tabelle (Mannschaften) | — | eigener Verein statt meldender |
| Teilnehmerliste der Veranstaltung | — | eigene Spalte neben dem Melder |

Gekürzt wird in keiner davon: `ClubComposition.fullLine` (vormals `printedLine`), volle
Vereinsnamen, ` / ` als Trenner. Die Kurzform-Stufen bleiben dem Schiedsrichter-Board und der
Athleten-Anzeige vorbehalten, wo die Kartenbreite sie erzwingt.

Der meldende Verein verschwindet nicht — er steht in jeder dieser Listen weiterhin als
„gemeldet von" darunter. Anders als auf der Urkunde: dort hat er nichts verloren.

## Was dafür nötig war

### Der eigene Verein muss überhaupt ankommen

Der Verein einer Person hängt an einem *zweiten*, aliasierten `CLUB`-Join — der bisherige liefert
den meldenden Verein. Das Board hatte ihn seit dem 09.08. (`CompetitionMatchTeamRepo`), die Listen
nicht. Nachgezogen in `afterMigrate.sql`:

- `competition_registration_team_participant.club_name` — der eigene Verein der Person
- `participant_for_event.own_club_name` — daneben `club_name`, das der **meldende** Verein bleibt
  (die Rechnung folgt ihm)
- `substitution_view.participant_in_club_name` — ohne ihn ändert eine Ummeldung aus einem anderen
  Verein die Kette nicht

`registered_competition_team_participant.club_name` gab es bereits.

### Ein Feld statt sieben Zugriffe

`ParticipantForExecutionDto` bekommt `ownClubName`. Das Feld ist der Sammelpunkt: Meldeansicht,
Startliste, Meldungen-Tabelle und die An-/Abmelde-Auflösung gehen alle durch diesen Dto, und
`clubName` darin ist und bleibt der meldende Verein. Wo die Anzeige keine Vereinszeile hat
(An-/Abmeldung, QR-Zuordnung, „Mein Event"), steht `null` mit einem Kommentar, der sagt warum.

### Die Reihenfolge im Boot

Die Kette soll in Bootsreihenfolge stehen. Die Listen holen ihre Crew aber aus `array_agg` —
Postgres gibt sie in beliebiger Reihenfolge zurück, und die Ummeldungen hängen ihre Ersatzleute
hinten an. Ohne Ordnung stünde derselbe Verein je Ausdruck an anderer Stelle.

`ClubComposition.inBoatOrder` trägt dieselbe Ordnung wie `CompetitionMatchTeamRepo`: Rolle,
Nachname, Kennung. Sortiert wird einmal je Mannschaft; Kette und Mannschaftstabelle darunter teilen
sich die sortierte Liste, statt jede für sich zu sortieren (die Tabellen sortierten bisher nur nach
Rolle — bei zwei Ruderern derselben Rolle also gar nicht).

### Nicht mehr nullbar

`actualClubName` ist in beiden Durchführungs-Dtos jetzt Pflicht: `fullLine` fällt selbst auf den
meldenden Verein zurück, wenn niemand einen Verein trägt. Das `?? team.clubName` in vier
React-Komponenten entfällt — eine Rückfallebene, die zweimal an verschiedenen Stellen steht, ist
eine Rückfallebene zu viel.

## Tests

`ClubChainInListsTest` (echtes Postgres) prüft alle vier Anzeigen gegen **zwei** Mannschaften
derselben Veranstaltung:

- die bekannte Gastruderer-Mannschaft aus `seedClubChain` (sieben Personen, fünf Vereine, ein
  Verein doppelt, ein `N.N.`, ein meldender Verein, dem niemand angehört)
- neu `seedCrossClubTeam`: zwei Personen aus zwei **gepflegten** Vereinen, kein einziger
  Gastruderer — der Zuschnitt, an dem die alte Ableitung schwieg

Geprüft wird je Anzeige: alle Vereine vollständig, in Bootsreihenfolge, kein „Renngemeinschaft" —
und dass die Zeile jeder Person ihren eigenen Verein nennt.

## Offen

- **`event.mixed_team_term` hat keinen Leser mehr.** Der Begriff ist damit eine Einstellung ohne
  Wirkung; sie gehört entfernt (Spalte, Sichten, Dtos, Formularfeld). Getrennt vom Nachzug, damit
  ein Rückbau der Anzeige nicht an einer gefallenen Spalte hängt.
- **Challenge-Ansicht und Bedingungs-Export** nennen weiterhin den meldenden Verein
  (`CompetitionRegistrationRepo.getChallengeCompetitions`,
  `ParticipantRequirementService`). Beim Export ist das vertretbar — die Zeile geht an den Melder;
  beim Abgleich hochgeladener Namenslisten gegen Meldungen ist es eine offene Frage, welcher der
  beiden Vereine der richtige Schlüssel ist.
- **Die Bestätigungsmail an den Melder** listet die Personen des eigenen Vereins
  (`ParticipantForEventRepo.getByClub`). Ob dort auch die gemeldeten Personen fremder Vereine
  stehen sollen, ist eine Frage an die Praxis, keine Anzeigefrage.
