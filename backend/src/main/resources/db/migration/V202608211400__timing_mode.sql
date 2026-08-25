-- Zeitnahmetypen der internen Zeitnahme: je Veranstaltung gepflegte Vorlagen dafür, WIE ein
-- Wettkampf gestartet und gemessen wird (Einzelstarts im festen Abstand, gemeinsame Startwellen,
-- Massenstart als eine Welle mit allen, mit oder ohne Rundenzeiten).
--
-- Warum eine eigene Tabelle statt Spalten am Wettkampf: derselbe Typ gilt typischerweise für viele
-- Wettkämpfe ("alle Vorläufe als Timetrial 30s"), und die Zuordnung kann je Runde abweichen
-- (Vorlauf einzeln, Finale als Massenstart). Vorlage und Zuordnung sind deshalb getrennt --
-- dasselbe Muster wie bei den Wettkampfvorlagen.
create table timing_mode
(
    id               uuid      primary key,
    event            uuid      not null references event on delete cascade,
    name             text      not null,
    -- Werden Rundenzeiten erwartet? Steuert, ob SPLIT-Posten für Läufe dieses Typs relevant sind.
    with_laps        boolean   not null default false,
    -- Wie viele Boote je Startvorgang: EINZEL = jedes Boot startet für sich (Timetrial),
    -- WELLE = mehrere gemeinsam. Der Massenstart ist keine dritte Ausprägung, sondern eine
    -- Welle, in der schlicht alle Boote des Laufs stehen -- deshalb gibt es nur zwei Werte.
    start_grouping   text      not null check (start_grouping in ('EINZEL', 'WELLE')),
    -- Gesetzt: die Starts folgen automatisch in diesem festen Abstand (Intervallstart).
    -- null: jeder Start wird von Hand ausgelöst. Sekunden statt Millisekunden, weil das die
    -- Größenordnung ist, in der Regattaleitungen denken -- die Sequenz-Mechanik rechnet um.
    interval_seconds int       check (interval_seconds is null or interval_seconds > 0),
    -- Vorlauf/Countdown vor dem (ersten) Start; schließt an die lead_in-Mechanik der
    -- Startsequenzen an (V202608180845, dort 10000 ms als Standard -- daher 10 s).
    lead_in_seconds  int       not null default 10 check (lead_in_seconds >= 0),
    created_at       timestamp not null,
    created_by       uuid      references app_user on delete set null,
    updated_at       timestamp not null,
    updated_by       uuid      references app_user on delete set null,
    -- Der Name ist das, worüber die Regattaleitung den Typ auswählt -- doppelt wäre er nicht mehr
    -- unterscheidbar. Gleiche Regel wie bei timing_station (V202608171400).
    unique (event, name)
);

-- Zuordnung Zeitnahmetyp -> Wettkampf und/oder Runde. Ein Eintrag ohne Runde gilt für den ganzen
-- Wettkampf; ein Eintrag mit Runde übersteuert ihn genau für diese Runde (Auflösung im Service,
-- reine Logik nach dem Muster von RequirementScopeLogic).
create table timing_mode_assignment
(
    id                      uuid      primary key,
    competition             uuid      not null references competition on delete cascade,
    competition_setup_round uuid      references competition_setup_round on delete cascade,
    -- restrict statt cascade: das Löschen eines Typs darf Wettkämpfe nicht stillschweigend
    -- unkonfiguriert zurücklassen -- der Service verlangt, erst die Zuordnungen zu lösen.
    timing_mode             uuid      not null references timing_mode on delete restrict,
    created_at              timestamp not null,
    created_by              uuid      references app_user on delete set null,
    updated_at              timestamp not null,
    updated_by              uuid      references app_user on delete set null,
    -- nulls not distinct (Postgres 17): auch der Wettkampf-Eintrag ohne Runde darf nur einmal
    -- existieren. Ohne die Klausel wären beliebig viele (competition, null)-Zeilen erlaubt und
    -- die Auflösung müsste raten, welche gilt.
    unique nulls not distinct (competition, competition_setup_round)
);

create index on timing_mode_assignment (competition);
