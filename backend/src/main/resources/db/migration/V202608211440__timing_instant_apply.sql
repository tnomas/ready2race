-- Echtzeit-Rückschreibung der internen Zeitnahme (Leitstand, Phase A).

-- Schalter „Automatische Übernahme" je Veranstaltung. An der Veranstaltung statt an einer eigenen
-- Tabelle, weil dort auch die übrige Zeitnahme-Konfiguration liegt (timing_system,
-- raceclocker_auto_pull, ... - V202608071600). Vorgabe an: Echtzeit ist der Normalfall, der
-- Schalter existiert für Momente, in denen die Regattaleitung Ergebnisse bewusst zurückhalten will.
alter table event
    add column timing_auto_apply boolean not null default true;

alter table timing_official_time
    -- Freitext-Grund zur Strafzeit. Das Team trägt bereits penalty_note (V202608061202) als
    -- Anzeige-Spalte; hier steht das Original aus dem Leitstand, das die Rückschreibung dorthin
    -- überträgt - ohne eigene Spalte ginge der Grund bei jeder Neuberechnung verloren.
    add column penalty_note text,
    -- Fingerabdruck des Ergebnisstands, den die Rückschreibung zuletzt an das Team geschrieben
    -- hat (Zeit inkl. Strafe, Status, Strafsekunden, Grund). Er beantwortet zwei Fragen, die
    -- sich aus Zeitstempeln nicht sicher ableiten lassen: „Hat sich seit dem letzten Schreiben
    -- etwas geändert?" (unverändert = kein doppeltes Schreiben) und „Ist der Stand am Team noch
    -- unserer?" (weicht das Team ab, hat jemand anders eingegriffen - dann wird nie
    -- stillschweigend überschrieben). null = an diesem Team steht nichts von der Zeitnahme.
    add column applied_fingerprint text;
