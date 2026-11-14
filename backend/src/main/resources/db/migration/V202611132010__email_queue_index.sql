-- Mail-Warteschlange: der Versandjob fragt alle 10 s (und nach jedem Versand sofort)
--   where dont_send_before <= now and sent_at is null ... order by priority desc, created_at
-- Ohne Index war das ein Seq-Scan über alle je verschickten Mails. Der Teilindex enthält nur
-- offene Mails und liefert sie in Versandreihenfolge.
--
-- email_attachment.email: Anhänge je Mail beim Versand und das Kaskaden-Löschen versandter Mails.

set search_path to ready2race, pg_catalog, public;

create index if not exists email_queue_open_idx
    on email (priority desc, created_at)
    where sent_at is null;

create index if not exists email_attachment_email_idx
    on email_attachment (email);
