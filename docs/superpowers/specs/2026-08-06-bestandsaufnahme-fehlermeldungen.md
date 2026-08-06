# Bestandsaufnahme: Fehlermeldungen ohne ErrorCode

**Stand:** 06.08.2026, nach der Überarbeitung der Zeitplan-Meldungen (B4/B21 und Excel-Import).
**Zweck:** Entscheidungsgrundlage für Thomas — soll die Fehlerkommunikation breiter überarbeitet
werden? **Dies ist eine Liste, keine Änderung.** Nichts davon ist angefasst worden.

## Das Muster, um das es geht

Ein Backend-Fehler trägt einen `ErrorCode`
(`backend/.../calls/responses/ErrorCode.kt`), das Frontend bildet ihn auf einen übersetzten Text ab,
mit einem Fallback für Unbekanntes. Vorbild:
`frontend/src/components/event/competition/registration/deregistrationError.ts`.

Fehlt der Code, passiert im Frontend eines von zwei Dingen:

1. Der rohe **englische Backend-Text** steht in der Oberfläche (z. B. beim Urkunden-Download).
2. Häufiger: die Meldung verschwindet in einem **Sammeltopf** — `common.error.unexpected`,
   `entity.add/edit/delete.error` oder ein fester Dialogtext. Der Nutzer erfährt, *dass* etwas nicht
   ging, nie *warum*. Das ist der eigentliche Verlust; er fällt weniger auf als englischer Text,
   kostet am Renntag aber genauso viel Zeit.

51 `*Error.kt`-Dateien unter `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/` geprüft.
404er auf IDs, die die Oberfläche gar nicht anbietet, sind durchgehend ausgeklammert — die kann ein
Nutzer über die normale Bedienung nicht auslösen.

## Überblick

| Bereich | Zweige gesamt | nutzerauslösbar | davon ohne ErrorCode |
| --- | ---: | ---: | ---: |
| Zeitplan (eventSchedule) | 22 | 19 | **8** |
| Durchführung/Ergebnisse | 61 | 59 | **36** |
| Meldungen/Registrierung | 39 | 33 | **18** |
| Urkunden & Dokumente | 26 | 16 | **16** (0 % Abdeckung) |
| Stammdaten & Konfiguration | 49 | 32 | **32** (0 % Abdeckung) |
| Rechnungen | 5 | 5 | 1 |
| Benutzer/Rollen/Anmeldung | 21 | 16 | **16** |
| Live-Anzeigen | 9 | 9 | **9** (0 % Abdeckung) |
| **Summe** | **232** | **189** | **≈136** |

Zwei Bereiche sind bereits vorbildlich: **RaceClocker** (8 von 8 mit Code) und
**Abmeldung/CompetitionDeregistration** (5 von 5). Bei **Rechnungen** fehlt nur noch `NotFound`.

## Nach Bereich

### Zeitplan (eventSchedule) — nach dieser Überarbeitung noch offen

Verschieben und Excel-Import sind erledigt (`SCHEDULE_SHIFT_*`, `SCHEDULE_IMPORT_DUPLICATE_ROWS`,
`SPREADSHEET_*`, `FILE_ERROR`). Offen bleiben acht Zweige derselben Datei
(`eventSchedule/entity/EventScheduleError.kt`):

- `MatchAlreadyStarted` / `MatchAlreadyFinished` (Z. 105/106) — „The match of slot … has already
  started/is already finished". Aktivieren/Beenden über den Zeitplan-Tab, `EventSchedule.tsx`
  zeigt `common.error.unexpected`.
- `SlotNotSkippable` / `SlotNotLinked` (Z. 107/108) — dieselbe Sammelmeldung.
- `SetupMatchAlreadyPlanned` (Z. 104) — „already has a schedule slot", landet in
  `entity.add/edit.error` des Slot-Dialogs.
- `RoundNotMaterialized` / `RoundHasRunsToRace` (Z. 206/207) — **gegensätzliche Ursachen, identischer
  Text** `cancelRound.error` in `CompetitionExecutionRound.tsx`. Der eine Fall heißt „überspring die
  Slots einzeln", der andere „diese Läufe müssen gefahren werden".
- `CompressionImpossible` (Z. 109) hat weiterhin keinen Code, wird aber über `details` sauber
  angezeigt — funktioniert, ist nur nicht nach dem Muster gebaut.

### Durchführung/Ergebnisse — größter Block

`CompetitionExecutionError.kt` (35 Zweige, ~21 ohne Code), `CompetitionExecutionChallengeError.kt`
(7/7 ohne Code), `SubstitutionError.kt` (7/7 ohne Code), dazu je einer aus
`MatchResultImportConfigError` und `StartListConfigError`. `RaceClockerError.kt` ist vollständig.

- `CompetitionExecutionError.kt:106` `TeamsNotMatching`, `:116` `MatchResultsLocked`,
  `:180` `PlacesNotContinuous`, `:185` `StartTimeManagedBySchedule` — alle vier in
  `CompetitionExecution.tsx` generisch.
- `CompetitionExecutionChallengeError.kt:38` `ResultAlreadySubmitted` — alle sieben Challenge-Gründe
  teilen sich eine Sammelmeldung.
- `SubstitutionError.kt:20/25` — sieben Ablehnungsgründe, ein bis zwei Texte in `Substitutions.tsx`.
- Nebenfund: `PlaceAndTimeBothNull` scheint toter Code, wird nirgends mehr geworfen.

### Meldungen/Registrierung

- `CompetitionRegistrationError.kt` — 8 Zweige, **kein einziger Code**. Darunter die
  Kernvalidierungen `RatingCategoryMissing` (Z. 44) und `ParticipantOutOfAgeRestriction` (Z. 49),
  die in `entity.add.error` verschwinden.
- `EventRegistrationError.kt` — 10 von 19 sind schon sauber gemappt
  (`EventRegistrationCreatePage.tsx`); offen u. a. `SelfRegistrationNotAllowed` (Z. 121) und
  `DocumentsAlreadyAccepted` (Z. 136).
- `EventParticipantError.kt:21` `NoEmail` — trägt im Quelltext schon ein `//TODO: error-code`.
- Roher englischer Text: `ParticipantForEventTable.tsx:460` gibt `error.message` direkt aus.

### Urkunden & Dokumente — 0 % Abdeckung

Keine der acht Dateien setzt einen `errorCode`.

- `CertificateError.kt:20` `ChallengeStillInProgress`, `:35` `UnreadableTemplate` — landen als
  **roher englischer Text** im Feedback (`ParticipantForEventTable.tsx:459-460`).
- `AwardCertificateError.kt:14/29` `MissingTemplate` / `UnreadableTemplate` teilen sich einen Text.
- `GapDocumentTemplateError.kt:27` `InvalidFont` („Font file could not be read") → `entity.add.error`.
- `WebDAVError.kt` — 10 Zweige, 6 klar nutzerauslösbar (`ConfigIncomplete` Z. 78,
  `ManifestNotFound` Z. 62), alle in einer Pauschalmeldung.

### Stammdaten & Konfiguration — 0 % Abdeckung

Für diese Domänen enthält das `ErrorCode`-Enum bislang überhaupt nichts.

- `ParticipantError.kt:17` `ParticipantInUse` — Löschen blockiert, Grund unsichtbar.
- `CompetitionSetupError.kt:28/33` `CreatedRoundDeleted` / `CreatedRoundOrderChanged` — reguläre
  Bedienfehler beim Umbau eines Setups.
- `CompetitionCategoryError.kt:21`, `FeeError.kt:20` (`…InUse`) — liefern in `details` sogar die
  Liste der betroffenen Wettkämpfe mit; angezeigt wird sie nicht.
- `EventDayError.kt:22` `CompetitionsNotFound` — ebenso mit ungenutzter `details`-Liste.
- `CatererError.kt:13` `InvalidPrice`. Nebenfund: die zugehörige Validierung in
  `CatererTransactionRequest.kt:13` ist toter Code (`Valid` fest verdrahtet).
- Auffällig: `ParticipantError.kt:19` `UnknownGenderValue` **hat** einen Code
  (`PARTICIPANT_IMPORT_UNKNOWN_GENDER_VALUE`), fällt im Frontend-Switch aber trotzdem in den
  `default`, weil dort nur `SPREADSHEET_*` behandelt wird. Ein Einzeiler.

### Benutzer/Rollen/Anmeldung

`AuthError` (4), `RoleError` (2), `TaskError` (2), `WorkShiftError` (2), `WorkTypeError` (1),
`AppUserError` (4 von 7) ohne Code.

- `TaskError.kt:17`, `WorkShiftError.kt:17` `AssignedAClubRepresentative` → „Löschen fehlgeschlagen".
- `RoleError.kt:32` `Static` — dass die Rolle systemseitig fixiert ist, erfährt niemand.
- `AuthError.kt:15` `CredentialsIncorrect` funktioniert nur, weil zufällig kein zweiter 401-Fall
  existiert: die Zuordnung hängt am Status, nicht an einem Code.

### Live-Anzeigen — 0 % Abdeckung, aber renntagsrelevant

- `LiveDashboardError.kt:12` `FinishReservedForOffice` — Steg-Personal beendet einen Lauf, der dem
  Regattabüro vorbehalten ist, und liest „Der Lauf konnte nicht geändert werden"
  (`LiveDashboardPage.tsx:187`). Der häufigste dieser Fälle.
- `QrCodeError.QrCodeAlreadyInUse` — Doppelvergabe bei der Bändchen-Ausgabe; die Meldung „Code konnte
  nicht zugewiesen werden" klingt nach Scanfehler und schickt die Helfer auf die falsche Fährte.
- `ParticipantTrackingError` — `TeamAlreadyCheckedIn`, `TeamNotCheckedIn`,
  `QrCodeNotAssociatedWithParticipant` teilen sich in `TeamCheckInOut.tsx` zwei feste Texte.
- Nebenfund: `QrCodeError.QrCodeNotFound` ist toter Code (Aufruf in `QrCodeAppService.kt:25`
  auskommentiert).

### Rechnungen

Fast fertig: nur `InvoiceError.NotFound` (Z. 22) ohne Code, die vier Hauptfälle sind gemappt.
`ProduceInvoiceError` ist kein API-Fehler — `MissingRecipient` / `NoPositions` erreichen den Nutzer
nie, der Hintergrundjob hängt still fest und `EventInvoicesInfoDto` meldet weiter „läuft noch". Das
ist keine ErrorCode-Lücke, sondern eine Sichtbarkeitslücke.

## Wo der Hebel am größten wäre

Wenn nur ein Teil davon gemacht wird, in dieser Reihenfolge:

1. **Live-Anzeigen** (9 Fälle) — kleinster Aufwand, trifft am Renntag Helfer ohne Kontext.
   `FinishReservedForOffice` und `QrCodeAlreadyInUse` allein lohnen sich.
2. **Zeitplan-Rest** (8 Fälle) — dieselbe Datei, die gerade offen war; besonders die beiden
   Runden-Fälle mit identischem Text bei gegensätzlicher Ursache.
3. **Durchführung/Ergebnisse** (~36 Fälle) — der größte Block, betrifft die Ergebniserfassung.
   Am ehesten in zwei Schritten: erst `CompetitionExecutionChallengeError` und `SubstitutionError`
   (je eine geschlossene Gruppe), dann `CompetitionExecutionError`.
4. **Urkunden & WebDAV** (16 Fälle) — teils schon roher englischer Text in der Oberfläche.
5. **Stammdaten** (~32 Fälle) — die meisten Fälle, aber nicht renntagskritisch; hier ist der
   Sonderfall interessant, dass mehrere Fehler ihre `details`-Liste schon mitschicken und sie nur
   niemand anzeigt.

Kleinigkeiten, die unabhängig davon aufräumbar sind: der `default`-Zweig beim Teilnehmer-Import
(`PARTICIPANT_IMPORT_UNKNOWN_GENDER_VALUE`), sowie die drei Fundstellen toten Codes
(`PlaceAndTimeBothNull`, `QrCodeNotFound`, `CatererTransactionRequest.validate`).
