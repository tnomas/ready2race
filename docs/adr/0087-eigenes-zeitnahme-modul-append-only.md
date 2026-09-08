# ADR-0087: Eigenes Zeitnahme-Modul: Zeitmarken als Append-only-Log, Erfassung lokal mit Serveruhr, Echtzeit-Rückschreibung in den bestehenden Ergebnisfluss, Abschneiden statt Runden

- Status: angenommen
- Datum: 2026-08-17
- Bereich: domäne, backend, datenbank
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Die Regatta im August 2026 wurde mit einem externen Zeitnahmedienst gestoppt (siehe [ADR-0054](0054-externer-zeitnahmedienst-setzung-bleibt-hier.md) und [ADR-0056](0056-automatischer-feed-abruf-feed-ist-wahrheit.md)). Der Schmerzpunkt war der Umweg über Startlisten-Export und Ergebnis-Import zwischen Zeitnahme und Ergebnisfluss. Gewünscht war eine eingebaute Zeitnahme, die Startlisten aus der Durchführung zieht, mit mehreren Geräten (Start, Strecke, Ziel) arbeitet und Endzeiten direkt in Wertung und Schiedsrichter-Freigabe schreibt. Wertung und Freigabe arbeiten auf `competition_match_team.timecode`; diese Schicht sollte nicht umgebaut werden.

## Entscheidung

1. **Eigenes Modul `app/timing`** (Backend unter `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing/`) mit den Tabellen `timing_station`, `timing_time_mark`, `timing_assignment` (V202608171400), `timing_start_sequence`, `timing_start_sequence_entry` (V202608180030) und `timing_official_time` (V202608181100).
2. **Zeitmarken sind ein Append-only-Log.** Jede Marke trägt eine vom Gerät erzeugte UUID (Idempotenz bei Wiederholung) und einen Status `ACTIVE | RETRACTED`. Rücknahme ist ein Statuswechsel; physisches Löschen gibt es nur als ausdrücklichen Leitstand-Befehl. Die Spalte `source` (`APP_USER | HARDWARE`) hält die Herkunft fest.
3. **Erfassung lokal, Serveruhr als Referenz.** Der Zeitstempel entsteht auf dem Gerät aus `performance.now()` plus einem Server-Offset, der aus mehreren Roundtrips gegen einen Serverzeit-Endpunkt bestimmt wird (niedrigste Latenz gewinnt, Rekalibrierung ab 300 ms Drift). Persistenz und Verteilung laufen asynchron über eine write-ahead-Warteschlange und blockieren die Erfassung nie. Neuladen schadet nie, weil der Zustand serverseitig liegt.
4. **Offizielle Zeiten sind eine eigene Schicht, die in den bestehenden Ergebnisfluss pusht.** `timing_official_time` je Team berechnet Ziel minus Start, kennt manuellen Override, Strafe und DNS/DNF/DSQ. Der Push an den Lauf nutzt exakt denselben Schreibweg wie CSV- und Handimport (gleiche Timecode-Id, gleiche Einheit, gleiches `failed`/`failed_reason`-Schema, `penalty_seconds` nach Feed-Konvention). Platzberechnung und Freigabe bleiben unverändert („Integration, nicht Import").
5. **Echtzeit-Rückschreibung statt Rechenknopf.** `recomputeAndApply` läuft nach jeder Zeitnahme-Mutation (Rücknahme, Reaktivierung, Zuordnung, Strafe, Override, Sequenz-Feuerung) im selben Request. Der Schalter `event.timing_auto_apply` (V202608211440, Vorgabe an) kann das je Veranstaltung abschalten; Einschalten zieht den aufgelaufenen Stand nach. `timing_official_time.applied_fingerprint` unterscheidet „unverändert" (idempotent) von „fremd" (Eingriff durch Schiedsrichter oder Import); Fremdes wird nie stillschweigend überschrieben, ein Push dorthin scheitert außer mit `force`. Die Übernahme leitet seit V202608211460 auch die Lauf-Plätze ab; Gleichstände auf der veröffentlichten Genauigkeit teilen sich den Platz.
6. **Abschneiden, nie runden.** `event.timing_precision` (V202608211450, Werte `SEKUNDE | ZEHNTEL | HUNDERTSTEL | MILLISEKUNDE`, Vorgabe `ZEHNTEL`) bestimmt die veröffentlichte Stufe. Die Übernahme schneidet den Timecode vor dem Schreiben ab, Strafen gehen vorher in die Summe ein. Zeitmarken und `timing_official_time` bleiben millisekundengenau; die Grenze zwischen Roh- und Anzeigewert ist in `frontend/src/components/timing/leitstand/format.ts` dokumentiert.
7. **Timing-Boards sehen nur erwartete Partien.** `TimingTeamDto` trägt eine bewusst gröbere Phase `ACTIVE | OPEN | DONE` in derselben Zweigreihenfolge wie die Durchführungsansichten; Freilos-Teams werden nicht geliefert, außer das Freilos muss gefahren werden ([ADR-0074](0074-freilos-ableitung-kein-zustand.md)).

Der CSV-Export/Import-Weg bleibt ausschließlich als Anbindung fremder Systeme bestehen.

## Verworfene Alternativen

- **Eigener Ergebnisfluss neben dem Timecode-Pfad:** hätte Platzberechnung und Freigabe verdoppelt; stattdessen derselbe Schreibweg wie der Import.
- **Manueller Knopf „Neu berechnen/Übernehmen" als Normalweg** (erster Leitstand, 18.08.): am Renntag muss eine zugeordnete Zielzeit sofort am Lauf stehen; der Knopf entfiel am 23.08. ersatzlos, der manuelle Push bleibt nur für Schalter-aus und `force`.
- **Einfrieren jedes Teams mit gesetztem Platz:** zu weit, blockierte die eigene Platzableitung; verengt auf „fremder Platz" über den Fingerabdruck.
- **Kaufmännisches Runden:** eine veröffentlichte Zeit darf nie schneller sein als die gemessene.
- **Client-Timer als Referenz für Countdowns und Marken:** Geräteuhren driften; nur die Serveruhr ist Referenz.
- **Event-Replay über den Socket beim Reconnect:** nicht nötig, ein voller REST-Refetch genügt (siehe [ADR-0088](0088-timing-websocket-und-geraete-token.md)).
- **Volle Zustandsableitung im Timing-DTO:** Boards brauchen nur Sortierung und Gruppierung, daher die grobe Phase.
- **Nicht in v1:** Rundenrennen mit automatischer Rundenzählung, Hardware-Firmware oder Gateway, Voll-Offline-PWA, Livestream- und Sprecher-Boards (letztere kamen später über eigene Wege, [ADR-0095](0095-eigene-stream-domaene-server-entscheidet-on-air.md), [ADR-0098](0098-sprecher-board-drei-spalten-dashboard.md)).

## Konsequenzen

- Wer eine Zeitnahme-Mutation hinzufügt, muss `recomputeAndApply` im selben Request auslösen und den Änderungsmarker bumpen (siehe [ADR-0097](0097-zeitnahme-livestream-sync-eine-sequenz-rechnung.md)); ein vergessener Aufruf fällt erst am Renntag auf.
- Ein Team mit Fremd-Eingriff wird nicht mehr automatisch nachgezogen; der Leitstand zeigt „dirty", jemand muss entscheiden. Das ist gewollt, kostet aber Aufmerksamkeit.
- Die Genauigkeitsstufe ist eine Regatta-Entscheidung. Nachträgliches Umstellen ändert veröffentlichte Gleichstände; feinere Stufen zeigen einen Warnhinweis, blockieren aber nicht.
- Das Log wächst; Rücknahmen bleiben als Zeilen stehen. Auswertungen müssen `status = 'ACTIVE'` filtern.
- Der Uhrenabgleich hängt an der Netzqualität des Geräts; ohne Netz gilt der letzte bekannte Offset.
- Das Modul ist in allen Folgerunden ausgebaut, nie ersetzt worden: Startsequenzen ([ADR-0089](0089-startsequenzen-serverseitig-fehlstart.md)), Scharfschaltung ([ADR-0090](0090-scharfschaltung-je-posten.md)), Töne ([ADR-0091](0091-toene-gehoeren-dem-zeitnahmetyp.md)), Zwischenzeiten ([ADR-0092](0092-zwischenzeiten-am-lauf-distanz-am-wettkampf.md)), Zeitnahmeprofile ([ADR-0080](0080-zeitnahmeprofil-baum-vier-ebenen.md)).

## Quellen

- Commits: `4f8650bc` (Design-Spec), `e880d61a` (Tabellen), `0ba67640` (Erfassung, Rücknahme, Zuordnung), `340300bc` (race-sichere Marken), `954078ae` (State-Endpunkt), `264e03d3` (Serverzeit-Endpunkt), `d1dd9ced`, `a3c6e54e` (Offline-Warteschlange write-ahead), `3c75e0e0` (offizielle Zeiten), `db41185e` (Freeze und dirty), `7b821e02` (Strafen und Pull-Pause beim Push), `40b9849a` (Rückschreibe-Entscheidung als reine Logik), `209e2d78` (Echtzeit-Rückschreibung), `23246cf2` (Leitstand-Schalter), `085b168b` (Platzableitung), `27c5c067` (Teilstände), `9c61060d`, `c19f0028`, `7eb542cb`, `1b7fb65d` (Genauigkeit), `c0046a1a` (erwartete Partien), `583d28e7` (Posten-Startliste)
- Migrationen: `V202608171400__timing_module.sql`, `V202608180030__timing_start_sequences.sql`, `V202608181100__timing_official_time.sql`, `V202608211440__timing_instant_apply.sql`, `V202608211450__timing_precision.sql`, `V202608211460__timing_apply_places.sql`
- Specs: `docs/superpowers/specs/2026-08-17-timing-module-design.md`, `docs/superpowers/specs/2026-08-23-zeitnahme-boards-leitstand-design.md`, `docs/superpowers/plans/2026-08-17-timing-backend-foundation.md`, `docs/superpowers/plans/2026-08-18-timing-leitstand.md`
- Verwandte ADRs: [ADR-0046](0046-timecode-adaptive-praezision.md), [ADR-0054](0054-externer-zeitnahmedienst-setzung-bleibt-hier.md), [ADR-0056](0056-automatischer-feed-abruf-feed-ist-wahrheit.md), [ADR-0060](0060-teilergebnisse-zeitstrafen-ausweisen.md), [ADR-0088](0088-timing-websocket-und-geraete-token.md), [ADR-0089](0089-startsequenzen-serverseitig-fehlstart.md), [ADR-0080](0080-zeitnahmeprofil-baum-vier-ebenen.md)
