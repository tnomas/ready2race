set search_path to ready2race, pg_catalog, public;

-- Distanz und Bezugsgröße gehören dem Wettkampf, nicht der Zeitnahme: Die Zeitnahme braucht Start
-- und Ziel, alles andere ist Ausstattung der Strecke.
--
-- An competition_properties und nicht an competition, weil dieselbe Tabelle laut Check-Constraint
-- auch die Zeilen der Wettkampf-VORLAGEN trägt. Eine Vorlage bringt damit beides mit, und die 19
-- Wettkämpfe einer Regatta müssen es nicht 19-mal von Hand bekommen.
alter table competition_properties
    add column distance_meters int
        check (distance_meters is null or distance_meters > 0),
    -- set null statt restrict: Wer eine Bezugsgröße löscht, soll nicht gehindert werden -- der
    -- Wettkampf zeigt dann eben kein Tempo mehr. Sie ist reine Anzeige und verfälscht keine
    -- Messung, also ist die mildere Wirkung die richtige.
    add column pace_reference uuid references pace_reference on delete set null;
