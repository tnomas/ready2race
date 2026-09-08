# ADR-0039: Helfer-App als eigener Frontend-Bereich unter /app mit eigener Sitzung; ein QR-Code je Entität und Veranstaltung

- Status: angenommen
- Datum: 2025-07-06
- Bereich: frontend, datenbank
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Am Veranstaltungstag scannen Helfer mit dem Smartphone Bändchen und Ausweise: Check-in und Check-out, Prüfen von Teilnahmebedingungen, Verpflegungsausgabe. Die Desktop-Verwaltung mit Tabellen und Dialogen ist dafür ungeeignet. Die Helfer sind aber dieselben Nutzer mit denselben Rechten wie in der Verwaltung, und gescannt werden Personen, die in mehreren Veranstaltungen vorkommen.

## Entscheidung

- Die Helfer-App ist ein eigener Routenbaum unter `/app` in `frontend/src/routes.tsx` mit eigenem Layout (`layouts/AppLayout.tsx`). Sie ist kein separates Projekt und kein separater Build, sondern Teil derselben React-Anwendung.
- Die Auswahl der App (Veranstaltung, Funktion) hält der `AppSessionContext` (`frontend/src/contexts/app/AppSessionContext.tsx`). Anmeldung, Sitzungsprüfung, Panic-Fallback und Weiterleitung liegen zentral in einem `UserProvider`; auf einer verbotenen Seite wird ausgeloggt.
- Rechte kommen aus derselben `privileges.ts` wie die Verwaltung; die App-Funktionen sind als Karten dargestellt und erscheinen nur mit passendem Privileg.
- QR-Codes liegen in der Tabelle `qr_codes` (Migration `V202508110945__qr_code_integration.sql`): `qr_code_id` (der gescannte Text, global eindeutig), genau eines von `app_user` oder `participant` (Check-Constraint `chk_either_app_user_or_participant`), und `event`. **Je Entität und Veranstaltung gibt es höchstens einen Code**: zwei partielle Unique-Indizes auf `(app_user, event)` und `(participant, event)` (Migration `V202606221000__qr_code_unique_per_entity_and_event.sql`); die Migration dedupliziert Altdaten und behält den jüngsten Code. Die Zuweisung in der App arbeitet deshalb als Update, nicht als Insert.
- Auf kleinen Bildschirmen bietet der Einstieg die Wahl zwischen Helfer-App, öffentlichen Ergebnissen und Desktop-Verwaltung.

## Verworfene Alternativen

- **Reihenfolge „erst App-Funktion, dann Veranstaltung"** (`0332e5bd`, 2025-08-06): am 2025-09-24 umgedreht zu „erst Veranstaltung, dann Funktion" (`0418e706`); der Knopf „App wechseln" entfiel. Diese Reihenfolge wurde am 2026-09-02 erneut abgelöst durch „Scannen zuerst" ([ADR-0099](0099-helfer-app-scannen-zuerst.md)).
- **Mehrere Codes je Person und Veranstaltung**: erzeugte Doppelzeilen in Views und ließ `fetchOne` scheitern; per Unique-Index ausgeschlossen.
- **Über Seiten verstreute Anmelde- und Redirect-Logik**: brach bei Reloads und wurde in den `UserProvider` gebündelt (`6c5b1c79`, `cd315564`).

## Konsequenzen

- Verwaltung und Helfer-App teilen Code, Client und Sitzung; ein Rechteproblem in der Verwaltung ist auch eines in der App. Umgekehrt braucht eine neue App-Funktion kein neues Auth-Konzept, nur ein Privileg ([ADR-0010](0010-privilegien-action-resource-scope.md)).
- Der Routenbaum unter `/app` ist die Grundlage, an der später die PWA-Ausführung hängt: der Service-Worker-Scope folgt dem Ablageort `dist/app/` ([ADR-0077](0077-helfer-app-als-pwa.md)).
- Ein Bändchen-Code ist an eine Veranstaltung gebunden; wer eine Person für die nächste Veranstaltung ausstattet, legt einen neuen Code an. Gleichzeitig kann ein Bändchen nicht zwei Personen gehören (`qr_code_unique`).
- Die Helfer-App wurde dreimal in ihrer Grundreihenfolge umgebaut; wer die Navigation erneut ändert, sollte die drei Stände (`0332e5bd`, `0418e706`, [ADR-0099](0099-helfer-app-scannen-zuerst.md)) kennen.

## Quellen

- Commits: `df2b668e` (init QR App Area), `1ca22470`, `a6dbfbae` (use privileges.ts), `2c117aa1` (QR-Code an App-Nutzer und Teilnehmer), `0332e5bd` (App-Navigation), `04690b8d`, `e0ef67ed` (QR-Codes für App-Nutzer und Teilnehmer), `e54253d9` (Logout auf verbotener Seite), `61391ee9` (Wahl auf kleinen Bildschirmen), `0418e706` (erst Veranstaltung wählen), `6c5b1c79`, `12e3d5d2`, `cd315564` (Auth-Ablauf), `9fbbfe40` (Panic-Seite), `1cd635bf` (ein QR-Code je Entität und Veranstaltung), `259e2efb` (Update statt Insert)
- Migrationen: `V202508110945__qr_code_integration.sql`, `V202606221000__qr_code_unique_per_entity_and_event.sql`
- Code: `frontend/src/routes.tsx`, `frontend/src/contexts/app/AppSessionContext.tsx`, `frontend/src/layouts/AppLayout.tsx`
- Verwandte ADRs: [ADR-0005](0005-frontend-stack-react-vite-mui.md), [ADR-0008](0008-serverseitige-sessions-header-token.md), [ADR-0010](0010-privilegien-action-resource-scope.md), [ADR-0040](0040-caterer-abrechnung-als-ereignisprotokoll.md), [ADR-0041](0041-checkin-checkout-ereignisprotokoll-arena.md), [ADR-0077](0077-helfer-app-als-pwa.md), [ADR-0099](0099-helfer-app-scannen-zuerst.md)
