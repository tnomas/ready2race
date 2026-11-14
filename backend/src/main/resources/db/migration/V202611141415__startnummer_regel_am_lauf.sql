-- Startnummer aus Meldungsnummer: die Regel steht am Lauf (ADR-0111, Nachtrag vom 14.11.2026).
--
-- V202611141330 hielt den Schalter nur an der Veranstaltung, und der RaceClocker-Abruf las ihn bei
-- jedem Takt neu. Ein Refinalisieren ohne Haken nach angelegten Runden schaltete damit auch für
-- schon angelegte Läufe zurück: Der nächste Abruf schrieb Listenpositionen 1..n hinein, und jedes
-- Leihboot stand mitten im Renntag als "abweichend" da. Umgekehrt kam ein Bahntausch aus RaceClocker
-- für Läufe, die mit Setzposition angelegt waren, nach einem Refinalisieren mit Haken still nicht
-- mehr an.
--
-- Deshalb stempelt die Rundenanlage die Regel an jeden Lauf, den sie anlegt
-- (competition_match.team_numbers_as_start_numbers). Jede Stelle, die über einen bestehenden Lauf
-- entscheidet (RaceClocker-Abruf, Freilos-Setzungszahl), liest den Stempel; der Schalter an der
-- Veranstaltung gilt nur noch für neu anzulegende Runden.
--
-- Backfill konservativ: true nur, wenn die Veranstaltung den Schalter trägt UND jede Startnummer des
-- Laufs der Meldungsnummer ihres Teams entspricht (mindestens ein Team, keine fehlende
-- Meldungsnummer). Sonst false - dann bleibt das bisherige Verhalten (Bahnen aus RaceClocker,
-- Setzungszahl am Freilos-Chip), wie es für jeden vor dem Schalter angelegten Lauf galt.

set search_path to ready2race, pg_catalog, public;

alter table competition_match
    add column team_numbers_as_start_numbers boolean not null default false;

update competition_match cm
set team_numbers_as_start_numbers = true
from competition_setup_match csm
         join competition_setup_round csr on csr.id = csm.competition_setup_round
         join competition_properties cp on cp.id = csr.competition_setup
         join competition c on c.id = cp.competition
         join event e on e.id = c.event
where csm.id = cm.competition_setup_match
  and e.team_numbers_as_start_numbers
  and exists (select 1
              from competition_match_team cmt
              where cmt.competition_match = cm.competition_setup_match)
  and not exists (select 1
                  from competition_match_team cmt
                           join competition_registration cr on cr.id = cmt.competition_registration
                  where cmt.competition_match = cm.competition_setup_match
                    and (cr.team_number is null or cr.team_number <> cmt.start_number));
