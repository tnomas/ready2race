create unique index if not exists uq_timing_sequence_active_station
    on timing_start_sequence (station)
    where state in ('ARMED', 'RUNNING');
