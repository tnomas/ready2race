create table if not exists timing_start_sequence
(
    id                uuid primary key,
    event             uuid      not null references event on delete cascade,
    station           uuid      not null references timing_station on delete restrict,
    mode              text      not null check (mode in ('MASS', 'INTERVAL')),
    interval_millis   bigint,
    state             text      not null default 'ARMED' check (state in ('ARMED', 'RUNNING', 'DONE', 'ABORTED')),
    started_at_millis bigint,
    created_at        timestamp not null,
    created_by        uuid references app_user on delete set null,
    updated_at        timestamp not null,
    updated_by        uuid references app_user on delete set null
);

create table if not exists timing_start_sequence_entry
(
    id                     uuid primary key,
    sequence               uuid      not null references timing_start_sequence on delete cascade,
    competition_match_team uuid      not null references competition_match_team on delete cascade,
    position               int       not null,
    status                 text      not null default 'PENDING' check (status in ('PENDING', 'STARTED', 'SKIPPED')),
    time_mark              uuid references timing_time_mark on delete set null,
    unique (sequence, position)
);

create index if not exists idx_timing_sequence_event on timing_start_sequence (event);
create index if not exists idx_timing_sequence_entry_seq on timing_start_sequence_entry (sequence);
