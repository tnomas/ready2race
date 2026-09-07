# ADR-0010: Privilegien als Action × Resource × Scope, im Code definiert und beim Start gesät; neue Privilegien erreichen nur die Admin-Rolle

- Status: angenommen
- Datum: 2025-02-13
- Bereich: backend, frontend, betrieb
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Rollen sollen von Veranstaltern frei zusammengestellt werden, die Menge der möglichen Rechte muss aber der Code kennen, weil er sie prüft. Vereinsnutzer dürfen nur Eigenes sehen und ändern. Im Fork kamen ab August 2026 neue Ressourcen dazu (Live-Dashboard, Boards, Stream, Zeitnahme-Posten); auf Produktion fehlte der Rolle „Schiedsrichter:in" danach ein Recht, weil nur die Admin-Rolle automatisch versorgt wird.

## Entscheidung

- **Ein Privileg ist ein Tripel** aus `Action {CREATE, READ, UPDATE, DELETE}`, `Resource` (Stand September 2026: USER, EVENT, CLUB, REGISTRATION, INVOICE, SUBSTITUTION, APP_EVENT_REQUIREMENT, APP_QR_MANAGEMENT, APP_COMPETITION_CHECK, APP_CATERER, APP_TIMING, WEB_DAV, RESULT, LIVE_DASHBOARD, BOARD, STREAM, ADMINISTRATION) und `Scope {OWN(1), GLOBAL(2)}`. Definiert in `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/auth/entity/Privilege.kt` als `sealed class` mit `data object`-Instanzen wie `ReadEventGlobal`; `hasPrivilege` vergleicht Scope-Level ≥.
- **Datenbank:** Tabelle `privilege(id, action, resource, scope)` mit Unique-Index über die drei Spalten; `role`, `role_has_privilege`, `app_user_has_role` (`V202412161700__privileges_and_roles.sql`). Rollen sind dynamische Bündel; statische Rollen (`static = true`) sind nicht zuweisbar.
- **Sät beim Start, keine Migration:** `database/initializeDatabase.kt` legt fehlende `Privilege.entries` an, erzeugt bzw. aktualisiert den `SYSTEM_USER` (Null-UUID) und die Admin-Rolle (`ADMIN_ROLE`) mit **allen** Privilegien sowie die Rollen „User" und „Club representative".
- **Prüfung:** Routen rufen `authenticate(Privilege)`, `optionalAuthenticate(action, resource)` oder `authenticateAny(Neu, Alt)` (`calls/requests/Extensions.kt`). Fehlendes Recht antwortet 403 ([ADR-0011](0011-http-fehlersemantik-und-errorcode-muster.md)).
- **Frontend-Spiegel:** `frontend/src/authorization/privileges.ts` (Konstanten wie `readEventGlobal`), Typ aus `types.gen.ts`; Tabellen, Buttons und Routen-Guards prüfen über den UserContext.
- **Neues Privileg anlegen:** Objekt in `Privilege.kt`, Route mit `authenticateAny(Neu, Alt)`, Enum-Wert in der handgepflegten `documentation.yaml`, `npm run generate`, Konstante in `privileges.ts`. Keine Migration.
- **Betriebsregel:** Neue Privilegien landen automatisch nur an der Admin-Rolle. Jede Auslieferung mit neuer Ressource braucht einen Handgriff in der Rollenverwaltung; der Schritt wird im MR-Dokument für die Reviewer benannt. Neue Features nutzen deshalb, wo es geht, bestehende Rechte (Vereinskürzel über `ReadClubGlobal`/`UpdateClubGlobal`, Export über `ReadEventGlobal`, manueller Check-in ohne neues Recht).
- **Feingranulare Rechte statt UPDATE EVENT:** Wer nur Anzeigen pflegt, bekommt READ/UPDATE BOARD; die Verwaltungsrouten prüfen per `authenticateAny` daneben weiter die Event-Rechte, sodass bestehende Rollen nichts verlieren. Dasselbe Muster gilt für STREAM und APP_TIMING.

## Verworfene Alternativen

- Ursprüngliche Tabelle `privilege(name)` mit `association_bound`-Flag: durch Action/Resource/Scope abgelöst, weil ein Name keine Scope-Ordnung ausdrückt.
- Ressource PARTICIPANT: am 2025-06-26 wieder entfernt; Teilnehmer laufen über CLUB-Rechte (`ed6dda19`).
- Privilegien per Migration anlegen: verworfen, weil `initializeDatabase` sie ohnehin sät und eine Migration nur eine zweite Wahrheit wäre.
- Automatische Zuweisung neuer Privilegien an bestehende Nicht-Admin-Rollen: verworfen; der Code kann nicht wissen, welche selbst angelegte Rolle ein neues Recht bekommen soll. Ein Hinweis nach der Migration oder eine Rollenansicht mit nicht zugeordneten Privilegien wurde nur vorgeschlagen.

## Konsequenzen

- Drei Pflegestellen (Kotlin, YAML, Frontend-Konstante) je Privileg; vergisst man die YAML, kennt `types.gen.ts` den Wert nicht.
- Auf `USER` gibt es kein `DELETE`-Privileg; Löschaktionen dort (Einladung zurückziehen) laufen über `customEntityActions` der EntityTable, deren Papierkorb an `DELETE`+`OWN` hängt ([ADR-0035](0035-nutzer-onboarding-einladung-ohne-delete-privileg.md)).
- Der Handgriff in der Rollenverwaltung ist eine bewusst festgehaltene Lücke; er hat auf Produktion bereits einmal eine ganze Rolle ohne Kachel gelassen.
- `initializeDatabase` läuft bei jedem Start in einer Transaktion und überschreibt den Admin aus der Umgebung ([ADR-0007](0007-argon2id-passwort-hashing.md)).
- Scope OWN wird je Ressource unterschiedlich ausgelegt (Verein, eigener Nutzer); die Auslegung steht im jeweiligen Service, nicht im Privileg.

## Quellen

- Commits: `17822e34` (`V202412161700`), `88b20d67` (Rollen am Nutzer), `004b286e` (Rollen implementiert), `e48a0182` (Nutzerübersicht, Privilegien in der YAML), `730ca857` (Vereine und Teilnehmer), `32d3c0bf`, `800b570a` (Scope für Teilnehmer), `183f00b7` (Registration-Privileg), `7331062e`, `df17889a` (statische Rollen nicht zuweisbar), `9bae2431` (Sichtbarkeit für Admin/System-Nutzer), `d1ae50d7`, `d211725f` (Frontend-Tabellen und Registration-Rechte), `ed6dda19` (PARTICIPANT entfernt), `a30f2cda` (MR-Dokument mit Handgriff), `4e8ffdd8`, `815fe879` (Vereinskürzel über CLUB-Rechte), `efbb2545` (Export über ReadEventGlobal), `ad903edb` (READ/UPDATE BOARD), `3f67752f` (STREAM), `4e62cf83` (APP_TIMING)
- Specs: `docs/crf-2026-folge-mr.md` (§5), `docs/superpowers/specs/2026-08-09-vereinskette-statt-renngemeinschaft-design.md` („Pflegeseite"), `docs/superpowers/specs/2026-08-27-livestream-overlay-design.md` („Rechte")
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/auth/entity/Privilege.kt`, `database/initializeDatabase.kt`, `database/static.kt`, `calls/requests/Extensions.kt`, `frontend/src/authorization/privileges.ts`
- Verwandte ADRs: [ADR-0004](0004-openapi-first-handgepflegte-yaml.md), [ADR-0008](0008-serverseitige-sessions-header-token.md), [ADR-0011](0011-http-fehlersemantik-und-errorcode-muster.md), [ADR-0025](0025-vereine-teilnehmer-scope-own-stammverein.md), [ADR-0035](0035-nutzer-onboarding-einladung-ohne-delete-privileg.md), [ADR-0058](0058-schiedsrichter-dashboard-eigene-ressource-nutzlast.md), [ADR-0078](0078-board-system-ersetzt-info-ansichten.md), [ADR-0088](0088-timing-websocket-und-geraete-token.md)
