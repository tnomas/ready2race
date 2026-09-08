# ADR-0043: Wertungskategorien je Meldung mit Altersbeschränkung je Veranstaltung

- Status: angenommen
- Datum: 2025-08-05
- Bereich: domäne, datenbank
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Innerhalb eines Wettkampfs starten Teams in verschiedenen Wertungen, etwa Altersklassen oder Leistungsklassen, fahren aber im selben Lauf. Startlisten, Ergebnisse und Urkunden müssen die Wertung kennen, ohne dass je Wertung ein eigener Wettkampf angelegt wird. Die Zuordnung soll schon bei der Meldung erfolgen, und Veranstalter wollen prüfen, ob ein Team altersmäßig in die gewählte Kategorie passt.

## Entscheidung

- Wertungskategorien sind eine Stammtabelle `rating_category` (`name`, `description`, Audit-Spalten; Migration `V202508051600__rating_categories_for_teams.sql`).
- Die Zuordnung hängt an der **Wettkampfmeldung**: Spalte `competition_registration.rating_category`. Die Auswahl passiert im Meldedialog, nicht nachträglich in der Durchführung.
- Ob eine Kategorie Pflicht ist, entscheidet der Wettkampf: `competition_properties.rating_category_required` (Migration `V202510281215__rating_category_configuration.sql`). Ist für eine Veranstaltung keine Kategorie konfiguriert, entfällt die Pflicht auch bei gesetztem Schalter (`a8140e9d`).
- Welche Kategorien in einer Veranstaltung wählbar sind und mit welcher Altersgrenze, steht in `event_rating_category` (`event`, `rating_category`, `year_restriction_from`, `year_restriction_to`; Migration `V202510301530__rating_category_age_restriction.sql`). Die Jahrgangsprüfung läuft bei der Meldung im Backend.
- Der Startlisten-Export kann die Kategorie als Spalte ausgeben (Migration `V202508071030__rating_category_in_startlist_export.sql`) oder an den Kurznamen anhängen (`append_rating_to_short_name`, [ADR-0042](0042-startlisten-export-ergebnisimport-stabile-kennung.md)).

## Verworfene Alternativen

- Keine belegt. Ein eigener Wettkampf je Wertung ist der implizite Gegenentwurf, den die Entität vermeidet.

## Konsequenzen

- Die Kategorie ist eine Eigenschaft der Meldung und damit stabil über Runden und Läufe; ein Team wechselt seine Wertung nicht zwischen Vorlauf und Finale.
- Ergebnisse je Kategorie sind eine Ableitung über die gemischten Läufe; wie diese Rechnung an genau einer Stelle passiert und wie die Kategorien sortiert werden (`V202608091510__rating_category_sort_order.sql`), regelt [ADR-0072](0072-ergebnisse-nach-wertungskategorien-und-partie.md).
- Der Pflicht-Schalter am Wettkampf und die Freischaltung je Veranstaltung sind zwei Stellen; eine Kategorie, die am Wettkampf verlangt, aber in der Veranstaltung nicht freigeschaltet ist, führt zu keiner Pflicht. Das ist gewollt, überrascht aber beim Konfigurieren.
- Altersgrenzen sind Jahrgänge (`year_restriction_*`), keine Stichtage; Sportarten mit Stichtagsregeln brauchen eine Erweiterung.
- Die Kategorien sind Teil der Datensicherung (`DB_RATING_CATEGORIES`, [ADR-0047](0047-webdav-export-jobs-und-datensicherung.md)).

## Quellen

- Commits: `ba60a339` (CRUD-Backend Wertungskategorien), `79d15f14` (Zuweisung und Frontend), `864873f2` (Auswahl bei der Meldung), `50646062` (Altersbeschränkung), `a8140e9d` (Pflicht entfällt ohne konfigurierte Kategorie)
- Migrationen: `V202508051600__rating_categories_for_teams.sql`, `V202508071030__rating_category_in_startlist_export.sql`, `V202510281215__rating_category_configuration.sql`, `V202510301530__rating_category_age_restriction.sql`
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/ratingcategory/`
- Verwandte ADRs: [ADR-0026](0026-meldung-je-verein-teams-je-wettkampf.md), [ADR-0042](0042-startlisten-export-ergebnisimport-stabile-kennung.md), [ADR-0047](0047-webdav-export-jobs-und-datensicherung.md), [ADR-0072](0072-ergebnisse-nach-wertungskategorien-und-partie.md)
