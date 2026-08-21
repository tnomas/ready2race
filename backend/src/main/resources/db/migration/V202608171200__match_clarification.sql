-- Ein Lauf, gegen den ein Einspruch läuft, wird von den Schiedsrichtern nicht freigegeben
-- (finished_at bleibt leer). Weil deriveMatchState die Aktivierung VOR dem Beenden prüft, stand
-- er bis hierher dauerhaft auf RUNNING - und hielt damit Stream-Uhr, Board-Cursor und die Kette
-- an einem einzigen strittigen Rennen fest.
--
-- clarification_since ist der Merker: gesetzt = in Klärung. Aufheben und Beenden leeren BEIDE
-- Spalten; eine Historie führt diese Tabelle bewusst nicht (Entscheidung vom 17.08.2026).
-- activated_at bleibt unangetastet: Der Lauf ist weiter an den Start gerufen, und nach dem
-- Aufheben steht er ohne Zutun wieder auf RUNNING.
alter table competition_match
    add column clarification_since  timestamp,
    add column clarification_reason varchar(255);

-- Eine Klärung ohne Grund darf es nicht geben (der Grund steht auf der eingeklappten Zeile im
-- Schiedsrichter-Dashboard), ein Grund ohne Klärung ebenso wenig - sonst bliebe nach dem
-- Aufheben ein Text stehen, den keine Anzeige mehr einordnen kann. Dieselbe Regel prüft der
-- Validator in MatchClarificationRequest, damit der Server nicht erst an der Datenbank scheitert.
alter table competition_match
    add constraint competition_match_clarification_complete
        check (
            (clarification_since is null and clarification_reason is null)
                or (clarification_since is not null
                    and clarification_reason is not null
                    and btrim(clarification_reason) <> '')
            );
