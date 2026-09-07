# ADR-0070: Aktivierung ruft zum Start (PREPARING), „Läuft" nur aus gemessenem oder bestätigtem Start; Zustand „Klärung" für strittige Läufe

- Status: angenommen
- Datum: 2026-08-09
- Bereich: domäne, datenbank
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Bis August 2026 trug `competition_match` einen Boolean `currently_running`. Fachlich bedeutete er immer „vom Schiedsrichter an den Start gerufen", die Oberfläche nannte ihn aber „Aktuell laufend". Die Athleten-Anzeige konnte einen aufgerufenen Lauf nicht von einem unterscheiden, der tatsächlich fährt, und leitete den Unterschied ad hoc aus `started_at` ab. Mit dem automatischen Feed-Abruf (ADR-0056) gab es erstmals einen zuverlässigen Sender für den Ist-Start, und ADR-0059 verlangte, dass der Laufzustand nur an einer Stelle abgeleitet wird.

Eine Woche später zeigte sich eine zweite Lücke: Ein Lauf mit Einspruch blieb dauerhaft `RUNNING` und hielt damit Livestream-Uhr, Board-Cursor und die Aktivierungskette (ADR-0064) fest.

## Entscheidung

1. **Aktivierung ist ein Zeitpunkt, kein Boolean.** Migration `V202608091400__match_activated_at.sql` ersetzt `currently_running` durch `activated_at timestamp` (Drop-Column, nicht rückwärtskompatibel). Wer einen Lauf „aktiv" setzt, ruft ihn nur zum Start; die API spricht von Aktivierung, nicht von „running".
2. **`RUNNING` entsteht ausschließlich aus einem Ist-Start.** `started_at` wird entweder vom Zeitnahme-Feed gestempelt (in `pollMatch` vor `applyRaceClockerRows`, wegen der Transaktions-Rollback-Falle) oder durch den Knopf „Läuft" im Schiedsrichter-Dashboard bestätigt. Der Knopf heißt bewusst „Läuft", nicht „Start". Ein Ist-Start wird nie aus der geplanten Startzeit abgeleitet.
3. **`PREPARING` ist ein neuer Wert in `MatchState`:** aktiviert (`activated_at` gesetzt) ohne `started_at`. Er war der einzige Eingriff in `deriveMatchState` (heute in `LiveDashboardLogic.deriveMatchState`) und eine begründete Ausnahme zur Regel „keine neuen Enum-Werte" aus ADR-0059. Jede Oberfläche liest `MatchState`; keine leitet selbst ab.
4. **Der Ort, an dem Crews fahren, heißt „Arena"**, nicht „Wasser" (`V202608091410__check_type_not_in_arena.sql`, Check-Typ `NOT_IN_ARENA`), siehe ADR-0041 und ADR-0081.
5. **Klärung ist ein echter Zustand.** `V202608171200__match_clarification.sql` ergänzt `clarification_since` und `clarification_reason` (Check: beide gesetzt oder beide leer, Grund nicht leer). Regel: in Klärung ⇔ `clarification_since is not null`. `CLARIFICATION` ist ein eigener Zweig ganz oben in `deriveMatchState` und schlägt die Aktivierung; `activated_at` bleibt unangetastet. Aufheben, Beenden und Zurücksetzen leeren beide Spalten; Deaktivieren lässt die Klärung stehen; Setzen auf einen beendeten Lauf gibt 409. Es gibt keine Historie und keinen Zwang zur Klärung.
6. **Ein strittiger Lauf blockiert nichts.** Öffentliche Anzeigen verlieren ihn über den SQL-Filter in `getRunningMatches`, die Kette über `ChainSlot.matchInClarification`; Zeitnahme-Abfragen filtern nicht (Zeiten laufen weiter ein). Ergebnisse gehen nach der bestehenden Freigaberegel (ADR-0045) als „vorläufig · in Klärung" hinaus. Das Sprecher-Board erhält strittige Läufe nur auf ausdrückliche Bestellung (`includeClarification=true`); `clarification_reason` bleibt intern.
7. Kein neues Privileg: Klärung setzen und aufheben laufen über `authenticateAny` mit den vorhandenen Dashboard- und Event-Rechten.

Später ergänzt: `false_start_at` als weiterer Stempel (2026-09-02, ADR-0089).

## Verworfene Alternativen

- Ist-Start aus der geplanten Startzeit ableiten: „eine Messung, die niemand gemessen hat".
- Eigene Zustandsableitung je Oberfläche: genau die Inkonsistenz, die ADR-0059 beendet hat.
- Beschriftung „Start" für den Bestätigungsknopf: hätte suggeriert, der Knopf startet das Rennen.
- Klärung als Ablesefeld statt Enum-Wert: hier ist das Durchfallen in `else`-Zweige ausdrücklich erwünscht, weil ein strittiger Lauf überall wie „nicht laufend" behandelt werden soll; bewusste Umkehr der Regel vom 07.08.
- Dritte Spalte `clarification_resolved_at` oder eine Klärungshistorie: als Ballast verworfen, Schiedsrichter-Notizen am Boot genügen.
- Eingriff in `PublicResultsVisibility` oder in die `updated_at`-Sortierung der Ergebnisliste: hätte alle Ergebnisse betroffen.
- Naiver Fix für „Mein Event": ein strittiger Lauf landete sonst unter „Dein nächster Lauf" mit Countdown, was schlimmer wäre als der jetzige Fehler; bewusst offen gelassen.
- Änderungen an `matchUnderway`, `modeFor` und `applyRaceClockerRows`: müssen weiter auf die Aktivierung hören.

## Konsequenzen

- Jede Anzeige, die „läuft" sagt, meint jetzt einen gemessenen oder bestätigten Start. Ein aufgerufener Lauf wird im Zeitplan-Rail grün markiert, weil sonst das Fenster am Start unmarkiert bliebe.
- Deaktivieren pausiert die Feed-Automatik (`raceclocker_auto_paused_at`); der Freigabe-Knopf ist auch im Dashboard.
- Die Migration ist nicht rückwärtskompatibel; Datenbanken mit `currently_running` müssen durch V202608091400.
- „Mein Event" führt einen strittigen Lauf weiter unter „läuft gerade" – bekannte, bewusst offene Lücke.
- Neue `when`/`switch`-Zweige über `MatchState` müssen `PREPARING` und `CLARIFICATION` behandeln; Tests zu `deriveMatchState` sind der Ort, an dem das geprüft wird.
- Der Feed-Abruf ordnet weiter über `activated_at` zu, auch für Läufe in Klärung.

## Quellen

- Commits: `79e3f230`, `c4cae65c`, `b733983f`, `2f161fe6`, `1b0c9d53`, `c5d5daa0`, `05a06050`, `a104ece7`, `245f37dd`, `d4eb30f9`, `39cc9d6f` (activated_at, PREPARING, Arena); `906eb2c6`, `eb7a05e6`, `88b46065`, `1751f4fc`, `a71df501`, `0a7d3f41`, `a64b4185`, `feb002c7` (Klärung); `af6b4476` (includeClarification)
- Migrationen: `V202608091400__match_activated_at.sql`, `V202608091410__check_type_not_in_arena.sql`, `V202608171200__match_clarification.sql`
- Code: `LiveDashboardLogic.deriveMatchState`
- Specs: `docs/superpowers/specs/2026-08-09-laufzustand-arena-design.md`, `docs/superpowers/specs/2026-08-17-lauf-klaerung-design.md`, `docs/superpowers/plans/2026-08-17-lauf-klaerung.md`
- Verwandte ADRs: [ADR-0059](0059-laufzustand-eine-ableitung.md), [ADR-0056](0056-automatischer-feed-abruf-feed-ist-wahrheit.md), [ADR-0041](0041-checkin-checkout-ereignisprotokoll-arena.md), [ADR-0064](0064-aktivierungskette-ganzer-zeitplan.md), [ADR-0045](0045-oeffentliche-ergebnisse-live-tab-freigabe.md), [ADR-0081](0081-kurzbezeichner-kennung-kuerzel-sportneutral.md), [ADR-0089](0089-startsequenzen-serverseitig-fehlstart.md), [ADR-0098](0098-sprecher-board-drei-spalten-dashboard.md)
