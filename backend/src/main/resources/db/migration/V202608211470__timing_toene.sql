-- Töne der Zeitnahme.
--
-- 1) Tonplan am Zeitnahmetyp: WELCHE Sinus-Pieps WANN relativ zum Start des jeweiligen
--    Boots/der Welle gespielt werden (z.B. Piep bei D-10, je ein Piep bei D-5..D-1, langer Ton
--    beim Start). Der Plan gehört zum Zeitnahmetyp, weil dort alle Sequenz-Parameter leben und
--    verschiedene Typen (Timetrial vs. Welle) verschiedene Pläne wollen. JSON-Array von
--    Einträgen {offsetMillis, frequencyHz, durationMillis}; offsetMillis negativ = vor dem
--    Start, 0 = der Start selbst (positive Werte sind nicht erlaubt — nach dem Start wandert
--    das Countdown-Ziel sofort zum nächsten Boot). null = eingebauter Standardplan, der exakt
--    dem bisherigen Verhalten entspricht (T-5..T-1 kurz 600 Hz/100 ms, T-0 lang 900 Hz/400 ms).
--    Grenzen erzwingt der Service (TimingModeRequest): höchstens 30 Einträge, Frequenz
--    100..4000 Hz, Dauer 20..2000 ms, Offset -600000..0 ms.
alter table timing_mode
    add column tone_plan jsonb;

-- 2) Erfassungstöne der Posten: der Bestätigungston beim Erfassen am FINISH- bzw. SPLIT-Posten,
--    je Postentyp getrennt einstellbar (Höhe/Dauer). Liegt wie Genauigkeit und Übernahme-Schalter
--    an der Veranstaltung und erreicht die Boards über GET /timing/settings (Token-lesbar) samt
--    settingsChanged-Broadcast. JSON-Objekt {frequencyHz, durationMillis}; null = eingebauter
--    Standard (880 Hz/150 ms — der bisherige Erfassungs-Piep, es klingt also nichts anders).
alter table event
    add column timing_finish_tone jsonb,
    add column timing_split_tone jsonb;
