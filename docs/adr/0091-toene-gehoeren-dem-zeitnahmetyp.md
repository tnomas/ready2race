# ADR-0091: Töne gehören dem Zeitnahmetyp: Ton-Sätze je Veranstaltung mit Vorgabesatz, ein Schritt-Typ für alle Folgen, verpasste Töne werden nie nachgeholt

- Status: angenommen
- Datum: 2026-08-24
- Bereich: domäne, datenbank, frontend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Der Countdown-Piep war fest verdrahtet (T-5 bis T-1 bei 600 Hz, T-0 bei 900 Hz). Wasser und Halle brauchen verschiedene Klänge, ein Fehlstart braucht eine über Wind erkennbare Tonfolge. Der erste Umbau hängte den Sequenz-Tonplan an den Zeitnahmetyp, die drei Erfassungstöne aber an die Veranstaltung. Folge: Zeitfahren und Massenstart klangen zwangsläufig gleich, und wer die Lautstärke aller Typen ändern wollte, musste jeden Typ anfassen; die Event-Einstellungsseite war auf 638 Zeilen gewachsen.

## Entscheidung

**Modell**
- Tabelle `timing_tone_set` je Veranstaltung (V202608261200) trägt alle vier Töne: Startsequenz-Tonplan, Zwischenzeit-, Ziel- und Fehlstartton, dazu `tone_per_boat` (Tonleiter je Boot). Genau ein Vorgabesatz je Veranstaltung, erzwungen durch den partiellen Unique-Index `on timing_tone_set (event) where is_default`.
- `timing_mode.tone_set` ist nullable mit `on delete set null`: `null` heißt „erbt den Vorgabesatz". Ein Zeitnahmetyp wählt also einen Satz oder erbt.
- Die Töne reisen mit der Partie (`TimingMatchDto.timingMode`) in der Posten-Startliste; `TimingSettingsDto` (`GET …/timing/settings`) behält den Vorgabesatz als Rückfall für Erfassungen ohne Zuordnung, also für den großen Knopf.
- Zwei Migrationen bewusst getrennt: V202608261200 legt Sätze an und übernimmt den Bestand verhaltensgleich (Satz „Standard", je Typ mit eigenem Tonplan ein eigener Satz, Bestand mit `tone_per_boat = false`); V202608261210 lässt die Event-Tonspalten erst danach fallen ([ADR-0014](0014-flyway-migrationskonventionen.md)).
- Grenzen zentral in `TimingToneLimits` (`app/timing/entity/TimingTones.kt`): höchstens 30 Einträge, 100–4000 Hz, Offset −600000..0 ms. Positive Offsets sind verboten; `null` als Plan heißt eingebauter Standard, und ein Regressionstest belegt, dass der Standardplan exakt wie die alte Regel klingt.

**Tonmodell im Frontend** (`frontend/src/utils/timing/tonePlan.ts`, `feedback.ts`)
- Ein Schritt-Typ `ToneStep` für Startplan, Fehlstart-Folge und Erfassungstöne; verschieden ist nur das Offset-Fenster (rückwärts zum Start bzw. vorwärts ab Auslösung), geprüft an der validierenden Stelle.
- Hüllkurve explizit: `releaseMillis = null` heißt Abfallend, `0–5000` heißt Gehalten. `0` ist ein legitimer Wert und wird nie zu `null` normalisiert (andere Klangform); explizites `SINE` wird dagegen zu `null` normalisiert (gleicher Klang).
- Wellenform mit festem Formfaktor je Form, damit ein Formwechsel keinen Lautstärkesprung macht. Der eingebaute Fehlstart ist kurz-kurz-lang im Sägezahn und wird abwärtskompatibel gelesen (Objekt wird zur einelementigen Folge).
- `playToneSequence` meldet die ganze Folge an der WebAudio-Uhr an; die Folge ist danach nicht abbrechbar, beim Rückruf gewollt.
- Verpasste Töne werden nie nachgeholt. Der Erfassungston spielt nur bei der Nutzergeste; das Nachsenden der Offline-Warteschlange bleibt stumm.
- Das Fehlstart-Signal ist eine eigene WebSocket-Nachricht (`attemptRetracted`), weil Einzelmarken-Echos auch bei harmlosen Korrekturen feuern.

## Verworfene Alternativen

- **Töne an der Veranstaltung** (erste Fassung V202608211470): alle Typen klingen gleich; ausgebaut am 26.08.
- **Drei dauerhaft offene Ton-Editoren in den Veranstaltungs-Einstellungen:** ersetzt durch einen Abschnitt „Ton-Sätze".
- **Vorgabesatz per Anwendungslogik statt Index:** zwei Vorgabesätze wären dann nur ein Bug entfernt.
- **Eine Migration für Anlegen und Abräumen:** kein Zustand ohne Datenverlust dazwischen.
- **Zweiter Schritt-Typ für den Fehlstart:** wäre eine reine Kopie.
- **Lineares Ausklingen:** das Ohr hört logarithmisch.
- **`setTimeout`-Kaskade für Tonfolgen:** klang ungleichmäßig.
- **Tonleiter-Schalter am Event:** aus dem Scharfschaltungs-Plan hierher verschoben.
- **Feste Tastenbelegung `1`–`6`/`A`–`F` im Frontend:** wanderte zusammen mit den Tönen an den Typ ([ADR-0089](0089-startsequenzen-serverseitig-fehlstart.md)).

## Konsequenzen

- Ohne Ton-Satz gilt „ein Ton für alle Boote"; die Auflösung fällt auf `false`, nicht auf den Spalten-Default. Wer Tonleitern will, muss einen Satz anlegen.
- Das Löschen eines Satzes setzt betroffene Typen stumm auf „erben"; das ist gewollt, aber nicht sichtbar, bis jemand den Typ öffnet.
- Zwei Rückfallpfade (Partie trägt Töne, Settings tragen den Vorgabesatz) müssen konsistent bleiben; wer einen ändert, prüft den anderen.
- Die `0`-vs-`null`-Regel bei `releaseMillis` ist eine Falle für jede Normalisierung; sie steht im Backend-KDoc und in der API-Beschreibung.
- Nach dem Aufräumen der Töne sank kurz die Testzahl; eine gesunkene Testzahl ist bei solchen Umbauten das Erste, was einzeln nachverfolgt wird.

## Quellen

- Commits: `66d25a2b` (Tonplan-Logik als reine Funktionen), `2ee7e971` (Tonplan am Typ, Erfassungstöne am Event, V202608211470), `51799701` (Boards spielen), `d4814336` (Editoren), `aeb70f16`, `c5b2f34b`, `c8121c23` (Fehlstart-Ton, V202608211480), `ea7cc7bf`, `cf49c00b` (Hüllkurve explizit), `2e5f737b`, `e58428c8` (Wellenform), `a35483ca`, `afd72f58`, `c634c537` (Fehlstart als Tonfolge), `e97bbaa5` (Entwurf Ton-Sätze), `f25d5225` (Ton-Sätze, V202608261200), `0b72d3be` (Bestandssätze), `164b7d3c` (Töne reisen mit der Partie), `653b2373` (Event gibt Töne ab, V202608261210), `ab5c7f68` (Oberfläche), `95215b0b` (Gesamtprüfung), `9f137ef2` (Typ: Töne, Tasten, Sequenz-Schalter)
- Migrationen: `V202608211470__timing_toene.sql`, `V202608211480__timing_fehlstart_ton.sql`, `V202608261200__timing_tone_set.sql`, `V202608261210__event_toene_weg.sql`
- Specs: `docs/superpowers/specs/2026-08-26-zeitnahmetyp-toene-design.md`, `docs/superpowers/plans/2026-08-26-zeitnahmetyp-toene.md`, `docs/superpowers/plans/2026-08-25-scharfschaltung.md` („Task 4 — ANGEHALTEN")
- Verwandte ADRs: [ADR-0014](0014-flyway-migrationskonventionen.md), [ADR-0080](0080-zeitnahmeprofil-baum-vier-ebenen.md), [ADR-0089](0089-startsequenzen-serverseitig-fehlstart.md), [ADR-0090](0090-scharfschaltung-je-posten.md)
