# Design: Zeitnahme-Einstellungen pro Wettkampf

**Stand:** 2026-08-05
**Status:** Design abgenommen, Implementierung ausstehend
**Kontext:** Nacharbeit zur RaceClocker-Integration (Issue #94, Migrationen
`V202607211200__raceclocker_integration.sql` und `V202607231000__raceclocker_feedback.sql`). Ziel
ist der Sammelbranch `feature/crf-2026` für die Coastal Regatta am 14.08.2026.

---

## 1. Problem

Die RaceClocker-Ergebnis-URLs werden heute über einen Knopf **im Durchführungs-Tab** gepflegt
(`RaceClockerConfigDialog`, geöffnet aus `CompetitionExecution.tsx:792`). Das ist der falsche Ort:
die URLs sind keine Handlung während der Durchführung, sondern eine Einstellung, die einmal vor
der Regatta gesetzt wird und danach für alle Runden gilt.

Zwei weitere Löcher hängen daran:

- **Das Startlisten-Preset wird bei jedem CSV-Download neu von Hand gewählt**
  (`StartListConfigPicker.tsx`, globale Liste aus `startlist_export_config`). RaceClocker braucht
  pro Wettkampf zwei Presets — „RaceClocker Zeitfahren" ohne Lauf-Spalte für die Qualifikation,
  „RaceClocker Läufe" mit Lauf-Spalte für alles andere. Greift man am Renntag zum falschen,
  kippt RaceClocker das Zeitfahren-Rennen wegen der Lauf-Spalte in den Wave-Modus und der
  **Countdown fehlt**. Niemand prüft das nach; der Fehler fällt erst am Start auf.
- **Das Ergebnis-Import-Preset ebenso** (`MatchResultUploadDialog.tsx`, Liste aus
  `match_result_import_config`).
- **Das Ergebnis-Menü am Lauf ist fest verdrahtet**
  (`MATCH_RESULT_OPTIONS = ['form', 'XLS', 'RACECLOCKER']`, `CompetitionExecutionRound.tsx:52`)
  und bietet den RaceClocker-Pull auch bei Wettkämpfen an, die nie einen Feed haben.

**Nicht Teil des Problems:** Eine Konfiguration *pro Runde* ist nicht nötig. Alle Läufe-Runden
liegen in einem einzigen RaceClocker-Rennen und werden über die Lauf-Team-ID auseinandergehalten
(siehe `V202607231000`). Welche der beiden URLs bzw. Presets gilt, leitet sich aus
`competition_setup_round.is_qualification` ab. Pro Runde wäre nur nötig, wenn jemand am Renntag
ein zweites Läufe-Rennen anlegt — bewusst nicht vorgesehen.

## 2. Zielbild

Ein neuer Tab **„Zeitnahme"** auf der Wettkampf-Seite, neben Setup, Durchführung und
Platzierungen. Er beantwortet eine Frage: *Mit welchem Fremdsystem reden wir für diesen
Wettkampf, und unter welchen Adressen und Spalten-Presets?*

### 2.1 Trennschärfe zu „Wettkampf bearbeiten"

Die Abgrenzung steckt schon im Schema. `competition_properties` hängt laut Check-Constraint
entweder an einer `competition` **oder** an einem `competition_template`
(`V202501151000__events_structure.sql:79`) — das ist der vorlagefähige Teil, den „Wettkampf
bearbeiten" pflegt, und deshalb teilt jener Dialog sein Formular mit den Wettkampf-Vorlagen.

Die Zeitnahme-Einstellungen hängen direkt an `competition`, der Tabelle mit `event uuid not null`.
Eine Vorlage *kann* sie nicht tragen, denn sie zeigen auf konkrete Rennen in einem fremden System,
angelegt für eine konkrete Regatta.

| Ort | Frage | vorlagefähig |
|---|---|---|
| Wettkampf bearbeiten | Was *ist* dieser Wettkampf? Was steht in der Ausschreibung? | ja |
| Setup | Wie ist die Runden- und Lauf-Struktur? | ja |
| **Zeitnahme** | Mit welchem Fremdsystem reden wir, unter welcher Adresse? | **nie** |

Der Tab heißt bewusst nicht „Einstellungen": der neutrale Name lädt die Doppelung mit „Wettkampf
bearbeiten" erst ein, „Zeitnahme" beantwortet die Zuordnungsfrage von selbst.

## 3. Datenmodell

Eine Migration, vier neue Spalten auf `competition`. Die beiden URL-Spalten
(`raceclocker_tt_results_url`, `raceclocker_heats_results_url`) existieren bereits aus
`V202607211200` und bleiben unverändert.

```sql
alter table competition
    add column timing_system                  text,
    add column startlist_config_qualification uuid references startlist_export_config on delete set null,
    add column startlist_config_rounds        uuid references startlist_export_config on delete set null,
    add column result_import_config           uuid references match_result_import_config on delete set null;
```

**`timing_system`** trägt `RACECLOCKER` oder `WEBSCORER`, als `text` ohne Check-Constraint — wie
`places_option` in `V202505301000__competition_setup.sql:32` auch. Die Werte werden im Backend als
Enum geparst.

**Nullable, ohne Default.** Das ist die wichtigste Eigenschaft dieser Migration: alle bestehenden
Wettkämpfe stehen auf `null` und verhalten sich danach exakt wie vorher — Preset-Dialog bei jedem
Download und Upload, alle drei Ergebnis-Optionen im Menü. Es ändert sich erst etwas, wenn jemand
für einen Wettkampf ein System wählt. Kein Datenmigrations-Schritt, kein Stichtag.

**`on delete set null`** bei den Preset-Referenzen: löscht jemand in der Konfiguration ein Preset,
verliert der Wettkampf seine Vorbelegung und fällt auf den Dialog zurück. Kein Löschverbot in der
Preset-Verwaltung, kein Kaskadenschaden am Wettkampf.

## 4. Auflösungsregel

Eine Regel, im Backend, an einer Stelle:

> **Qualifikationsrunde → `startlist_config_qualification`. Sonst → `startlist_config_rounds`.
> Ist der Quali-Slot leer, greift der Runden-Slot.**

Der Rückfall ist keine Bequemlichkeit, sondern der Grund, warum Webscorer nur *ein* Preset-Feld
braucht: dort gibt es keine Zweiteilung, das eine Preset landet im Runden-Slot und gilt damit auch
für die Qualifikation. RaceClocker füllt beide Slots.

Die Regel steht damit neben der bestehenden URL-Regel im Backend
(`RaceClockerMatchTarget.resultsUrl`) statt im Frontend verdoppelt zu werden — `CompetitionRoundDto`
kennt `isQualification` heute gar nicht und soll es auch nicht bekommen müssen.

### 4.1 Wirkung auf `/startList`

Der `config`-Query-Parameter ist heute Pflicht für CSV
(`competitionExecution.kt:224`). Künftig **optional**:

- Parameter gesetzt → wird verwendet wie heute (der Dialog-Weg bleibt vollständig funktionsfähig).
- Parameter fehlt → Server löst nach der Regel aus Abschnitt 4 auf.
- Parameter fehlt und beide Slots leer → eigener Fehlercode; das Frontend öffnet daraufhin den
  `StartListConfigPicker` wie bisher.

Analog für den Ergebnis-Import: fehlt der Konfigurations-Parameter, greift
`result_import_config`; ist der leer, erscheint der `MatchResultUploadDialog` mit Preset-Auswahl.

## 5. API

Der bestehende Endpunkt liegt unter `/competitionExecution/raceclocker-config` — also unter der
Durchführung, aus der wir ihn gerade herausholen, und unter einem Namen, der nur eines der beiden
Systeme nennt. Er wird **ersetzt**:

```
GET  /event/{eventId}/competition/{competitionId}/timing-config
PUT  /event/{eventId}/competition/{competitionId}/timing-config
```

Gemountet in `competition.kt` neben `competitionExecution()`, nicht darin. Privilegien wie heute:
Lesen `ReadEventGlobal`, Schreiben `UpdateEventGlobal`.

DTO und Request tragen sechs Felder: `timingSystem`, die zwei URLs, die zwei
Startlisten-Presets, das Import-Preset. Alle nullable.

`getRaceClockerConfig` / `updateRaceClockerConfig` in `CompetitionExecutionService` werden zu
`getTimingConfig` / `updateTimingConfig`. Die URL-Normalisierung beim Speichern
(Schema ergänzen, http auf https heben, Leerstrings zu `null`) bleibt unverändert erhalten —
inklusive ihrer Begründung im Kommentar. Der alte Endpunkt, `RaceClockerConfigDto` und
`RaceClockerConfigRequest` entfallen; das Frontend-SDK wird neu generiert.

## 6. Frontend

### 6.1 Neuer Tab

`COMPETITION_TABS` in `CompetitionPage.tsx` bekommt `'timing'`. `validateTabSearch<CompetitionTab>`
ist generisch, die Route braucht keine Änderung. Sichtbarkeit wie Setup und Durchführung:
`updateEventGlobal` und `!eventData.challengeEvent`.

Der Tab-Inhalt entsteht aus `RaceClockerConfigDialog.tsx`: der Dialog-Rahmen fällt weg, das
Formular und **beide Hinweis-Boxen** wandern in eine neue Komponente
`components/event/competition/timing/CompetitionTimingConfig.tsx`. `RaceClockerConfigDialog.tsx`
wird gelöscht.

### 6.2 Aufbau

```
Zeitnahme-System   ( ) — nicht gesetzt    (•) RaceClocker    ( ) Webscorer

┌─ nur bei RaceClocker ──────────────────────────────┐
│ Ergebnis-Feed Zeitfahren-Rennen  [………………………]       │
│ Ergebnis-Feed Läufe-Rennen       [………………………]       │
│ ℹ zwei Rennen nötig — Countdown nur bei Einzelstart │
└────────────────────────────────────────────────────┘

Startliste Qualifikation   [RaceClocker Zeitfahren ▾]
Startliste übrige Runden   [RaceClocker Läufe      ▾]
ℹ Kopfzeile abschalten, R2R-Lauf-ID auf „Extra info" mappen

Ergebnis-Import (xlsx)     [………………………………………… ▾]
```

Bei **Webscorer** entfällt der URL-Block, und aus den zwei Startlisten-Feldern wird eines
(gespeichert im Runden-Slot, siehe Abschnitt 4). Bei **nicht gesetzt** ist der ganze Tab bis auf
die System-Auswahl leer.

Das Import-Feld ist in beiden Systemen sichtbar: bei Webscorer ist der xlsx-Upload der Hauptweg,
bei RaceClocker der Notausgang, wenn der Feed am Renntag klemmt.

Die Preset-Listen kommen aus `getStartListConfigs` und `getMatchResultImportConfigs`, wie in den
beiden heutigen Dialogen. Deren Verweise auf die globale Preset-Verwaltung (`InlineLink` nach
`/config`) wandern mit in den Tab.

### 6.3 Validierung

Unvollständig speichern ist **erlaubt**: die RaceClocker-Rennen entstehen dort erst kurz vor der
Regatta, die URLs liegen bei der Vorbereitung noch nicht vor. Stattdessen zwei Hinweise:

- **Im Tab:** eine Warnung, welches Stück fehlt. Zwei Fälle: System `RACECLOCKER`, aber mindestens
  eine der beiden URLs leer; oder beide Startlisten-Slots leer (dann greift auch der Rückfall aus
  Abschnitt 4 nicht).
- **Im Durchführungs-Tab:** derselbe Sachverhalt als Warnung mit Link auf den Zeitnahme-Tab
  (`InlineLink` mit `search={{tab: 'timing'}}`). Der Hinweis erscheint nur, wenn ein System
  gewählt und die Konfiguration unvollständig ist — bei `null` bleibt die Durchführung wie heute.

### 6.4 Durchführung

- Der Knopf „RaceClocker-Konfiguration" (`CompetitionExecution.tsx:787–794`) verschwindet
  samt Dialog-State.
- `MATCH_RESULT_OPTIONS` wird abhängig von `timingSystem`: `WEBSCORER` → ohne
  `RACECLOCKER`-Eintrag; `RACECLOCKER` und `null` → wie heute alle drei. (Bei `RACECLOCKER` bleibt
  `XLS` als Notausgang bestehen.)
- Startlisten-CSV und Ergebnis-Import laden ohne Konfigurations-Parameter; die Dialoge erscheinen
  nur noch beim Fehlercode aus Abschnitt 4.1.

## 7. Tests

**Backend** (`./mvnw test`, Stil wie `RaceClockerFeedTest`): Unit-Tests der Auflösungsregel —
Quali-Runde mit gefülltem Quali-Slot; Quali-Runde mit leerem Quali-Slot (→ Runden-Slot);
Nicht-Quali-Runde; beide Slots leer (→ Fehlercode); explizit übergebener Parameter überstimmt die
Auflösung. Dazu die URL-Normalisierung beim Speichern, die aus dem alten Endpunkt übernommen wird.

**Frontend** (`npm run test`, `npm run build`): die System-abhängige Sichtbarkeit im Tab und die
Ableitung von `MATCH_RESULT_OPTIONS` als reine Funktionen, testbar ohne Rendering — analog zu
`editMatchForm.test.ts`.

**Manuell vor der Regatta:** ein vollständiger Round-Trip pro System. RaceClocker: Presets
hinterlegen, Startliste für Quali und für eine Läufe-Runde ohne Dialog laden, in beide Rennen
importieren, Ergebnisse pullen. Webscorer: ein Preset, xlsx-Upload ohne Dialog.

## 8. Abgrenzung

Bewusst nicht Teil dieses Designs:

- URL oder Preset **pro Runde** (Abschnitt 1).
- Zeitnahme-Einstellungen in **Wettkampf-Vorlagen** — laut Schema unmöglich und fachlich falsch.
- Ein **drittes Zeitnahme-System** oder eine Plugin-Struktur dafür. Die zwei Werte sind ein
  `text`-Feld; ein drittes System ergänzt man später ohne Migration.
- **Veranstaltungsweite** Vorbelegung der Presets (etwa „alle Wettkämpfe dieser Regatta nutzen
  RaceClocker"). Sinnvoll bei vielen Wettkämpfen, aber nicht vor dem 14.08.
