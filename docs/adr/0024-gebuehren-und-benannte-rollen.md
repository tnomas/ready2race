# ADR-0024: Gebühren als eigene Entität mit Pflicht/Optional; benannte Rollen (NamedParticipant) nur als Rolle

- Status: angenommen
- Datum: 2025-02-28
- Bereich: domäne, api
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Wettkämpfe haben Startgelder, und ein Team besteht aus benannten Rollen (Ruderin, Steuermann) mit Anzahlen je Geschlecht. Beides gehörte zum ersten Wettkampfmodell vom Januar 2025. Bei der Umbenennung Race → Competition am 2025-02-26 wurde das Gebührenmodell aus Backend und Frontend entfernt und nur im Schema belassen; zwei Tage später wurde es neu gebaut. Die Rollen trugen zunächst Standardanzahlen und ein Pflicht-Flag, was sich in der Praxis als überflüssig erwies.

## Entscheidung

**Gebühren**
- `fee` ist eine globale Konfigurationsentität (Name, Beschreibung). Die Zuordnung zum Wettkampf liegt in `competition_properties_has_fee` mit Betrag und `required`-Flag (`V202501151000__events_structure.sql`, Neubau `5580e223`).
- Pflichtgebühren gelten für jede Meldung; optionale Gebühren wählt der Verein bei der Meldung (`competition_registration_optional_fee`).
- Beträge sind in der OpenAPI als String (Dezimalzahl) typisiert (`542eaa41`), damit kein Gleitkommafehler in Rechnungen landet.
- Eine Gebühr darf je Wettkampf nur einmal zugeordnet werden (`56174382`).
- Löschen einer referenzierten Gebühr, Kategorie oder Rolle antwortet mit 409 (`add51539`, siehe [ADR-0011](0011-http-fehlersemantik-und-errorcode-muster.md)).
- Mit der Nachmeldung bekam jede Gebühr zusätzlich `late_amount` ([ADR-0019](0019-rechnungen-aus-meldungen-snapshot.md)).

**Benannte Rollen**
- `named_participant` beschreibt ausschließlich die Rolle (Name, Beschreibung). Anzahlen je Rolle und Geschlecht stehen in `competition_properties_has_named_participant`; sie gehören zum Wettkampf, nicht zur Rolle.
- Default-Teilnehmerzahlen und das Required-Flag an der Rolle wurden aus Backend, Frontend und Schema entfernt (`ff0e6c80`, `2828ac3a`).
- Doppelte Rollen je Wettkampf werden im Frontend validiert (`9f3f97aa`).

## Verworfene Alternativen

- Erstes Gebührenmodell aus dem Januar: bei Race → Competition entfernt (`338b6536`) und neu gebaut (`5580e223`), weil die Zuordnung an den kopierten Properties hängen musste ([ADR-0023](0023-wettkampfvorlagen-kopieren-nicht-referenzieren.md)).
- Default-Anzahlen und Pflicht-Flag an der Rolle: entfernt, weil dieselbe Rolle je Wettkampf unterschiedlich besetzt ist und ein Default nur Verwirrung stiftete.
- Betrag als Zahl in der API: durch String ersetzt.

## Konsequenzen

- Der Betrag lebt nur in der Zuordnung; „was kostet diese Gebühr" ist ohne Wettkampf nicht beantwortbar.
- Rollen sind so schlank, dass sportartspezifische Eigenschaften (z. B. „muss eine Steuerperson sein") nicht an der Rolle hängen können; die Geschlechterverteilung wird beim Melden aus den Anzahlen geprüft ([ADR-0026](0026-meldung-je-verein-teams-je-wettkampf.md)).
- Spätere Erweiterungen hängen weitere Eigenschaften an die Rolle statt an den Wettkampf: Bedingungen je Rolle (`f6ebcd70`), QR-Pflicht je Rolle (`V202508110948`). Wer die Rolle liest, muss beide Ebenen kennen.
- String-Beträge müssen im Frontend geparst und formatiert werden; Rechenoperationen finden ausschließlich im Backend statt.

## Quellen

- Commits: `338b6536` (Gebühren entfernt), `c6d9757b` (Schema Gebührenzuordnung), `5580e223` (Gebühren neu), `542eaa41` (Betrag als String), `add51539` (409 bei Löschen), `2fddbc47`/`d58842f4` (Anzeige), `56174382` (keine Doppelgebühr), `41bb449e` (NamedParticipant CRUD), `ff0e6c80`/`2828ac3a` (Defaults und Required entfernt), `837d6fd0`/`9f3f97aa` (Frontend-Validierung)
- Migrationen: `V202501151000__events_structure.sql`, `V202502140000__event_registration.sql`
- Verwandte ADRs: [ADR-0011](0011-http-fehlersemantik-und-errorcode-muster.md), [ADR-0019](0019-rechnungen-aus-meldungen-snapshot.md), [ADR-0022](0022-veranstaltungsstruktur-event-tage-wettkaempfe.md), [ADR-0023](0023-wettkampfvorlagen-kopieren-nicht-referenzieren.md), [ADR-0026](0026-meldung-je-verein-teams-je-wettkampf.md)
