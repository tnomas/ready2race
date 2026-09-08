# ADR-0067: Zeitnahme-Konfiguration je Wettkampf, vom Event vererbt (coalesce), Abweichungen benannt

- Status: ersetzt durch [ADR-0080](0080-zeitnahmeprofil-baum-vier-ebenen.md)
- Datum: 2026-08-05
- Bereich: domäne, datenbank, api
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Zeitnahmesystem, Ergebnisadressen und Spaltenvorlagen (Startlisten-Export, Ergebnis-Import) wurden bei jedem Download im Dialog gewählt, mit der Gefahr, ein Zeitfahren-Rennen des Dienstes durch eine Lauf-Spalte in den Wellenmodus zu kippen. Die Ergebnisadressen wurden aus dem Durchführungs-Tab gepflegt. Bei zwanzig Wettkämpfen bedeutete Pflege je Wettkampf zwanzig Tippfehlerchancen, die erst am Renntag auffallen; eine veranstaltungsweite Vorbelegung war zunächst als „nicht vor dem 14.08." zurückgestellt.

## Entscheidung

1. **Reiter „Zeitnahme" am Wettkampf** (bewusst nicht „Einstellungen"). Vier Spalten auf `competition`, nie auf `competition_properties`, weil Properties wahlweise an einer Vorlage hängen und Zeitnahme-Daten auf konkrete Rennen zeigen: `timing_system` (Text ohne Check-Constraint), `startlist_config_qualification`, `startlist_config_rounds`, `result_import_config` (nullable ohne Default, `on delete set null`; Migration heute `V202608061209__competition_timing_config.sql`). Eigener Endpunkt `…/competition/{id}/timing-config` ersetzt `/competitionExecution/raceclocker-config`; die Vorlagenwahl verschwindet aus dem Dialog (`StartListConfigPicker.tsx` gelöscht, `config`-Query-Parameter entfällt).
2. **Preset-Auflösung:** Qualifikationsrunde → `startlist_config_qualification`, sonst `startlist_config_rounds`; ein leerer Quali-Slot fällt auf den Runden-Slot zurück, außer bei RaceClocker, dort bricht der Export mit Fehlercode ab (Korrektur nach Abschluss-Review, die Regel stand zunächst bedingungslos). Die Regel liegt nur im Backend; `CompetitionRoundDto` kennt `isQualification` nicht.
3. **Das Event bekommt dieselben Felder als Standard** (`V202608062100__event_timing_defaults.sql`, `V202608071300__event_timing_presets.sql`), gelesen per `coalesce(competition.x, event.x)`. Der Wettkampf liest live, solange der Override-Schalter aus ist; beim Einschalten werden die geltenden Werte vorbelegt, aber nicht dauerhaft kopiert. Der Wettkampf-Reiter zeigt geerbte Werte als Text mit Link; die Event-Karte listet abweichende Wettkämpfe je Feld (`CompetitionTimingDeviationDto`). Spaltenvorlagen heißen wie in der Konfiguration („Startlisten Export", „Rennergebnisse Import"), nicht „Preset".
4. **Polling-Takte nur am Event** (ADR-0056), kein Wettkampf-Override.

## Verworfene Alternativen

- Konfiguration pro Runde, Zeitnahme in Wettkampf-Vorlagen, ein drittes System als Plugin-Struktur: nicht gebaut.
- Vorlagen-Auswahl je Export/Import-Aufruf (`f9268e81`): entfernt, ein Codeweg.
- Bedingungsloser Rückfall Quali → Runden: bei RaceClocker zerstört das den Countdown.
- Kopie beim Einschalten der Abweichung: „man ändert oben und drei Wettkämpfe zeigen auf das alte Rennen"; verworfen.
- „Spaltenvorlagen bleiben je Wettkampf" (`4ee8205d`, `0bcc5d7d`): in `ffcb39ac` zurückgenommen, auch sie erben.
- Später revidiert, mehrfach: Die zwei festen Ergebnisadressen wurden am 09./10.08. durch benannte Rennen ersetzt (ADR-0068). Am 11.08. wurden die Event-Vorgaben für Rennen nicht mehr gelesen und per Backfill in die Wettkämpfe geschrieben (`V202608111200`); am 12.08. verschmolzen die Paare `_qualification/_rounds` per `coalesce(rounds, qualification)` zu je einer Spalte (`V202608111500__raceclocker_single_race.sql`), weil der Dienst Zeitfahren und Wellenrennen nicht mehr unterschied; die Rennen-Zuordnung verließ den Override-Schalter, weil der Schalter beim Ausschalten acht Wettkämpfen die Zuordnung genullt hatte (`6791a145`). Am 24./25.08. entfernte der Zeitnahmeprofil-Baum (ADR-0080) `competition.timing_system`, `startlist_config`, `result_import_config` und `raceclocker_race` ersatzlos (`V202608242110`): Zwei Zeitnahme-Softwares in einer Regatta gibt es nicht, und die Vererbung kehrte als Vier-Ebenen-Baum zurück.

## Konsequenzen

- Diese ADR beschreibt einen Zwischenstand von drei Wochen. Wer heute Zeitnahme-Konfiguration sucht, findet sie in `timing_profile_assignment` und `TimingProfileResolveLogic` (ADR-0080); `event.timing_system` entscheidet allein die Art.
- Die Lehre aus dem Override-Schalter ist geblieben: Wenn zwei Oberflächen dieselbe Spalte schreiben, darf keine sie „aufräumen".
- Die `coalesce`-Vererbung „Wettkampf vor Event" wurde zum Muster für andere Felder (Folgerunden-Automatik `auto_create_following_rounds`, ADR-0073) und lebt dort weiter.
- Enums als Text ohne Constraint (`timing_system`, ADR-0015) erlaubten das spätere Hinzufügen von `INTERN` ohne Migration.
- Die Migrationsnummern wurden vom Upstream-Team umbenannt; die Arbeitsnotizen nennen noch V202608051500.

## Quellen

- Commits: `2346bfc2` (Spalten am Wettkampf), `f00f51cc` (Preset aus der Runde statt Dialog), `39bacbfd` (eigener Endpunkt), `67cb4244` (Import-Preset vom Wettkampf), `f9268e81` (Picker entfernt), `6d2c52cf` (Reiter „Zeitnahme"), `7ff99982`, `4ee8205d` (Event-Standard mit Override), `0bcc5d7d` (geerbte Werte sichtbar), `ffcb39ac` (Formate erben), `4e9a55c9` (Warnung bei fehlender Quali-Zeitnahme), `25b53d2a`, `2a72d050` (Event-Vorgabe für Rennen weg, Backfill), `6791a145` (Schalter nullt keine Rennen mehr), `35e221c9`, `49b39c6a`, `1e77532e` (ein Rennen, ein Preset je Wettkampf), `6c18f88e` (Zeitnahmeprofil-Baum)
- Migrationen: `V202608061209__competition_timing_config.sql`, `V202608062100__event_timing_defaults.sql`, `V202608071300__event_timing_presets.sql`, `V202608111200__competition_raceclocker_race_backfill.sql`, `V202608111500__raceclocker_single_race.sql`, `V202608242110__competition_timing_override_weg.sql`
- Specs: `docs/superpowers/specs/2026-08-05-zeitnahme-tab-design.md` (§2.1, §3, §4, §4.1, §5, §8), `docs/superpowers/specs/2026-08-05-testprotokoll-nachtlauf.md` (F6), `docs/superpowers/specs/2026-08-07-raceclocker-polling-design.md` („Konfiguration"), `docs/crf-2026-folge-mr.md` (§1.1, §2.1)
- Verwandte ADRs: [ADR-0015](0015-views-in-aftermigrate-enums-als-text.md), [ADR-0042](0042-startlisten-export-ergebnisimport-stabile-kennung.md), [ADR-0054](0054-externer-zeitnahmedienst-setzung-bleibt-hier.md), [ADR-0056](0056-automatischer-feed-abruf-feed-ist-wahrheit.md), [ADR-0068](0068-benannte-zeitnahme-rennen-statt-adressen.md), [ADR-0073](0073-folgerunden-automatik-erstellt-aktiviert-nicht.md), [ADR-0080](0080-zeitnahmeprofil-baum-vier-ebenen.md)
