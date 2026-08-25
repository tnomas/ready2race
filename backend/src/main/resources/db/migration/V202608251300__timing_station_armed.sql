set search_path to ready2race, pg_catalog, public;

-- Die Betriebsart des Postens: ONETOUCH löst bei jedem Druck sofort aus (Vorgabe, das heutige
-- Verhalten), ARMED verlangt, dass der Posten sich vorher scharf schaltet. Gepflegt wird sie in den
-- Veranstaltungs-Einstellungen -- das ist eine Entscheidung der Regattaleitung, keine des
-- Zeitnehmers.
--
-- ONETOUCH als Vorgabe ist nicht Bequemlichkeit, sondern Sicherheit: Würde eine bestehende
-- Veranstaltung ungefragt auf ARMED springen, stände am nächsten Renntag ein Posten vor einem
-- toten Knopf, ohne zu wissen warum.
alter table timing_station
    add column capture_mode text not null default 'ONETOUCH'
        check (capture_mode in ('ONETOUCH', 'ARMED')),
    -- Der Betriebszustand, den der Posten selbst schaltet. Nur bei ARMED von Bedeutung; im
    -- ONETOUCH-Betrieb liegt er brach.
    --
    -- Getrennt von der Betriebsart, weil beide verschiedene Besitzer haben: Die Art setzt die
    -- Leitung einmal, den Zustand kippt der Zeitnehmer am Tag zwanzigmal. In einer Spalte
    -- überschriebe das Entschärfen die Konfiguration.
    --
    -- false als Vorgabe: Ein Posten, der sich still selbst scharf schaltet, ist genau das, was die
    -- Sicherung verhindern soll.
    add column armed boolean not null default false;
