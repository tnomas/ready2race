# ADR-0022: Veranstaltungsstruktur Event → Veranstaltungstage → Wettkämpfe; „Competition" statt „Race"

- Status: angenommen
- Datum: 2025-01-16
- Bereich: domäne, api
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Eine Veranstaltung erstreckt sich über mehrere Tage, an denen Wettkämpfe stattfinden; ein Wettkampf kann sich über mehrere Tage ziehen (Vorlauf am Samstag, Finale am Sonntag). Der erste Entwurf nannte den Wettkampf „Race", was zu rennsportlastig war: Die Software soll auch für Sportarten ohne Rennen taugen. Parallel wurde im Januar 2025 ein Muster „Properties-Objekte" als gemeinsamer Kern von Request und DTO eingeführt und im Februar teilweise wieder zurückgebaut.

## Entscheidung

- **Drei Ebenen.** `event` (mit Meldezeitraum `registration_available_from/to`), `event_day` je Datum, `competition` je Event. Wettkämpfe werden Tagen über die n:m-Tabelle `event_day_has_competition` zugeordnet; die Zuordnung ist von beiden Seiten pflegbar (Assign-Requests am Tag und am Wettkampf). Alles in `V202501151000__events_structure.sql`.
- **Begriff „Competition".** Alle Artefakte heißen Competition, CompetitionTemplate, CompetitionCategory, CompetitionProperties (`bc1aa1b9`, `338b6536`). „Race" kommt in Code, API und Oberfläche nicht vor; deutsch heißt es „Wettkampf". Die Ableitung „Rennen" bleibt der Zeitnahme vorbehalten ([ADR-0080](0080-zeitnahmeprofil-baum-vier-ebenen.md)).
- **Eigenschaften als kopierte Struktur.** Ein `CompetitionRequest` enthält entweder eine Vorlagen-ID oder vollständige Properties; beim Anlegen werden die Eigenschaften nach `competition_properties` kopiert (samt `named_participant`- und Gebühren-Zuordnungen). `CompetitionProperties` ist die einzige verbliebene Properties-Klasse, weil sie kopiert wird und deshalb eine eigene Identität hat.
- **Sortierung nach Kennung.** `identifier` (die Rennnummer) wird auf Datenbankebene mit numerischem Suffix sortiert, auch wenn die Kennung nicht auf eine Zahl endet (`4862d846`, `22de55a9`).
- **Listen aus Views.** Event-Listen kommen aus einer View mit Zählern (Wettkämpfe, Meldungen, von/bis), gepflegt in `afterMigrate.sql` ([ADR-0015](0015-views-in-aftermigrate-enums-als-text.md)).

## Verworfene Alternativen

- Meldung je Tag (`event_day_registration`): im ersten Registrierungsschema angelegt (`730ca857`), danach nicht weiterverfolgt; gemeldet wird je Event und je Wettkampf ([ADR-0026](0026-meldung-je-verein-teams-je-wettkampf.md)).
- Durchgängiges Properties-Muster (`EventProperties`, `EventDayProperties`, `AppUserProperties` als Kern von Request und DTO, `4c874e4e`): ab Februar 2025 aufgelöst und die Felder direkt in DTOs/Requests verlagert (`5d9cad78`, `b8d2c463`), weil die Generalisierung außer bei kopierten Strukturen keinen Nutzen brachte.
- Begriff „Race": ersetzt, siehe oben.

## Konsequenzen

- Die n:m-Zuordnung erlaubt mehrtägige Wettkämpfe, verlangt aber bei jeder Tagesansicht einen Join; „an welchem Tag läuft dieses Finale" beantwortet erst der Zeitplan ([ADR-0063](0063-zeitstrahl-slots-feste-uhrzeit-import.md)), nicht diese Tabelle.
- Wer eine neue Ebene (z. B. Sektion) braucht, hängt sie an das Event und ordnet Wettkämpfe zu; die Tagesstruktur bleibt unberührt.
- Die Umbenennung Race → Competition war ein einziger großer Commit mit Schema, API und Frontend; das erste Gebührenmodell fiel dabei aus Backend und Frontend heraus ([ADR-0024](0024-gebuehren-und-benannte-rollen.md)).
- `identifier` und `short_name` werden leicht verwechselt: `identifier` ist die Kennung (Rennnummer), `short_name` das Kürzel ([ADR-0081](0081-kurzbezeichner-kennung-kuerzel-sportneutral.md)).

## Quellen

- Commits: `f6f0e09d` (Create event), `026907ac` (Event CRUD), `caf06e18` (Event Day CRUD), `c0c1d1a0` (Race CRUD), `4c874e4e` (Properties-Generalisierung), `2f403f02` (EventDay Frontend), `7470d7ac` (Zuordnung Tag/Wettkampf), `62af2ff0` (Merge #30), `bc1aa1b9`/`338b6536`/`9e2a06ce` (Race → Competition), `4862d846`/`22de55a9` (Sortierung nach identifier), `5d9cad78`/`b8d2c463` (Properties zurückgebaut), `730ca857` (event_day_registration im Erstentwurf)
- Migrationen: `V202501151000__events_structure.sql`
- Verwandte ADRs: [ADR-0015](0015-views-in-aftermigrate-enums-als-text.md), [ADR-0023](0023-wettkampfvorlagen-kopieren-nicht-referenzieren.md), [ADR-0024](0024-gebuehren-und-benannte-rollen.md), [ADR-0026](0026-meldung-je-verein-teams-je-wettkampf.md), [ADR-0063](0063-zeitstrahl-slots-feste-uhrzeit-import.md), [ADR-0081](0081-kurzbezeichner-kennung-kuerzel-sportneutral.md)
