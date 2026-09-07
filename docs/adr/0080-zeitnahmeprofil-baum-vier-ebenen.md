# ADR-0080: Zeitnahmeprofil-Baum: Rennen und Zeitnahmetyp sind ein Begriff mit vier Vererbungsebenen; das System hängt nur an der Veranstaltung

- Status: angenommen (ersetzt [ADR-0067](0067-zeitnahme-konfiguration-je-wettkampf-vererbt.md) und [ADR-0068](0068-benannte-zeitnahme-rennen-statt-adressen.md))
- Datum: 2026-08-24
- Bereich: domäne, datenbank, api, frontend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Im August 2026 beantworteten zwei Mechaniken dieselbe Frage „Wie wird dieser Lauf gezeitet?":

- Die Anbindung des externen Zeitnahmedienstes (ADR-0054) kannte benannte Rennen in `raceclocker_race` (ADR-0068), gepflegt rennen-zuerst, mit einer Spalte `competition.raceclocker_race` und einer Vererbung Wettkampf-vor-Event per coalesce (ADR-0067). Diese Welt wurde mehrfach revidiert: Wegfall der Veranstaltungs-Voreinstellung (`V202608111200`), Ein-Rennen-Modell je Wettkampf (`V202608111500`), ein Override-Schalter, der beim Ausschalten acht Wettkämpfe ohne Rennen ließ.
- Das eigene Zeitnahme-Modul (ADR-0087) bekam am 2026-08-23 Zeitnahmetypen `timing_mode` je Veranstaltung mit einer zweistufigen Zuordnung `timing_mode_assignment` je Wettkampf und/oder Runde, gepflegt wettkampf-zuerst, sowie den `TimingSystem`-Wert `INTERN`.

Dazu konnten Wettkämpfe ein eigenes System und eigene Dateiformate (`startlist_config`, `result_import_config`) setzen, was niemand brauchte. Nicht abbildbar war das eigentliche Motiv: ein Wettkampf, dessen Qualifikation ein Zeitfahren ist und dessen Folgerunden im Wellenstart gefahren werden.

## Entscheidung

1. **Ein Begriff: Zeitnahmeprofil.** Ein externes Rennen (`raceclocker_race`) und ein interner Zeitnahmetyp (`timing_mode`) sind beide ein Zeitnahmeprofil. Welche Art gilt, entscheidet allein `event.timing_system`; zwei Zeitnahme-Softwares in einer Regatta gibt es nicht.
2. **Eine Zuordnungstabelle über vier Ebenen.** `timing_profile_assignment` (`V202608242100`) trägt je Zeile den vollen Pfad Veranstaltung → Wettkampf → Runde → Partie mit `unique nulls not distinct (event, competition, competition_setup_round, competition_setup_match)`. Das Profil hängt an zwei echten Fremdschlüsseln `raceclocker_race` und `timing_mode` mit `num_nonnulls(...) = 1` und `on delete restrict`.
3. **Die speziellste gesetzte Ebene gewinnt:** Partie > Runde > Wettkampf > Veranstaltung. Die Regel steht genau einmal in `TimingProfileResolveLogic` (`app/timingProfile/boundary`) als reine Funktion; Abruf-Job, Handabruf, Sammelexport, Posten-Startliste und Baum-Endpunkt gehen darüber. `effectiveProfile` rechnet der Server; der Poll-Kandidat wird in Kotlin aufgelöst, nicht per SQL-Join.
4. **Ersatzlos entfernt** (`V202608242110__competition_timing_override_weg.sql`): `competition.raceclocker_race`, `competition.timing_system`, `competition.startlist_config`, `competition.result_import_config`, die Tabelle `timing_mode_assignment` und die Abweichungsliste der Event-Karte. Die Migration verwirft Daten bewusst; die Prüfabfrage vor dem Produktionslauf steht in der Migration.
5. **Ein Baum-Bauteil mit zwei Einstiegen:** Veranstaltungs-Einstellungen ab der Wurzel, Wettkampf-Tab ab dem Wettkampf. Jede Zeile speichert sofort; „Alles darunter auf Erben" räumt einen Teilbaum.
6. Partie-Zuordnungen hängen an `competition_setup_match` und überleben so das Löschen und Neuerzeugen einer Runde (`e76ad297`).

## Verworfene Alternativen

- Zeitnahme-Konfiguration je Wettkampf mit coalesce-Vererbung und Override-Schalter (ADR-0067): zwei Oberflächen schrieben dieselben Spalten, und wenn zwei Oberflächen dieselbe Spalte schreiben, darf keine sie aufräumen.
- Zwei feste Adressen (Zeitfahren/Läufe) je Event und Wettkampf: von ADR-0068 bereits durch benannte Rennen ersetzt.
- Rennen-zuerst-Mehrfachauswahl „am Rennen die Wettkämpfe anhaken": bewusst verloren, der Normalfall ist ein Klick an der Wurzel.
- Zweistufige `timing_mode_assignment` (`66b7d862`): im Baum aufgegangen.
- Polymorphe Referenz statt zweier FK-Spalten: verliert `restrict`.
- Vier-Ebenen-Auflösung im SQL: die Regel gehört in Kotlin, einmal.
- Aufräumknopf statt Datenverlust in der Migration: verworfen, Prüfabfrage stattdessen.
- Sequenz-Parameter am Board von Hand (`aeff9c4c`): entfällt, das Profil trägt sie.

## Konsequenzen

- ADR-0067 und ADR-0068 sind ersetzt; `raceclocker_race` existiert als Tabelle weiter, ist aber nur noch ein Profil.
- Der Sammelexport der Startlisten bleibt dimensionsblind für Partie-Zuordnungen (je Wettkampf); der Baum weist darauf hin.
- Das Polling filtert weiter explizit auf `RACECLOCKER`; ein Wechsel von `event.timing_system` schaltet die ganze Regatta um.
- Offener Hoch-Befund aus dem Delta-Audit vom 2026-09-07: `CompetitionSetupService` legt beim Speichern eines Setups Runden neu an und lässt Zuordnungen per Cascade verschwinden. Bis zur Behebung verliert ein Setup-Speichern die Runden- und Partie-Profile.
- Handtests des Baums stehen aus (fünf Fälle); die Migration ist ohne Dump nicht rückgängig zu machen.
- Wer eine fünfte Ebene braucht (etwa je Bahn), erweitert die eine Tabelle und die eine Regel – nicht mehr.

## Quellen

- Commits: `6c18f88e` (Baum, V202608242100/2110), `c3a14811`, `d29a0298`, `e76ad297`, `fbb7dc09`; Vorgeschichte `66b7d862`, `295d5ef8`, `1f76186c`, `583d28e7`, `dd52776f`, `0b83345f`, `aeff9c4c` (Zeitnahmetypen), `2346bfc2`, `f00f51cc`, `ffcb39ac` (Vererbung je Wettkampf), `8e7e8685`, `17740b83`, `277c8fd9` (benannte Rennen)
- Migrationen: `V202608242100__timing_profile_assignment.sql`, `V202608242110__competition_timing_override_weg.sql`; Vorgeschichte `V202608101100`, `V202608101110`, `V202608111200`, `V202608111500`
- Code: `TimingProfileResolveLogic.kt`
- Specs: `docs/superpowers/specs/2026-08-24-zeitnahmeprofil-design.md`, `docs/superpowers/plans/2026-08-24-zeitnahmeprofil.md`, `docs/superpowers/specs/2026-08-09-raceclocker-rennen-design.md`
- Verwandte ADRs: [ADR-0054](0054-externer-zeitnahmedienst-setzung-bleibt-hier.md), [ADR-0056](0056-automatischer-feed-abruf-feed-ist-wahrheit.md), [ADR-0067](0067-zeitnahme-konfiguration-je-wettkampf-vererbt.md), [ADR-0068](0068-benannte-zeitnahme-rennen-statt-adressen.md), [ADR-0087](0087-eigenes-zeitnahme-modul-append-only.md), [ADR-0089](0089-startsequenzen-serverseitig-fehlstart.md), [ADR-0091](0091-toene-gehoeren-dem-zeitnahmetyp.md)
