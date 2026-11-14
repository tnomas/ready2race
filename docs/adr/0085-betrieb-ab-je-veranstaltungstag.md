# ADR-0085: „Betrieb ab" je Veranstaltungstag, Fenster auf dem Gerät ausgewertet

- Status: angenommen
- Datum: 2026-08-11
- Bereich: domäne, frontend, datenbank
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Bei der Vergabe der Teilnehmerbänder wurde in der Helfer-App die Regatta von 2025 erwischt, weil jede Veranstaltung als gleicher Knopf ohne Datum erschien; die Liste war ungefiltert und unsortiert. Die App cacht ihre Veranstaltungsliste offline (ADR-0077), und die Akkreditierung läuft oft schon am Vorabend des ersten Wettkampftags.

## Entscheidung

1. **Der Beginn hängt am Tag, nicht an der Veranstaltung:** `event_day.operations_start` (nullable, `V202608211300__event_day_operations_start.sql`; ursprünglich als V202608111600 geplant, wegen Kollision umnummeriert). Das Feld heißt bewusst „Betrieb ab" und nicht „Akkreditierung" – der Begriff soll für jede Sportart tragen (ADR-0081).
2. **Ein Fenster über die ganze Regatta:** `min(operations_start) ≤ jetzt < max(date) + 1 Tag`. Bei leerem Feld gilt `date 00:00` als Rückfall. Kein Fenster je Tag, das würde abends aussperren.
3. **Das Fenster wird auf dem Gerät ausgewertet.** Zwei abgeleitete Felder am `EventDto` und die React-freie Logik in `frontend/src/components/qrApp/eventOperations.ts`; ein serverseitig vorberechnetes „läuft gerade" würde im Offline-Cache altern und morgens falsch sein.
4. Die Auswahlseite zeigt Laufendes zuerst, den Rest hinter „Alle Veranstaltungen" (immer erreichbar); übersprungen wird die Auswahl nur bei genau einer laufenden Veranstaltung.

## Verworfene Alternativen

- Feldname „Akkreditierung": Sportwissen und zu eng.
- Fenster je Tag: sperrt zwischen den Tagen aus.
- Serverseitig berechnetes „läuft gerade": altert im Cache.
- Umzugswerkzeug für bereits falsch zugeordnete Bänder: per SQL von Hand erledigt.
- Anpassung anderer Veranstaltungswähler in der Verwaltung: nicht Gegenstand.

## Konsequenzen

- Ohne gepflegtes `operations_start` beginnt das Fenster um Mitternacht des Tages; Akkreditierung am Vorabend braucht den Eintrag.
- Die Gerätezeit entscheidet über die Vorauswahl; eine falsch gestellte Uhr zeigt eine falsche Liste, kann aber nichts Falsches schreiben (Bestätigungen tragen den Server-Tag, ADR-0084).
- Die Umnummerierung der Migration ist ein Beispiel für die Slot-Kollisionen der Bündel-Runde (ADR-0014, ADR-0100).
- Der Ablauf „Scannen zuerst" (ADR-0099) merkt sich die Veranstaltung und macht die Auswahl seltener nötig.

## Quellen

- Commits: `860bc238`, `afa508f0`, `d241f034`, `638748d1`
- Migrationen: `V202608211300__event_day_operations_start.sql`
- Code: `frontend/src/components/qrApp/eventOperations.ts`
- Specs: `docs/superpowers/specs/2026-08-11-betrieb-ab-design.md`
- Verwandte ADRs: [ADR-0014](0014-flyway-migrationskonventionen.md), [ADR-0022](0022-veranstaltungsstruktur-event-tage-wettkaempfe.md), [ADR-0039](0039-helfer-app-eigener-bereich-unter-app.md), [ADR-0077](0077-helfer-app-als-pwa.md), [ADR-0081](0081-kurzbezeichner-kennung-kuerzel-sportneutral.md), [ADR-0084](0084-bedingungen-geltungsbereich-und-protokoll.md), [ADR-0099](0099-helfer-app-scannen-zuerst.md), [ADR-0100](0100-fork-arbeitsweise-worktrees-merge-richtung-build-db.md)
