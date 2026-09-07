# ADR-0064: Die Aktivierungskette läuft über den ganzen Zeitplan und hält an der ersten Gruppe mit offenem Lauf; der Zeitstrahl ist die einzige Kette

- Status: angenommen
- Datum: 2026-08-04
- Bereich: domäne, backend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Mit dem Zeitstrahl (ADR-0063) ruft eine Kette Läufe nacheinander an den Start: Wird ein Lauf beendet, aktiviert sie den nächsten. Drei Probleme traten nacheinander auf. Erstens bilden parallele Läufe mit derselben Startzeit eine Startgruppe; die Kette rückte weiter, sobald irgendein Lauf der Gruppe fertig war. Zweitens begann die Suche beim gerade beendeten Slot und übersprang Gruppen, die längst aufgerufen waren: Am 10.08. standen zwei Läufe gleichzeitig auf „In Vorbereitung" (der zweite Anstoß kam aus der Folgerunden-Automatik), und nach einem Freilos am Folgetag sprang die Kette über den Rest des laufenden Tages. Drittens gab es eine zweite Kette: `LiveDashboardService.activateNext` aktivierte beim Beenden von Läufen ohne Zeitplan-Slot alle Läufe mit nächster Startzeit, ohne Tagesgrenze und ohne Startgruppen; bei teilweise gepflegtem Zeitstrahl arbeiteten zwei Ketten am selben Ereignis.

## Entscheidung

1. **Die Kette rückt erst weiter, wenn jede Partie der Startgruppe fertig ist.** Ausdrücklich als Vorgabe des Projektinhabers festgehalten: Der letzte Zieleinlauf der Gruppe löst den Vorstoß aus, nicht der erste. „Fertig" heißt `finished_at` oder erledigt im Sinne von `teamIsSettled` (Abmeldungen zählen mit) oder in Klärung. „Noch laufend" meint den Ist-Start (`ChainSlot.matchStartedAt`), nicht die bloße Aktivierung: Ein nur an den Start gerufener Nachbar hält die Kette nicht an (Verfeinerung vom 09.08.).
2. **Die Kette betrachtet den gesamten Zeitplan** (`ScheduleChain.decideNext`, ab 10.08.): Slots werden nach `start_time` gruppiert und aufsteigend durchlaufen. Die Kette hält an der ersten Gruppe, die noch etwas offen hat („die Front"), und handelt genau dort. Eine bereits aufgerufene Gruppe mit offenem Lauf ist eine solche Front. Erst eine Gruppe, in der wirklich nichts mehr offen ist (nur übersprungene, entfallene, freie oder beendete Slots), wird übergangen. „Jetzt" spielt keine Rolle: Nur die geplante Startzeit ordnet die Gruppen, Verspätung verschiebt nichts. Die „läuft etwas"-Abfrage in `resumeIfParked` (`hasRunningMatch`) und die `after`-Untergrenze in `getChainSlots` wurden dadurch überflüssig und entfernt.
3. **Ein wartender Slot hält die Kette ohne Fehler an.** Enthält die Front einen `WAITING`-Slot (Runde noch nicht gesetzt), wartet die Kette; `createNewRound` prüft nach dem Materialisieren, ob der nächste fällige Slot soeben gefüllt wurde, und stößt die Kette erneut an (zweiter Auslöser). Wer den Slot nicht mehr fahren will, sagt ihn ab (`setSlotSkipped`); das ist der Weg an einem wartenden Slot vorbei.
4. **Der Zeitstrahl ist die einzige Aktivierungskette.** `activateNext` und `getActivationCandidates` im Dashboard sind ersatzlos entfernt (`c8c35036`). Beim Beenden eines Laufs ohne Slot aktiviert niemand mehr automatisch; Läufe mit Slot verhalten sich unverändert über `ScheduleChain`. Ein von Hand deaktivierter Lauf ist wieder die Front; wer ihn herausnehmen will, sagt den Slot ab.
5. **Die Kette kennt die Zustandsaufzählung nicht** (ADR-0059). Sie hängt an `finished_at`, `teamIsSettled` und `ChainSlot.matchInClarification`. Weder der Feed-Abruf (ADR-0056) noch die eigene Zeitnahme (ADR-0089) stoßen sie an; nur Beenden, Absagen und `createNewRound` tun das.

## Verworfene Alternativen

- Weiterrücken beim ersten beendeten Lauf eines Parallelpaars (Backlog C6): verworfen, die Gruppe muss fertig sein.
- Ausgangspunkt „ab dem beendeten Slot" (`7a5c010b`): ersetzt durch „Front ist, wo der Zeitplan sie sieht, nicht wo das letzte Ziel war" (`95905757`).
- Berücksichtigung der aktuellen Uhrzeit bei der Aktivierung: verworfen; zusätzliche Gatter und Referenzzeitpunkte beschrieben den Zustand nur ungenauer.
- Abbruch der Kette am Breakpoint „nächster Lauf nicht gesetzt" oder eine zusätzliche Bestätigung: verworfen, die Kette wartet.
- Vereinheitlichung beider Ketten (Dashboard und Zeitstrahl): verworfen, die Dashboard-Kette war ungetestet und fiel ersatzlos (kein Test entfiel).
- Ein blockierender, bloß aktivierter Nachbar (Fassung vom 04.08.): am 09.08. auf den Ist-Start verengt.

## Konsequenzen

- Ein Beenden am Sonntag kann nicht mehr auf den Freitag zurückspringen; die Front ist die erste Gruppe mit etwas Offenem, auch wenn sie Tage zurückliegt. Ein vergessener offener Lauf am Vortag hält die Kette deshalb sichtbar an, statt übergangen zu werden.
- Läufe ohne Zeitplan-Slot werden nie automatisch aktiviert. Wer den Zeitstrahl nur teilweise pflegt, bekommt keine Kette für den Rest.
- Die Kette bleibt an einem Lauf stehen, dessen Boote alle abgemeldet sind, nur weil `teamIsSettled` Abmeldungen als erledigt zählt; das ist der Grund, warum das Prädikat dort bleibt (ADR-0044).
- Ein Freilos-Boot zählt in `teamIsSettled` als erledigt (Nebenfund vom 15.08.), sonst bliebe die Kette hängen (ADR-0074).
- Die Folgerunden-Automatik (ADR-0073) ist der zweite Anstoß; sie erstellt Runden, die Kette entscheidet über die Aktivierung nach dem Kettenmodus (ADR-0065).
- Die Regel ist zweimal per DB-Integrationstest festgenagelt worden, weil ein Alias-Fehler in einer Einzel-Slot-Query jede Aktivierung mit 500 beendete (ADR-0030).
- Der Kommentar über `decideNext` in `ScheduleChain.kt` ist die verbindliche Beschreibung; wer die Kette ändert, ändert ihn mit.

## Quellen

- Commits: `7a5c010b` (Startgruppe muss fertig sein), `95905757` (Kette über den ganzen Zeitplan), `ae8c43c9` (Merge in den Sammelzweig), `c8c35036` (zweite Kette im Dashboard entfernt), `eecbe3c9` (Abmeldungen zählen für die Kette, nicht für die Wertung), `e18da52e`, `70a61894` (Kette entlang der Slots)
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/eventSchedule/boundary/ScheduleChain.kt` (`decideNext`, `decideAndActivate`, `resumeIfParked`), `…/app/liveDashboard/boundary/LiveDashboardLogic.kt` (`teamIsSettled`)
- Specs: `docs/superpowers/specs/2026-07-30-schiedsrichter-dashboard-backlog.md` (C6, „Entscheidungen 04.08.2026"), `docs/superpowers/specs/2026-08-03-zeitstrahl-design.md` (§4 „Kette über Slots"), `docs/superpowers/specs/2026-08-09-laufzustand-arena-design.md` (§3.1), `docs/testkatalog-11-08.md` (Bug 7)
- Verwandte ADRs: [ADR-0030](0030-tests-testcontainers-und-reine-logik.md), [ADR-0044](0044-abmeldung-dns-dnf-dq-im-freitext.md), [ADR-0056](0056-automatischer-feed-abruf-feed-ist-wahrheit.md), [ADR-0059](0059-laufzustand-eine-ableitung.md), [ADR-0061](0061-lauf-endet-nur-durch-aktiven-input.md), [ADR-0063](0063-zeitstrahl-slots-feste-uhrzeit-import.md), [ADR-0065](0065-kettenmodus-dreiwertig-regattabuero-beendet-immer.md), [ADR-0066](0066-entfaellt-statt-ueberspringen-sichtbar-markieren.md), [ADR-0070](0070-laufzustaende-preparing-running-klaerung.md), [ADR-0073](0073-folgerunden-automatik-erstellt-aktiviert-nicht.md), [ADR-0074](0074-freilos-ableitung-kein-zustand.md), [ADR-0089](0089-startsequenzen-serverseitig-fehlstart.md)
