-- Attribution of the external timing provider on public result views.
--
-- Timing providers may require a visible reference/link when their timing data is published
-- (e.g. RaceClocker, terms and conditions no. 6). The provider attribution (display name +
-- website) is configured on the match result import config, and each match keeps a reference
-- to the config its results were last imported with, so public result views can render
-- "Timing by <provider>" with a link.

alter table match_result_import_config
    add column attribution_name text,
    add column attribution_url text;

update match_result_import_config
    set attribution_name = 'RaceClocker',
        attribution_url = 'https://raceclocker.com'
    where name ilike '%raceclocker%';

update match_result_import_config
    set attribution_name = 'Webscorer',
        attribution_url = 'https://www.webscorer.com'
    where name ilike '%webscorer%';

alter table competition_match
    add column result_import_config uuid references match_result_import_config on delete set null;
