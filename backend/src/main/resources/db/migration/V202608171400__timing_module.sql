create table if not exists timing_station
(
    id         uuid primary key,
    event      uuid      not null references event on delete cascade,
    name       text      not null,
    type       text      not null check (type in ('START', 'SPLIT', 'FINISH')),
    sorting    int       not null,
    created_at timestamp not null,
    created_by uuid references app_user on delete set null,
    updated_at timestamp not null,
    updated_by uuid references app_user on delete set null,
    unique (event, name)
);

create table if not exists timing_time_mark
(
    id               uuid primary key,
    event            uuid      not null references event on delete cascade,
    station          uuid      not null references timing_station on delete restrict,
    timestamp_millis bigint    not null,
    source           text      not null default 'APP_USER' check (source in ('APP_USER', 'HARDWARE')),
    status           text      not null default 'ACTIVE' check (status in ('ACTIVE', 'RETRACTED')),
    created_at       timestamp not null,
    created_by       uuid references app_user on delete set null
);

create index if not exists idx_timing_time_mark_event on timing_time_mark (event);
create index if not exists idx_timing_time_mark_station on timing_time_mark (station);

create table if not exists timing_assignment
(
    id                     uuid primary key,
    time_mark              uuid      not null unique references timing_time_mark on delete cascade,
    competition_match_team uuid      not null references competition_match_team on delete cascade,
    created_at             timestamp not null,
    created_by             uuid references app_user on delete set null,
    updated_at             timestamp not null,
    updated_by             uuid references app_user on delete set null
);

create index if not exists idx_timing_assignment_team on timing_assignment (competition_match_team);
