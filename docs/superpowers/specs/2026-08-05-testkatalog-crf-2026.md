# Testkatalog `feature/crf-2026`

**Stand:** 2026-08-05, Sammelbranch bei `8a1adae2`
**Zweck:** Ein Katalog aller Fälle, die vor der Regatta am 14.08. auf **einem** gebauten Stand
durchlaufen werden. Er sammelt die Fälle über alle Arbeitsstränge (Athleten-Anzeige, Zeitstrahl,
RaceClocker, Schiedsrichter-Dashboard, Betrieb), damit der große Test in der Woche vom 10.08. nicht
aus dem Gedächtnis zusammengesucht werden muss.

## Wie dieser Katalog benutzt wird

Jeder Fall trägt zwei Spalten:

- **testbar ab** — der Commit, der den Fall möglich macht. Ein älterer Stand kann ihn nicht
  bestehen; nach einem Rebase/Cherry-pick den neuen Hash nachtragen.
- **Nachweis** — Commit und Datum, auf dem der Fall zuletzt **von Hand** grün war, plus Kürzel des
  Testers. Leer heißt: nie nachgewiesen. Automatisierte Unit-Tests zählen hier nicht — sie laufen
  in `./mvnw test` und `npm run test` und decken die Rechenlogik ab, nicht den Ablauf.

Beim großen Test einen Stand bauen, alle Fälle eines Bereichs in einem Zug durchgehen und die
Nachweis-Spalte in **diesem** Dokument fortschreiben (ein Commit „Record test evidence for
<Datum>"). Fällt ein Fall durch: Fall stehen lassen, Befund als eigenen Punkt darunter notieren,
nicht die Erwartung anpassen.

## Vorbereitung

1. **Stand festlegen.** `git log --oneline -1` im Haupt-Checkout, Hash ins Testprotokoll.
2. **Worktree-Falle.** Es laufen mehrere Worktrees parallel; ein Dev-Server auf einem anderen Port
   gehört womöglich zu einem anderen Stand. Vor dem Test prüfen:
   ```bash
   lsof -nP -iTCP -sTCP:LISTEN | grep node
   ```
   und für den gefundenen Prozess `lsof -p <pid> -a -d cwd`. Nur ein Server aus dem Checkout, der
   den zu testenden Commit trägt, ist aussagekräftig. (Am 05.08. lief die Anzeige auf `:5124` aus
   dem `zeitstrahl`-Worktree — die Änderungen aus dem Hauptcheckout waren dort schlicht nicht drin.)
3. **Umgebung.** `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`,
   `cd backend && docker compose up -d`, Backend starten, `npm run dev` im Frontend. `.env` in
   `backend/` und `frontend/` sind gitignored und fehlen in frischen Worktrees.
4. **Migrationen.** Wechselt die Dev-DB zwischen Branches, kann Flyway Lücken melden;
   `-Dflyway.outOfOrder=true` beim Maven-Aufruf lässt die fehlenden Migrationen nachlaufen.
5. **Daten.** Veranstaltung mit Zeitplan, mindestens einem Wettkampf mit ≥ 4 Booten, davon eines
   abgemeldet, und einem Wettkampf mit gepflegten RaceClocker-URLs.
6. **Seiten.** Athleten-Anzeige `/board/{eventId}` · Kiosk `/event/{eventId}/info` ·
   Schiedsrichter `/event/{eventId}/live-dashboard` · Zeitplan-Tab der Veranstaltung ·
   Wettkampf-Durchführung.

---

## A — Athleten-Anzeige

| ID | Fall | Erwartung | testbar ab | Nachweis |
|---|---|---|---|---|
| A1 | Spaltenreihenfolge | Links „Letztes Ergebnis", Mitte „Aktueller Lauf", rechts „Nächster Lauf" | `1e0ab80e` | |
| A2 | Uhr auf der Kiosk-Seite | „Konfigurieren"/„Vollbild" und das Vollbild-Beenden-Symbol verdecken Uhr und „Stand" nicht | `1e0ab80e` | |
| A3 | Lauf aktuell, nicht gestartet | Geplante Startzeit groß, darunter „in Vorbereitung"; keine Zeiten | `5d5506ad` | |
| A4 | Lauf gestartet | Darunter „gestartet HH:MM"; geplante Zeit bleibt sichtbar | `5d5506ad` | |
| A5 | Teilergebnisse im laufenden Lauf | Gewertete Boote zeigen „Platz. Zeit", ungewertete zeigen rechts nichts | `5d5506ad` | |
| A6 | Zeitstrafe (Detailablauf unten) | Zeit steigt um die Strafe, darunter „inkl. N s Zeitstrafe · Grund" | `0c8e378c` | |
| A7 | Manuelle Zeitstrafe | Hinweis erscheint, Zeit bleibt unverändert (nur ausgewiesen, nie verrechnet) | `5d5506ad` | |
| A8 | Ergebnis nach Laufende | Lauf wandert nach links, Kopf zeigt geplanten und echten Start, Zeiten bleiben | `5d5506ad` | |
| A9 | DNF/DNS/DSQ | Grund statt Zeit, gedämpft, kein Platz — im laufenden und im beendeten Lauf | `c1072f54` | |
| A10 | Abgemeldetes Boot | Steht unten im Ergebnis als „abgemeldet · Grund", Platz „–", keine Zeit | `5d5506ad` | |
| A11 | Mannschaft ohne Namen | „<Verein> | Team 2" aus `team_number` statt nur Vereinsname | `5d5506ad` | |
| A12 | Bahn = Startposition | Große Zahl links entspricht `start_number` des Laufs | `135e8a90` | |
| A13 | Noch nicht gesetzte Runde | Platzhalter „Lauf noch nicht gesetzt" an der Stelle des Zeitplan-Slots | `e5744801` | |
| A14 | Programmpunkt (Pause) | „Mittagspause" erscheint nur, wenn die Veranstaltung Pausen auf öffentlichen Anzeigen erlaubt | `5e9d0bda` | |
| A15 | Überfälliger Lauf | Verstrichene Startzeit → „erwartet" statt negativem Countdown; Lauf verschwindet erst nach 30 min | `6d699ec5`, `dcb4745f` | |
| A16 | Lauf ohne Startzeit | „Zeit offen", Lauf bleibt sichtbar | `6d699ec5` | |
| A17 | Verbindungsverlust | Letzter guter Stand bleibt stehen, nach ~2 Takten „Verbindung unterbrochen"; nie „kein Lauf auf dem Wasser" | `0f6812bd` | |
| A18 | Telefon-Layout | Blöcke untereinander, Namen brechen um, keine waagerechte Rolle | `8c013ff0` | |
| A19 | Takt | Anzeige holt im konfigurierten Takt, nie schneller als 10 s; Änderung ist nach höchstens ~15 s sichtbar | `77fca680` | |
| A20 | Ohne Anmeldung | `/board/{eventId}` funktioniert im privaten Fenster vollständig | `8eda6dc1` | |

## B — Zeitstrahl und Laufkette

| ID | Fall | Erwartung | testbar ab | Nachweis |
|---|---|---|---|---|
| B1 | Slot anlegen/ändern/löschen | Startzeit schreibt auf den Lauf durch; Besitz und Eindeutigkeit werden geprüft | `e3329e01`, `f3d3870b` | |
| B2 | Slot-Zustände | Wartend, gesetzt, gelaufen, abgesagt, verwaist werden im Tag-Agenda-Tab korrekt unterschieden | `a05e644a`, `18a6ebf2` | |
| B3 | Verschieben: plus/Uhrzeit/komprimieren | Vorschau vor dem Anwenden, Ergebnis entspricht der Vorschau | `9ae3cfe6`, `08f5c341` | |
| B4 | Verschieben über den Renntag hinaus | Wird abgelehnt, mit verständlicher Meldung | `4bfb2278` | |
| B5 | Lauf absagen | Nur mit Audit; ein bereits gestarteter Lauf lässt sich nicht absagen | `bf3e47cd`, `0b56ebf2` | |
| B6 | Wortwahl | Oberfläche spricht von „abgesagt", nicht von „übersprungen"; Umfang der Aktion ist benannt | `8bd94c1f`, `041bf03d` | |
| B7 | Excel-Import | Zeilenweise Vorschau, echte Excel-Zeilennummern in Fehlermeldungen, Namensabgleich | `8cc599eb`, `01863020`, `8bf3ef04` | |
| B8 | Kette: Fortschaltmodus | Drei Modi (aus / nur Runde / voll) greifen wie beschrieben | `ed7160d1`, `27080b8b` | |
| B9 | Kette: Wartepunkt | Kette hält am wartenden Slot, ganze Startgruppe wird abgewartet | `6d6be623`, `cd83aed2` | |
| B10 | Kette nach Absage | Nach Absage des gewarteten Slots läuft die Kette weiter | `41b808e9` | |
| B11 | Läufe aus dem Zeitplan steuern | Büro kann Läufe direkt aus dem Zeitplan starten/beenden; beendete Läufe lassen sich nicht reaktivieren | `65406827`, `c9709773` | |
| B12 | Startzeit von Slot-Läufen | Manuelle Startzeit-Änderung am Lauf wird abgelehnt, solange ein Slot ihn führt | `c8441e8c` | |
| B13 | Zeitstrahl-Anzeige | Indikator „jetzt" im Plan-Tab und auf dem Schiedsrichter-Dashboard steht an der richtigen Stelle | `ba7e7bdb` | |

## C — RaceClocker

| ID | Fall | Erwartung | testbar ab | Nachweis |
|---|---|---|---|---|
| C1 | Startlisten-Export | Export trägt die R2R-UUID in „Extra info"; ohne dieses Mapping findet der Pull keine Boote | `dd8d67b8` | |
| C2 | Wellenname | Wellenname enthält die Startzeit, Lauf wird im Feed gefunden | `09e6a642` | |
| C3 | Ergebnisse ziehen | Zeiten und Plätze landen am richtigen Boot, Plätze aus den Zeiten abgeleitet | `dd8d67b8` | |
| C4 | Teil-Pull | Ein Pull mit nur teilweise genommenen Zeiten ist wiederholbar, ohne die übrigen Boote zu beschädigen | `b1e2e238` | |
| C5 | Echter Start | Früheste gemessene Startzeit überschreibt `started_at`, auch gegen einen manuellen Stempel | `f86665ae`, `e4cb8753` | |
| C6 | Mitternacht als Platzhalter | `00:00:00.0` für Boote ohne Start setzt `started_at` nicht auf Mitternacht | `c0458d8d` | |
| C7 | Zeitstrafe aus dem Feed | `Penalty`/`Penalty note` landen als Ausweisung am Boot, die Zeit wird nicht zusätzlich verrechnet | `0c8e378c` | |
| C8 | Bahnen aus „Rank" | Eine Bahnvertauschung in RaceClocker schlägt auf die Bahnen durch, auch für Boote ohne Zeit; der Bib wandert nicht mit | `d64ae540` | |
| C9 | Doppelte Mannschaft | Zwei Zeilen für dasselbe Boot → Pull verweigert mit Namensliste, statt zu raten | `dd8d67b8` | |
| C10 | Keine Ergebnisse | Pull ohne gewertete Zeilen meldet das verständlich und ändert nichts | `dd8d67b8` | |
| C11 | Fehlerfälle URL | Fehlende, ungültige und nicht erreichbare URL werden unterschieden gemeldet | `dd8d67b8` | |

## D — Schiedsrichter-Dashboard

| ID | Fall | Erwartung | testbar ab | Nachweis |
|---|---|---|---|---|
| D1 | Live- und Listen-Tab | Laufender Lauf oben, Liste vollständig; Badge nur bei Änderung im anderen Tab | `cda94db0`, `7abc060d` | |
| D2 | Takt und Countdown | Abfrage-Intervall wählbar, Countdown sichtbar, Auswahl bleibt am Gerät | `c4addcb3` | |
| D3 | Verbindungsverlust | Warnung „Stand veraltet" statt stiller Anzeige | `7fbdc4fe` | |
| D4 | Erststart | Ladeanzeige vor dem ersten Abruf, kein leeres Bild | `8931ef8f` | |
| D5 | Mannschafts-Dialog | Bleibt beim Nachladen aktuell; Auswahl wird geleert, wenn die Mannschaft aus der Antwort fällt | `e0cceada`, `1fe986ca` | |
| D6 | Auflagen | Erfüllt/fehlend/Zeitfenster mit einem Blick; Zeitfenster-Verstöße als Warnung | `11ac52e8`, `0f2cd691` | |
| D7 | Ersatzleute | Ersetzte Person und Grund werden im Dialog angezeigt | `5aeeca53`, `10beadd5` | |
| D8 | Lauf beenden mit offenen Ergebnissen | Rückfrage benennt die offenen Boote; nichts wird stillschweigend gewertet | `93176bb6`, `3cb1e410` | |
| D9 | Teilergebnisse | Ergebnisse einzelner Boote lassen sich erfassen, ohne den Lauf zu beenden | `b1e2e238` | |
| D10 | DNS/DNF/DSQ | Alle drei Zustände erfassbar und unterscheidbar dargestellt | `c1072f54` | |
| D11 | Zeitstrafe erfassen | Sekunden und Grund, Formular macht deutlich, dass die Zeit die Strafe enthält | `29d56efb`, `98b786bc` | |
| D12 | Schiedsrichter-Modus | Warnung, wenn das Büro den Modus überschreibt | `b061c470` | |
| D13 | Draußen lesbar | Große Schrift, hoher Kontrast, Vereinsnamen gekürzt, Karten als Spaltengitter | `211bbf4f`, `e45ce42f`, `95616793` | |
| D14 | Freie Slots | Programmpunkte erscheinen im Dashboard an ihrer Stelle | `42d6b9f7` | |

## E — Betrieb

| ID | Fall | Erwartung | testbar ab | Nachweis |
|---|---|---|---|---|
| E1 | gzip | Antworten der öffentlichen Endpoints kommen komprimiert an | `9d96df1b` | |
| E2 | Zwischenspeicher | Viele gleichzeitige Zuschauer erzeugen höchstens einen Aufbau je 5 s und Veranstaltung | `77fca680` | |
| E3 | Notbremse | Rate-Limit der öffentlichen Info-Endpoints greift und meldet sauber | `1b752fbf` | |
| E4 | Rechte | `LIVE_DASHBOARD` steuert den Zugang zum Dashboard; die Athleten-Anzeige braucht keine Anmeldung | `6d6c6431`, `8eda6dc1` | |
| E5 | Nutzlast | Dashboard-Antwort enthält nur, was die Liste zeigt | `d189fe68` | |
| E6 | Zeitzone | Postgres läuft auf UTC, die Anwendung auf Europe/Berlin — angezeigte Zeiten stimmen mit dem Zeitplan überein | — | |

---

## Detailablauf A6/C7 — Zeitstrafe während der Lauf läuft

Der Kernfall: die Anzeige muss eine nachgetragene Strafe übernehmen, **bevor** der Lauf beendet ist.

1. Lauf starten, in RaceClocker die Zeiten aller Boote nehmen.
2. In ready2race „Ergebnisse aus RaceClocker holen". Lauf **nicht** beenden.
   → Anzeige zeigt im Mittelblock Platz und Zeit je Boot; notiere die Zeit eines Bootes.
3. In RaceClocker für dieses Boot 15 s Strafe mit Grund eintragen (RaceClocker rechnet die Strafe
   in `Result` ein).
4. Erneut „Ergebnisse aus RaceClocker holen". Lauf weiterhin **nicht** beenden.

**Erwartung:**
- Die Zeit des Bootes ist um 15 s höher als in Schritt 2, darunter steht „inkl. 15 s Zeitstrafe · Grund".
- Wirft die Strafe das Boot nach hinten, ändern sich die Plätze mit (Plätze werden beim Pull aus den
  Zeiten neu abgeleitet).
- Die Anzeige übernimmt das ohne Neuladen, spätestens nach ~15 s (Takt ≥ 10 s plus 5 s Cache).
- Der Lauf steht weiter unter „Aktueller Lauf".
- Nach dem Beenden (A8) sind Zeit, Platz und Strafhinweis im Ergebnisblock unverändert.

**Wichtig:** Die externe Zeitmessung ist die Quelle der Wahrheit. Ein Pull überschreibt eine im
Formular erfasste Strafe (A7). Beide Wege am selben Boot zu mischen ist kein unterstützter Ablauf.

## Offene Punkte, die der Test entscheiden soll

- **Lauf doppelt sichtbar.** Die Ergebnis-Abfrage filtert nicht auf „läuft gerade": ein vollständig
  gewerteter, aber nicht beendeter Lauf kann gleichzeitig unter „Aktueller Lauf" und unter „Letztes
  Ergebnis" stehen. Mit Teilergebnissen (A5) passiert das häufiger. Gewünscht oder störend?
- **Bootsnummer.** Es gibt keine Nummer, die am Boot bleibt: `start_number` ist die Bahn,
  `team_number` die n-te Mannschaft eines Vereins. Der RaceClocker-Bib wird seit `d64ae540` nicht
  mehr geschrieben. Falls die Athleten eine feste Bootsnummer erwarten, braucht das eine eigene
  Spalte samt Schreibweg — vor der Regatta entscheiden.
- **Ort/Strecke.** `placeName` in den Info-DTOs wird nie gefüllt; eine Tabelle für Orte existiert
  nicht. Entweder Feld entfernen oder Bedarf klären.

## Nicht in diesem Katalog

- Meldewesen, Rechnungen, Urkunden und Dokumentenerzeugung (eigene Stränge, teils eigene Worktrees).
- Platzberechnung bei Zeitgleichheit (Rechenlogik, durch Unit-Tests gedeckt).
- Lastverhalten unter echter Zuschauerzahl — es gibt Cache, Takt-Untergrenze und Rate-Limit, aber
  keinen Messwert.
