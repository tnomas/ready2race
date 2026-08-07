set search_path to ready2race, pg_catalog, public;

-- Schweregrade der Schiedsrichter-Pruefungen (Entwurf 2026-08-07).
--
-- Zwei getrennte Fragen, zwei getrennte Orte: OB eine Pruefung fuer einen Wettkampf gilt, ist eine
-- Eigenschaft des Rennformats und steht am Wettkampf. WIE hart sie geahndet wird, ist eine
-- Entscheidung des Renntages und steht in competition_check_severity.

-- Der Beachsprint braucht keine An-/Abmeldung aufs Wasser, die Langstrecke schon. Das Flag liegt
-- auf competition_properties und nicht auf competition, weil diese Tabelle wahlweise an einem
-- Wettkampf ODER an einer Wettkampf-Vorlage haengt: so wird es einmal in der Vorlage gesetzt statt
-- bei jeder Regatta neu. Default true erhaelt das bisherige Verhalten aller bestehenden Wettkaempfe.
alter table competition_properties
    add column check_in_out_required boolean not null default true;

-- Bewusst duenn besetzt: nur Abweichungen vom eingebauten Standard stehen hier. Fehlt eine Zeile,
-- gilt LiveDashboardLogic.defaultSeverity -- und der ist exakt das Verhalten vor diesem Entwurf.
-- Deshalb gibt es keinen Datenmigrations-Schritt: bestehende Regatten verhalten sich unveraendert.
create table competition_check_severity
(
    competition             uuid      not null references competition on delete cascade,
    -- INVOICE_OPEN | NOT_ON_WATER | REQUIREMENT | REQUIREMENT_TIME_WINDOW
    check_type              text      not null,
    -- nur bei den beiden REQUIREMENT-Typen gesetzt
    participant_requirement uuid references participant_requirement on delete cascade,
    -- OK | WARNING | CRITICAL
    severity                text      not null,
    created_at              timestamp not null,
    created_by              uuid references app_user on delete set null,
    updated_at              timestamp not null,
    updated_by              uuid references app_user on delete set null
);

-- Zwei partielle Indizes statt eines zusammengesetzten: Postgres behandelt NULLs in einem
-- Unique-Key als verschieden, ein einzelner Index liesse fuer INVOICE_OPEN und NOT_ON_WATER
-- beliebig viele Duplikate zu.
create unique index uq_ccs_competition_check
    on competition_check_severity (competition, check_type)
    where participant_requirement is null;

create unique index uq_ccs_competition_check_requirement
    on competition_check_severity (competition, check_type, participant_requirement)
    where participant_requirement is not null;

create index idx_ccs_competition on competition_check_severity (competition);
