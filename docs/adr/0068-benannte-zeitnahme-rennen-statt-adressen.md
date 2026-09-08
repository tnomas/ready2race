# ADR-0068: Benannte Zeitnahme-Rennen als Zeilen statt zweier fester Adressen

- Status: ersetzt durch [ADR-0080](0080-zeitnahmeprofil-baum-vier-ebenen.md)
- Datum: 2026-08-09
- Bereich: datenbank, backend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Das Modell kannte zwei feste Ergebnisadressen je Wettkampf und Event (`raceclocker_tt_results_url`, `raceclocker_heats_results_url`) und erriet die Zuordnung aus `is_qualification`. Die Coastal-Regatta fuhr aber drei Rennen im Zeitnahmedienst (Zeitfahren, Langstrecke, Kurzstrecke) mit unterschiedlichen Adressen je Tag; der Abruf-Job holte den Rückfall bedingungslos und traf damit Wellen im falschen Rennen. Vier Tage vor der Regatta musste das Modell umgebaut werden, ohne Datenbanken zu verlieren, die die Migrationen bereits gesehen hatten.

## Entscheidung

- **Tabelle `raceclocker_race` je Veranstaltung** (`V202608101100__raceclocker_races.sql`): `event`, `name` (unique je Event), `results_url` (not null, unique je Event, normalisiert auf Apex-Form), `start_mode` INDIVIDUAL | WAVE, `captures_laps` als Andockpunkt für Rundenzeiten, `position`. Läufe wählen ihr Rennen per Name; die alten Adressspalten werden nach Backfill in einer zweiten Migration entfernt (`V202608101110__drop_raceclocker_urls.sql`), weil Kotlin und jOOQ sonst zwischen den Schritten nicht übersetzbar wären (ADR-0014: Umbau und Abbau getrennt).
- **Anwahl** über `raceclocker_race_qualification` / `raceclocker_race_rounds` je auf `event` und `competition` (`coalesce`, `on delete set null`); der Backfill entdoppelt über die Adresse und benennt aus der Herkunft, per LEFT JOIN, damit Wettkämpfe ohne Properties-Zeile nicht stumm die Event-Adresse erben.
- **Adress-Normalisierung als Folge-Migration:** `V202608101120__normalize_raceclocker_urls.sql` normalisiert Altzeilen und verschmilzt www/apex-Paare (kleinste Position überlebt, Zeiger werden umgehängt statt via `on delete set null` zu verschwinden). `V202608101100` wurde trotz falsch kopierter www-Adressen nicht angefasst, weil ihre Prüfsumme in mehreren Datenbanken verankert ist.
- **`pollEvent` zerfällt in vier Phasen** (Auflösen, Zuordnen, Abrufen, Schreiben; `RaceClockerRaceResolution`, `RaceClockerFeedAssignment`), Abrufe je Takt nur für gerade gefahrene Rennen, Rückfall auf das zweite Rennen nur bei Nichttreffer. `Resolution` unterscheidet `Skip` (sauberer Stempel) von `Defect` (`INTERNAL_ERROR`). Integrität über Veranstaltungsgrenzen prüft der Service, nicht ein zusammengesetzter Schlüssel.
- **Ein zugeordnetes Rennen ist nicht löschbar** (`RACECLOCKER_RACE_STILL_ASSIGNED`, ab 13.08.), statt Wettkämpfe still per SET NULL abzuhängen.
- **Zeitnahme-Nennung** zeigt auf `raceclocker_race.results_url` (ADR-0087-Umfeld, `V202608211200`).

## Verworfene Alternativen

- Rundenzeiten im ersten Wurf: Feed-Format unbekannt, nur `captures_laps` als Andockpunkt; kamen am 11.08. (ADR-0056) und am 25.08. (ADR-0092).
- Startlisten-Presets auf das Rennen ziehen: derselbe Zwei-Slot-Bruch, wegen der Regatta vertagt.
- Anwahl je Runde: Pflegeaufwand für einen nicht existierenden Fall.
- Eine Anwahl je Wettkampf (statt Quali/Runden): konnte Zeitfahren plus Läufe nicht abbilden; wurde drei Tage später trotzdem so gebaut (`V202608111500`), als der Dienst die Unterscheidung aufgab.
- Eine einzige Migration für Auf- und Abbau: nicht übersetzbar zwischen den Schritten.
- End-to-End-Test über alle vier Phasen von `pollEvent`: bewusst nicht vier Tage vor der Regatta, weil `fetchRows` dafür injizierbar werden müsste; als bekannte Lücke notiert.
- Später revidiert: Event-Vorgabe entfiel am 11.08. (Rennen nur je Wettkampf, Backfill `V202608111200`); Ein-Rennen-Modell am 12.08.; Mehrfachauswahl „am Rennen die Wettkämpfe anhaken" (umgedreht am 11.08.) fiel am 24.08. bewusst weg; der Zeitnahmeprofil-Baum (ADR-0080) machte Rennen und Zeitnahmetyp zu einem Begriff und entfernte `competition.raceclocker_race`.

## Konsequenzen

- Die Tabelle `raceclocker_race` existiert weiter und ist heute eine der beiden Profil-Arten im Baum (ADR-0080); `start_mode` fiel mit dem Ein-Rennen-Modell (`V202608111500`).
- Es gibt keinen Rollback ohne Dump: Der Ausbau/Abbau-Zuschnitt in Löschrichtung kennt keinen gestaffelten Rollout; vor Produktionsmigrationen ist ein Dump Pflicht (ADR-0014).
- Die Eindeutigkeit je Event hängt am normalisierten Adress-String; wer eine Adresse mit anderem Host-Schreibweise anlegt, bekommt eine zweite Zeile.
- Der Override-Schalter der Zeitnahme-Konfiguration nullte beim Ausschalten die Rennen-Zuordnung (acht Wettkämpfe ohne Rennen am 11.08.); daraus entstand die Regel „wenn zwei Oberflächen dieselbe Spalte schreiben, darf keine sie aufräumen" (ADR-0067).
- Produktion fährt seit spätestens 13.08.2026 das Ein-Rennen-Modell; ein älteres Abzug-Skript, das die alten Adressfelder liest, bricht deshalb ab (Arbeitsnotiz).

## Quellen

- Commits: `8e7e8685` (Design), `17740b83` (Plan), `2ce84b94` (Rennen als Zeilen), `6ed20587`, `342c44e9` (CRUD), `7ea47152` (Läufe wählen ihr Rennen), `390594fc` (Adressspalten entfernt), `67a2ebdc` (Backfill mit LEFT JOIN), `051fad8f` (Pflege im Zeitnahme-Reiter), `277c8fd9` (Apex-Normalisierung als Folge-Migration), `d473eb44` (Merge, Umnummerierung), `e5052776` (zugeordnetes Rennen nicht löschbar), `6c18f88e` (Zeitnahmeprofil-Baum)
- Migrationen: `V202608101100__raceclocker_races.sql`, `V202608101110__drop_raceclocker_urls.sql`, `V202608101120__normalize_raceclocker_urls.sql`, `V202608111200__competition_raceclocker_race_backfill.sql`, `V202608111500__raceclocker_single_race.sql`
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/raceclocker/` (`RaceClockerRaceService`, `RaceClockerRaceResolution`, `RaceClockerFeedAssignment`, `control/RaceClockerRaceRepo.kt`)
- Specs: `docs/superpowers/specs/2026-08-09-raceclocker-rennen-design.md` (§1, §3, §6, §8), `docs/superpowers/plans/2026-08-09-raceclocker-rennen.md`, `docs/superpowers/specs/2026-08-10-raceclocker-rennen-testauftrag.md` (§1, §4, §5)
- Verwandte ADRs: [ADR-0014](0014-flyway-migrationskonventionen.md), [ADR-0054](0054-externer-zeitnahmedienst-setzung-bleibt-hier.md), [ADR-0056](0056-automatischer-feed-abruf-feed-ist-wahrheit.md), [ADR-0067](0067-zeitnahme-konfiguration-je-wettkampf-vererbt.md), [ADR-0080](0080-zeitnahmeprofil-baum-vier-ebenen.md), [ADR-0092](0092-zwischenzeiten-am-lauf-distanz-am-wettkampf.md)
