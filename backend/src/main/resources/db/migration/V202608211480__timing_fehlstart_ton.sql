-- Fehlstart-Ton der Zeitnahme.
--
-- Ein eigenständiger Ton neben den Erfassungstönen (V202608211470): Start-Board und
-- Startbildschirm spielen ihn, wenn ein Versuch zurückgenommen oder eine laufende Sequenz
-- abgebrochen wird — die beiden Fehlstart-Gesten des Systems. Ablage wie die Erfassungstöne als
-- jsonb an der Veranstaltung ({frequencyHz, durationMillis, releaseMillis?}); null = eingebauter
-- Standard (440 Hz / 3000 ms — deutlich länger und tiefer als Countdown-Ticks und Startton,
-- damit er am Wasser sofort als „zurück!" erkennbar ist). Ausgeliefert aufgelöst über
-- GET /timing/settings samt settingsChanged-Broadcast; Grenzen erzwingt der Service
-- (TimingToneLimits: Frequenz 100..4000 Hz, Dauer 20..10000 ms, Ausklingen 0..5000 ms).
alter table event
    add column timing_false_start_tone jsonb;
