# ADR-0046: Ergebniszeiten als Timecode (Millisekunden plus Anzeigeformat) mit adaptiver Anzeigepräzision

- Status: angenommen
- Datum: 2025-11-25
- Bereich: backend, frontend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Ergebnisse waren zunächst nur Plätze. Mit dem Ergebnisimport aus Tabellendateien ([ADR-0042](0042-startlisten-export-ergebnisimport-stabile-kennung.md)) mussten Zeiten importiert, gespeichert und wieder formatiert werden, und zwar so, wie die Quelle sie geschrieben hat (Minuten:Sekunden oder Stunden:Minuten:Sekunden, mit null bis drei Nachkommastellen). Später, am Regattatag 2026, sprengten dreistellige Fotofinish-Zeiten die Spalten von Dashboard und Board, obwohl eine Nachkommastelle fast immer reicht.

## Entscheidung

- Eine Zeit ist ein Wert vom Typ `Timecode(millis, baseUnit, millisecondPrecision)` (`backend/src/main/kotlin/de/lambda9/ready2race/backend/data/Timecode.kt`): `millis` als `Long`, `baseUnit` aus `HOURS`, `MINUTES`, `SECONDS`, `millisecondPrecision` aus `NONE`, `ONE`, `TWO`, `THREE`. Das Anzeigeformat ist Teil des Werts, nicht eine Einstellung der Anzeige.
- Gespeichert werden Millisekunden an `competition_match_team`; ein Parser liest Zeitangaben aus Text. Die Importkonfiguration hat eine Zeitspalte; liefert die Quelle keine Plätze, werden sie aus den Zeiten berechnet.
- **Adaptive Präzision**: `Timecode.displayPrecision(times, minimum = ONE)` ermittelt je Lauf die gröbste Präzision ab einer Dezimalstelle, bei der alle unterschiedlichen Zeiten des Laufs unterscheidbar bleiben. Zwei gleiche Zeiten (totes Rennen) erzwingen keine feinere Anzeige; nur unterschiedliche Zeiten, die bei grober Darstellung zusammenfielen, tun das. Die Regel gilt für Schiedsrichter-Dashboard, Boards und öffentliche Ergebnisse.
- Die Anzeige **schneidet ab**, sie rundet nicht (Ganzzahldivision, gleiche Logik wie `toString`). Das deckt sich mit der späteren Regel für offizielle Zeiten des eigenen Zeitnahme-Moduls ([ADR-0087](0087-eigenes-zeitnahme-modul-append-only.md)).

## Verworfene Alternativen

- Keine belegt. Die Alternative „Zeit als formatierter String" oder „feste drei Nachkommastellen überall" ist nur implizit, durch die Wahl von Millisekunden plus Format, ausgeschlossen.

## Konsequenzen

- Jede Stelle, die Zeiten anzeigt, muss die Präzision je Lauf bestimmen, nicht je Zeit; sonst stehen in einer Spalte gemischte Formate. Die Funktion ist deshalb im Backend und wird pro Lauf einmal ausgewertet.
- Abschneiden statt Runden bedeutet, dass 1:23,459 als 1:23,4 erscheint. Das ist im Sport üblich, muss aber bei Vergleichen mit fremden Ergebnislisten bekannt sein.
- Zeitstrafen werden nicht in `millis` verrechnet, sondern ausgewiesen ([ADR-0060](0060-teilergebnisse-zeitstrafen-ausweisen.md)); das Feld enthält die gemessene Zeit.
- Das Frontend hat keinen eigenen Zeitparser; es zeigt an, was das Backend formatiert. Für die Eingabe im Zeitnahme-Modul (`OfficialTimeEditDialog`) gilt derselbe Typ.

## Quellen

- Commits: `533b6f62` (Implement times for results: `data/Timecode.kt`, `parsing/Parser.kt`, `timecode/TimecodeRepo.kt`), `7138cd8e` (adaptive Präzision, Dashboard-Zeitspalte)
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/data/Timecode.kt`, `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timecode/`
- Verwandte ADRs: [ADR-0042](0042-startlisten-export-ergebnisimport-stabile-kennung.md), [ADR-0060](0060-teilergebnisse-zeitstrafen-ausweisen.md), [ADR-0087](0087-eigenes-zeitnahme-modul-append-only.md), [ADR-0092](0092-zwischenzeiten-am-lauf-distanz-am-wettkampf.md)
