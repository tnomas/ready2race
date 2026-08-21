alter table timing_time_mark
    add column updated_at timestamp,
    add column updated_by uuid references app_user on delete set null;
