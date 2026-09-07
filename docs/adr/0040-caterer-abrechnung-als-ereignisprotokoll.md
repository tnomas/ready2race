# ADR-0040: Verpflegungsabrechnung als reines Ereignisprotokoll ohne Kontostand

- Status: angenommen
- Datum: 2025-07-21
- Bereich: domäne, datenbank
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Auf Veranstaltungen gibt eine Verpflegungsstelle Essen und Getränke an Helfer und Beteiligte aus. Die Ausgabe sollte per QR-Scan in der Helfer-App ([ADR-0039](0039-helfer-app-eigener-bereich-unter-app.md)) festgehalten werden, damit hinterher abgerechnet werden kann, wer was bekommen hat. Ein vollständiges Kassensystem mit Guthaben, Aufladung und Storno war nicht das Ziel.

## Entscheidung

- Jede Ausgabe ist eine Zeile in `caterer_transaction` (Migration `V202508110949__caterer_implementation.sql`): `caterer_id` (der ausgebende App-Nutzer), `app_user_id` (der Empfänger), `price` als `decimal(10,2)`, `event_id` und Audit-Spalten. Ein Check-Constraint `chk_caterer_transaction_price_non_negative` erzwingt `price >= 0`.
- Es gibt **keine Kontostand-Entität**. Summen je Person, je Caterer oder je Veranstaltung werden bei Bedarf aus den Zeilen berechnet; die Indizes auf `(event_id, caterer_id, created_at)` und `(app_user_id, event_id)` sind dafür angelegt.
- Die Rolle „Caterer" ist ein eigenes Privileg (`UpdateAppCatererGlobal` auf der Ressource `APP_CATERER`) und eine eigene App-Funktion in der Helfer-App; ausgeben darf, wer dieses Recht hat.

## Verworfene Alternativen

- Keine belegt. Die Migration und der Commit `c1cbfe5a` zeigen nur die gewählte Form; ein Kontostand-, Guthaben- oder Storno-Modell wurde nicht angelegt.

## Konsequenzen

- Das Modell ist einfach und nachvollziehbar: jede Zeile ist ein Ereignis mit Zeitstempel und Urheber, nichts wird überschrieben.
- Korrekturen sind nur eingeschränkt möglich: negative Beträge sind per Constraint ausgeschlossen, also lässt sich eine Fehlbuchung nicht durch eine Gegenbuchung neutralisieren. Wer Storno braucht, muss entweder die Zeile löschen (kein Protokoll) oder das Modell erweitern.
- Empfänger sind ausschließlich App-Nutzer (`app_user_id`), keine Teilnehmer ohne Konto. Für eine Verpflegung von Sportlern, die nur als `participant` existieren, reicht das Modell nicht.
- Die Abrechnung ist Ereignisprotokoll und folgt damit demselben Muster wie der Check-in ([ADR-0041](0041-checkin-checkout-ereignisprotokoll-arena.md)); wer eines der beiden um Zustände erweitert, sollte das andere im Blick behalten.

## Quellen

- Commits: `c1cbfe5a` (add caterer role and qr app functionality)
- Migrationen: `backend/src/main/resources/db/migration/V202508110949__caterer_implementation.sql`
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/auth/entity/Privilege.kt` (`APP_CATERER`), `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/caterer/`
- Verwandte ADRs: [ADR-0010](0010-privilegien-action-resource-scope.md), [ADR-0016](0016-schema-konventionen-uuid-audit-timestamp.md), [ADR-0039](0039-helfer-app-eigener-bereich-unter-app.md), [ADR-0041](0041-checkin-checkout-ereignisprotokoll-arena.md)
