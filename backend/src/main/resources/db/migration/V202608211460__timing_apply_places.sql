-- Die Echtzeit-Übernahme schreibt fortan auch die Plätze des Laufs; dafür wandern `place` und
-- `places_calculated` mit in den Fingerabdruck des zuletzt geschriebenen Stands
-- (timing_official_time.applied_fingerprint, Feldreihenfolge:
-- Zeit | Status | Strafsekunden | Strafgrund | Platz | places_calculated, Felder längenpräfixiert,
-- null als '_').
--
-- Bestandsabdrücke kennen die beiden neuen Felder nicht. Sie werden als "ohne eigenen Platz"
-- fortgeschrieben (Platz null, places_calculated false) - denn vor diesem Umbau hat die Übernahme
-- nie einen Platz geschrieben. Damit gilt der Übergang der Schutzregel sauber:
--  * Zeilen, deren Team keinen Platz trägt, bleiben "unsere" und bekommen ab der nächsten
--    Übernahme ihren abgeleiteten Platz.
--  * Zeilen, deren Team schon einen Platz trägt (Schiedsrichter hat gerechnet oder eingetragen),
--    weichen jetzt vom Abdruck ab und gelten damit als FREMD - sie bleiben eingefroren, exakt wie
--    die alte Regel "Platz gesetzt = eingefroren" es wollte.
UPDATE timing_official_time
SET applied_fingerprint = applied_fingerprint || '|_|5:false'
WHERE applied_fingerprint IS NOT NULL;

-- Gleichstände sind auf der veröffentlichten Genauigkeitsstufe der Normalfall, nicht die Ausnahme:
-- zwei Boote 40 ms auseinander SIND bei Zehntel-Genauigkeit zeitgleich und teilen sich den Platz
-- (1, 1, 3 - dieselbe Lesart, mit der Wertungskategorien und Siegerehrungsbogen gleiche Plätze
-- seit jeher behandeln). Der eindeutige Index von V202507040930 verbot genau das und stand auch
-- dem Nachrücken im Weg (Boot B bekommt Platz 1, bevor Boot A auf 2 rückt).
DROP INDEX IF EXISTS place_unique_in_match;
