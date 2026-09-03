# Design: Helfer-App mit Scan-zuerst-Ablauf

**Stand:** 2026-09-02
**Branch:** `claude/helper-app-workflow-redesign-71001d`
**Gilt für:** alles unter `/app` (Helfer-App als PWA)

## 1. Problem

Die Helfer-App verlangt heute vor dem ersten Scan drei Entscheidungen: Veranstaltung, Aufgabe
(sechs Kacheln), dann erst der Scanner. Die Aufgabe bestimmt, was nach dem Scan passiert, obwohl
das Band selbst schon fast alles vorgibt: Ein unbekanntes Band kann nur zugewiesen werden, ein
Helferband kann nur Verpflegung oder Bandverwaltung bedeuten. Wer nur eine einzige Aufgabe darf,
klickt trotzdem durch Listen. Wer mehrere darf, verliert sich zwischen den Ansichten, und die
Zeitnahme hat obendrein eine eigene Veranstaltungswahl.

Am Regattatag zeigt sich das als „Auf welchem Reiter bin ich?“ und „Warum steht hier die Regatta
von letztem Jahr?“.

## 2. Zielbild

- **Scannen ist der Anfang.** Nach der Anmeldung landet man so schnell wie möglich vor der Kamera.
  Was nach dem Scan passiert, ergibt sich aus dem Band und den eigenen Rechten. Gefragt wird nur,
  wenn wirklich mehrere Dinge möglich sind, und die Antwort wird gemerkt.
- **So wenige Ansichten wie möglich.** Jede Zwischenseite, die sich aus Rechten oder Bestand
  ableiten lässt, wird übersprungen.
- **Die Veranstaltung ist Gedächtnis, keine Frage.** Sie wird einmal gewählt (oder automatisch
  erkannt) und gilt, bis jemand sie bewusst in den Einstellungen wechselt. Zeitnahme und
  Dashboard folgen derselben Veranstaltung.
- **Ein Abseits für alles Seltene.** Veranstaltung wechseln, Modus ändern, Sprache, Abmelden und
  App zurücksetzen liegen hinter einem Zahnrad, nicht im Ablauf.
- **Auf Handy, Tablet und Laptop bedienbar**, mit Fingerzielen ab 48 px und ohne horizontales
  Scrollen.

## 3. Nicht Teil dieses Vorhabens

- Die Zeitnahme-Boards selbst (`TimingBoardPage`, `TimingLeitstandPage`, `TimingStartDisplayPage`)
  und die kanonischen Adressen unter `/event/$eventId/timing/...`. Sie werden nur neu verdrahtet.
- Das Live-Dashboard (`LiveDashboardPage`). Nur sein Zurück-Ziel ändert sich.
- Backend und API. Der Scan-Endpunkt liefert bereits alles Nötige, insbesondere die
  Veranstaltung des Bandes.
- Service Worker, Manifest, Lese-Cache, Sitzungsablage. Die PWA-Mechanik bleibt unverändert.
- Neue Rechte oder Rollen.

## 4. Begriffe

**Scan-Rechte** sind die vier heutigen App-Rechte, die einen Scan sinnvoll machen. Der Typ heißt
`ScanMode`, weil dieselben Werte auch den gemerkten Stationsmodus bilden:

| ScanMode                 | Recht (GLOBAL UPDATE)     | Bedeutung am Band                          |
|--------------------------|---------------------------|--------------------------------------------|
| `APP_QR_MANAGEMENT`      | `APP_QR_MANAGEMENT`       | Bänder zuweisen und entfernen              |
| `APP_COMPETITION_CHECK`  | `APP_COMPETITION_CHECK`   | Boote an- und abmelden (Check-in/-out)     |
| `APP_EVENT_REQUIREMENT`  | `APP_EVENT_REQUIREMENT`   | Bedingungen prüfen (Waage)                 |
| `APP_CATERER`            | `APP_CATERER`             | Verpflegung ausgeben                       |

**Welten** sind die drei Einstiege, die nicht auseinander hervorgehen:

| Welt        | Bedingung                                          | Adresse           |
|-------------|----------------------------------------------------|-------------------|
| `SCAN`      | mindestens ein Scan-Recht                          | `/app/scan`       |
| `TIMING`    | `updateAppTimingGlobal`                            | `/app/timing`     |
| `DASHBOARD` | `readLiveDashboardGlobal`                          | `/app/dashboard`  |

Der **Modus** ist das gemerkte Scan-Recht, das an dieser Station gilt. Er existiert nur, wenn
jemand mehr als ein Scan-Recht hat; mit genau einem Recht ist der Modus dieses Recht.

## 5. Gedächtnis

Alles im `localStorage`, weil die installierte App Kaltstarts überstehen muss (siehe
PWA-Spezifikation vom 09.08.).

| Schlüssel       | Inhalt                                                  | Lebensdauer                          |
|-----------------|---------------------------------------------------------|--------------------------------------|
| `eventId`       | UUID der Veranstaltung (Schlüssel bleibt wie heute)     | bis zum bewussten Wechsel            |
| `app.scanMode`  | JSON `{userId, eventId, mode}`                          | gilt nur für dieselbe Person und Veranstaltung; sonst wie nicht vorhanden |

`appFunction` (alter Schlüssel) wird beim Start entfernt. `appRequirementCompetition` (gemerkter
Wettkampf an der Waage) bleibt unverändert.

Speicherzugriffe laufen über Funktionen mit injizierbarem `WebStorageLike`, damit die Tests im
Node-Umfeld ohne DOM auskommen (Muster aus `sessionToken.ts`).

## 6. Adressen

| Adresse                    | Seite                     | Voraussetzung                                     |
|----------------------------|---------------------------|---------------------------------------------------|
| `/app`                     | Einstieg (nur Weiche)     | angemeldet                                        |
| `/app/login`               | Anmeldung                 |                                                   |
| `/app/forbidden`           | Keine Berechtigung        |                                                   |
| `/app/veranstaltung`       | Veranstaltung wählen      | angemeldet, ≥1 Welt                               |
| `/app/start`               | Kacheln der Welten        | angemeldet, Veranstaltung, ≥2 Welten              |
| `/app/scan`                | Scanner                   | angemeldet, Veranstaltung, ≥1 Scan-Recht          |
| `/app/scan/$qrCodeId`      | Scan-Ergebnis             | wie Scanner                                       |
| `/app/einstellungen`       | Einstellungen             | angemeldet, Veranstaltung                         |
| `/app/dashboard`           | Schiedsrichter-Dashboard  | angemeldet, Veranstaltung, `readLiveDashboardGlobal` |
| `/app/timing`              | Posten wählen             | angemeldet, Veranstaltung, `updateAppTimingGlobal` |
| `/app/timing/leitstand`    | Leitstand                 | zusätzlich `updateEventGlobal`                    |
| `/app/timing/$stationId`   | Erfassungsboard           | wie Posten wählen                                 |

Entfallen: `/app/scanner`, `/app/function`, `/app/user`, `/app/participant`, `/app/assign`,
`/app/timing/$eventId/...`. Die Veranstaltung steht nicht mehr in der Zeitnahme-Adresse, sie
kommt aus dem Gedächtnis. Der Link aus dem Betrieb-Reiter (`/app/timing`) funktioniert weiter.

Wächter in `beforeLoad`: nicht angemeldet → `/app/login`. Fehlt die Voraussetzung „Veranstaltung“
oder das Recht, geht es nach `/app`, und der Einstieg entscheidet neu. So gibt es genau eine
Stelle, die Umleitungen kennt.

## 7. Der Einstieg (`/app`)

Eine reine Funktion `resolveEntry` entscheidet, die Seite führt nur aus:

```
Eingabe:  worlds (Welten der Person), eventId (gemerkt oder null),
          events (Liste oder undefined, solange sie lädt), now
Ausgabe:  {kind: 'WAIT'}
        | {kind: 'FORBIDDEN'}
        | {kind: 'CHOOSE_EVENT'}
        | {kind: 'ADOPT_EVENT', eventId}      // genau eine Veranstaltung im Betrieb
        | {kind: 'GO', to: '/app/start' | '/app/scan' | '/app/timing' | '/app/dashboard'}
```

Reihenfolge der Prüfungen:

1. Keine Welt → `FORBIDDEN`.
2. Veranstaltung: Ist eine gemerkt und die Liste noch nicht geladen, gilt sie (Offline-Start).
   Ist die Liste geladen und die gemerkte Veranstaltung darin enthalten, gilt sie. Ist keine
   gemerkt oder die gemerkte nicht mehr enthalten: bei genau einer Veranstaltung im Betrieb
   (`splitEventsByOperation`) → `ADOPT_EVENT`, sonst → `CHOOSE_EVENT`. Lädt die Liste noch und
   ist nichts gemerkt → `WAIT`.
3. Genau eine Welt → `GO` dorthin. Mehrere → `GO /app/start`.

`ADOPT_EVENT` und alle `GO` werden mit `replace: true` ausgeführt, damit die Zurück-Taste nie auf
die Weiche zurückfällt.

## 8. Der Scan-Ablauf

### 8.1 Scanner (`/app/scan`)

Kopfzeile: Zurück-Pfeil nur bei mehreren Welten (→ `/app/start`), Titel „Scannen“, darunter der
Name der Veranstaltung, rechts das Zahnrad (→ `/app/einstellungen`). Bei mehreren Scan-Rechten
steht unter dem Titel ein Chip mit dem Modus („Modus: Bedingungen prüfen“) oder „Modus: wird beim
ersten Scan gefragt“; der Chip führt in die Einstellungen.

Ein erkannter QR-Code (UUID am Ende des Inhalts) führt per `navigate` nach `/app/scan/$qrCodeId`.
Kein Netzaufruf im Scanner; die Ergebnisseite lädt selbst. Ungültiger Inhalt → Fehlermeldung wie
heute. Die 2-Sekunden-Entprellung bleibt im Scanner-Baustein (lokaler `useRef`, nicht mehr im
Context).

Der Entwicklungs-Knopf „Skip“ bleibt in `development`/`test`.

### 8.2 Ergebnis (`/app/scan/$qrCodeId`)

Die Seite lädt das Band über `checkQrCode` und kennt drei Bandtypen: `UNKNOWN` (leere Antwort),
`PARTICIPANT`, `USER`. Danach entscheidet eine reine Funktion:

```
decideScan({band, rights, mode})
  UNKNOWN:   rights ∋ APP_QR_MANAGEMENT  → {kind: 'ASSIGN'}
             sonst                       → {kind: 'UNKNOWN_NOT_ALLOWED'}
  bekannt:   effective = mode, falls mode ∈ rights
                        sonst rights[0], falls rights.length === 1
                        sonst null
             effective null              → {kind: 'CHOOSE', options: rights}
             sonst                       → {kind: 'ACT', mode: effective,
                                            canRemove: rights ∋ APP_QR_MANAGEMENT}
```

Vor der Entscheidung prüft die Seite die Veranstaltung: Trägt ein bekanntes Band eine andere
`eventId` als die gemerkte, zeigt sie „Dieses Band gehört zu einer anderen Veranstaltung“ mit dem
Namen der fremden Veranstaltung (falls in der Liste) und bietet nur „Nochmal scannen“. Das ist
neu und fängt den Fall ab, in dem am Steg noch ein Band vom Vorjahr hängt.

Was `ACT` je Band und Modus zeigt:

| Band          | Modus                    | Inhalt                                                     |
|---------------|--------------------------|------------------------------------------------------------|
| PARTICIPANT   | APP_COMPETITION_CHECK    | Person, Boote mit Check-in/-out (`TeamCheckInOut`)          |
| PARTICIPANT   | APP_EVENT_REQUIREMENT    | Person, Bedingungs-Checkliste (`RequirementsChecklist`)     |
| PARTICIPANT   | APP_QR_MANAGEMENT        | Person mit Wettkämpfen, Knopf „Band entfernen“ (primär)     |
| PARTICIPANT   | APP_CATERER              | Fehlerkarte „Teilnehmende bekommen hier keine Verpflegung“  |
| USER          | APP_CATERER              | Person, Verpflegungsbuchung (`CatererTransaction`)          |
| USER          | APP_QR_MANAGEMENT        | Person, Knopf „Band entfernen“ (primär)                     |
| USER          | Check oder Bedingungen   | Person, Hinweis „Helferband, hier ist nichts zu tun“        |

Ist `canRemove` gesetzt und der Modus nicht `APP_QR_MANAGEMENT`, steht ganz unten ein
Textknopf „Band entfernen“ (mit Bestätigungsdialog wie heute). So kann die Waage ein falsch
vergebenes Band korrigieren, ohne den Modus zu wechseln.

`CHOOSE` zeigt die Person und darunter je Scan-Recht einen großen Knopf. Die Wahl wird als Modus
gemerkt und die Seite entscheidet sofort neu, ohne Navigation. Unter den Knöpfen steht der Hinweis,
dass die Wahl für die folgenden Scans gilt und im Zahnrad änderbar ist.

Beim Abhaken einer Bedingung ist die Liste kurz gesperrt, bis die Antwort da ist.

`ASSIGN` ist die heutige Zuweisung (Teilnehmende/Nutzer umschalten, Suche, Systemnutzer per
QR-Code scannen), nur als Baustein mit Eigenschaften statt als Seite mit Context.

`UNKNOWN_NOT_ALLOWED` ist eine Fehlerkarte: „Dieses Band ist niemandem zugeordnet. Bänder zuweisen
darf hier nur die Bandausgabe.“ mit „Nochmal scannen“.

Jede abgeschlossene Handlung (Check-in, Bedingung gespeichert bleibt auf der Seite; Buchung,
Zuweisung, Entfernen) führt mit `replace: true` zurück nach `/app/scan`, damit Zurück nicht das
verbrauchte Ergebnis wieder öffnet. Der Zurück-Pfeil der Kopfzeile führt ebenfalls nach
`/app/scan`. Die Bedingungs-Checkliste bleibt nach dem Abhaken offen, weil an der Waage mehrere
Bedingungen nacheinander abgehakt werden.

### 8.3 Fehler beim Laden

Netzfehler oder unbekannte Antwortform → Fehlerkarte mit „Nochmal scannen“. Kein stiller
Rücksprung.

## 9. Übrige Seiten

**Veranstaltung wählen (`/app/veranstaltung`)**: Inhalt und Logik von `QrEventsPage` (im Betrieb
oben, alle Übrigen hinter „Alle Events“, Datum an jedem Knopf). Ohne das automatische
Weiterspringen, das liegt jetzt im Einstieg. Die Wahl setzt `eventId` und geht mit `replace` nach
`/app`. Kopfzeile mit Zurück-Pfeil nur, wenn schon eine Veranstaltung gemerkt ist (→ `/app`).

**Kacheln (`/app/start`)**: Kopfzeile mit Veranstaltungsname und Zahnrad. Kacheln: Scannen,
Zeitnahme, Schiedsrichter-Dashboard, je nach Welt. Raster 1/2/3 Spalten nach Breite. Kein
Abmelden-Knopf mehr auf der Seite.

**Einstellungen (`/app/einstellungen`)**: Zurück-Pfeil → `/app`. Abschnitte:

1. Veranstaltung: Name, Datum, Knopf „Veranstaltung wechseln“ → `/app/veranstaltung`.
2. Modus (nur bei mehreren Scan-Rechten): Auswahlliste der Scan-Rechte, Wahl wird sofort gemerkt.
3. Sprache: der bestehende `LanguageWidget` (wandert aus dem Layout hierher).
4. Konto: „Abmelden“.
5. App: „App zurücksetzen“ mit Bestätigung wie heute.

**Posten wählen (`/app/timing`)**: wie `TimingStationSelectPage`, aber mit der gemerkten
Veranstaltung. Die Karte „Schiedsrichter“ setzt den Modus auf `APP_COMPETITION_CHECK` und geht
nach `/app/scan`. Kopfzeile wie Kacheln, Zurück-Pfeil nur bei mehreren Welten.

**Dashboard (`/app/dashboard`)**: unverändert, Zurück → `/app`.

**Keine Berechtigung (`/app/forbidden`)**: unverändert, Knopf „Abmelden“ statt „Zurück zum
Login“, weil ein Zurück ohne Abmelden wieder hier landet.

## 10. Bausteine und Dateien

### Neue reine Logik (`frontend/src/components/qrApp/`)

- `appAccess.ts`: `scanRightsOf(check)`, `worldsOf(check)` über eine `checkPrivilege`-Funktion.
- `appEntry.ts`: `resolveEntry(...)` nach Abschnitt 7.
- `scanDecision.ts`: `decideScan(...)` nach Abschnitt 8.2, plus `bandTypeOf(response)`.
- `appMemory.ts`: `readRememberedEvent`/`writeRememberedEvent`, `readScanMode`/`writeScanMode`,
  `forgetLegacyAppFunction` (räumt den Schlüssel des Vorgängers auf).
- `eventOperations.ts`, `requirementScope.ts`, `startScannerWithRetry.ts`: weitere reine
  Hilfsfunktionen (Betrieb-Filter der Veranstaltungsliste, Vorbelegung des Wettkampfs an der
  Bedingungs-Checkliste, Neustart des Scanners nach Kamerafehler).

Je Datei ein `.test.ts` (vitest, Node, kein DOM).

### Context

`AppSessionContext` schrumpft auf: `eventId`, `setEventId`, `event` (aus der Liste), `events`,
`scanRights`, `worlds`, `scanMode`, `setScanMode`. Weg: `appFunction`, `qr`, `qrLastScanned`,
`navigateTo`, `AppView`, `AppFunction`. Der Wechsel der Veranstaltung löscht den gemerkten
Wettkampf der Waage nicht (er wird ohnehin nur übernommen, wenn die Person dort gemeldet ist).

### Seiten (`frontend/src/pages/app/`)

| Neu / geändert            | Aus                                  |
|---------------------------|--------------------------------------|
| `AppEntryPage.tsx`        | neu                                  |
| `EventChoicePage.tsx`     | `QrEventsPage.tsx`                   |
| `WorldsPage.tsx`          | `AppFunctionSelectPage.tsx`          |
| `ScanPage.tsx`            | `QrScannerPage.tsx`                  |
| `ScanResultPage.tsx`      | neu, ersetzt drei Seiten             |
| `SettingsPage.tsx`        | neu                                  |
| `TimingStationSelectPage` | angepasst (Veranstaltung aus Gedächtnis) |
| `AppDashboardPage`        | Zurück-Ziel                          |
| `ForbiddenPage`           | Abmelden                             |

Gelöscht: `QrEventsPage`, `AppFunctionSelectPage`, `QrScannerPage`, `QrParticipantPage`,
`QrAppuserPage`, `QrAssignPage`, `TimingEventsPage`, `AppTopTitle`, `appEntries` samt Test.

### Bausteine (`frontend/src/components/qrApp/`)

- `AppHeader.tsx`: Zurück-Pfeil (optional), Titel, Untertitel (optional), Zahnrad (optional).
  `AppColumn.tsx`: die eine zentrierte, begrenzte Spalte aller App-Seiten außer den
  Zeitnahme-Boards und dem Dashboard.
- `result/BandInfo.tsx` (aus `QrAssignmentInfo`, ohne Context), `result/ChooseMode.tsx`,
  `result/ParticipantActions.tsx`, `result/ParticipantRequirements.tsx`, `result/UserActions.tsx`,
  `result/AssignBand.tsx` (aus `QrAssignPage`), `result/ScanErrorCard.tsx`,
  `result/RemoveBandButton.tsx`.
- `assign/ParticipantAssignment.tsx`, `assign/UserAssignment.tsx`,
  `assign/AssignmentSearchField.tsx`, `assign/SystemUserScanner.tsx`: die Bausteine hinter
  `AssignBand` (Suche, Trefferliste, Systemnutzer-Scan).
- `TeamCheckInOut`, `RequirementsChecklist`, `CatererTransaction`, `QrNimiqScanner`: bekommen
  ihre Eingaben als Eigenschaften (`eventId`, `qrCodeId`, `participantId`, `onDone`).
- `PriceAdjuster.tsx` (Rundungsknöpfe unter dem Preisfeld der Verpflegung), `QrDeleteDialog.tsx`
  (der Bestätigungsdialog hinter „Band entfernen“).

### Layout

`AppLayout` verliert den `LanguageWidget`. Der Container bekommt Safe-Area-Abstände
(`env(safe-area-inset-*)`) und `maxWidth: 'sm'` als Spaltenbreite für alle Seiten außer den
Zeitnahme-Boards, die sich wie heute per `position: fixed` aus dem Fluss nehmen.

## 11. Responsiveness

- Eine zentrierte Spalte, Breite bis 640 px; auf dem Tablet bleibt sie zentriert statt links zu
  kleben (heutiger Fehler mehrerer Seiten).
- Fingerziele mindestens 48 px hoch; Aktionsknöpfe `size="large"`, `fullWidth`.
- Kacheln: 1 Spalte unter `sm`, 2 ab `sm`, 3 ab `md`.
- Scanner: Vorschau quadratisch, Breite `min(100%, 70vh)`, damit auf dem Tablet im Querformat
  der Knopf darunter sichtbar bleibt.
- Sticky-Aktionsleiste am unteren Rand für Check-in und Buchung (heute schon bei
  `TeamCheckInOut`), mit `padding-bottom: env(safe-area-inset-bottom)`.
- Kein horizontales Scrollen: lange Namen brechen um.

## 12. Übersetzungen

Neue Schlüssel unter `app.*` in `de`, `en`, `da`. Die Modusnamen wandern von
`app.functionSelect.functions.*` nach `app.mode.*`, die Welten nach `app.world.*`. Alte, nicht
mehr verwendete Schlüssel (`qrEvents.switchApp`, `qrEvents.back`, `app.functionSelect.*`,
`app.forbidden.backButton`) werden entfernt. Deutsche Texte mit echten Umlauten.

## 13. Tests

- Reine Logik: `appAccess`, `appEntry`, `scanDecision`, `appMemory` mit Tabellen aller
  Kombinationen (Band × Rechte × Modus; Welten × Veranstaltungslage).
- Bestehende Tests (`eventOperations`, `requirementScope`, `startScannerWithRetry`) bleiben.
- `tsc -b`, `vite build`, `eslint` müssen sauber sein.
- Handprüfung im Browser (Handy- und Tablet-Breite) mit dem Seed `71ed`: Anmeldung mit einem
  Konto mit einem Recht, mit mehreren Rechten, mit Zeitnahme; unbekanntes Band ohne Recht.

## 14. Risiken

- **Adressen in Verläufen.** Installierte Apps haben `/app/scanner` oder `/app/function` in der
  Historie. Unbekannte Adressen unter `/app` fallen auf die Weiche `/app` zurück (Not-Found-Route).
- **Zeitnahme ohne Veranstaltung in der Adresse.** Ein Posten-Link `/app/timing/$stationId` aus
  einem Verlauf mit anderer gemerkter Veranstaltung lädt einen fremden Posten. Die Boards
  prüfen die Veranstaltung ohnehin über die Posten-Liste; die kanonischen, geteilten Links
  bleiben unter `/event/...` und sind nicht betroffen.
- **Modus vergessen.** Wer den Modus einmal falsch wählt, arbeitet falsch weiter. Der Chip am
  Scanner macht den Modus dauerhaft sichtbar; das ist die Abwägung gegen eine Nachfrage je Scan.
