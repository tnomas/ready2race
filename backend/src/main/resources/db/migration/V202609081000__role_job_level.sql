-- Rollen tragen ab jetzt den Job, aus dem sie stammen, und die Ebene, auf der sie
-- zugewiesen werden. Statische Rollen sind genau die Jobs; eigene Rollen sind Kopien.
-- Ebene: SELF, CLUB, EVENT, GLOBAL (ORGANIZER reserviert für den Mandanten-Umbau).
alter table role add column job text;
alter table role add column level text not null default 'GLOBAL';

update role set job = 'ADMIN', level = 'GLOBAL' where id = '00000000-0000-0000-0000-000000000000';
update role set job = 'USER', level = 'SELF' where id = '00000000-0000-0000-0000-000000000001';
update role set job = 'CLUB_REPRESENTATIVE', level = 'CLUB' where id = '00000000-0000-0000-0000-000000000002';

alter table role add constraint role_level_check
    check (level in ('SELF', 'CLUB', 'EVENT', 'ORGANIZER', 'GLOBAL'));
