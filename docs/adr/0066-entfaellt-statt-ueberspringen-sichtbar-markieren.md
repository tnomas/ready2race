# ADR-0066: „Entfällt" statt „Überspringen"; abgesagte Läufe bleiben sichtbar markiert; eine Runde absagen nur aus der Durchführung und nur ohne offene Läufe

- Status: angenommen
- Datum: 2026-08-05
- Bereich: domäne, frontend, backend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Der Zeitstrahl (ADR-0063) erlaubte, einzelne Slots zu „überspringen". Das Wort suggerierte, der Lauf käme später. Scheiden im Zeitfahren so viele Boote aus, dass eine Folgerunde nicht stattfinden muss, konnten bisher nur einzelne Slots übersprungen werden; die dann gebaute Rundenabsage im Zeitplan-Tab war zu prominent und untergrub die Setzung der Folgerunde. Zwei weitere Vorfälle: Im Fenster zwischen „Boote zum Start" und dem ersten Feed-Bericht konnte ein aktivierter Lauf abgesagt werden und war dann abgesagt und laufend zugleich; und ein abgesagtes Finale verschwand auf den öffentlichen Boards spurlos, was eine wartende Besatzung von einem Anzeigefehler nicht unterscheiden kann.

## Entscheidung

- **Wortwahl:** Slot-Zustand `SKIPPED` heißt „Entfällt", `OBSOLETE` heißt „Verfallen" (i18n-Schlüssel bleiben, nur Texte). Die Handlung heißt „absagen".
- **Eine ganze Runde absagen** (`EventScheduleService.setRoundSkipped`) liegt in Wettkampf → Durchführung neben „Runde löschen", nicht im Zeitplan-Tab. Die Aktion ist nur sichtbar, wenn die Runde materialisiert ist und kein Lauf zwei oder mehr startende Boote hat; sonst lehnt der Server mit 409 ab (`RoundNotMaterialized`, `RoundHasRunsToRace`, gleiches „racing"-Prädikat wie die Aktivierungskandidaten). Wer `UPDATE LIVE_DASHBOARD` ohne `UPDATE EVENT` hat, darf Rennslots absagen, aber keine Programmpunkte (ADR-0058).
- **Schutzregel statt stiller Deaktivierung:** `EventScheduleLogic.matchUnderway(startedAt, activated)` kombiniert Aktivierung und Ist-Start; ein laufender Slot kann nicht abgesagt werden. Wer wirklich absagen will, deaktiviert zuerst (eine sichtbare zweite Handlung). Das Zurücknehmen einer Absage (`unskip`) hängt an `started_at`, damit Altdaten sich selbst heilen.
- **Abgesagte Läufe bleiben sichtbar.** Auf dem Schiedsrichter-Dashboard und (ab 07.08.) auf allen öffentlichen Anzeigen bleibt ein abgesagter Lauf an seiner geplanten Position als schmale, durchgestrichene Karte ohne Crews („Findet nicht statt", `cancelled = true`); eine Funktion (`mergeWithPendingPlaceholders`) gilt für Kiosk und Athleten-Anzeige gleichermaßen. Überfällig-Labels entfielen zugleich.
- In der Zustandsableitung steht `SKIPPED` hinter RUNNING und FINISHED und vor AWAITING_FINISH: Was tatsächlich passiert, schlägt den zurückgenommenen Plan; ein abgesagter Lauf braucht niemanden mehr, der ihn beendet (ADR-0059).

## Verworfene Alternativen

- Rundenabsage im Zeitplan-Tab: zu prominent, entfernt (`2f2d2a9c`).
- Absage einer Runde mit fahrbaren Läufen: 409, verworfen.
- Stilles Mit-Deaktivieren beim Absagen (`20ac9233`, erster von zwei möglichen Fixes): verworfen zugunsten der Schutzregel, weil eine zweite sichtbare Handlung ehrlicher ist.
- Ausfiltern abgesagter Läufe aus den öffentlichen „Nächste Läufe" (`20ac9233`): am 07.08. durch die Markierung ersetzt (`a01fa007`, `701bc555`).
- Gemeinsamer MUI-Chip für die öffentlichen Anzeigen: eigene Typografie behalten.
- Löschsperre für gefahrene Runden: „Runde löschen" bleibt erlaubt, die Bestätigung nennt aber die Zahl der bereits sichtbaren Läufe (ADR-0073).

## Konsequenzen

- Ein Slot, der im Fenster zwischen Aufruf und erstem Feed-Bericht abgesagt werden soll, verlangt zwei Klicks (deaktivieren, absagen). Das ist der Preis der Schutzregel.
- Abgesagte Läufe belegen weiterhin Platz auf jeder Anzeige; ein Board mit vielen Absagen wird länger, nicht kürzer.
- Ein Widerruf einer Absage löst die Folgerunden-Automatik nicht aus (ADR-0073) und ist über „Nachrücken nach Ausfall" (ADR-0063) rückwärts zu korrigieren.
- Absagen stößt die Aktivierungskette an; das ist der Weg an einem wartenden Slot vorbei (ADR-0064).
- Öffentliche Anzeigen kennen nur vier grobe Zustände; „entfällt" ist einer davon, Teilwertung bleibt intern.
- Der Grundsatz „sichtbar markieren statt verstecken" wurde später für Abmeldungen im Boot (durchgestrichen, ADR-0044) und Freilose (ADR-0074) wiederholt.

## Quellen

- Commits: `3daf0bb6` (Wortwahl „entfällt"), `2f2d2a9c` (Rundenabsage in die Durchführung), `a634c05a` (409 bei fahrbaren Läufen), `ab7d4ebf` (Reichweite der Absage-Aktionen benannt), `20ac9233` (sichtbar markieren, abgesagt-und-laufend blockieren), `a01fa007` (Zustand im Zeitplan, abgesagt bleibt), `701bc555` (Statuschips überall), `85407386` (Überfällig-Labels weg, abgesagte durchgestrichen), `b5e7bf2f` (Absage gestarteter Slots abgelehnt)
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/eventSchedule/boundary/EventScheduleLogic.kt` (`matchUnderway`), `…/EventScheduleService.kt` (`setSlotSkipped`, `setRoundSkipped`), `…/entity/EventScheduleError.kt` (`RoundNotMaterialized`, `RoundHasRunsToRace`), `frontend/src/i18n/de/translations.json` (`SKIPPED`, `OBSOLETE`)
- Specs: `docs/superpowers/specs/2026-07-30-schiedsrichter-dashboard-backlog.md` (C3), `docs/superpowers/specs/2026-08-07-lauf-status-anzeige-design.md` (§4.3)
- Verwandte ADRs: [ADR-0044](0044-abmeldung-dns-dnf-dq-im-freitext.md), [ADR-0058](0058-schiedsrichter-dashboard-eigene-ressource-nutzlast.md), [ADR-0059](0059-laufzustand-eine-ableitung.md), [ADR-0063](0063-zeitstrahl-slots-feste-uhrzeit-import.md), [ADR-0064](0064-aktivierungskette-ganzer-zeitplan.md), [ADR-0070](0070-laufzustaende-preparing-running-klaerung.md), [ADR-0073](0073-folgerunden-automatik-erstellt-aktiviert-nicht.md), [ADR-0074](0074-freilos-ableitung-kein-zustand.md)
