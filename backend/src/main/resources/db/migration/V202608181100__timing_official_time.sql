create table if not exists timing_official_time
(
    id                     uuid primary key,
    competition_match_team uuid      not null unique references competition_match_team on delete cascade,
    event                  uuid      not null references event on delete cascade,
    computed_millis        bigint,
    override_millis        bigint,
    penalty_millis         bigint    not null default 0,
    result_status          text      not null default 'NONE' check (result_status in ('NONE', 'DNS', 'DNF', 'DSQ')),
    dirty                  boolean   not null default false,
    pushed_at              timestamp,
    created_at             timestamp not null,
    created_by             uuid references app_user on delete set null,
    updated_at             timestamp not null,
    updated_by             uuid references app_user on delete set null
);
create index if not exists idx_timing_official_time_event on timing_official_time (event);
