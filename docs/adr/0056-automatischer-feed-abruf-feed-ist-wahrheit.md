# ADR-0056: Automatischer Feed-Abruf als Scheduler-Job; Handeingabe pausiert je Lauf; der Feed ist Quelle der Wahrheit; Allowlist DNS/DNF/DQ; keine Redirects

- Status: angenommen
- Datum: 2026-08-05
- Bereich: backend, datenbank, betrieb
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Bis Anfang August kamen Ergebnisse aus dem Zeitnahme-Feed nur per Knopfdruck je Lauf; der Ist-Start wurde gar nicht übernommen. Für den Regattatag sollten Zeiten ohne Zuruf ankommen, ohne Handeingaben der Schiedsrichter zu überschreiben. Drei Eigenheiten des Feeds mussten dabei sauber behandelt werden: Er hat kein Statusfeld (die Spalte „Result" trägt Fortschrittstexte wie „Not started" neben Zeiten und Ausfällen), nach einem Wellen-Neustart meldet er `00:00:00.0`, und eine im Dienst gelöschte Einzelzeit blieb in ready2race für immer stehen. Ein Sicherheits-Review vor der Regatta fand außerdem SSRF über Open-Redirect als Lücke.

## Entscheidung

1. **Ein Scheduler-Job pollt je Veranstaltung.** In `Application.kt` läuft ein Herzschlag über `scheduleDynamic` (1 s aktiv, 30 s Leerlauf), der `RaceClockerPollService.pollTick` ruft. Konfiguration an `event` (Migration V202608071600): `raceclocker_auto_pull` (Vorgabe aus), `raceclocker_interval_active_seconds` (5), `raceclocker_interval_upcoming_seconds` (60), `raceclocker_watch_before_minutes` (15), `raceclocker_watch_after_minutes` (120); Untergrenzen per `coerceAtLeast` im Code, nicht nur im Formular. Kein Wettkampf-Override der Takte.
2. **Ein Schreibpfad für Knopf und Job:** `applyRaceClockerRows`. Der Job schreibt in einer eigenen Transaktion, liest Runden einmal je Wettkampf und Tick, bestimmt die Tick-Rate nach dem Durchlauf; ein Defekt trifft nur den eigenen Lauf (`competition_match.raceclocker_poll_error`, auch Defekte als `INTERNAL_ERROR`). Ein Fingerabdruck im Speicher verhindert Schreibrauschen bei unverändertem Feed.
3. **Handeingabe pausiert den Abruf je Lauf.** Jeder Handschreibpfad ruft `pauseRaceClockerAutoPull(matchId)` (setzt `competition_match.raceclocker_auto_paused_at`; No-Op ohne Zeitnahmesystem). Die Pause wird ein zweites Mal in der Schreibtransaktion geprüft. „Automatik fortsetzen" verwirft den Fingerabdruck, damit der nächste Tick wirklich schreibt. Pausierte Läufe bleiben markierte Kandidaten: Ihr Zustand zählt für den Takt, ihr Schreiben wird übersprungen (`29d9ba75`).
4. **Der Feed ist Quelle der Wahrheit, solange der Pull aktiv ist.** Trägt keine zugeordnete Zeile Startzeit oder Ergebnis (Restart-Reset, bewusst die Umkehrung von `RaceClockerPollLogic.startDetected`), werden Zeit, Platz, Ausfall und Strafe der im Feed vorhandenen Boote gelöscht und `started_at` geleert; Bahnen und `activated_at` bleiben. Während die Welle läuft, nimmt der Pull bei Zeilen ohne Ergebnis Zeit, Platz und Strafe zurück; handeingetragene Disqualifikationen (`failed`) überleben. Ein Feed, der jede zugeordnete Zeile ohne Start und ohne Ergebnis zeigt, nimmt auch einen gemessenen Start zurück; ein leerer Feed ist keine Rücknahme.
5. **Allowlist statt Blocklist:** `noResultReason` erkennt genau DNS, DNF und DQ (den Dropdown-Inhalt des Zeitnehmers, Schreibweise egal). Jeder andere Text heißt „kein Ergebnis". Übersprungene Zeilen bleiben unangetastet. `startDetected` zählt DNS nicht als Startbeleg (der einzige Grund, der vor dem Rennen feststeht), DNF und DQ dagegen schon.
6. **Der Job beendet nie, aktiviert keine abgesagten Slots und schreibt keine bevorstehenden Läufe.** Ein erkannter Start aktiviert den Lauf und stempelt `started_at` in `pollMatch` vor `applyRaceClockerRows` (Transaktions-Rollback-Falle); gemessene Starts werden auf den Tag gestempelt, der der Abrufzeit am nächsten liegt. Für nicht aktivierte Läufe gibt der Poll außer der Aktivierung nichts frei; der manuelle Knopf geht bewusst darüber hinweg.
7. **Keine Weiterleitungen:** `RaceClockerFeed.kt` setzt `followRedirects = false`; der HTTP-Engine wird injiziert und je Abruf geschlossen. Migration V202608101120 normalisiert gespeicherte Adressen auf die Apex-Form, damit der Host-Vergleich auf einem String greift.
8. **Rundenzeiten** aus bis zu vier frei benannten Split-Spalten landen in `competition_match_team_lap` (V202608110100), per Upsert über (Boot, Position) mit stabilem `created_at`; entfernte Marken werden gelöscht.

## Verworfene Alternativen

- Ein Job je Veranstaltung: unnötige Job-Verwaltung; ein Herzschlag mit Fälligkeit je Veranstaltung reicht.
- Fester 5-s-Job: verschwendet Abrufe außerhalb des Fensters um `start_time`.
- Persistieren des letzten Abrufzeitpunkts: im Speicher genügt, nach Neustart harmlos.
- `raceclocker_polled_at` im Dashboard-DTO: bricht das ETag (ADR-0058); bleibt draußen (`2ea729e7`).
- Blocklist bekannter Fortschrittstexte: jeder neue Text des Anbieters hätte Boote als Ausfall gewertet. Unbekannt gilt bewusst als „offen", weil ein falsch offenes Boot die Zeile unberührt lässt, ein falscher Ausfall aber etwas Falsches behauptet.
- `Result in seconds` als zweites Signal: steht bei jeder Zeile ohne Zeit auf 0 und unterscheidet nur getimt/ungetimt, das kann `isTime` schon.
- Fertigen HTTP-Client injizieren: die Client-Konfiguration ist selbst Verhalten (Redirects), ein im Test gebauter Client hätte sie umgangen (`32d1c8b3`).
- Pausierte Läufe aus den Kandidaten filtern (Vorzustand): kippte bei einer Handeingabe den Takt der ganzen Veranstaltung.
- Rundenzeiten je Tick vollständig ersetzen (`13443f00`): der Livestream zeigte dann immer „Runde 1, 2, 3" vorn statt der zuletzt eingetroffenen Zeit; durch Upsert ersetzt (`228777ed`).
- Automatisches Zurücknehmen manueller DNF: bewusst nicht, eine Hand-DNF hat im Feed nie ein Ergebnis.

## Konsequenzen

- Das Wort „Wahrheit" gilt nur, solange der Pull aktiv ist. Nach „Automatik fortsetzen" löscht ein Restart-Reset auch eine Handeingabe (Testkatalog C34, bewusst offen; organisatorische Regel bis eine Nachfrage gebaut ist).
- Der Fingerabdruck lebt im Speicher; nach einem Neustart schreibt der nächste Tick einmal alles neu (harmlos, aber sichtbar in `updated_at`).
- Jeder neue Handschreibpfad muss `pauseRaceClockerAutoPull` rufen, sonst importiert der nächste Tick die Handeingabe zurück. Das gilt auch für „Lauf zurücksetzen" (ADR-0061), das die Pause setzt und den Fingerabdruck vergisst.
- Ein Bahntausch von Hand überlebt den nächsten Feed-Wechsel nicht (ADR-0055).
- `pollEvent` wurde am 09./10.08. in vier Phasen zerlegt, die einzeln getestet sind; ein Test über alle vier zusammen fehlt bewusst, weil `fetchRows` dafür injizierbar werden müsste (`docs/superpowers/specs/2026-08-10-raceclocker-rennen-testauftrag.md`).
- Die Allowlist ist an den Dropdown des Anbieters gebunden; ein neuer Ausfallgrund dort bleibt in ready2race „offen", bis jemand die Liste erweitert.
- Der Job filtert weiter explizit auf `timing_system = RACECLOCKER`; das eigene Zeitnahme-Modul (ADR-0087) läuft daneben, ein Boot bekommt nie aus beiden Systemen eine Zeit.

## Quellen

- Commits: `0f7cf5e5` (Design), `46389b6c` (Abruf- und Schreibregeln), `32d1c8b3` (keine Redirects, Engine injiziert), `2ea729e7` (Poll-Zeitstempel aus dem ETag), `e8e01bcc` / `8641d94d` (Allowlist), `1d20bc9f` (Restart-Reset), `7b6e25e3` (Rücknahme einzelner Zeiten), `55187a3b` (Start auf den Messtag), `21c6d2c1` (DNS kein Startbeleg), `29d9ba75` (Pause nur je Lauf), `cab40343` (Start zurücknehmen), `13443f00` / `228777ed` (Rundenzeiten, Upsert), `6d82365a` (Reset setzt die Pause)
- Migrationen: `V202608071600__raceclocker_polling.sql`, `V202608101120__normalize_raceclocker_urls.sql`, `V202608110100__match_team_laps.sql`
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/Application.kt` (Herzschlag), `…/app/raceclocker/boundary/RaceClockerPollService.kt`, `…/app/raceclocker/boundary/RaceClockerPollLogic.kt` (`startDetected`), `…/app/raceclocker/entity/RaceClockerFeedRow.kt` (`noResultReason`), `…/app/raceclocker/control/RaceClockerFeed.kt`
- Specs: `docs/superpowers/specs/2026-08-07-raceclocker-polling-design.md`, `docs/superpowers/specs/2026-08-05-testkatalog-crf-2026.md` (C27–C34, C41), `docs/testkatalog-11-08.md`
- Verwandte ADRs: [ADR-0013](0013-scheduler-und-datenbank-warteschlangen.md), [ADR-0054](0054-externer-zeitnahmedienst-setzung-bleibt-hier.md), [ADR-0055](0055-feed-schluessel-lauf-team-id-bahn-aus-rank.md), [ADR-0058](0058-schiedsrichter-dashboard-eigene-ressource-nutzlast.md), [ADR-0061](0061-lauf-endet-nur-durch-aktiven-input.md), [ADR-0068](0068-benannte-zeitnahme-rennen-statt-adressen.md), [ADR-0070](0070-laufzustaende-preparing-running-klaerung.md), [ADR-0087](0087-eigenes-zeitnahme-modul-append-only.md), [ADR-0092](0092-zwischenzeiten-am-lauf-distanz-am-wettkampf.md)
