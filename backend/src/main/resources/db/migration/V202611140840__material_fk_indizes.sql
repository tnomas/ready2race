-- Fremdschlüssel der Materialvermietung, nach denen Abfragen oder Lösch-Prüfungen filtern,
-- bekommen einen Index - dieselbe Regel wie V202611132000 für die Durchführung: indiziert wird,
-- was eine Abfrage oder eine Kaskade/Restriktion tatsächlich durchsucht; die Audit-Spalten
-- (created_by/updated_by/reported_by) bleiben wie überall im Schema ohne Index.
--
-- material_damage_photo.material_damage: die Fotos jeder Schadensseite (listForDamages je
--   Seitenaufruf) und die Kaskade beim Löschen eines Schadens.
-- event_has_material_provider.material_provider: die Veranstaltungswahl des Anbieters
--   (listForProvider) und die Lösch-Prüfung des Anbieters; der Primärschlüssel beginnt mit event.
-- app_user.material_provider: die Lösch-Prüfung "noch Konten zugeordnet" und das set null beim
--   Löschen eines Anbieters (sonst Seq-Scan über alle Konten).
-- material_item.material_type, material_offer.material_type,
-- competition_properties_has_material_type.material_type: die Lösch-Prüfungen einer Materialart
--   (hasItems/hasOffers/hasCompetitionDemand) und die Kaskade/Restriktion dahinter; der
--   Primärschlüssel des Bedarfs beginnt mit competition_properties.
--
-- Ohne concurrently, weil Flyway jede Migration in einer Transaktion ausführt; die Tabellen sind
-- klein.

set search_path to ready2race, pg_catalog, public;

create index if not exists material_damage_photo_material_damage_idx
    on material_damage_photo (material_damage);

create index if not exists event_has_material_provider_material_provider_idx
    on event_has_material_provider (material_provider);

create index if not exists app_user_material_provider_idx
    on app_user (material_provider);

create index if not exists material_item_material_type_idx
    on material_item (material_type);

create index if not exists material_offer_material_type_idx
    on material_offer (material_type);

create index if not exists competition_properties_has_material_type_material_type_idx
    on competition_properties_has_material_type (material_type);
