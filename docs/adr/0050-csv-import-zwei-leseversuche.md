# ADR-0050: CSV-Import mit eigenem Leser; zwei Leseversuche statt einer Parser-Einstellung

- Status: angenommen
- Datum: 2025-10-27
- Bereich: backend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Stammdaten (Vereine, Teilnehmer) sollen aus Tabellen eingespielt werden statt einzeln erfasst; später kamen Verbandslisten hinzu, die Teilnahmebedingungen bestätigen. Diese Dateien stammen aus fremden Systemen und sind nicht sauber: Am 2026-08-09 enthielt eine Verbandsliste ein einzelnes `"` in einem Vereinsnamen. Der CSV-Parser hielt das Feld bis zum Dateiende offen, und der Fehler riss alle vier CSV-Importe in einen 500er mit Stacktrace. Der Fehler lag auch in `origin/main`.

## Entscheidung

- CSV wird über ein eigenes Lesemodul im Backend gelesen (`backend/src/main/kotlin/de/lambda9/ready2race/backend/csv/`: `CSV.kt`, `Column.kt`, `ColumnBuilder.kt`, `RowReader.kt`, `CSVReadError.kt`), aufgebaut analog zum Leser für Tabellendateien des Ergebnisimports ([ADR-0042](0042-startlisten-export-ergebnisimport-stabile-kennung.md)). Import-Endpoints für Teilnehmer und Vereine haben einen Upload-Wizard im Frontend. `club.name` bekam einen Unique-Index (`V202512021800__club_name_unique.sql`).
- **Zwei Leseversuche**: `CSV.parseRows` liest zuerst streng (`ignoreQuotations = false`), damit ein zitiertes `"a;b"` sein Semikolon behält. Bricht der Parser ab, wird genau einmal ohne Anführungszeichen-Auswertung gelesen. Scheitern beide, antwortet der Server mit `422` und `CSVReadError.MalformedQuotes(detail)`, wobei `detail` den Anfang der Stelle trägt, an der der Parser ausgestiegen ist, damit die Zeile in der Datei auffindbar ist ([ADR-0011](0011-http-fehlersemantik-und-errorcode-muster.md)).
- Ein Fehlparse im zweiten Versuch kann keine falschen Häkchen setzen, weil der Abgleich beim Bedingungsimport über Name, Verein und Jahrgang läuft und ein verschobenes Feld dann schlicht nicht trifft.

## Verworfene Alternativen

- **Eine einzelne Parser-Einstellung**: gemessen wurde, dass keine Einstellung der verwendeten Bibliothek beide Fälle abdeckt: die Vorgabe hält das Feld offen, `withIgnoreQuotations` verliert das Semikolon in zitierten Feldern, `withStrictQuotes` verwirft Daten, und der RFC-4180-Parser verschluckt Zeilen still. Die Messtabelle steht im Commit `0a6afe43`.
- **Anführungszeichen vorab aus der Datei entfernen**: nicht belegt als erwogen; wäre ein dritter, datenverändernder Weg.

## Konsequenzen

- Jeder CSV-Import zahlt im Fehlerfall einen zweiten Parserlauf über die ganze Datei; bei den vorkommenden Dateigrößen (Hunderte bis wenige Tausend Zeilen) ist das unerheblich.
- Der zweite Versuch liefert bei Dateien mit korrekt zitierten Feldern, die zugleich ein loses `"` enthalten, ein anderes Feldlayout als der erste; das ist der Preis dafür, dass die Datei überhaupt gelesen wird. Der Aufrufer sieht nicht, welcher Versuch gegriffen hat.
- Verbandsdateien bringen weitere Fallen mit, die der Leser nicht löst: Die DRV-Aktivenpass-Liste ist Latin-1 trotz `_UTF8` im Dateinamen (vorher mit `iconv` wandeln), Filterwert und Vereinsspalte sind wegzulassen, und ein zweiter Import summiert sich auf (Arbeitsnotiz `drv-aktivenpass-import.md`).
- Der Unique-Index auf `club.name` schützt den Import vor Dubletten, blockiert aber auch die Selbstregistrierung mit bereits vorhandenem Vereinsnamen ([ADR-0049](0049-challenge-events-teilnehmer-ohne-konto.md)).

## Quellen

- Commits: `1bb0c02f` (Import Backend), `cafac812` (Import Frontend), `de0de3eb` (CSV-Upload für Vereine), `38a36f27` (Upload-Wizard), `b3a94a24` (Unique-Index Vereinsname), `0a6afe43` (Stop a lone quote from tearing the CSV import)
- Migrationen: `V202512021800__club_name_unique.sql`
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/csv/CSV.kt` (`parseRows`), `csv/CSVReadError.kt` (`MalformedQuotes`)
- Verwandte ADRs: [ADR-0011](0011-http-fehlersemantik-und-errorcode-muster.md), [ADR-0025](0025-vereine-teilnehmer-scope-own-stammverein.md), [ADR-0027](0027-teilnahmebedingungen-global-je-event-manuell.md), [ADR-0042](0042-startlisten-export-ergebnisimport-stabile-kennung.md), [ADR-0049](0049-challenge-events-teilnehmer-ohne-konto.md)
