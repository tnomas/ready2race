set search_path to ready2race, pg_catalog, public;

-- Materialvermietung (Entwurf 2026-09-07, docs/superpowers/specs/2026-09-07-materialvermietung-design.md):
-- externe Anbieter verleihen Boote und Zubehör; Vereine stellen bei der Anmeldung Anfragen je
-- Meldung, der Anbieter bestätigt, teilt Stücke zu und führt eine Schadensakte.

create table material_provider
(
    id            uuid primary key,
    name          text      not null,
    contact_name  text,
    contact_email text,
    contact_phone text,
    note          text,
    created_at    timestamp not null,
    created_by    uuid      references app_user on delete set null,
    updated_at    timestamp not null,
    updated_by    uuid      references app_user on delete set null
);
create unique index material_provider_name_unique on material_provider (name);

-- Ein Nutzer gehört höchstens einem Anbieter, parallel zum Vereinsfeld app_user.club.
-- Der OWN-Scope der MATERIAL-Rechte wird gegen diese Spalte geprüft.
alter table app_user
    add column material_provider uuid references material_provider on delete set null;

-- Globales Stammdatum: die gemeinsame Sprache zwischen Bedarf am Wettkampf und Angebot des Anbieters.
create table material_type
(
    id          uuid primary key,
    name        text      not null,
    category    text      not null check (category in ('BOAT', 'OTHER')),
    description text,
    created_at  timestamp not null,
    created_by  uuid      references app_user on delete set null,
    updated_at  timestamp not null,
    updated_by  uuid      references app_user on delete set null
);
create unique index material_type_name_unique on material_type (name);

-- Konkretes Exemplar. Die Nummer ist für Boote die Nummer am Rumpf und soll der Startnummer
-- entsprechen (Spec Abschnitt 8). Die Bezeichnung ist kurz, damit sie in Grafiken passt.
create table material_item
(
    id                uuid primary key,
    material_provider uuid      not null references material_provider on delete cascade,
    material_type     uuid      not null references material_type on delete restrict,
    number            integer,
    label             text      not null check (char_length(label) between 1 and 20),
    note              text,
    status            text      not null default 'ACTIVE' check (status in ('ACTIVE', 'RETIRED')),
    created_at        timestamp not null,
    created_by        uuid      references app_user on delete set null,
    updated_at        timestamp not null,
    updated_by        uuid      references app_user on delete set null
);
create unique index material_item_number_unique
    on material_item (material_provider, material_type, number) where number is not null;
create index on material_item (material_provider);

-- Bedarf je Wettkampf (gilt für Wettkampf UND Vorlage, wie competition_properties_has_fee).
create table competition_properties_has_material_type
(
    competition_properties uuid    not null references competition_properties on delete cascade,
    material_type          uuid    not null references material_type on delete cascade,
    count                  integer not null check (count > 0),
    primary key (competition_properties, material_type)
);

-- Einladung eines Anbieters zu einer Veranstaltung. requests_closed sperrt neue Anfragen der Vereine.
create table event_has_material_provider
(
    event             uuid      not null references event on delete cascade,
    material_provider uuid      not null references material_provider on delete cascade,
    requests_closed   boolean   not null default false,
    created_at        timestamp not null,
    created_by        uuid      references app_user on delete set null,
    updated_at        timestamp not null,
    updated_by        uuid      references app_user on delete set null,
    primary key (event, material_provider)
);

-- Angebot je Veranstaltung, Anbieter und Materialart. planned_count speist die Ampel,
-- changeover_minutes die Konfliktprüfung zwischen zwei Läufen desselben Stücks.
create table material_offer
(
    id                 uuid primary key,
    event              uuid      not null,
    material_provider  uuid      not null,
    material_type      uuid      not null references material_type on delete cascade,
    price_text         text,
    planned_count      integer   not null default 0 check (planned_count >= 0),
    changeover_minutes integer   not null default 30 check (changeover_minutes >= 0),
    created_at         timestamp not null,
    created_by         uuid      references app_user on delete set null,
    updated_at         timestamp not null,
    updated_by         uuid      references app_user on delete set null,
    foreign key (event, material_provider) references event_has_material_provider on delete cascade,
    unique (event, material_provider, material_type)
);

-- Anfrage je Meldung und Angebot. Der Fremdschlüssel auf die Meldung ist aufgeschoben und ohne
-- Kaskade: Die Anmeldung löscht beim Speichern alle nicht gesperrten Meldungen und legt sie mit
-- derselben ID neu an (Task 3.0); innerhalb dieser Transaktion darf die Anfrage kurz ins Leere
-- zeigen. Wirklich entfernte Meldungen räumt MaterialService.dropRequestsOfRemovedRegistrations auf.
create table material_request
(
    id                       uuid primary key,
    competition_registration uuid      not null references competition_registration deferrable initially deferred,
    material_offer           uuid      not null references material_offer on delete cascade,
    count                    integer   not null check (count > 0),
    status                   text      not null check (status in ('REQUESTED', 'CONFIRMED', 'WAITLISTED', 'DECLINED', 'WITHDRAWN')),
    decision_note            text,
    requested_at             timestamp not null,
    decided_at               timestamp,
    created_at               timestamp not null,
    created_by               uuid      references app_user on delete set null,
    updated_at               timestamp not null,
    updated_by               uuid      references app_user on delete set null,
    unique (competition_registration, material_offer)
);
create index on material_request (material_offer);

-- Anfragen überleben das Neu-Speichern der Anmeldung (Meldung wird gelöscht und mit gleicher ID neu
-- angelegt), sollen aber mit einer wirklich entfernten Meldung verschwinden. Der Trigger feuert
-- aufgeschoben beim Commit und räumt nur Waisen weg. Der Name beginnt mit "A0", damit er vor den
-- RI-Triggern (RI_ConstraintTrigger_...) desselben Ereignisses läuft.
create or replace function material_request_orphan_cleanup() returns trigger
    language plpgsql as
$$
begin
    delete from material_request mr
    where mr.competition_registration = old.id
      and not exists (select 1 from competition_registration cr where cr.id = old.id);
    return null;
end;
$$;

create constraint trigger "A0_material_request_orphan_cleanup"
    after delete on competition_registration
    deferrable initially deferred
    for each row
execute function material_request_orphan_cleanup();

-- Zuteilung: ohne competition_match für den ganzen Wettkampf, mit competition_match als Ausnahme
-- je Lauf (Spec Abschnitt 9/10). Bei Menge > 1 mehrere Zeilen.
create table material_assignment
(
    id                uuid      primary key,
    material_request  uuid      not null references material_request on delete cascade,
    material_item     uuid      not null references material_item on delete restrict,
    competition_match uuid      references competition_match on delete cascade,
    created_at        timestamp not null,
    created_by        uuid      references app_user on delete set null,
    updated_at        timestamp not null,
    updated_by        uuid      references app_user on delete set null,
    unique nulls not distinct (material_request, material_item, competition_match)
);
create index on material_assignment (material_item);
create index on material_assignment (competition_match);

-- Schaden mit optionalem Ausfallfenster; das Fenster ist die einzige Quelle für "nicht verfügbar".
create table material_damage
(
    id                     uuid primary key,
    material_item          uuid      not null references material_item on delete cascade,
    reported_at            timestamp not null,
    reported_by            uuid      references app_user on delete set null,
    description            text      not null,
    severity               text      not null check (severity in ('MINOR', 'MAJOR', 'TOTAL', 'OUTAGE_ONLY')),
    status                 text      not null default 'REPORTED' check (status in ('REPORTED', 'REPAIRED')),
    -- Verursacher als Momentaufnahme, ohne Fremdschlüssel: Die Akte ist historisch und darf weder
    -- beim Neu-Speichern der Anmeldung (Meldung wird gelöscht und mit gleicher ID neu angelegt) noch
    -- beim endgültigen Löschen einer Meldung ihren Verursacher verlieren.
    caused_by_registration uuid,
    caused_by_team         text,
    caused_by_club         text,
    caused_by_competition  text,
    out_of_service_from    timestamp,
    out_of_service_until   timestamp,
    repaired_at            timestamp,
    created_at             timestamp not null,
    created_by             uuid      references app_user on delete set null,
    updated_at             timestamp not null,
    updated_by             uuid      references app_user on delete set null,
    check (out_of_service_until is null or out_of_service_from is null or out_of_service_until >= out_of_service_from)
);
create index on material_damage (material_item);

create table material_damage_photo
(
    id              uuid primary key,
    material_damage uuid      not null references material_damage on delete cascade,
    name            text      not null,
    content_type    text      not null,
    created_at      timestamp not null
);

create table material_damage_photo_data
(
    material_damage_photo uuid primary key references material_damage_photo on delete cascade,
    data                  bytea not null
);
