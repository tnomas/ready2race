# ADR-0084: Teilnahmebedingungen mit Geltungsbereich je Tag und je Wettkampf; additive Scan-Bestätigung; Revisionsprotokoll

- Status: angenommen
- Datum: 2026-08-14
- Bereich: datenbank, backend, domäne
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Eine Teilnahmebedingung (ADR-0027) galt genau einmal je Person und Veranstaltung. Waage und Bootsabnahme sind aber an jedem Tag und teils je Wettkampf neu fällig – ein Verfahrensfehler, der nach Regattatag 1 auffiel. Am Folgetag zeigte sich der zweite Fehler: Die Scan-App rief den Ersetzen-Endpunkt und löschte damit alle übrigen Bestätigungen derselben Bedingung (Waage-Vorfall); der Abgleich im Büro war dimensionsblind und richtete denselben Schaden an. Wer die Bestätigungen entfernt hatte, ließ sich nicht sagen, weil die Erfüllungstabelle nur den aktuellen Stand kennt.

## Entscheidung

1. **Zwei Schalter statt Aufzählung:** `participant_requirement.per_event_day` und `per_competition` (Vorgabe aus); die vierte Kombination entsteht von selbst. An der Erfüllung stehen nullbare Dimensionen `event_day` und `competition` (`V202608141900__participant_requirement_dimensions.sql`).
2. **Eindeutigkeit mit `unique nulls not distinct`** über `(participant, event, participant_requirement, event_day, competition)`; der Primärschlüssel weicht diesem Index. Bestandszeilen bekommen den ersten Wettkampftag, unabhängig vom Schalter. Weil jOOQ ohne Primärschlüssel kein `UpdatableRecord` erzeugt, laufen Updates als gewöhnliche Anweisung.
3. **Die Regel „gilt für diese Person in diesem Lauf?" liegt in `RequirementScopeLogic`** (rein, `app/participantRequirement/boundary`), im Frontend gespiegelt in `frontend/src/components/qrApp/requirementScope.ts`. Regel: je Tag und je Wettkampf, nicht je Lauf – Vorlauf bis Finale teilen eine Bestätigung. Das Erledigungsfenster rechnet gegen den ersten Lauf des Rahmens.
4. **Scan-Bestätigungen sind additiv.** Endpunkt `approve/participant` für genau eine Person, idempotent (Upsert), mit Tag und Wettkampf. Der Tag wird serverseitig bestimmt – eine falsch gestellte Tablet-Uhr darf nicht für einen anderen Tag abhaken. Der Wettkampf ist Pflicht bei `perCompetition`, sonst 400; der Waage-Scan wählt ihn.
5. **Der Abgleich schreibt nur im Rahmen:** trägt den Wettkampf, löscht und schreibt dimensionsscharf, lehnt wettkampfbezogene Bedingungen ohne Wettkampf ab, erhebt Betroffene vor dem Löschen und schreibt nur echte Änderungen. Die Liste zählt Bedingungen, nicht Zeilen (kein „3/2" mehr). Die Massenpflege behält den Ersetzen-Endpunkt.
6. **Revisionsprotokoll:** `participant_requirement_log` (`V202608152000`) mit `source` ∈ SCAN, BULK, IMPORT, mitgeschrieben an Scan und Abgleich in beide Richtungen, mit Rahmen. Die Rücknahme ist die hervorgehobene Richtung. Getrennt aus demselben Grund wie `participant_tracking_change` neben `participant_tracking` (ADR-0075): dort steht, was gilt, hier, wer das wann festgelegt hat.

## Verworfene Alternativen

- Aufzählungstyp für den Geltungsbereich: vier Werte, die die zwei Schalter ohnehin ergeben.
- Sentinel-Werte oder ein `coalesce`-Ausdrucksindex statt `nulls not distinct`: verworfen, Begründung steht in der Migration.
- Ersetzen-Semantik am Scan beibehalten: genau der Waage-Vorfall.
- Tag vom Gerät nehmen: Tablet-Uhren sind nicht vertrauenswürdig.

## Konsequenzen

- Der Export „offene Bedingungen" prüft weiter nur, OB eine Bestätigung existiert; er ist dimensionsblind – bewusst offen, mehrfach dokumentiert.
- Der Datei-Import schreibt noch nicht ins Protokoll (Quelle IMPORT ist vorbereitet); die Protokollansicht ist eine Liste, keine Auswertung.
- Der Datenverlust an der Waage auf Produktion wurde nicht weiterverfolgt.
- `1f2718b6` verhindert Doppelzeilen neben Bestandszeilen; wer die Backfill-Regel ändert, muss das mitdenken.
- Zwei Regel-Kopien (Kotlin und TypeScript) müssen synchron bleiben; ein Test je Seite ist die Bremse.

## Quellen

- Commits: `9aa00702`, `9c4a75ac`, `710d91d3`, `b5469ee1` (Dimensionen); `305a31c6`, `9d43c009`, `60faff70`, `1f2718b6` (additive Scans, Abgleich); `82f0f349` (Protokoll)
- Migrationen: `V202608141900__participant_requirement_dimensions.sql`, `V202608152000__participant_requirement_log.sql`
- Code: `RequirementScopeLogic.kt`, `frontend/src/components/qrApp/requirementScope.ts`
- Verwandte ADRs: [ADR-0027](0027-teilnahmebedingungen-global-je-event-manuell.md), [ADR-0039](0039-helfer-app-eigener-bereich-unter-app.md), [ADR-0075](0075-manueller-checkin-mit-begruendung-und-spur.md), [ADR-0076](0076-mein-event-band-qr-ohne-anmeldung.md), [ADR-0099](0099-helfer-app-scannen-zuerst.md)
