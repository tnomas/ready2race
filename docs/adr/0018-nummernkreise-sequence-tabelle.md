# ADR-0018: Nummernkreise über eine eigene sequence-Tabelle

- Status: angenommen
- Datum: 2025-01-30
- Bereich: datenbank, backend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Rechnungen brauchen lückenlose, fortlaufende Nummern. Der Zähler muss im Code je Verbraucher adressierbar sein, darf unter parallelen Rechnungsläufen keine Doppelvergabe erzeugen und soll ohne Handarbeit in jeder neuen Datenbank existieren. Die Rechnungsfunktion entstand im Januar 2025 im Upstream-Team lambda9 (Commit `5307508d`), und der Nummernkreis wurde gleich mit angelegt.

## Entscheidung

- Nummernkreise liegen in der Tabelle `sequence(consumer text primary key, value bigint, step int)`, angelegt in `V202501300930__invoices.sql`.
- Jeder Verbraucher ist ein Wert des Kotlin-Enums `SequenceConsumer` (`backend/…/app/sequence/entity/SequenceConsumer.kt`); derzeit gibt es nur `INVOICE`. Ein neuer Nummernkreis heißt: neuer Enum-Wert, sonst nichts.
- `SequenceRepo.getAndIncrement(consumer)` liest die Zeile mit `select … for update`, erhöht `value` um `step` und liefert den neuen Wert. Der Aufruf gehört in dieselbe Transaktion wie der Datensatz, der die Nummer trägt.
- Fehlende Zähler werden beim Anwendungsstart angelegt: `initializeDatabase` ruft `SequenceRepo.addMissing()` (siehe `backend/…/database/initializeDatabase.kt`). Auch `getAndIncrement` legt einen fehlenden Zähler an, sodass ein neuer Enum-Wert ohne Migration funktioniert.
- Die Domäne `sequence` hat bewusst kein `boundary/`-Paket: Es gibt keinen Endpunkt, der Nummern vergibt. Nummern entstehen ausschließlich als Nebeneffekt eines fachlichen Vorgangs (Rechnungserzeugung).

## Verworfene Alternativen

- Postgres-eigene Sequenzen (`create sequence`): nicht verwendet, weil sie nicht transaktional sind (ein Rollback hinterlässt Lücken) und sich nicht über ein Enum im Code adressieren lassen.
- Nummer aus `max(number) + 1` beim Einfügen: keine belegte Erwägung; das Muster mit `for update` schließt die Doppelvergabe unter Nebenläufigkeit aus, was `max + 1` ohne Sperre nicht kann.

## Konsequenzen

- Lückenlosigkeit ist garantiert, weil die Erhöhung Teil der fachlichen Transaktion ist. Dafür serialisiert `for update` alle Nummernvergaben desselben Verbrauchers; bei der Rechnungserzeugung (Job alle 5 Minuten, siehe [ADR-0013](0013-scheduler-und-datenbank-warteschlangen.md)) ist das unkritisch, für hochfrequente Zähler wäre es die falsche Struktur.
- Ein zweiter Nummernkreis ist billig (ein Enum-Wert), aber der Wert `step` steht nur in der Datenbank; wer eine andere Schrittweite als 1 will, muss die Zeile per SQL anpassen.
- `e5b377c5` („Fix sequences initialization") zeigt die Falle: Wird der Zähler nicht beim Start gesät, schlägt die erste Vergabe in einer frischen Datenbank fehl. Das Säen ist deshalb Teil von `initializeDatabase`, nicht einer Migration.
- Die Zähler werden nie zurückgesetzt. Ein Testlauf gegen eine Produktionskopie verbraucht echte Nummern, wenn er Rechnungen erzeugt.

## Quellen

- Commits: `5307508d` (Add generic invoices, Tabelle `sequence`), `e5b377c5` (Fix sequences initialization)
- Code: `backend/src/main/resources/db/migration/V202501300930__invoices.sql`, `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/sequence/`
- Verwandte ADRs: [ADR-0019](0019-rechnungen-aus-meldungen-snapshot.md), [ADR-0013](0013-scheduler-und-datenbank-warteschlangen.md), [ADR-0003](0003-entity-control-boundary-je-domaene.md)
