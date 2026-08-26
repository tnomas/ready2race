set search_path to ready2race, pg_catalog, public;

-- Ein benannter Satz aus den vier Tönen einer Zeitnahme. Gehört der Veranstaltung, weil man ihn
-- einmal einstellt und viele Zeitnahmetypen ihn teilen -- wer die Lautstärke aller Typen ändern
-- will, ändert einen Satz statt sieben Typen.
create table timing_tone_set
(
    id                 uuid      primary key,
    event              uuid      not null references event on delete cascade,
    name               text      not null,
    -- Der Vorgabesatz: Typen ohne eigene Wahl erben ihn. Genau einer je Veranstaltung, erzwungen
    -- über den partiellen Index unten statt über Anwendungslogik -- zwei Vorgaben werfen eine
    -- Frage auf, die niemand beantworten kann.
    is_default         boolean   not null default false,
    -- null heißt jeweils "eingebauter Standard", damit "Standard wiederherstellen" möglich
    -- bleibt -- dieselbe Bedeutung wie bisher an Veranstaltung und Typ.
    sequence_tone_plan jsonb,
    split_tone         jsonb,
    false_start_tone   jsonb,
    finish_tone        jsonb,
    -- Unterscheidet der Erfassungston die Boote? Position 1 spielt den Zielton, die übrigen fünf
    -- eine pentatonische Leiter darüber. Gehört hierher: Es ist eine Eigenschaft des Klangbildes.
    tone_per_boat      boolean   not null default true,
    created_at         timestamp not null,
    created_by         uuid      references app_user on delete set null,
    updated_at         timestamp not null,
    updated_by         uuid      references app_user on delete set null,
    unique (event, name)
);

create unique index on timing_tone_set (event) where is_default;

alter table timing_mode
    -- null heißt "erbt den Vorgabesatz". set null beim Löschen: Wer einen Satz wegwirft, soll
    -- nicht gehindert werden; die Typen fallen auf die Vorgabe zurück statt unbrauchbar zu werden.
    add column tone_set               uuid references timing_tone_set on delete set null,
    -- Startet die App diesen Lauf? Vorgabe an -- das heutige Verhalten.
    add column start_sequence_enabled boolean not null default true,
    -- Die Tasten, die am Zielposten die Boote treffen, in Positionsreihenfolge. Zwei Reihen, weil
    -- man je nach Tastatur greift, was näher liegt; die zweite ist optional.
    add column boat_keys_primary      text not null default '123456',
    add column boat_keys_secondary    text default 'ABCDEF';

-- Überführung der Bestandsdaten. Die eine Zusicherung, an der sie hängt: Nach dieser Migration
-- darf keine Regatta anders klingen als vorher. Schwierig ist das, weil der Startsequenz-Tonplan
-- heute am TYP hängt und die übrigen drei Töne an der VERANSTALTUNG -- ein einziger Satz je
-- Veranstaltung könnte verschiedene Tonpläne nicht abbilden. Deshalb drei Schritte:

-- 1) Ein Vorgabesatz "Standard" je Veranstaltung, die Zeitnahmetypen ODER eigene Töne hat: die
--    drei Veranstaltungs-Töne unverändert, kein eigener Startplan (null = eingebauter
--    Standardplan, genau die heutige Bedeutung eines Typs ohne tone_plan).
--
--    Warum auch OHNE Typen: Die drei Ton-Spalten der Veranstaltung wirken heute unabhängig davon,
--    ob es Zeitnahmetypen gibt -- GET /timing/settings liefert Ziel- und Zwischenton an jedes
--    Board. Eine Regatta mit eigenem Zielton und ohne Typen ist also konfiguriert, und sie verlöre
--    ihre Töne ersatzlos, sobald die drei Spalten fallen. Die Zusicherung gilt für jede Regatta,
--    nicht nur für die mit Typen. Wirklich leer bleiben nur Veranstaltungen ohne Typen UND ohne
--    eigene Töne -- dort gäbe es nichts zu bewahren, und ein leerer Satz wäre nur Ballast in der
--    Verwaltungsliste.
--
--    tone_per_boat ausdrücklich auf false: Der Spaltenstandard true ist für NEUE Sätze richtig,
--    für den Bestand wäre er ein Klangwechsel. Heute gibt es keine Tonleiter je Boot; sobald sie
--    gebaut wird, dürfen bestehende Sätze davon nicht ungefragt umgeschaltet werden.
insert into timing_tone_set (id, event, name, is_default, sequence_tone_plan, split_tone,
                             false_start_tone, finish_tone, tone_per_boat, created_at, updated_at)
select gen_random_uuid(),
       e.id,
       'Standard',
       true,
       null,
       e.timing_split_tone,
       e.timing_false_start_tone,
       e.timing_finish_tone,
       false,
       now(),
       now()
from event e
where exists (select 1 from timing_mode m where m.event = e.id)
   or num_nonnulls(e.timing_split_tone, e.timing_false_start_tone, e.timing_finish_tone) > 0;

-- 2) Für JEDEN Typ mit eigenem tone_plan ein weiterer Satz, benannt nach dem Typ, mit dessen
--    Tonplan und denselben drei Veranstaltungs-Tönen.
--
--    Der Satz bekommt bewusst die Id SEINES Zeitnahmetyps: So findet Schritt 3 ohne einen zweiten
--    Weg zurück (und ohne eine zweite Kopie des Namens-Ausdrucks unten) zum gerade angelegten
--    Satz. Zwei Tabellen sind zwei Schlüsselräume, dieselbe uuid kollidiert nirgends.
insert into timing_tone_set (id, event, name, is_default, sequence_tone_plan, split_tone,
                             false_start_tone, finish_tone, tone_per_boat, created_at, created_by,
                             updated_at, updated_by)
select m.id,
       m.event,
       -- Namenskollision: Der Name des Typs ist je Veranstaltung eindeutig (unique (event, name)
       -- an timing_mode), er kann hier also nur mit dem EINEN anderen Namen kollidieren, den
       -- dieser Umzug vergibt -- "Standard" aus Schritt 1. Genau dieser Typ bekommt einen Zusatz;
       -- heißt ein weiterer Typ derselben Veranstaltung schon so, entscheidet die Id, die ohnehin
       -- eindeutig ist. Umbenennen kann die Regattaleitung hinterher, verlieren soll sie nichts.
       case
           when m.name <> 'Standard' then m.name
           when not exists (select 1
                            from timing_mode o
                            where o.event = m.event
                              and o.name = 'Standard (Zeitnahmetyp)')
               then 'Standard (Zeitnahmetyp)'
           else 'Standard (' || m.id || ')'
           end,
       false,
       m.tone_plan,
       e.timing_split_tone,
       e.timing_false_start_tone,
       e.timing_finish_tone,
       -- Wie beim Vorgabesatz: false für den Bestand, damit die Tonleiter je Boot niemanden
       -- ungefragt umschaltet.
       false,
       m.created_at,
       m.created_by,
       m.updated_at,
       m.updated_by
from timing_mode m
         join event e on e.id = m.event
where m.tone_plan is not null;

-- 3) Der Typ zeigt auf seinen Satz. Typen OHNE eigenen Tonplan bleiben auf tone_set = null und
--    erben damit "Standard" -- auch das ist genau ihr heutiger Klang: die drei Töne der
--    Veranstaltung plus der eingebaute Startplan.
update timing_mode m
set tone_set = m.id
where m.tone_plan is not null;

-- Und damit geht der Startsequenz-Tonplan im Ton-Satz auf.
--
-- Die drei Ton-Spalten der VERANSTALTUNG (timing_split_tone, timing_false_start_tone,
-- timing_finish_tone) bleiben ausdrücklich stehen: Sie fallen erst, wenn der Leseweg auf die
-- Ton-Sätze umgebaut ist. Fielen sie hier mit, stünde zwischen zwei Migrationen ein Zustand ohne
-- Töne.
alter table timing_mode
    drop column tone_plan;
