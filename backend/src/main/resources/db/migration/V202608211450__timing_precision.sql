-- Genauigkeit der veröffentlichten offiziellen Zeiten (interne Zeitnahme).
--
-- An der Veranstaltung, bei den übrigen Zeitnahme-Feldern (timing_system V202608062100,
-- timing_auto_apply V202608211440): die Genauigkeit ist eine Regatta-Entscheidung, kein
-- Renntag-Schalter. Die Rohdaten bleiben unberührt -- timing_time_mark und timing_official_time
-- speichern weiterhin Millisekunden. Die Einstellung wirkt allein darauf, was die Übernahme an
-- den Lauf schreibt und was die Anzeige zeigt: der Timecode wird VOR dem Schreiben auf diese
-- Stufe abgeschnitten (nie kaufmännisch gerundet -- die veröffentlichte Zeit ist nie schneller
-- als die gemessene), Strafsekunden gehen vorher in die Summe ein.
--
-- Vorgabe ZEHNTEL: die übliche Veröffentlichungsgenauigkeit im Rudern; wer Millisekunden oder
-- ganze Sekunden veröffentlicht, stellt es bewusst um.
alter table event
    add column timing_precision text not null default 'ZEHNTEL'
        check (timing_precision in ('SEKUNDE', 'ZEHNTEL', 'HUNDERTSTEL', 'MILLISEKUNDE'));
