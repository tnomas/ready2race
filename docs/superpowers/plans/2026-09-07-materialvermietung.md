# Materialvermietung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sportler mieten bei der Anmeldung Boote und anderes Material bei externen Anbietern; der Anbieter bekommt ein Dashboard mit Anfragen, Einteilung nach Startnummer, Schadensakte und Ausfall-Ersatz; die Anzeigen zeigen Abweichungen zwischen Boots- und Startnummer.

**Architecture:** Neue Backend-Domäne `app/material/` (Kotlin/Ktor, KIO, jOOQ) mit einer Migration für alle Tabellen und Sichten in `afterMigrate.sql`. Anfragen hängen an der Meldung (`competition_registration`) und überleben das Neu-Speichern der Anmeldung durch stabile Meldungs-IDs plus aufgeschobene Fremdschlüssel. Frontend: eigener Einstieg `/material` nach Sprecher-Vorbild, reine Logik als getestete `.ts`-Module, Formular-Abschnitt in der Anmeldung, ein optionales Feld an den Team-DTOs aller Anzeigen.

**Tech Stack:** Kotlin 2 / Ktor / jOOQ 3.19 / Flyway / KIO (tailwind), Testcontainers (Postgres 17); React 19 / TypeScript / MUI / react-hook-form / TanStack Router / Vitest; OpenAPI-Client `@hey-api/openapi-ts`.

**Spec:** `docs/superpowers/specs/2026-09-07-materialvermietung-design.md`

## Global Constraints

- Arbeiten nur im Worktree `/Users/thomas/Developer/privat/ready2race/.claude/worktrees/boat-planning-dashboard-2b3537`. Nichts nach `main` mergen, nichts pushen.
- **Eigene Build-Datenbank:** Container `r2r-material-builddb` läuft auf Port **7660** (Postgres 17, user `developer`, pw `sql`, db `ready2race-build`). **Jeder** Maven-Aufruf bekommt `-Ddatabase.url=jdbc:postgresql://localhost:7660/ready2race-build`. Die geteilte DB auf 7652 nie anfassen. Falls der Container fehlt: `docker run -d --name r2r-material-builddb -e POSTGRES_USER=developer -e POSTGRES_PASSWORD=sql -e POSTGRES_DB=ready2race-build -p 7660:5432 postgres:17`.
- **Maven:** immer aus `backend/` mit `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./mvnw -o …`. Nach jeder Schema-Änderung (Migration oder `afterMigrate.sql`) `clean` mitgeben, sonst `NoSuchMethodError` auf generierten Records. Voller Testlauf: `./mvnw -o clean test -Ddatabase.url=…` (Testcontainers braucht Docker). Einzeltest: `-Dtest=MaterialServiceTest`.
- **Migration:** genau eine neue Datei `backend/src/main/resources/db/migration/V202609071000__material_rental.sql` (Task 1.1). Weitere Schema-Änderungen späterer Tasks kommen als `V20260907HHMM__…` mit steigender Zeit (Task 3.1: `V202609071100__material_request_deferred.sql` nur falls nötig, siehe dort). Sichten ausschließlich in `afterMigrate.sql` (Drop-Block oben in umgekehrter Reihenfolge, Create-Block unten).
- **API-Vertrag:** `backend/src/main/resources/openapi/documentation.yaml` ist handgepflegt und die einzige Quelle des Frontend-Clients. Jede neue Route und jedes Schema dort eintragen, danach `cd frontend && npm run generate` (erzeugt `src/api/types.gen.ts` + `sdk.gen.ts`, beide committen). Zusätzlich `api/src/material.tsp` als Skizze anlegen und in `api/main.tsp` importieren (Konvention, nicht Generierungsquelle).
- **Backend-Muster:** `app/material/{boundary,control,entity}`; Routen mit `call.respondComprehension { … }`; jeder `KIO.fail…`-Aufruf innerhalb einer Comprehension mit führendem `!` (sonst No-Op); Repos liefern `JIO`, im Service `.orDie()`; Fehler als `sealed interface MaterialError : ServiceError` mit `respond()`.
- **Rechte:** neue Ressource `MATERIAL` in `Privilege.kt` (READ/UPDATE × OWN/GLOBAL). Keine Migration; `initializeDatabase` sät fehlende Privilegien beim Start. `Resource`-Enum in `documentation.yaml` (Z. ~11898) ergänzen, sonst tippt `privileges.ts` rot.
- **Frontend:** Pfad-Aliasse `@api/`, `@components/`, `@contexts/`, `@authorization/`, `@utils/`, `@routes`. Tests nur reine Logik als `src/**/*.test.ts` (Vitest, Node, kein DOM), Testnamen auf Deutsch. Nach jeder Aufgabe `npm test`, `npm run build`, `npm run lint` in `frontend/`. Lint hat **28 vorbestehende Fehlerdateien** (Baseline in `/private/tmp/claude-501/…/scratchpad/lint-baseline-files.txt`); neue Dateien müssen fehlerfrei sein, alte werden nicht angefasst.
- **i18n:** jeder neue Schlüssel in allen drei Dateien `frontend/src/i18n/{de,en,da}/translations.json`, deutsche Texte mit echten Umlauten, neuer Top-Level-Schlüssel `material`. Kein automatischer Gleichheitstest, also gewissenhaft.
- **Commits:** deutsch, ohne KI-Hinweis, ohne `Co-Authored-By`. Nach jeder Aufgabe ein Commit.
- **Deutsch in Code-Kommentaren**, erklären das Warum. Keine Herkunftsangaben.

---

## Schnittstellen-Übersicht (gilt für alle Tasks)

### Tabellen (Task 1.1)

`material_provider`, `material_type`, `material_item`, `competition_properties_has_material_type`, `event_has_material_provider`, `material_offer`, `material_request`, `material_assignment`, `material_damage`, `material_damage_photo`, `material_damage_photo_data`, Spalte `app_user.material_provider`.

### Enums (Kotlin `app/material/entity/MaterialEnums.kt`, TypeScript aus `types.gen.ts`)

```kotlin
enum class MaterialCategory { BOAT, OTHER }
enum class MaterialItemStatus { ACTIVE, RETIRED }
enum class MaterialRequestStatus { REQUESTED, CONFIRMED, WAITLISTED, DECLINED, WITHDRAWN }
enum class MaterialDamageSeverity { MINOR, MAJOR, TOTAL, OUTAGE_ONLY }
enum class MaterialDamageStatus { REPORTED, REPAIRED }
enum class MaterialCapacityLevel { GREEN, YELLOW }
```

### Routen (alle unter `/api`)

| Methode + Pfad | Recht | Task |
|---|---|---|
| GET/POST `/materialProvider` | READ MATERIAL GLOBAL / UPDATE MATERIAL GLOBAL | 1.3 |
| GET/PUT/DELETE `/materialProvider/{providerId}` | READ MATERIAL (OWN = eigener) / UPDATE MATERIAL GLOBAL | 1.3 |
| GET/POST `/materialProvider/{providerId}/item`, PUT/DELETE `…/item/{itemId}` | READ/UPDATE MATERIAL (OWN = eigener Anbieter) | 1.3 |
| GET/POST `/materialType`, PUT/DELETE `/materialType/{typeId}` | GET: READ MATERIAL (jeder Scope); Rest UPDATE MATERIAL GLOBAL | 1.3 |
| PUT `/user/{userId}/materialProvider` | UPDATE USER GLOBAL | 1.6 |
| GET/PUT/DELETE `/event/{eventId}/materialProvider/{providerId}` (Einladung, `requestsClosed`) | GET: READ EVENT GLOBAL oder READ MATERIAL OWN (eigener); PUT Einladen/Entladen: UPDATE EVENT GLOBAL; PUT `requestsClosed`: UPDATE MATERIAL OWN/GLOBAL | 2.1 |
| GET `/event/{eventId}/materialProvider` (eingeladene Anbieter mit Zählern) | READ EVENT GLOBAL | 2.1 |
| GET/POST `/event/{eventId}/materialProvider/{providerId}/offer`, PUT/DELETE `…/offer/{offerId}` | READ/UPDATE MATERIAL (OWN = eigener) | 2.1 |
| GET `/event/{eventId}/materialProvider/mine` (Veranstaltungen, zu denen der eigene Anbieter eingeladen ist: `/materialProvider/{providerId}/event`) | READ MATERIAL OWN | 2.1 |
| PUT `/event/{eventId}/competitionRegistration/{competitionRegistrationId}/materialRequests` | UPDATE REGISTRATION (OWN = eigener Verein) | 3.1 |
| GET `/event/{eventId}/materialProvider/{providerId}/overview` | READ MATERIAL (OWN = eigener) | 4.1 |
| PUT `/event/{eventId}/materialProvider/{providerId}/request/{requestId}/decision` | UPDATE MATERIAL (OWN) | 4.1 |
| PUT `/event/{eventId}/materialProvider/{providerId}/request/{requestId}/assignments` | UPDATE MATERIAL (OWN) | 4.1 |
| POST `/event/{eventId}/finalizeRegistrations?keepNumbers&alignMaterialNumbers` | bestehend, neuer Query-Parameter | 4.4 |
| GET/POST `/materialProvider/{providerId}/damage`, GET/PUT `…/damage/{damageId}`, POST `…/damage/{damageId}/photo`, GET/DELETE `…/photo/{photoId}`, GET `/event/{eventId}/materialProvider/{providerId}/damage/csv` | READ/UPDATE MATERIAL (OWN) | 5.1 |

### Frontend-Routen (Task 1.5 legt das Gerüst an)

`/material` (Veranstaltungswahl), `/material/event/$eventId` (Dashboard mit `?tab=requests|assignment|damages|settings`), `/material/fleet` (Flotte des eigenen Anbieters; Admin mit `?provider=`), `/material/admin` (Anbieter + Materialarten, nur GLOBAL).

---

# Schritt 1: Stammdaten

### Task 1.1: Migration und Sichten-Gerüst

**Files:**
- Create: `backend/src/main/resources/db/migration/V202609071000__material_rental.sql`
- Modify: `backend/src/main/resources/db/migration/afterMigrate.sql` (Drop-Block oben, Create-Block unten; `app_user_with_privileges` bleibt unverändert, `au.*` nimmt die neue Spalte mit)

**Interfaces:**
- Produces: alle Tabellen der Schnittstellen-Übersicht; jOOQ-Klassen `MATERIAL_PROVIDER`, `MATERIAL_TYPE`, `MATERIAL_ITEM`, `COMPETITION_PROPERTIES_HAS_MATERIAL_TYPE`, `EVENT_HAS_MATERIAL_PROVIDER`, `MATERIAL_OFFER`, `MATERIAL_REQUEST`, `MATERIAL_ASSIGNMENT`, `MATERIAL_DAMAGE`, `MATERIAL_DAMAGE_PHOTO`, `MATERIAL_DAMAGE_PHOTO_DATA`; `AppUserRecord.materialProvider: UUID?`; Sicht `material_item_view` (Stück mit Typname, Kategorie, Anbieter, offene Schäden).

- [ ] **Step 1: Migration schreiben**

```sql
set search_path to ready2race, pg_catalog, public;

-- Materialvermietung (Entwurf 2026-09-07, docs/superpowers/specs/2026-09-07-materialvermietung-design.md):
-- externe Anbieter verleihen Boote und Zubehör; Vereine stellen bei der Anmeldung Anfragen je
-- Meldung, der Anbieter bestätigt, teilt Stücke zu und führt eine Schadensakte.

create table material_provider
(
    id            uuid primary key,
    name          text      not null,
    contact_name  text,
    contact_email text,
    contact_phone text,
    note          text,
    created_at    timestamp not null,
    created_by    uuid      references app_user on delete set null,
    updated_at    timestamp not null,
    updated_by    uuid      references app_user on delete set null
);
create unique index material_provider_name_unique on material_provider (name);

-- Ein Nutzer gehört höchstens einem Anbieter, parallel zum Vereinsfeld app_user.club.
-- Der OWN-Scope der MATERIAL-Rechte wird gegen diese Spalte geprüft.
alter table app_user
    add column material_provider uuid references material_provider on delete set null;

-- Globales Stammdatum: die gemeinsame Sprache zwischen Bedarf am Wettkampf und Angebot des Anbieters.
create table material_type
(
    id          uuid primary key,
    name        text      not null,
    category    text      not null check (category in ('BOAT', 'OTHER')),
    description text,
    created_at  timestamp not null,
    created_by  uuid      references app_user on delete set null,
    updated_at  timestamp not null,
    updated_by  uuid      references app_user on delete set null
);
create unique index material_type_name_unique on material_type (name);

-- Konkretes Exemplar. Die Nummer ist für Boote die Nummer am Rumpf und soll der Startnummer
-- entsprechen (Spec Abschnitt 8). Die Bezeichnung ist kurz, damit sie in Grafiken passt.
create table material_item
(
    id                uuid primary key,
    material_provider uuid      not null references material_provider on delete cascade,
    material_type     uuid      not null references material_type on delete restrict,
    number            integer,
    label             text      not null check (char_length(label) between 1 and 20),
    note              text,
    status            text      not null default 'ACTIVE' check (status in ('ACTIVE', 'RETIRED')),
    created_at        timestamp not null,
    created_by        uuid      references app_user on delete set null,
    updated_at        timestamp not null,
    updated_by        uuid      references app_user on delete set null
);
create unique index material_item_number_unique
    on material_item (material_provider, material_type, number) where number is not null;
create index on material_item (material_provider);

-- Bedarf je Wettkampf (gilt für Wettkampf UND Vorlage, wie competition_properties_has_fee).
create table competition_properties_has_material_type
(
    competition_properties uuid    not null references competition_properties on delete cascade,
    material_type          uuid    not null references material_type on delete cascade,
    count                  integer not null check (count > 0),
    primary key (competition_properties, material_type)
);

-- Einladung eines Anbieters zu einer Veranstaltung. requests_closed sperrt neue Anfragen der Vereine.
create table event_has_material_provider
(
    event             uuid      not null references event on delete cascade,
    material_provider uuid      not null references material_provider on delete cascade,
    requests_closed   boolean   not null default false,
    created_at        timestamp not null,
    created_by        uuid      references app_user on delete set null,
    updated_at        timestamp not null,
    updated_by        uuid      references app_user on delete set null,
    primary key (event, material_provider)
);

-- Angebot je Veranstaltung, Anbieter und Materialart. planned_count speist die Ampel,
-- changeover_minutes die Konfliktprüfung zwischen zwei Läufen desselben Stücks.
create table material_offer
(
    id                 uuid primary key,
    event              uuid      not null,
    material_provider  uuid      not null,
    material_type      uuid      not null references material_type on delete cascade,
    price_text         text,
    planned_count      integer   not null default 0 check (planned_count >= 0),
    changeover_minutes integer   not null default 30 check (changeover_minutes >= 0),
    created_at         timestamp not null,
    created_by         uuid      references app_user on delete set null,
    updated_at         timestamp not null,
    updated_by         uuid      references app_user on delete set null,
    foreign key (event, material_provider) references event_has_material_provider on delete cascade,
    unique (event, material_provider, material_type)
);

-- Anfrage je Meldung und Angebot. Der Fremdschlüssel auf die Meldung ist aufgeschoben und ohne
-- Kaskade: Die Anmeldung löscht beim Speichern alle nicht gesperrten Meldungen und legt sie mit
-- derselben ID neu an (Task 3.0); innerhalb dieser Transaktion darf die Anfrage kurz ins Leere
-- zeigen. Wirklich entfernte Meldungen räumt MaterialService.dropRequestsOfRemovedRegistrations auf.
create table material_request
(
    id                       uuid primary key,
    competition_registration uuid      not null references competition_registration deferrable initially deferred,
    material_offer           uuid      not null references material_offer on delete cascade,
    count                    integer   not null check (count > 0),
    status                   text      not null check (status in ('REQUESTED', 'CONFIRMED', 'WAITLISTED', 'DECLINED', 'WITHDRAWN')),
    decision_note            text,
    requested_at             timestamp not null,
    decided_at               timestamp,
    created_at               timestamp not null,
    created_by               uuid      references app_user on delete set null,
    updated_at               timestamp not null,
    updated_by               uuid      references app_user on delete set null,
    unique (competition_registration, material_offer)
);
create index on material_request (material_offer);

-- Zuteilung: ohne competition_match für den ganzen Wettkampf, mit competition_match als Ausnahme
-- je Lauf (Spec Abschnitt 9/10). Bei Menge > 1 mehrere Zeilen.
create table material_assignment
(
    id                uuid      primary key,
    material_request  uuid      not null references material_request on delete cascade,
    material_item     uuid      not null references material_item on delete restrict,
    competition_match uuid      references competition_match on delete cascade,
    created_at        timestamp not null,
    created_by        uuid      references app_user on delete set null,
    updated_at        timestamp not null,
    updated_by        uuid      references app_user on delete set null,
    unique nulls not distinct (material_request, material_item, competition_match)
);
create index on material_assignment (material_item);

-- Schaden mit optionalem Ausfallfenster; das Fenster ist die einzige Quelle für "nicht verfügbar".
create table material_damage
(
    id                     uuid primary key,
    material_item          uuid      not null references material_item on delete cascade,
    reported_at            timestamp not null,
    reported_by            uuid      references app_user on delete set null,
    description            text      not null,
    severity               text      not null check (severity in ('MINOR', 'MAJOR', 'TOTAL', 'OUTAGE_ONLY')),
    status                 text      not null default 'REPORTED' check (status in ('REPORTED', 'REPAIRED')),
    caused_by_registration uuid      references competition_registration deferrable initially deferred,
    out_of_service_from    timestamp,
    out_of_service_until   timestamp,
    repaired_at            timestamp,
    created_at             timestamp not null,
    created_by             uuid      references app_user on delete set null,
    updated_at             timestamp not null,
    updated_by             uuid      references app_user on delete set null,
    check (out_of_service_until is null or out_of_service_from is null or out_of_service_until >= out_of_service_from)
);
create index on material_damage (material_item);

create table material_damage_photo
(
    id              uuid primary key,
    material_damage uuid      not null references material_damage on delete cascade,
    name            text      not null,
    content_type    text      not null,
    created_at      timestamp not null
);

create table material_damage_photo_data
(
    material_damage_photo uuid primary key references material_damage_photo on delete cascade,
    data                  bytea not null
);
```

- [ ] **Step 2: Sicht `material_item_view` in `afterMigrate.sql`**

Oben im Drop-Block (direkt nach `set search_path`, vor allen anderen Drops) ergänzen:

```sql
drop view if exists material_item_view;
```

Unten am Ende der Datei anhängen:

```sql
-- Materialstück mit Typ, Kategorie, Anbieter und Zahl offener Schäden (Flotte, Task 1.3).
create view material_item_view as
select mi.id,
       mi.material_provider,
       mp.name                                         as material_provider_name,
       mi.material_type,
       mt.name                                         as material_type_name,
       mt.category,
       mi.number,
       mi.label,
       mi.note,
       mi.status,
       (select count(*) from material_damage md
        where md.material_item = mi.id and md.status = 'REPORTED')::int as open_damages,
       mi.created_at, mi.created_by, mi.updated_at, mi.updated_by
from material_item mi
         join material_type mt on mt.id = mi.material_type
         join material_provider mp on mp.id = mi.material_provider;
```

- [ ] **Step 3: Build mit Codegen laufen lassen**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./mvnw -o -q clean compile -Ddatabase.url=jdbc:postgresql://localhost:7660/ready2race-build
ls target/generated-sources/jooq/de/lambda9/ready2race/backend/database/generated/tables/ | grep -i material
```

Erwartet: `MaterialProvider.kt`, `MaterialType.kt`, `MaterialItem.kt`, `MaterialItemView.kt`, `MaterialOffer.kt`, `MaterialRequest.kt`, `MaterialAssignment.kt`, `MaterialDamage.kt`, `MaterialDamagePhoto.kt`, `MaterialDamagePhotoData.kt`, `EventHasMaterialProvider.kt`, `CompetitionPropertiesHasMaterialType.kt`. Falls Flyway meckert („applied migration not resolved"): die Build-DB neu anlegen (`docker exec r2r-material-builddb psql -U developer -d postgres -c 'drop database "ready2race-build"; create database "ready2race-build";'`).

- [ ] **Step 4: Bestehende Tests laufen lassen** (Schema-Änderung, deshalb `clean`)

```bash
./mvnw -o clean test -Ddatabase.url=jdbc:postgresql://localhost:7660/ready2race-build 2>&1 | tail -20
```

Erwartet: `BUILD SUCCESS`, keine Failures.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db/migration/V202609071000__material_rental.sql backend/src/main/resources/db/migration/afterMigrate.sql
git commit -m "Materialvermietung: Tabellen für Anbieter, Materialarten, Stücke, Angebote, Anfragen, Zuteilungen und Schäden"
```

---

### Task 1.2: Rechte, Rolle, Nutzerfeld

**Files:**
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/auth/entity/Privilege.kt` (Resource-Enum + 4 data objects)
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/database/static.kt` (`MATERIAL_PROVIDER_ROLE`)
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/database/initializeDatabase.kt` (Rolle säen, `persistRole` bekommt Parameter `static`)
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/auth/entity/LoginDto.kt`, `app/auth/control/Conversions.kt` (`materialProviderId`)
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/appuser/control/AppUserHasRoleRepo.kt` (`deleteExceptSystem` muss die neue Rolle als System-Rolle behandeln, siehe Kommentar in `static.kt`)
- Modify: `backend/src/main/resources/openapi/documentation.yaml` (Resource-Enum ~Z. 11898, `LoginDto` ~Z. 12346 um `materialProviderId`)
- Modify: `frontend/src/authorization/privileges.ts`, `frontend/src/contexts/user/UserContext.ts`, `frontend/src/contexts/user/UserProvider.tsx`
- Test: `backend/src/test/kotlin/de/lambda9/ready2race/backend/app/material/MaterialPrivilegeTest.kt`

**Interfaces:**
- Produces: `Privilege.ReadMaterialOwn`, `ReadMaterialGlobal`, `UpdateMaterialOwn`, `UpdateMaterialGlobal`; `MATERIAL_PROVIDER_ROLE = 00000000-0000-0000-0000-000000000003`; `LoginDto.materialProviderId: UUID?`; Frontend `readMaterialOwn`, `readMaterialGlobal`, `updateMaterialOwn`, `updateMaterialGlobal`; `AuthenticatedUser.materialProviderId?: string`.

- [ ] **Step 1: Test schreiben** (`MaterialPrivilegeTest.kt`)

```kotlin
package de.lambda9.ready2race.backend.app.material

import de.lambda9.ready2race.backend.app.auth.control.PrivilegeRepo
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.role.control.RoleHasPrivilegeRepo
import de.lambda9.ready2race.backend.database.MATERIAL_PROVIDER_ROLE
import de.lambda9.ready2race.testing.testComprehension
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class MaterialPrivilegeTest {

    @Test
    fun materialPrivilegesAreSeeded() = testComprehension {
        val all = !PrivilegeRepo.all()
        val material = all.filter { it.resource == "MATERIAL" }
        assertEquals(
            setOf("READ:OWN", "READ:GLOBAL", "UPDATE:OWN", "UPDATE:GLOBAL"),
            material.map { "${it.action}:${it.scope}" }.toSet(),
        )
    }

    @Test
    fun providerRoleCarriesOwnPrivilegesOnly() = testComprehension {
        val ids = !RoleHasPrivilegeRepo.getPrivilegesByRole(MATERIAL_PROVIDER_ROLE)
        val all = !PrivilegeRepo.all()
        val names = all.filter { it.id in ids }.map { "${it.action}:${it.resource}:${it.scope}" }.toSet()
        assertEquals(setOf("READ:MATERIAL:OWN", "UPDATE:MATERIAL:OWN"), names)
        assertTrue(Privilege.entries.any { it == Privilege.UpdateMaterialOwn })
    }
}
```

(Falls `PrivilegeRepo.all()`/`RoleHasPrivilegeRepo.getPrivilegesByRole` andere Namen tragen, die tatsächlichen aus `initializeDatabase.kt` verwenden.)

- [ ] **Step 2: Test laufen lassen, muss scheitern** (Compile-Fehler wegen fehlender Symbole zählt)

```bash
./mvnw -o test -Dtest=MaterialPrivilegeTest -Ddatabase.url=jdbc:postgresql://localhost:7660/ready2race-build 2>&1 | tail -15
```

- [ ] **Step 3: Backend umsetzen**

`Privilege.kt`: in `enum class Resource` nach `STREAM,` den Wert `MATERIAL,` ergänzen. Nach den Stream-Objekten:

```kotlin
    // Materialvermietung (Spec 2026-09-07): OWN meint den Anbieter, dem der Nutzer über
    // app_user.material_provider zugeordnet ist - dieselbe Mechanik wie beim Verein.
    data object ReadMaterialOwn : Privilege(Action.READ, Resource.MATERIAL, Scope.OWN)
    data object ReadMaterialGlobal : Privilege(Action.READ, Resource.MATERIAL, Scope.GLOBAL)
    data object UpdateMaterialOwn : Privilege(Action.UPDATE, Resource.MATERIAL, Scope.OWN)
    data object UpdateMaterialGlobal : Privilege(Action.UPDATE, Resource.MATERIAL, Scope.GLOBAL)
```

`static.kt`: `val MATERIAL_PROVIDER_ROLE = UUID.fromString("00000000-0000-0000-0000-000000000003")!!`. In `AppUserHasRoleRepo.deleteExceptSystem` die Liste der System-Rollen um `MATERIAL_PROVIDER_ROLE` **nicht** erweitern (die Rolle soll durch die Nutzerverwaltung zuweisbar und entfernbar sein); dafür in `initializeDatabase.kt` `persistRole` um `static: Boolean = true` erweitern und die neue Rolle so säen:

```kotlin
        // Nicht statisch, damit der Admin sie in der Nutzerverwaltung vergeben kann - statische
        // Rollen filtert role_with_privileges heraus und RoleService.checkAssignable weist sie ab.
        !persistRole(
            now, allPrivileges, MATERIAL_PROVIDER_ROLE, "Materialanbieter", "Verleiht Boote und Material",
            listOf(Privilege.ReadMaterialOwn, Privilege.UpdateMaterialOwn), static = false
        )
```

`LoginDto`: Feld `val materialProviderId: UUID?` nach `clubId`; in `auth/control/Conversions.kt` `materialProviderId = materialProvider`. Prüfen, ob es weitere Stellen gibt, die `LoginDto(` konstruieren (`grep -rn "LoginDto(" backend/src`).

`documentation.yaml`: im `Resource`-Enum `- MATERIAL` ergänzen; im Schema `LoginDto` nach `clubId`:

```yaml
        materialProviderId:
          type: string
          format: uuid
```

- [ ] **Step 4: Frontend**

`privileges.ts` (Muster `readStreamGlobal`):

```ts
export const readMaterialOwn: Privilege = {action: 'READ', resource: 'MATERIAL', scope: 'OWN'}
export const readMaterialGlobal: Privilege = {action: 'READ', resource: 'MATERIAL', scope: 'GLOBAL'}
export const updateMaterialOwn: Privilege = {action: 'UPDATE', resource: 'MATERIAL', scope: 'OWN'}
export const updateMaterialGlobal: Privilege = {action: 'UPDATE', resource: 'MATERIAL', scope: 'GLOBAL'}
```

`UserContext.ts`: `materialProviderId?: string` in `AuthenticatedUser` neben `clubId`. `UserProvider.tsx` Z. ~273: `materialProviderId: userData.userInfo.materialProviderId`.

```bash
cd frontend && npm run generate && npm run build 2>&1 | tail -5
```

- [ ] **Step 5: Tests grün**

```bash
cd backend && ./mvnw -o test -Dtest=MaterialPrivilegeTest -Ddatabase.url=jdbc:postgresql://localhost:7660/ready2race-build 2>&1 | grep -E "Tests run|BUILD"
```

- [ ] **Step 6: Commit**

```bash
git add -A backend/src frontend/src/authorization frontend/src/contexts/user frontend/src/api
git commit -m "Materialvermietung: Rechte READ/UPDATE MATERIAL, Rolle Materialanbieter, Anbieter am Nutzer"
```

---

### Task 1.3: Backend-Domäne: Anbieter, Materialarten, Stücke

**Files:**
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/material/entity/MaterialEnums.kt`, `MaterialProviderDto.kt`, `MaterialProviderRequest.kt`, `MaterialProviderSort.kt`, `MaterialTypeDto.kt`, `MaterialTypeRequest.kt`, `MaterialTypeSort.kt`, `MaterialItemDto.kt`, `MaterialItemRequest.kt`, `MaterialItemSort.kt`, `MaterialError.kt`
- Create: `app/material/control/MaterialProviderRepo.kt`, `MaterialTypeRepo.kt`, `MaterialItemRepo.kt`, `Conversions.kt`
- Create: `app/material/boundary/MaterialService.kt`, `app/material/boundary/material.kt`
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/plugins/Routing.kt` (Import + `material()` neben `fee()`)
- Test: `backend/src/test/kotlin/de/lambda9/ready2race/backend/app/material/MaterialServiceTest.kt`

**Interfaces:**
- Produces:

```kotlin
data class MaterialProviderDto(val id: UUID, val name: String, val contactName: String?, val contactEmail: String?, val contactPhone: String?, val note: String?)
class MaterialProviderRequest(val name: String, val contactName: String?, val contactEmail: String?, val contactPhone: String?, val note: String?) : Validatable
enum class MaterialProviderSort : Sortable { ID, NAME }
data class MaterialTypeDto(val id: UUID, val name: String, val category: MaterialCategory, val description: String?)
class MaterialTypeRequest(val name: String, val category: MaterialCategory, val description: String?) : Validatable
enum class MaterialTypeSort : Sortable { ID, NAME, CATEGORY }
data class MaterialItemDto(val id: UUID, val materialProvider: UUID, val materialProviderName: String, val materialType: UUID, val materialTypeName: String, val category: MaterialCategory, val number: Int?, val label: String, val note: String?, val status: MaterialItemStatus, val openDamages: Int)
class MaterialItemRequest(val materialType: UUID, val number: Int?, val label: String, val note: String?, val status: MaterialItemStatus) : Validatable
enum class MaterialItemSort : Sortable { ID, NUMBER, LABEL, TYPE }

object MaterialService {
    fun addProvider(request: MaterialProviderRequest, userId: UUID): App<MaterialError, ApiResponse.Created>
    fun pageProviders(params: PaginationParameters<MaterialProviderSort>): App<Nothing, ApiResponse.Page<MaterialProviderDto, MaterialProviderSort>>
    fun getProvider(id: UUID): App<MaterialError, ApiResponse.Dto<MaterialProviderDto>>
    fun updateProvider(id: UUID, request: MaterialProviderRequest, userId: UUID): App<MaterialError, ApiResponse.NoData>
    fun deleteProvider(id: UUID): App<MaterialError, ApiResponse.NoData>
    fun addType(request: MaterialTypeRequest, userId: UUID): App<MaterialError, ApiResponse.Created>
    fun pageTypes(params: PaginationParameters<MaterialTypeSort>): App<Nothing, ApiResponse.Page<MaterialTypeDto, MaterialTypeSort>>
    fun updateType(id: UUID, request: MaterialTypeRequest, userId: UUID): App<MaterialError, ApiResponse.NoData>
    fun deleteType(id: UUID): App<MaterialError, ApiResponse.NoData>
    fun addItem(providerId: UUID, request: MaterialItemRequest, userId: UUID): App<MaterialError, ApiResponse.Created>
    fun pageItems(providerId: UUID, params: PaginationParameters<MaterialItemSort>): App<Nothing, ApiResponse.Page<MaterialItemDto, MaterialItemSort>>
    fun updateItem(providerId: UUID, itemId: UUID, request: MaterialItemRequest, userId: UUID): App<MaterialError, ApiResponse.NoData>
    fun deleteItem(providerId: UUID, itemId: UUID): App<MaterialError, ApiResponse.NoData>
}

sealed interface MaterialError : ServiceError {
    data object ProviderNotFound; data object ProviderNameTaken; data object ProviderInUse
    data object TypeNotFound; data object TypeNameTaken; data object TypeInUse
    data object ItemNotFound; data object ItemNumberTaken; data object ItemInUse
    // spätere Tasks ergänzen weitere Werte
}
```

Statuscodes: NotFound → 404, NameTaken/NumberTaken → 409 mit `errorCode` (neue Werte `MATERIAL_PROVIDER_NAME_TAKEN`, `MATERIAL_TYPE_NAME_TAKEN`, `MATERIAL_ITEM_NUMBER_TAKEN` in `ErrorCode` Kotlin + yaml), InUse → 409.

- [ ] **Step 1: Test schreiben** (`MaterialServiceTest.kt`, Muster `PaceReferenceServiceTest`)

```kotlin
class MaterialServiceTest {

    private fun createTestUser(): App<Nothing, UUID> = KIO.comprehension {
        val now = LocalDateTime.now()
        val id = UUID.randomUUID()
        !AppUserRepo.create(AppUserRecord(id = id, email = "m-$id@test.de", password = "x", firstname = "M", lastname = "T",
            language = "de", createdAt = now, updatedAt = now)).orDie()
        KIO.ok(id)
    }

    private fun provider(name: String = "Bootshaus Nord") =
        MaterialProviderRequest(name = name, contactName = null, contactEmail = "info@nord.de", contactPhone = null, note = null)

    @Test
    fun providerTypeItemRoundTrip() = testComprehension {
        val userId = !createTestUser()
        val providerId = (!MaterialService.addProvider(provider(), userId) as ApiResponse.Created).id
        val typeId = (!MaterialService.addType(MaterialTypeRequest("C4x+", MaterialCategory.BOAT, null), userId) as ApiResponse.Created).id
        val itemId = (!MaterialService.addItem(providerId, MaterialItemRequest(typeId, 7, "Boot 7", null, MaterialItemStatus.ACTIVE), userId) as ApiResponse.Created).id

        val page = !MaterialService.pageItems(providerId, PaginationParameters(null, null, null, null))
        val item = page.data.single { it.id == itemId }
        assertEquals("C4x+", item.materialTypeName)
        assertEquals(MaterialCategory.BOAT, item.category)
        assertEquals(7, item.number)
        assertEquals(0, item.openDamages)
    }

    @Test
    fun duplicateNumberPerTypeIsRejected() = testComprehension {
        val userId = !createTestUser()
        val providerId = (!MaterialService.addProvider(provider(), userId) as ApiResponse.Created).id
        val typeId = (!MaterialService.addType(MaterialTypeRequest("C1x", MaterialCategory.BOAT, null), userId) as ApiResponse.Created).id
        !MaterialService.addItem(providerId, MaterialItemRequest(typeId, 3, "Boot 3", null, MaterialItemStatus.ACTIVE), userId)
        assertKIOFails(MaterialError.ItemNumberTaken) {
            MaterialService.addItem(providerId, MaterialItemRequest(typeId, 3, "Boot 3b", null, MaterialItemStatus.ACTIVE), userId)
        }
    }

    @Test
    fun typeInUseCannotBeDeleted() = testComprehension {
        val userId = !createTestUser()
        val providerId = (!MaterialService.addProvider(provider(), userId) as ApiResponse.Created).id
        val typeId = (!MaterialService.addType(MaterialTypeRequest("C2x", MaterialCategory.BOAT, null), userId) as ApiResponse.Created).id
        !MaterialService.addItem(providerId, MaterialItemRequest(typeId, null, "Zweier", null, MaterialItemStatus.ACTIVE), userId)
        assertKIOFails(MaterialError.TypeInUse) { MaterialService.deleteType(typeId) }
    }

    @Test
    fun providerNameMustBeUnique() = testComprehension {
        val userId = !createTestUser()
        !MaterialService.addProvider(provider(), userId)
        assertKIOFails(MaterialError.ProviderNameTaken) { MaterialService.addProvider(provider(), userId) }
    }
}
```

- [ ] **Step 2: Test laufen lassen, muss scheitern** (Compile-Fehler)

- [ ] **Step 3: Umsetzen**

Repos nach `FeeRepo`-Muster: `MATERIAL_PROVIDER.insertReturning(record) { ID }`, `.update(f) { ID.eq(id) }`, `.delete { ID.eq(id) }`, `.exists { … }`, `.page(params, { listOf(NAME) })`. `MaterialItemRepo.page` liest `MATERIAL_ITEM_VIEW.page(params, { listOf(LABEL, MATERIAL_TYPE_NAME) }) { MATERIAL_PROVIDER.eq(providerId) }`; Sort `TYPE -> listOf(MATERIAL_ITEM_VIEW.MATERIAL_TYPE_NAME)`.

Service-Prüfungen (jeweils mit `!`): Anbieter-Name eindeutig (`exists { NAME.eq(name).and(ID.ne(id)) }` → `ProviderNameTaken`), Typ-Name analog, Nummer je (provider, type) → `ItemNumberTaken`, Löschen Anbieter mit Stücken/Einladungen → `ProviderInUse`, Typ mit Stücken/Bedarf/Angeboten → `TypeInUse`, Stück mit Zuteilungen → `ItemInUse` (Tabelle `material_assignment`, existiert seit 1.1; Repo `MaterialItemRepo.hasAssignments(itemId)`). `updateItem`/`deleteItem` prüfen, dass das Stück zum `providerId` gehört (sonst `ItemNotFound`).

Routen in `material.kt`:

```kotlin
fun Route.material() {
    route("/materialProvider") {
        get { call.respondComprehension { !authenticate(Privilege.ReadMaterialGlobal); val p = !pagination<MaterialProviderSort>(); MaterialService.pageProviders(p) } }
        post { call.respondComprehension { val user = !authenticate(Privilege.UpdateMaterialGlobal); val body = !receiveKIO(MaterialProviderRequest.example); MaterialService.addProvider(body, user.id!!) } }
        route("/{providerId}") {
            get { call.respondComprehension {
                val (user, scope) = !authenticate(Privilege.Action.READ, Privilege.Resource.MATERIAL)
                val id = !pathParam("providerId", uuid)
                if (scope == Privilege.Scope.OWN && id != user.materialProvider) KIO.fail(AuthError.PrivilegeMissing) else MaterialService.getProvider(id)
            } }
            put { … UpdateMaterialGlobal … }
            delete { … UpdateMaterialGlobal … }
            route("/item") {
                get { … READ MATERIAL, OWN-Prüfung wie oben, pagination<MaterialItemSort>(), MaterialService.pageItems(id, p) }
                post { … UPDATE MATERIAL, OWN-Prüfung, receiveKIO(MaterialItemRequest.example), addItem }
                route("/{itemId}") { put { … updateItem }; delete { … deleteItem } }
            }
        }
    }
    route("/materialType") {
        get { call.respondComprehension { !authenticate(Privilege.Action.READ, Privilege.Resource.MATERIAL); val p = !pagination<MaterialTypeSort>(); MaterialService.pageTypes(p) } }
        post { … UpdateMaterialGlobal … }
        route("/{typeId}") { put { … }; delete { … } }
    }
}
```

Die OWN-Prüfung als private Hilfsfunktion `fun ownProviderCheck(user, scope, providerId): App<AuthError, Unit>` in `material.kt`, damit die Folge-Tasks sie wiederverwenden.

`Routing.kt`: Import `de.lambda9.ready2race.backend.app.material.boundary.material` und Aufruf `material()` direkt nach `fee()`.

- [ ] **Step 4: Tests grün**

```bash
./mvnw -o test -Dtest=MaterialServiceTest -Ddatabase.url=jdbc:postgresql://localhost:7660/ready2race-build 2>&1 | grep -E "Tests run|BUILD|FAIL"
```

- [ ] **Step 5: Commit**

```bash
git add backend/src && git commit -m "Materialvermietung: Backend-Domäne für Anbieter, Materialarten und Materialstücke"
```

---

### Task 1.4: OpenAPI-Vertrag und Client für Schritt 1

**Files:**
- Modify: `backend/src/main/resources/openapi/documentation.yaml`
- Create: `api/src/material.tsp`; Modify: `api/main.tsp` (Import alphabetisch einsortieren)
- Generated: `frontend/src/api/types.gen.ts`, `frontend/src/api/sdk.gen.ts`

**Interfaces:**
- Produces (operationIds, so werden die SDK-Funktionen heißen): `getMaterialProviders`, `addMaterialProvider`, `getMaterialProvider`, `updateMaterialProvider`, `deleteMaterialProvider`, `getMaterialItems`, `addMaterialItem`, `updateMaterialItem`, `deleteMaterialItem`, `getMaterialTypes`, `addMaterialType`, `updateMaterialType`, `deleteMaterialType`. Schemas `MaterialProviderDto`, `MaterialProviderRequest`, `MaterialTypeDto`, `MaterialTypeRequest`, `MaterialItemDto`, `MaterialItemRequest`, `MaterialCategory`, `MaterialItemStatus`.

- [ ] **Step 1: Pfade in der Yaml ergänzen** (Vorbild `/fee` ab Z. ~4303 und `/fee/{feeId}` ~4360; Pagination-Parameter per `$ref` wie dort). Beispiel für einen Pfad, die übrigen analog:

```yaml
  /materialProvider:
    get:
      operationId: getMaterialProviders
      description: Alle Materialanbieter, seitenweise. Braucht READ MATERIAL GLOBAL.
      parameters:
        - $ref: '#/components/parameters/limit'
        - $ref: '#/components/parameters/offset'
        - $ref: '#/components/parameters/sort'
        - $ref: '#/components/parameters/search'
      responses:
        200:
          description: Seite mit Anbietern
          content:
            application/json:
              schema:
                type: object
                required: [data, pagination]
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/MaterialProviderDto'
                  pagination:
                    $ref: '#/components/schemas/Pagination'
        401:
          $ref: '#/components/responses/401'
        403:
          $ref: '#/components/responses/403'
        500:
          $ref: '#/components/responses/500'
    post:
      operationId: addMaterialProvider
      description: Legt einen Anbieter an. Braucht UPDATE MATERIAL GLOBAL.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/MaterialProviderRequest'
      responses:
        201:
          $ref: '#/components/responses/201'
        400:
          $ref: '#/components/responses/400'
        401:
          $ref: '#/components/responses/401'
        403:
          $ref: '#/components/responses/403'
        409:
          $ref: '#/components/responses/409'
        500:
          $ref: '#/components/responses/500'
```

Die genauen `$ref`-Namen für Pagination-Parameter, `Pagination`-Schema und die Standard-Responses aus dem `/fee`-Block übernehmen (nicht raten, sondern kopieren).

- [ ] **Step 2: Schemas ergänzen** (unter `components.schemas`, alphabetisch bei `M`)

```yaml
    MaterialCategory:
      type: string
      enum: [BOAT, OTHER]
    MaterialItemStatus:
      type: string
      enum: [ACTIVE, RETIRED]
    MaterialProviderDto:
      type: object
      required: [id, name]
      properties:
        id: {type: string, format: uuid}
        name: {type: string}
        contactName: {type: string}
        contactEmail: {type: string}
        contactPhone: {type: string}
        note: {type: string}
    MaterialProviderRequest:
      type: object
      required: [name]
      properties:
        name: {type: string}
        contactName: {type: string}
        contactEmail: {type: string}
        contactPhone: {type: string}
        note: {type: string}
    MaterialTypeDto:
      type: object
      required: [id, name, category]
      properties:
        id: {type: string, format: uuid}
        name: {type: string}
        category: {$ref: '#/components/schemas/MaterialCategory'}
        description: {type: string}
    MaterialTypeRequest:
      type: object
      required: [name, category]
      properties:
        name: {type: string}
        category: {$ref: '#/components/schemas/MaterialCategory'}
        description: {type: string}
    MaterialItemDto:
      type: object
      required: [id, materialProvider, materialProviderName, materialType, materialTypeName, category, label, status, openDamages]
      properties:
        id: {type: string, format: uuid}
        materialProvider: {type: string, format: uuid}
        materialProviderName: {type: string}
        materialType: {type: string, format: uuid}
        materialTypeName: {type: string}
        category: {$ref: '#/components/schemas/MaterialCategory'}
        number: {type: integer}
        label: {type: string, maxLength: 20}
        note: {type: string}
        status: {$ref: '#/components/schemas/MaterialItemStatus'}
        openDamages: {type: integer}
    MaterialItemRequest:
      type: object
      required: [materialType, label, status]
      properties:
        materialType: {type: string, format: uuid}
        number: {type: integer}
        label: {type: string, maxLength: 20}
        note: {type: string}
        status: {$ref: '#/components/schemas/MaterialItemStatus'}
```

`ErrorCode`-Enum in der Yaml um `MATERIAL_PROVIDER_NAME_TAKEN`, `MATERIAL_TYPE_NAME_TAKEN`, `MATERIAL_ITEM_NUMBER_TAKEN` ergänzen (und in Kotlin `ErrorCode`, falls dort ein Enum existiert: `grep -rn "enum class ErrorCode" backend/src`).

- [ ] **Step 3: `api/src/material.tsp` als Skizze** (Modelle wie oben, Interface `MaterialRoutes` mit `@route("/materialProvider")`), Import in `api/main.tsp`.

- [ ] **Step 4: Client erzeugen und bauen**

```bash
cd frontend && npm run generate && npm run build 2>&1 | tail -3 && grep -c "getMaterialProviders\|MaterialItemDto" src/api/types.gen.ts src/api/sdk.gen.ts
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/openapi/documentation.yaml api/ frontend/src/api
git commit -m "Materialvermietung: API-Vertrag und Client für Anbieter, Materialarten und Stücke"
```

---

### Task 1.5: Frontend: Verwaltung und Flotte, Routen, Menü

**Files:**
- Create: `frontend/src/pages/material/MaterialAdminPage.tsx`, `MaterialFleetPage.tsx`, `SelectMaterialEventPage.tsx` (vorerst nur Platzhalter mit Titel, gefüllt in Task 2.3), `MaterialDashboardPage.tsx` (Platzhalter mit Tabs-Gerüst, gefüllt in 2.3/4.3/5.3)
- Create: `frontend/src/components/material/MaterialProviderTable.tsx`, `MaterialProviderDialog.tsx`, `MaterialTypeTable.tsx`, `MaterialTypeDialog.tsx`, `MaterialItemTable.tsx`, `MaterialItemDialog.tsx`
- Modify: `frontend/src/routes.tsx` (Routen + `addChildren`), `frontend/src/components/sidebar/SidebarContent.tsx` (Eintrag „Material")
- Modify: `frontend/src/i18n/{de,en,da}/translations.json` (neuer Block `material`, `navigation.titles.material`)

**Interfaces:**
- Produces: Routen `materialRoute` (`/material`, Parent `mainLayoutRoute`, damit Kopfleiste und Sidebar bleiben), `materialIndexRoute`, `materialEventRoute` (`event/$eventId`, `validateSearch: validateTabSearch<MaterialTab>`), `materialFleetRoute`, `materialAdminRoute`. Typ `MaterialTab = 'requests' | 'assignment' | 'damages' | 'settings'` exportiert aus `MaterialDashboardPage.tsx`.
- Consumes: SDK-Funktionen aus Task 1.4, Rechte aus 1.2, `useUser().materialProviderId`.

- [ ] **Step 1: Routen** (Muster `usersIndexRoute` mit `checkAuth`; OR zweier Rechte von Hand wie `eventStreamScenesRoute`)

```tsx
export const materialRoute = createRoute({
    getParentRoute: () => mainLayoutRoute,
    path: 'material',
    component: () => <Outlet />,
    beforeLoad: ({context, location}) => {
        checkAuth(context, location)
        if (!context.checkPrivilege(readMaterialOwn) && !context.checkPrivilege(readMaterialGlobal)) {
            throw redirect({to: '/dashboard'})
        }
    },
})
export const materialIndexRoute = createRoute({getParentRoute: () => materialRoute, path: '/', component: () => <SelectMaterialEventPage />})
export const materialEventRoute = createRoute({
    getParentRoute: () => materialRoute, path: 'event/$eventId',
    component: () => <MaterialDashboardPage />, validateSearch: validateTabSearch<MaterialTab>,
})
export const materialFleetRoute = createRoute({getParentRoute: () => materialRoute, path: 'fleet', component: () => <MaterialFleetPage />})
export const materialAdminRoute = createRoute({
    getParentRoute: () => materialRoute, path: 'admin', component: () => <MaterialAdminPage />,
    beforeLoad: ({context, location}) => checkAuth(context, location, readMaterialGlobal),
})
```

Unter `mainLayoutRoute.addChildren([...])` die Gruppe `materialRoute.addChildren([materialIndexRoute, materialEventRoute, materialFleetRoute, materialAdminRoute])` ergänzen. `checkPrivilege(readMaterialOwn)` ist true, sobald ein Nutzer READ MATERIAL in irgendeinem Scope hat (`scopeLevel`-Vergleich in `UserProvider`).

- [ ] **Step 2: Sidebar** (`SidebarContent.tsx`, nach dem Vereins-Eintrag)

```tsx
{user.loggedIn && (user.checkPrivilege(readMaterialOwn) || user.checkPrivilege(readMaterialGlobal)) && (
    <SidebarItem text={t('navigation.titles.material')} icon={<Sailing />} authenticatedOnly to={'/material'} />
)}
```

(`Sailing` aus `@mui/icons-material`; falls nicht vorhanden `DirectionsBoat`.)

- [ ] **Step 3: Tabellen und Dialoge** nach `FeeTable`/`FeeDialog`-Muster. `MaterialProviderTable` (Spalten name, contactName, contactEmail; `parentResource={'USER'}` → Lösch-Recht am Admin; Kern-Zeilen):

```tsx
const dataRequest = (signal: AbortSignal, paginationParameters: PaginationParameters) =>
    getMaterialProviders({signal, query: {...paginationParameters}})
const deleteRequest = (dto: MaterialProviderDto) => deleteMaterialProvider({path: {providerId: dto.id}})
```

`MaterialProviderDialog` mit Feldern name (required), contactName, contactEmail, contactPhone, note. `MaterialTypeTable`/`Dialog` mit name, category (`FormInputSelect` mit Optionen `BOAT`/`OTHER`, Labels `material.category.BOAT` = „Boot", `OTHER` = „Sonstiges"), description. `MaterialItemTable` nimmt zusätzlich `providerId: string` als Prop (Spalten number, label, materialTypeName, status, openDamages), `MaterialItemDialog` mit `providerId`, Typ-Autocomplete aus `getMaterialTypes({query: {limit: 200}})`, number (Zahl, optional), label (required, max 20), note, status (Switch „ausgemustert").

`MaterialAdminPage`: zwei `useEntityAdministration`-Paare (Anbieter, Materialarten) untereinander, Muster `RolesPage`. `MaterialFleetPage`: `providerId = user.materialProviderId ?? search.provider`; ohne beides und ohne GLOBAL → Hinweis `material.fleet.noProvider`; mit GLOBAL und ohne Zuordnung ein `FormInputAutocomplete`-freies MUI-`Select` der Anbieter aus `getMaterialProviders`.

- [ ] **Step 4: Übersetzungen** (`material.*` in allen drei Dateien; Auszug de)

```json
"material": {
  "material": "Material", "provider": {"provider": "Anbieter", "providers": "Anbieter", "name": "Name", "contactName": "Ansprechperson", "contactEmail": "E-Mail", "contactPhone": "Telefon", "note": "Notiz"},
  "type": {"type": "Materialart", "types": "Materialarten", "name": "Name", "category": "Kategorie", "description": "Beschreibung"},
  "category": {"BOAT": "Boot", "OTHER": "Sonstiges"},
  "item": {"item": "Materialstück", "items": "Materialstücke", "number": "Nummer", "label": "Bezeichnung", "type": "Materialart", "status": "Status", "note": "Notiz", "openDamages": "Offene Schäden", "retired": "Ausgemustert", "labelTooLong": "Höchstens 20 Zeichen"},
  "itemStatus": {"ACTIVE": "Aktiv", "RETIRED": "Ausgemustert"},
  "fleet": {"title": "Flotte", "noProvider": "Ihr Konto ist keinem Anbieter zugeordnet."},
  "admin": {"title": "Anbieter und Materialarten"},
  "events": {"title": "Veranstaltungen", "none": "Der Anbieter ist zu keiner Veranstaltung eingeladen."}
}
```

`navigation.titles.material`: de „Material", en „Equipment", da „Materiel".

- [ ] **Step 5: Prüfen**

```bash
cd frontend && npm test 2>&1 | tail -4 && npm run build 2>&1 | tail -3 && npx eslint src/pages/material src/components/material src/routes.tsx src/components/sidebar
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src && git commit -m "Materialvermietung: Verwaltung von Anbietern und Materialarten, Flotte, Menüeintrag"
```

---

### Task 1.6: Nutzer einem Anbieter zuordnen

**Files:**
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/appuser/boundary/user.kt` (Route `PUT /user/{userId}/materialProvider`), `AppUserService.kt` (`setMaterialProvider`), `app/appuser/entity/` (neues `SetMaterialProviderRequest(val materialProviderId: UUID?)`), `AppUserDto.kt` (+ `materialProviderId: UUID?`, `materialProviderName: String?` falls die Sicht `app_user_with_roles` o. ä. erweitert werden muss; sonst per Join im Repo)
- Modify: `documentation.yaml` (Route `setUserMaterialProvider`, `AppUserDto` +2 Felder), `frontend/src/api/*` (generate)
- Modify: `frontend/src/pages/user/UserPage.tsx` (Select „Anbieter" nur bei `updateUserGlobal`, speichert per eigenem Aufruf nach `updateUser`)
- Test: `backend/src/test/kotlin/.../app/material/MaterialProviderAssignmentTest.kt`

**Interfaces:**
- Produces: `AppUserService.setMaterialProvider(targetUserId: UUID, providerId: UUID?, requestingUserId: UUID): App<ServiceError, ApiResponse.NoData>` (setzt `app_user.material_provider`; mit `providerId != null` zusätzlich Rolle `MATERIAL_PROVIDER_ROLE` zuweisen, falls nicht vorhanden; mit `null` die Rolle entfernen).

- [ ] **Step 1: Test**

```kotlin
@Test
fun assigningProviderAddsRole() = testComprehension {
    val admin = !createTestUser(); val target = !createTestUser()
    val providerId = (!MaterialService.addProvider(MaterialProviderRequest("Hafen Süd", null, null, null, null), admin) as ApiResponse.Created).id
    !AppUserService.setMaterialProvider(target, providerId, admin)
    val user = !AppUserRepo.getWithPrivileges(target)   // Sicht app_user_with_privileges; Funktionsname aus AppUserRepo übernehmen
    assertEquals(providerId, user!!.materialProvider)
    assertTrue(user.privileges!!.any { it!!.resource == "MATERIAL" && it.scope == "OWN" })
    !AppUserService.setMaterialProvider(target, null, admin)
    val cleared = !AppUserRepo.getWithPrivileges(target)
    assertNull(cleared!!.materialProvider)
}
```

- [ ] **Step 2: Scheitern lassen, umsetzen, grün** (Route mit `authenticate(Privilege.UpdateUserGlobal)`; `AppUserHasRoleRepo.create`/`delete` für die Rolle).

- [ ] **Step 3: Frontend `UserPage`:** unterhalb der Rollen ein MUI `Select` (Optionen aus `getMaterialProviders({query: {limit: 200}})`, plus „kein Anbieter"), Zustand außerhalb von react-hook-form, beim Speichern nach `updateUser` → `setUserMaterialProvider({path: {userId}, body: {materialProviderId}})`. Label `user.materialProvider` = „Materialanbieter" (de/en/da).

- [ ] **Step 4: Prüfen und Commit**

```bash
git add -A backend/src frontend/src && git commit -m "Materialvermietung: Nutzer einem Anbieter zuordnen"
```

---

**Schritt 1 abgeschlossen, wenn:** voller Backend-Testlauf grün, `npm test`/`build` grün, ein Admin kann Anbieter, Materialarten und Stücke anlegen und einen Nutzer zuordnen, und dieser Nutzer sieht „Material" im Menü mit seiner Flotte.

---

# Schritt 2: Veranstaltung, Einladung, Angebote, Bedarf

### Task 2.1: Backend: Einladung, Angebote, Bedarf am Wettkampf

**Files:**
- Create: `app/material/entity/MaterialOfferDto.kt`, `MaterialOfferRequest.kt`, `EventMaterialProviderDto.kt`, `MaterialProviderEventDto.kt`, `MaterialDemandDto.kt`, `MaterialDemandRequestDto.kt`
- Create: `app/material/control/EventHasMaterialProviderRepo.kt`, `MaterialOfferRepo.kt`
- Create: `app/competitionProperties/control/CompetitionPropertiesHasMaterialTypeRepo.kt` (1:1 nach `CompetitionPropertiesHasFeeRepo`)
- Modify: `app/competitionProperties/entity/CompetitionPropertiesRequest.kt` (+ `materialTypes: List<MaterialDemandRequestDto>`, Validierung `noDuplicates` auf `materialType`), das Response-DTO der Wettkampf-Eigenschaften (`grep -rn "fees" app/competitionProperties/entity/*Dto.kt`) + Sicht/Repo, die es befüllt (+ `materialTypes: List<MaterialDemandDto>`), `CompetitionPropertiesService.addCompetitionPropertiesReferences`/`updateCompetitionPropertiesReferences` (Bedarf mitschreiben, Z. ~102–141), `CompetitionPropertiesRequest.example`
- Modify: `app/material/boundary/MaterialService.kt`, `material.kt` (Routen), `MaterialError.kt` (+ `NotInvited`, `OfferNotFound`, `OfferTypeTaken`, `EventNotFound`)
- Modify: `app/event/boundary/event.kt` — **nicht** nötig; die Event-Routen liegen unter `route("/event/{eventId}")` in `material.kt` als eigener Block `Route.eventMaterial()`, der in `event.kt` innerhalb von `route("/{eventId}")` aufgerufen wird (Muster `eventDocument()`)
- Test: `MaterialServiceTest.kt` erweitern, `CompetitionPropertiesMaterialDemandTest.kt`

**Interfaces:**
- Produces:

```kotlin
data class MaterialDemandRequestDto(val materialType: UUID, val count: Int)          // Bedarf im CompetitionPropertiesRequest
data class MaterialDemandDto(val materialType: UUID, val name: String, val category: MaterialCategory, val count: Int)
data class MaterialOfferDto(val id: UUID, val event: UUID, val materialProvider: UUID, val materialType: UUID, val materialTypeName: String, val category: MaterialCategory, val priceText: String?, val plannedCount: Int, val changeoverMinutes: Int)
class MaterialOfferRequest(val materialType: UUID, val priceText: String?, val plannedCount: Int, val changeoverMinutes: Int) : Validatable
data class EventMaterialProviderDto(val materialProvider: UUID, val name: String, val requestsClosed: Boolean, val openRequests: Int, val openDamages: Int)   // Veranstalter-Übersicht (openRequests/openDamages ab Task 4.1/5.1 gefüllt, bis dahin 0 aus Subselect auf leere Tabellen - die Sub-Selects gleich jetzt schreiben, die Tabellen existieren)
data class MaterialProviderEventDto(val event: UUID, val eventName: String, val requestsClosed: Boolean)   // Veranstaltungswahl des Anbieters
class SetRequestsClosedRequest(val requestsClosed: Boolean)

// MaterialService
fun inviteProvider(eventId: UUID, providerId: UUID, userId: UUID): App<MaterialError, ApiResponse.NoData>      // idempotent
fun uninviteProvider(eventId: UUID, providerId: UUID): App<MaterialError, ApiResponse.NoData>                // löscht Angebote per Kaskade; mit bestehenden Anfragen -> ProviderInUse
fun getEventProviders(eventId: UUID): App<MaterialError, ApiResponse.ListDto<EventMaterialProviderDto>>
fun getProviderEvents(providerId: UUID): App<Nothing, ApiResponse.ListDto<MaterialProviderEventDto>>
fun setRequestsClosed(eventId: UUID, providerId: UUID, closed: Boolean, userId: UUID): App<MaterialError, ApiResponse.NoData>
fun listOffers(eventId: UUID, providerId: UUID): App<MaterialError, ApiResponse.ListDto<MaterialOfferDto>>
fun addOffer(eventId: UUID, providerId: UUID, request: MaterialOfferRequest, userId: UUID): App<MaterialError, ApiResponse.Created>   // NotInvited, OfferTypeTaken
fun updateOffer(eventId: UUID, providerId: UUID, offerId: UUID, request: MaterialOfferRequest, userId: UUID): App<MaterialError, ApiResponse.NoData>
fun deleteOffer(eventId: UUID, providerId: UUID, offerId: UUID): App<MaterialError, ApiResponse.NoData>   // mit Anfragen -> OfferInUse (409)
```

Routen (in `material.kt`, Funktion `Route.eventMaterial()`, eingehängt unter `/event/{eventId}`):

```
GET    /event/{eventId}/materialProvider                          READ EVENT GLOBAL          -> getEventProviders
PUT    /event/{eventId}/materialProvider/{providerId}             UPDATE EVENT GLOBAL        -> inviteProvider
DELETE /event/{eventId}/materialProvider/{providerId}             UPDATE EVENT GLOBAL        -> uninviteProvider
PUT    /event/{eventId}/materialProvider/{providerId}/requestsClosed   UPDATE MATERIAL (OWN-Prüfung) -> setRequestsClosed
GET    /event/{eventId}/materialProvider/{providerId}/offer       READ MATERIAL (OWN-Prüfung) ODER READ EVENT GLOBAL -> listOffers
POST   /event/{eventId}/materialProvider/{providerId}/offer       UPDATE MATERIAL (OWN)      -> addOffer
PUT    /event/{eventId}/materialProvider/{providerId}/offer/{offerId}     UPDATE MATERIAL (OWN)
DELETE /event/{eventId}/materialProvider/{providerId}/offer/{offerId}     UPDATE MATERIAL (OWN)
GET    /materialProvider/{providerId}/event                       READ MATERIAL (OWN-Prüfung) -> getProviderEvents
```

„ODER zweier Rechte" im Backend: `authenticateAny(Privilege.ReadMaterialOwn, Privilege.ReadEventGlobal)` liefert den Nutzer; danach OWN-Prüfung nur, wenn er `ReadEventGlobal` nicht hat (`user.hasPrivilege(Privilege.ReadEventGlobal)`).

- [ ] **Step 1: Tests**

```kotlin
@Test
fun offerRequiresInvitation() = testComprehension {
    val userId = !createTestUser()
    val eventId = !createTestEvent(userId)   // Hilfsfunktion: EventRepo.create mit Minimalfeldern; Vorbild in app/liveDashboard/*Test.kt oder app/stream/StreamSceneServiceTest.kt suchen und übernehmen
    val providerId = (!MaterialService.addProvider(provider(), userId) as ApiResponse.Created).id
    val typeId = (!MaterialService.addType(MaterialTypeRequest("C4x+", MaterialCategory.BOAT, null), userId) as ApiResponse.Created).id
    assertKIOFails(MaterialError.NotInvited) {
        MaterialService.addOffer(eventId, providerId, MaterialOfferRequest(typeId, "45 €", 5, 30), userId)
    }
    !MaterialService.inviteProvider(eventId, providerId, userId)
    !MaterialService.addOffer(eventId, providerId, MaterialOfferRequest(typeId, "45 €", 5, 30), userId)
    assertKIOFails(MaterialError.OfferTypeTaken) {
        MaterialService.addOffer(eventId, providerId, MaterialOfferRequest(typeId, "50 €", 1, 30), userId)
    }
    val offers = (!MaterialService.listOffers(eventId, providerId)).data
    assertEquals(1, offers.size); assertEquals("C4x+", offers.single().materialTypeName)
    val events = (!MaterialService.getProviderEvents(providerId)).data
    assertEquals(listOf(eventId), events.map { it.event })
}
```

`CompetitionPropertiesMaterialDemandTest`: Wettkampf mit `materialTypes = [(typeId, 1)]` anlegen (über `CompetitionService.addCompetition` mit `CompetitionPropertiesRequest.example.copy(materialTypes = …)`), Wettkampf laden, `materialTypes` enthält den Typ mit Namen; Update mit leerer Liste entfernt ihn.

- [ ] **Step 2: Scheitern lassen, umsetzen** (Repos nach `EVENT_HAS_MATERIAL_PROVIDER.insertReturning`, `.exists { EVENT.eq(e).and(MATERIAL_PROVIDER.eq(p)) }`; `listOffers` mit Join auf `MATERIAL_TYPE` für Name/Kategorie per `Jooq.query { select(MATERIAL_OFFER.asterisk(), MATERIAL_TYPE.NAME, MATERIAL_TYPE.CATEGORY).from(...).join(...) }`; Bedarf im Properties-DTO als weiteres `asMultiset`/Join wie `fees`).

- [ ] **Step 3: Grün, Commit**

```bash
git add backend/src && git commit -m "Materialvermietung: Einladung je Veranstaltung, Angebote und Bedarf am Wettkampf"
```

---

### Task 2.2: API-Vertrag für Schritt 2

**Files:** `documentation.yaml`, `api/src/material.tsp`, `api/src/competitionProperties.tsp`, `frontend/src/api/*`

**Interfaces:**
- Produces operationIds: `getEventMaterialProviders`, `inviteMaterialProvider`, `uninviteMaterialProvider`, `setMaterialRequestsClosed`, `getMaterialOffers`, `addMaterialOffer`, `updateMaterialOffer`, `deleteMaterialOffer`, `getMaterialProviderEvents`. Schemas `MaterialOfferDto`, `MaterialOfferRequest`, `EventMaterialProviderDto`, `MaterialProviderEventDto`, `SetRequestsClosedRequest`, `MaterialDemandDto`, `MaterialDemandRequestDto`; `CompetitionPropertiesRequest.materialTypes` (Array, required, darf leer sein) und das Properties-Response-Schema `+materialTypes`.

- [ ] **Step 1: Yaml ergänzen** (Muster wie Task 1.4; Pfad-Parameter `eventId` per `$ref: '#/components/parameters/eventId'`, `providerId`/`offerId` inline wie `sceneId` bei `/event/{eventId}/stream/{sceneId}/trialPhase`).
- [ ] **Step 2: `npm run generate && npm run build`** — der Build zeigt, wo `CompetitionPropertiesRequest` konstruiert wird (`materialTypes` fehlt dann): `CompetitionDialog.tsx`/`CompetitionTemplateDialog`-Mapper um `materialTypes: []` ergänzen (die echte Bedienung kommt in 2.3).
- [ ] **Step 3: Commit** `git commit -m "Materialvermietung: API-Vertrag für Einladung, Angebote und Bedarf"`

---

### Task 2.3: Frontend: Bedarf am Wettkampf, Veranstalter-Bereich, Anbieter-Dashboard mit Einstellungen

**Files:**
- Modify: `frontend/src/components/event/competition/CompetitionPropertiesFormInputs.tsx` (zweites `useFieldArray` `materialTypes` unter den Gebühren: Autocomplete Materialart + Zahl `count`, Duplikatprüfung wie `feesError`), die zugehörigen Form-Typen/Mapper (`grep -rn "fees:" frontend/src/components/event/competition/*.tsx frontend/src/components/event/competition/template/*.tsx`), Anzeige des Bedarfs in der Wettkampf-Detailansicht neben den Gebühren
- Create: `frontend/src/components/event/material/EventMaterialProvidersCard.tsx` (Veranstalter: Liste eingeladener Anbieter mit Zählern, Einladen per Select aus `getMaterialProviders`, Entladen mit Bestätigung)
- Modify: `frontend/src/pages/event/EventPage.tsx` (`organization`-Panel: `<EventMaterialProvidersCard eventId={eventId}/>` als letztes Element)
- Modify: `frontend/src/pages/material/SelectMaterialEventPage.tsx` (Liste aus `getMaterialProviderEvents({path: {providerId}})`, Link zu `/material/event/$eventId`; Admin ohne Zuordnung: Anbieter-Select oben, `providerId` als Search-Param `?provider=` weiterreichen)
- Modify: `frontend/src/pages/material/MaterialDashboardPage.tsx` (Tabs `requests|assignment|damages|settings` mit `TabSelectionContainer`/`TabPanel`, `providerId` aus `useUser().materialProviderId ?? search.provider`; Panels `requests`/`assignment`/`damages` zeigen bis zu ihren Tasks einen Hinweis `material.dashboard.comingSoon` — dieser Hinweis wird in 4.3/5.3 wieder entfernt)
- Create: `frontend/src/components/material/MaterialOfferTable.tsx`, `MaterialOfferDialog.tsx`, `MaterialSettingsPanel.tsx` (Angebote-Tabelle + Dialog + Switch „Vergabe geschlossen")
- i18n: `material.offer.*`, `material.demand.*`, `material.settings.*`, `material.dashboard.tabs.*`, `event.competition.material.*`

**Interfaces:**
- Consumes: SDK aus 2.2.
- Produces: `MaterialDashboardPage` exportiert `MaterialTab` und den Kontext `{eventId, providerId}` an die Panels als Props.

- [ ] **Step 1: Bedarf im Wettkampf-Formular** (Muster Gebühren-Block Z. ~443–508):

```tsx
const {fields: demandFields, append: appendDemand, remove: removeDemand} = useFieldArray({control, name: 'materialTypes'})
…
<FormInputLabel label={t('event.competition.material.demand')}>
  {demandFields.map((field, index) => (
    <Stack direction="row" spacing={1} key={field.id} alignItems="center">
      <FormInputAutocomplete name={`materialTypes[${index}].materialType`} options={materialTypeOptions} label={t('material.type.type')} required />
      <FormInputNumber name={`materialTypes[${index}].count`} label={t('material.demand.count')} required min={1} />
      <IconButton onClick={() => removeDemand(index)}><Delete/></IconButton>
    </Stack>
  ))}
  <Button onClick={() => appendDemand({materialType: null, count: 1})}>{t('material.demand.add')}</Button>
</FormInputLabel>
```

(`FormInputNumber` existiert? `ls frontend/src/components/form/input/`; sonst `FormInputText type="number"` mit `valueAsNumber`.) Mapper: Form → Request `materialTypes: form.materialTypes.map(d => ({materialType: d.materialType.id, count: Number(d.count)}))`, DTO → Form umgekehrt.

- [ ] **Step 2: Veranstalter-Karte, Veranstaltungswahl, Dashboard-Gerüst, Einstellungen-Panel** wie in Files beschrieben. `MaterialOfferDialog`: Materialart-Autocomplete (nur Arten, für die es noch kein Angebot gibt), `priceText`, `plannedCount` (Zahl ≥ 0), `changeoverMinutes` (Zahl ≥ 0, Default 30).

- [ ] **Step 3: Prüfen** (`npm test`, `npm run build`, eslint auf die neuen Dateien) **und Commit**

```bash
git add frontend/src && git commit -m "Materialvermietung: Bedarf am Wettkampf, Anbieter einladen, Dashboard-Gerüst mit Angeboten"
```

**Schritt 2 abgeschlossen, wenn:** Veranstalter lädt Anbieter ein und pflegt den Bedarf, Anbieter sieht die Veranstaltung unter „Material" und legt Angebote an.

---

# Schritt 3: Anmeldung

### Task 3.0: Stabile Meldungs-IDs beim Speichern der Anmeldung

**Warum:** `EventRegistrationService.upsert` löscht alle nicht gesperrten Meldungen (`CompetitionRegistrationRepo.deleteForEventRegistrationUpdate`, Z. ~168) und legt sie mit `UUID.randomUUID()` neu an (Z. ~583 Team, Z. ~455 Einzel). Materialanfragen zeigen auf die Meldung; mit wechselnden IDs wären sie nach jedem Speichern weg. Lösung ohne Umbau der Renummerierung: Client-IDs übernehmen, Fremdschlüssel aufgeschoben (Task 1.1), entfernte Meldungen explizit aufräumen.

**Files:**
- Modify: `app/eventRegistration/entity/CompetitionRegistrationSingleUpsertDto.kt` (+ `val id: UUID?`), `CompetitionRegistrationTeamUpsertDto.kt` (hat `id: UUID?` schon)
- Modify: `app/eventRegistration/control/EventRegistrationRepo.kt` (Template: Einzelmeldungen liefern ihre `id`; Teams tun es bereits Z. ~371)
- Modify: `app/eventRegistration/boundary/EventRegistrationService.kt`: (a) vor `deleteForEventRegistrationUpdate` die eingehenden IDs sammeln und `!MaterialService.dropRequestsOfRemovedRegistrations(persistedRegistrationId, incomingIds)` aufrufen; (b) `CompetitionRegistrationRecord(teamDto.id ?: UUID.randomUUID(), …)` bzw. `competitionRegistrationDto.id ?: UUID.randomUUID()`; (c) vor dem Insert: existiert die ID noch (gesperrte oder fremde Meldung) → `!KIO.fail(EventRegistrationError.RegistrationIdTaken(id))` (neuer Fehlerwert, 409)
- Create: `app/material/control/MaterialRequestRepo.kt` (erste Funktionen: `deleteForRegistrationsNotIn(eventRegistrationId, keepIds: List<UUID>)`, `clearDamageCauseForRegistrationsNotIn(...)` in `MaterialDamageRepo`), `MaterialService.dropRequestsOfRemovedRegistrations`
- Modify: `documentation.yaml` (`CompetitionRegistrationSingleUpsertDto.id` optional), `frontend/src/api/*`
- Modify: `frontend/src/pages/eventRegistration/EventRegistrationCreatePage.tsx` (`formDataToRequest` reicht `id` der Einzelmeldungen durch; Einzelmeldungen ohne `id` bekommen im Formular `uuid()` beim Anlegen — Stelle: `EventRegistrationSingleCompetitionForm.tsx`/`EventSingleCompetitionField`), `EventRegistrationTeamsForm.tsx` (Teams haben `uuid()` schon)
- Test: `backend/src/test/kotlin/.../app/eventRegistration/EventRegistrationStableIdsTest.kt`

**Interfaces:**
- Produces: `MaterialService.dropRequestsOfRemovedRegistrations(eventRegistrationId: UUID, keptRegistrationIds: List<UUID>): App<Nothing, Unit>` — löscht `material_request` (und per Kaskade Zuteilungen) aller nicht gesperrten Meldungen dieser Anmeldung, deren ID nicht in `kept` ist, und setzt `material_damage.caused_by_registration` für diese auf null. Gesperrte Meldungen (`competitionRgistrationReferenced()`) bleiben unberührt.
- Produces: Meldungs-IDs überleben ein erneutes Speichern, wenn das Formular sie zurückschickt.

- [ ] **Step 1: Test**

```kotlin
@Test
fun teamIdSurvivesResave() = testComprehension {
    // Fixture: Verein, Nutzer mit Verein, Veranstaltung offen für Anmeldung, Team-Wettkampf mit einem benannten Teilnehmer-Slot.
    // Vorbild für den Aufbau: ein bestehender EventRegistration-Test (grep -rln "EventRegistrationService" backend/src/test).
    val teamId = UUID.randomUUID()
    val dto = upsertDto(teams = listOf(teamDto(id = teamId, participants = listOf(p1))))
    !EventRegistrationService.upsert(eventId, user, dto)       // tatsächliche Signatur aus dem Service übernehmen
    !EventRegistrationService.upsert(eventId, user, dto)       // erneut speichern
    val regs = !CompetitionRegistrationRepo.getByClub(clubId)
    assertEquals(listOf(teamId), regs.map { it.id })
}

@Test
fun removedTeamDropsItsMaterialRequest() = testComprehension {
    // wie oben, zusätzlich Anbieter + Einladung + Angebot + material_request (direkt per MaterialRequestRepo.create) für teamId;
    // zweites Speichern ohne das Team -> keine material_request mehr, kein FK-Fehler beim Commit (testComprehension rollt zurück,
    // deshalb zusätzlich die Konsistenz prüfen: !Jooq.query { execute("set constraints all immediate") } nach dem zweiten upsert
    // erzwingt die aufgeschobene Prüfung innerhalb der Transaktion).
}
```

- [ ] **Step 2: Scheitern lassen, umsetzen, grün.** Danach der **volle** Backend-Testlauf (`clean test`), weil die Anmeldung viele Tests hat.

- [ ] **Step 3: Frontend-Anpassung (id der Einzelmeldung) + `npm run generate` + Build**

- [ ] **Step 4: Commit**

```bash
git add -A backend/src frontend/src && git commit -m "Anmeldung: Meldungs-IDs bleiben beim erneuten Speichern erhalten"
```

---

### Task 3.1: Backend: Anfragen je Meldung, Angebote und Ampel im Anmelde-Template, E-Mail

**Files:**
- Create: `app/material/entity/MaterialRequestDto.kt`, `MaterialRequestsUpsertRequest.kt`, `EventRegistrationMaterialOfferDto.kt`
- Modify: `app/material/control/MaterialRequestRepo.kt` (create, `forRegistration`, `withdraw`, `capacityForOffers(eventId)`), `MaterialOfferRepo.kt` (`forEvent(eventId)`)
- Modify: `app/eventRegistration/entity/EventRegistrationCompetitionDto.kt` (+ `materialDemands: List<EventRegistrationMaterialDemandDto>`), neue `EventRegistrationMaterialDemandDto(materialType, name, category, count, offers: List<EventRegistrationMaterialOfferDto>)`, `EventRegistrationMaterialOfferDto(offerId, providerId, providerName, priceText, capacity: MaterialCapacityLevel, requestsClosed: Boolean)`; `CompetitionRegistrationTeamUpsertDto` und `CompetitionRegistrationSingleUpsertDto` (+ `materialRequests: List<MaterialRequestDto>?` nur zum **Lesen** im Template; beim Upsert ignoriert)
- Modify: `app/eventRegistration/control/EventRegistrationRepo.kt` (`selectCompetitionsForEventRegistrationInfo`: Multiset `materialDemands`; Template-Teams/-Einzel: Multiset `materialRequests` aus `material_request` + Angebot + Typ), `EventRegistrationService.getEventRegistrationTemplate` (Kapazität je Angebot nachrechnen: `MaterialService.capacityLevels(eventId)`)
- Modify: `MaterialService.kt` (+ `setRequestsForRegistration`, `capacityLevels`), `material.kt` (Route), `MaterialError` (+ `RequestsClosed`, `TypeNotDemanded`, `DuplicateTypeForRegistration`, `RegistrationNotFound`)
- Modify: `app/email/entity/EmailTemplateKey.kt` (+ `MATERIAL_REQUEST_WITHDRAWN`), Platzhalter (`EmailPlaceholders.kt`), Standard-Template-Texte dort, wo die anderen Keys ihre Defaults haben (`grep -rn "COMPETITION_REGISTRATION_EDITED" backend/src/main`)
- Test: `MaterialRequestServiceTest.kt`

**Interfaces:**
- Produces:

```kotlin
data class MaterialRequestDto(val id: UUID, val competitionRegistration: UUID, val materialOffer: UUID, val materialType: UUID, val materialTypeName: String, val category: MaterialCategory, val providerId: UUID, val providerName: String, val count: Int, val status: MaterialRequestStatus, val decisionNote: String?, val requestedAt: LocalDateTime, val decidedAt: LocalDateTime?)
class MaterialRequestsUpsertRequest(val offerIds: List<UUID>) : Validatable        // vollständige Liste der gewünschten Angebote

fun MaterialService.setRequestsForRegistration(eventId: UUID, competitionRegistrationId: UUID, clubScope: Pair<Privilege.Scope, UUID?>, offerIds: List<UUID>, userId: UUID): App<ServiceError, ApiResponse.NoData>
//   Regeln (Spec Abschnitt 7): Meldung muss zu eventId gehören und bei OWN zum Verein des Nutzers (sonst RegistrationNotFound);
//   jedes Angebot muss zu eventId gehören, sein Typ im Bedarf des Wettkampfs stehen (TypeNotDemanded), höchstens ein Angebot je Typ (DuplicateTypeForRegistration);
//   requests_closed des Anbieters -> RequestsClosed, aber nur für NEUE Anfragen (bestehende bleiben, Rückzug bleibt erlaubt);
//   bestehende Anfrage mit gleichem Angebot: unverändert (auch CONFIRMED); nicht mehr genannte: status=WITHDRAWN, decided_at=now;
//   Rückzug einer CONFIRMED-Anfrage: E-Mail MATERIAL_REQUEST_WITHDRAWN an provider.contact_email (falls gesetzt);
//   Menge = count aus competition_properties_has_material_type des Wettkampfs.
fun MaterialService.capacityLevels(eventId: UUID): App<Nothing, Map<UUID, MaterialCapacityLevel>>   // offerId -> GREEN wenn (CONFIRMED+REQUESTED Mengen) < planned_count, sonst YELLOW
```

Route: `PUT /event/{eventId}/competitionRegistration/{competitionRegistrationId}/materialRequests` mit `authenticate(Privilege.Action.UPDATE, Privilege.Resource.REGISTRATION)`; bei OWN `user.club` mitgeben.

- [ ] **Step 1: Test** (Fixture wie Task 3.0 plus Anbieter/Einladung/Angebot/Bedarf)

```kotlin
@Test
fun requestsAreReplacedButConfirmedSurvive() = testComprehension {
    !MaterialService.setRequestsForRegistration(eventId, regId, Privilege.Scope.GLOBAL to null, listOf(offerBoat), userId)
    val first = (!MaterialRequestRepo.forRegistration(regId)).single()
    !MaterialRequestRepo.update(first.id) { status = "CONFIRMED" }
    !MaterialService.setRequestsForRegistration(eventId, regId, Privilege.Scope.GLOBAL to null, listOf(offerBoat, offerOars), userId)
    val after = !MaterialRequestRepo.forRegistration(regId)
    assertEquals("CONFIRMED", after.single { it.materialOffer == offerBoat }.status)
    assertEquals("REQUESTED", after.single { it.materialOffer == offerOars }.status)
    !MaterialService.setRequestsForRegistration(eventId, regId, Privilege.Scope.GLOBAL to null, emptyList(), userId)
    assertEquals(setOf("WITHDRAWN"), (!MaterialRequestRepo.forRegistration(regId)).map { it.status }.toSet())
}

@Test fun offerOfUndemandedTypeIsRejected() = … assertKIOFails(MaterialError.TypeNotDemanded)
@Test fun closedProviderRejectsNewRequests() = … setRequestsClosed(true) dann assertKIOFails(MaterialError.RequestsClosed)
@Test fun capacityTurnsYellowAtPlannedCount() = … planned_count=1, eine Anfrage -> YELLOW; planned_count=2 -> GREEN
```

- [ ] **Step 2: Scheitern lassen, umsetzen, grün** (voller Lauf, weil Template-DTOs geändert wurden).

- [ ] **Step 3: Commit** `git commit -m "Materialvermietung: Anfragen je Meldung, Angebote und Ampel im Anmelde-Template"`

---

### Task 3.2: API-Vertrag Schritt 3

**Files:** `documentation.yaml` (`setMaterialRequests`; `EventRegistrationCompetitionDto.materialDemands`, `EventRegistrationMaterialDemandDto`, `EventRegistrationMaterialOfferDto`, `MaterialCapacityLevel`, `MaterialRequestDto`, `MaterialRequestStatus`, `MaterialRequestsUpsertRequest`; `CompetitionRegistrationTeamUpsertDto.materialRequests` + Single optional), `api/src/material.tsp`, `frontend/src/api/*`.

- [ ] Yaml ergänzen, `npm run generate`, `npm run build` (Build zeigt Mapper, die `materialDemands` brauchen: mit `[]` auffüllen), Commit `"Materialvermietung: API-Vertrag für Anfragen bei der Anmeldung"`.

---

### Task 3.3: Frontend: Abschnitt „Material" im Anmeldeformular

**Files:**
- Create: `frontend/src/components/eventRegistration/EventRegistrationMaterialSection.tsx` (je Team/Einzelmeldung: eine Zeile je `materialDemand` des Wettkampfs)
- Create: `frontend/src/components/eventRegistration/materialChoice.ts` + `materialChoice.test.ts` (reine Logik)
- Modify: `EventRegistrationTeamsForm.tsx` (`TeamInput` Z. ~93–173: Abschnitt hinter den optionalen Gebühren; Default `materialRequests: []` beim Anlegen eines Teams Z. ~234), `EventRegistrationSingleCompetitionForm.tsx`/`EventSingleCompetitionField` (analog hinter den Gebühren), `EventRegistrationCreatePage.tsx` (Formulartyp `materialOfferIds: string[]` je Team/Einzelmeldung; Reset aus Template: `materialRequests.filter(r => r.status !== 'WITHDRAWN' && r.status !== 'DECLINED').map(r => r.materialOffer)`; nach erfolgreichem `addEventRegistration` je Meldung `setMaterialRequests({path: {eventId, competitionRegistrationId: id}, body: {offerIds}})`, nur wenn sich die Liste gegenüber dem Template geändert hat; Fehler je Meldung als `feedback.error` mit Wettkampfname)
- Create: `frontend/src/components/eventRegistration/MaterialCapacityChip.tsx` (grün „verfügbar" / gelb „knapp")
- i18n: `eventRegistration.material.*` (bring own / rent at / available / scarce / closed / status.*)

**Interfaces:**
- Produces (`materialChoice.ts`):

```ts
export type MaterialDemandChoice = {materialType: string; typeName: string; category: MaterialCategory; count: number; offers: EventRegistrationMaterialOfferDto[]; selectedOfferId: string | null}
// Aus Bedarf des Wettkampfs und den aktuellen Anfragen der Meldung die Auswahl je Materialart bauen.
export const buildChoices = (demands: EventRegistrationMaterialDemandDto[], selectedOfferIds: string[]): MaterialDemandChoice[]
// Aus der Auswahl die Liste der Angebots-IDs (ohne null) - das ist der Body des PUT.
export const selectedOfferIds = (choices: MaterialDemandChoice[]): string[]
// Beschriftung einer Zeile: 'own' | 'rent' | 'noOffer'
export const choiceKind = (choice: MaterialDemandChoice): 'own' | 'rent' | 'noOffer'
```

- [ ] **Step 1: Test `materialChoice.test.ts`**

```ts
describe('buildChoices', () => {
    test('markiert das gewählte Angebot je Materialart', () => {
        const demands = [{materialType: 't1', name: 'C4x+', category: 'BOAT', count: 1, offers: [{offerId: 'o1', providerId: 'p', providerName: 'Nord', priceText: '45 €', capacity: 'GREEN', requestsClosed: false}]}]
        expect(buildChoices(demands, ['o1'])[0].selectedOfferId).toBe('o1')
        expect(buildChoices(demands, [])[0].selectedOfferId).toBeNull()
    })
    test('ohne Angebot heißt die Zeile noOffer', () => {
        expect(choiceKind({materialType: 't', typeName: 'x', category: 'OTHER', count: 1, offers: [], selectedOfferId: null})).toBe('noOffer')
    })
})
```

- [ ] **Step 2: Umsetzen.** Zeile: `<Typography>{typeName} ({count} Stück)</Typography>`; ein Angebot → `Switch` „mieten bei {providerName}" + `MaterialCapacityChip` + Preistext; mehrere → `Select` mit „eigenes Material" + je Angebot „{providerName} · {priceText}" + Chip; `requestsClosed` → Schalter deaktiviert mit Tooltip `eventRegistration.material.closed`, außer die Anfrage besteht schon. Kategorie `BOAT` → Wort „Boot" statt „Material" in den Texten (`eventRegistration.material.ownBoat` vs. `ownMaterial`).

- [ ] **Step 3: `npm test`, `build`, eslint, Commit** `"Anmeldung: Boot oder Material mieten je Meldung, mit Ampel"`

---

### Task 3.4: Anfragen-Status in „Mein Event"

**Files:**
- Modify: `app/eventInfo/entity/MyEventDto.kt` (`MyEventRegistrationDto` + `material: List<MyEventMaterialDto>`; `MyEventMaterialDto(typeName, category, providerName, status, count)`), `app/eventInfo/control/MyEventRepo.kt` (Anfragen je `competition_registration` mitlesen, `WITHDRAWN` ausblenden), `MyEventService` (Cache-Schlüssel unverändert; Cache-Dauer bleibt)
- Modify: `documentation.yaml` (`MyEventRegistrationDto.material`, `MyEventMaterialDto`), Client
- Create: `frontend/src/components/results/myEvent/MyEventMaterial.tsx` (Block je Meldung: „C4x+: angefragt bei Nord" mit Status-Chip), eingebaut in `MyEventMatchList.tsx` dort, wo die Meldung gerendert wird
- i18n: `myEvent.material.*`, `material.requestStatus.*` (REQUESTED „angefragt", CONFIRMED „bestätigt", WAITLISTED „Warteliste", DECLINED „abgelehnt")

- [ ] Umsetzen, `npm test`/`build`, Backend-Tests für `MyEventService` laufen lassen (`-Dtest='MyEvent*'`), Commit `"Mein Event: Status der Materialanfragen je Meldung"`.

**Schritt 3 abgeschlossen, wenn:** ein Verein bei der Anmeldung je Team „mieten" wählt, die Anfrage nach erneutem Speichern noch da ist, die Ampel gelb wird, sobald die geplante Anzahl erreicht ist, und der Sportler den Status in „Mein Event" sieht.

---

# Schritt 4: Anbieter-Dashboard, Einteilung, Nummerngleichheit

### Task 4.1: Backend: Übersicht, Entscheidung, Zuteilung

**Files:**
- Create: `app/material/entity/MaterialOverviewDto.kt` (mit allen Unter-DTOs), `MaterialDecisionRequest.kt`, `MaterialAssignmentsRequest.kt`
- Create: `app/material/control/MaterialAssignmentRepo.kt`, `MaterialOverviewRepo.kt`
- Modify: `MaterialService.kt`, `material.kt`, `MaterialError` (+ `RequestNotFound`, `RequestNotConfirmed`, `WrongItemType`, `MatchNotOfRegistration`, `ItemNotOfProvider`)
- Modify: `afterMigrate.sql` (Sicht `material_request_view`: Anfrage + Angebot + Typ + Meldung + Wettkampf + Verein + `team_number`; Sicht `material_item_schedule`: je Zuteilung der Lauf mit `start_time`, für die Sicht „nach Materialstück")
- Test: `MaterialOverviewTest.kt`

**Interfaces:**
- Produces:

```kotlin
data class MaterialOverviewDto(
    val requestsClosed: Boolean,
    val offers: List<MaterialOfferDto>,
    val items: List<MaterialOverviewItemDto>,
    val requests: List<MaterialOverviewRequestDto>,
    val matches: List<MaterialOverviewMatchDto>,
)
data class MaterialOverviewItemDto(val id: UUID, val materialType: UUID, val materialTypeName: String, val category: MaterialCategory, val number: Int?, val label: String, val status: MaterialItemStatus, val outages: List<MaterialOutageDto>)
data class MaterialOutageDto(val damageId: UUID, val from: LocalDateTime, val until: LocalDateTime?)
data class MaterialOverviewRequestDto(
    val id: UUID, val materialOffer: UUID, val materialType: UUID, val materialTypeName: String, val category: MaterialCategory,
    val count: Int, val status: MaterialRequestStatus, val decisionNote: String?, val requestedAt: LocalDateTime, val decidedAt: LocalDateTime?,
    val competitionRegistration: UUID, val competition: UUID, val competitionIdentifier: String, val competitionName: String,
    val teamName: String?, val teamNumber: Int?, val clubId: UUID, val clubName: String, val clubContactEmail: String?,   // Kontakt = E-Mail des Nutzers, der die Anmeldung angelegt hat (event_registration.created_by)
    val assignments: List<MaterialAssignmentDto>,
)
data class MaterialAssignmentDto(val id: UUID, val materialItem: UUID, val competitionMatch: UUID?)
data class MaterialOverviewMatchDto(val id: UUID, val competition: UUID, val name: String?, val roundName: String?, val startTime: LocalDateTime?, val endTime: LocalDateTime?, val registrationIds: List<UUID>)
//   id = competition_match.competition_setup_match; name/roundName aus competition_match_with_teams (Felder dort nachsehen); endTime aus event_schedule_slot (falls vorhanden, sonst null)

class MaterialDecisionRequest(val status: MaterialRequestStatus, val decisionNote: String?)   // erlaubt: CONFIRMED, WAITLISTED, DECLINED (sonst 400)
class MaterialAssignmentsRequest(val assignments: List<MaterialAssignmentEntry>)             // vollständige Liste je Anfrage
data class MaterialAssignmentEntry(val materialItem: UUID, val competitionMatch: UUID?)

fun MaterialService.getOverview(eventId: UUID, providerId: UUID): App<MaterialError, ApiResponse.Dto<MaterialOverviewDto>>
fun MaterialService.decideRequest(eventId: UUID, providerId: UUID, requestId: UUID, request: MaterialDecisionRequest, userId: UUID): App<MaterialError, ApiResponse.NoData>
//   Anfrage muss zu einem Angebot dieses Anbieters in dieser Veranstaltung gehören; WITHDRAWN bleibt WITHDRAWN (409 RequestNotFound reicht); decided_at = now.
fun MaterialService.setAssignments(eventId: UUID, providerId: UUID, requestId: UUID, request: MaterialAssignmentsRequest, userId: UUID): App<MaterialError, ApiResponse.NoData>
//   Harte Prüfungen (Spec Abschnitt 9): Anfrage CONFIRMED (RequestNotConfirmed), Stück gehört dem Anbieter (ItemNotOfProvider), Stück hat den Typ des Angebots (WrongItemType),
//   competitionMatch (falls gesetzt) enthält die Meldung als competition_match_team (MatchNotOfRegistration). Liste ersetzt bestehende Zuteilungen der Anfrage.
```

Routen (unter `/event/{eventId}/materialProvider/{providerId}`): `GET /overview`, `PUT /request/{requestId}/decision`, `PUT /request/{requestId}/assignments`; alle mit `authenticate(READ bzw. UPDATE, MATERIAL)` + `ownProviderCheck`.

- [ ] **Step 1: Test** (Fixture aus 3.1 plus Lauf: `competition_setup_match` + `competition_match` + `competition_match_team` für die Meldung anlegen; Vorbild in `app/liveDashboard/*Test.kt`)

```kotlin
@Test fun overviewListsRequestWithTeamNumberAndMatch() = … teamNumber gesetzt -> requests.single().teamNumber == 3; matches.single().registrationIds enthält regId
@Test fun assignmentRejectsWrongType() = … Stück vom Typ Skulls auf Anfrage C4x+ -> assertKIOFails(MaterialError.WrongItemType)
@Test fun assignmentPerMatchNeedsTeamInMatch() = … fremder Lauf -> MatchNotOfRegistration
@Test fun decisionSetsDecidedAt() = … CONFIRMED -> decidedAt != null
```

- [ ] **Step 2: Umsetzen, grün (clean test, Sichten geändert), Commit** `"Materialvermietung: Übersicht, Entscheidung und Zuteilung für den Anbieter"`

---

### Task 4.2: Nummernvergabe nach Bootsnummern bei der Fixierung

**Files:**
- Create: `app/material/boundary/TeamNumberAlignment.kt` (reine Funktion, kein DB-Zugriff), Test `TeamNumberAlignmentTest.kt` (plain JUnit)
- Modify: `app/eventRegistration/boundary/eventRegistration.kt` (Query `alignMaterialNumbers`, Default false), `EventRegistrationService.finalizeRegistrations(userId, eventId, keepNumbers, alignMaterialNumbers)`, `MaterialService.boatNumbersForRegistrations(eventId): App<Nothing, Map<UUID, List<Int>>>` (je Meldung mit CONFIRMED-Anfrage auf ein Angebot der Kategorie BOAT: die Nummern der aktiven Stücke dieses Anbieters und Typs) 
- Modify: `documentation.yaml` (Query-Parameter), Client, `frontend/src/components/event/competition/excecution/FinalizeRegistrations.tsx` (zweite Checkbox „Startnummern nach Bootsnummern vergeben", nur sichtbar, wenn die Veranstaltung Anbieter hat: `getEventMaterialProviders` → Liste nicht leer; Hinweis mit Summe `openRequests > 0`: `event.action.finalizeRegistrations.material.openRequestsHint`)

**Interfaces:**
- Produces:

```kotlin
object TeamNumberAlignment {
    /**
     * Verteilt Startnummern innerhalb EINES Wettkampfs. rented: Meldungen mit bestätigtem Mietboot und den Bootsnummern
     * ihres Anbieters/Typs; own: Meldungen ohne Mietboot; taken: bereits vergebene Nummern (keepNumbers).
     * Regel (Spec Abschnitt 8): Mietteams zufällig auf die freien Bootsnummern; eigene Boote von 1 aufwärts auf Nummern,
     * die keine Bootsnummer sind; überzählige Mietteams auf freie Nummern oberhalb der höchsten Bootsnummer.
     */
    fun align(rented: Map<UUID, List<Int>>, own: List<UUID>, taken: Set<Int>, random: Random): Map<UUID, Int>
}
```

- [ ] **Step 1: Test**

```kotlin
class TeamNumberAlignmentTest {
    @Test fun rentedTeamsGetBoatNumbers() {
        val r = TeamNumberAlignment.align(mapOf(a to listOf(1,2,3), b to listOf(1,2,3)), listOf(c, d), emptySet(), Random(1))
        assertTrue(r[a] in 1..3 && r[b] in 1..3 && r[a] != r[b])
        assertEquals(setOf(4, 5), setOf(r[c], r[d]))      // eigene Boote meiden die Bootsnummern 1..3
    }
    @Test fun overflowRentedGoAboveFleet() {
        val r = TeamNumberAlignment.align(mapOf(a to listOf(1,2), b to listOf(1,2), c to listOf(1,2)), listOf(d), emptySet(), Random(1))
        val overflow = listOf(a, b, c).map { r[it]!! }.single { it > 2 }
        assertTrue(overflow > 2); assertEquals(3, r[d])   // d nimmt die erste Nicht-Bootsnummer, das überzählige Mietteam die nächste darüber
    }
    @Test fun takenNumbersAreSkipped() {
        val r = TeamNumberAlignment.align(mapOf(a to listOf(1,2,3)), listOf(b), setOf(1, 4), Random(1))
        assertTrue(r[a] in setOf(2, 3)); assertEquals(5, r[b])
    }
}
```

- [ ] **Step 2: Umsetzen.** In `finalizeRegistrations` je Wettkampf: mit `alignMaterialNumbers` die Meldungen in `rented`/`own` teilen (Map aus `MaterialService.boatNumbersForRegistrations`), `taken` = vorhandene Nummern bei `keepNumbers`, sonst leer; Ergebnis wie bisher in `record.teamNumber` schreiben. Ohne Schalter bleibt der alte Weg unverändert.

- [ ] **Step 3: Grün (voller Lauf), Frontend-Checkbox, Commit** `"Fixierung: Startnummern nach Bootsnummern vergeben"`

---

### Task 4.3: Frontend-Logik: Konflikte und Zuteilung nach Startnummer

**Files:**
- Create: `frontend/src/components/material/conflicts.ts`, `conflicts.test.ts`, `assignByStartNumber.ts`, `assignByStartNumber.test.ts`, `effectiveAssignments.ts`, `effectiveAssignments.test.ts`

**Interfaces:**
- Produces:

```ts
// effectiveAssignments.ts - wirksames Stück je Anfrage und Lauf: Ausnahme je Lauf schlägt Grundzuteilung.
export type EffectiveAssignment = {requestId: string; matchId: string; itemIds: string[]; isException: boolean}
export const effectiveAssignments = (requests: MaterialOverviewRequestDto[], matches: MaterialOverviewMatchDto[]): EffectiveAssignment[]
//   je Anfrage: Läufe = matches, deren registrationIds die Meldung enthalten; itemIds = Ausnahmen für diesen Lauf, sonst Grundzuteilungen (competitionMatch == null)

// conflicts.ts
export type ConflictKind = 'OVERLAP' | 'CHANGEOVER' | 'OUTAGE' | 'RETIRED'
export type MaterialConflict = {kind: ConflictKind; itemId: string; matchIds: string[]; requestIds: string[]}
export const DEFAULT_MATCH_MINUTES = 15   // ohne endTime gilt ein Lauf als 15 Minuten lang (Entscheidung, siehe Spec Abschnitt 9)
export const findConflicts = (effective: EffectiveAssignment[], matches: MaterialOverviewMatchDto[], items: MaterialOverviewItemDto[], changeoverMinutesByRequest: Record<string, number>): MaterialConflict[]
//   OVERLAP: zwei Läufe desselben Stücks, deren Fenster [start, end) sich schneiden (rot)
//   CHANGEOVER: Abstand zwischen end des früheren und start des späteren < changeover (gelb); Läufe ohne startTime werden übersprungen
//   OUTAGE: Lauf-Fenster schneidet ein outage-Fenster des Stücks (until null = offen) (rot)
//   RETIRED: Stück status RETIRED (rot)
export const severityOf = (kind: ConflictKind): 'error' | 'warning'

// assignByStartNumber.ts
export type ProposedAssignment = {requestId: string; entries: {materialItem: string; competitionMatch: null}[]}
export const assignByStartNumber = (requests: MaterialOverviewRequestDto[], items: MaterialOverviewItemDto[]): ProposedAssignment[]
//   für jede CONFIRMED-Anfrage ohne Grundzuteilung: Stück mit number == teamNumber, materialType == request.materialType, status ACTIVE; bei count > 1 nur das erste Stück per Nummer, Rest bleibt offen
export const deviatesFromStartNumber = (request: MaterialOverviewRequestDto, items: MaterialOverviewItemDto[]): boolean
//   true, wenn eine Grundzuteilung existiert und keines ihrer Stücke die Nummer teamNumber trägt
```

- [ ] **Step 1: Tests** (je Funktion drei bis fünf Fälle: Ausnahme schlägt Grundzuteilung; Überlappung bei gleicher Startzeit; Wechselzeit 30 bei Abstand 20 → CHANGEOVER, bei 45 keine; Ausfall offen ab Zeitpunkt trifft späteren Lauf, nicht früheren; assignByStartNumber überspringt RETIRED und falschen Typ; deviates true/false)
- [ ] **Step 2: Umsetzen, `npm test`, Commit** `"Materialvermietung: Konfliktprüfung und Zuteilung nach Startnummer als reine Logik"`

---

### Task 4.4: Frontend: Reiter „Anfragen" und „Einteilung"

**Files:**
- Create: `frontend/src/components/material/MaterialRequestsPanel.tsx` (Tabelle mit Filter Status/Materialart, Aktionen bestätigen/Warteliste/ablehnen mit Notiz-Dialog, Mehrfachauswahl „alle offenen bestätigen", Kopf je Angebot „bestätigt / offen / Warteliste von geplant" aus `overview.requests` gezählt; Hervorhebung der ältesten WAITLISTED-Anfrage je Angebot, sobald bestätigte Menge < geplant)
- Create: `frontend/src/components/material/MaterialAssignmentPanel.tsx` (Umschalter „nach Team" / „nach Materialstück"; Knopf „Nach Startnummer zuteilen" → `assignByStartNumber` → je Vorschlag `setMaterialAssignments`; manuelle Zuteilung per Autocomplete der passenden Stücke; Ausnahme je Lauf über `MaterialExceptionDialog.tsx`; Konflikte aus `findConflicts` als Chips rot/gelb an Zeile und Stück; Abweichung Nummer ≠ Startnummer als Chip `material.assignment.deviates`)
- Create: `frontend/src/components/material/MaterialExceptionDialog.tsx`, `frontend/src/components/material/useMaterialOverview.ts` (`useFetch(getMaterialOverview)` + `reload`, geteilt von allen Reitern)
- Modify: `MaterialDashboardPage.tsx` (Panels einhängen, Hinweis „coming soon" für requests/assignment entfernen), i18n `material.requests.*`, `material.assignment.*`, `material.conflict.*`
- Modify: `documentation.yaml`/Client für 4.1 und 4.2 (operationIds `getMaterialOverview`, `decideMaterialRequest`, `setMaterialAssignments`; Schemas aus 4.1) — **zuerst** erledigen, sonst fehlen die Typen

- [ ] **Step 1: Yaml + generate + build**
- [ ] **Step 2: Panels bauen.** Sicht „nach Materialstück": je Stück die Läufe aus `effectiveAssignments` zeitlich sortiert, Zeile „{startTime} · #{teamNumber} {clubName} · {competitionIdentifier}", Konflikt-Chips; ohne Zeitplan (alle startTime null) nur Teams.
- [ ] **Step 3: `npm test`, `build`, eslint, Commit** `"Materialvermietung: Reiter Anfragen und Einteilung im Anbieter-Dashboard"`

**Schritt 4 abgeschlossen, wenn:** der Anbieter Anfragen bestätigt, mit einem Klick nach Startnummer zuteilt, Konflikte sieht und je Lauf eine Ausnahme setzt; der Veranstalter fixiert mit dem Schalter und die Mietteams tragen Bootsnummern.

---

# Schritt 5: Schäden und Ausfall

### Task 5.1: Backend: Schadensakte, Fotos, CSV

**Files:**
- Create: `app/material/entity/MaterialDamageDto.kt`, `MaterialDamageRequest.kt`, `MaterialDamagePhotoDto.kt`, `MaterialDamageSort.kt`; `app/material/control/MaterialDamageRepo.kt` (erweitern), `MaterialDamagePhotoRepo.kt`, `MaterialDamagePhotoDataRepo.kt`
- Modify: `MaterialService.kt`, `material.kt` (Multipart-Route nach `eventDocument.kt`-Muster: erst `receiveMultipart` außerhalb, dann `respondComprehension`), `MaterialError` (+ `DamageNotFound`, `PhotoNotFound`, `PhotoTooLarge`, `InvalidOutageWindow`), `afterMigrate.sql` (Sicht `material_damage_view`: Schaden + Stück + Typ + verursachende Meldung mit Verein/Wettkampf + Fotoanzahl)
- Test: `MaterialDamageServiceTest.kt`

**Interfaces:**
- Produces:

```kotlin
data class MaterialDamageDto(val id: UUID, val materialItem: UUID, val itemLabel: String, val itemNumber: Int?, val materialTypeName: String, val reportedAt: LocalDateTime, val reportedByName: String?, val description: String, val severity: MaterialDamageSeverity, val status: MaterialDamageStatus, val causedByRegistration: UUID?, val causedByTeam: String?, val causedByClub: String?, val causedByCompetition: String?, val outOfServiceFrom: LocalDateTime?, val outOfServiceUntil: LocalDateTime?, val repairedAt: LocalDateTime?, val photos: List<MaterialDamagePhotoDto>)
data class MaterialDamagePhotoDto(val id: UUID, val name: String, val contentType: String, val createdAt: LocalDateTime)
class MaterialDamageRequest(val materialItem: UUID, val reportedAt: LocalDateTime, val description: String, val severity: MaterialDamageSeverity, val status: MaterialDamageStatus, val causedByRegistration: UUID?, val outOfServiceFrom: LocalDateTime?, val outOfServiceUntil: LocalDateTime?, val repairedAt: LocalDateTime?) : Validatable
//   Validierung: until >= from (InvalidOutageWindow, 400); status REPAIRED verlangt repairedAt; REPAIRED mit offenem until setzt until = repairedAt (Spec Abschnitt 10)
enum class MaterialDamageSort : Sortable { REPORTED_AT, ITEM, SEVERITY, STATUS }
const val MATERIAL_PHOTO_MAX_BYTES = 10L * 1024 * 1024

fun MaterialService.pageDamages(providerId: UUID, params: PaginationParameters<MaterialDamageSort>, eventId: UUID? = null, itemId: UUID? = null): App<Nothing, ApiResponse.Page<MaterialDamageDto, MaterialDamageSort>>
//   eventId filtert über caused_by_registration -> competition -> event ODER reported_at innerhalb der Veranstaltungstage
fun MaterialService.addDamage(providerId, request, userId): Created; getDamage; updateDamage; addPhotos(providerId, damageId, uploads: List<File>): NoData (PhotoTooLarge je Datei); getPhoto(providerId, photoId): ApiResponse.File; deletePhoto
fun MaterialService.damagesCsv(eventId: UUID, providerId: UUID): App<MaterialError, ApiResponse.File>   // Spalten: Stück, Nummer, Materialart, Gemeldet am, Schwere, Status, Beschreibung, Verursacher Team, Verein, Wettkampf, Ausfall von, Ausfall bis, Repariert am
```

Routen: `GET/POST /materialProvider/{providerId}/damage` (Query `eventId`, `itemId`), `GET/PUT /materialProvider/{providerId}/damage/{damageId}`, `POST …/damage/{damageId}/photo` (multipart `files`), `GET/DELETE /materialProvider/{providerId}/photo/{photoId}`, `GET /event/{eventId}/materialProvider/{providerId}/damage/csv`. Die Ausfallfenster fließen bereits über `MaterialOverviewItemDto.outages` (4.1) in die Übersicht — dort `material_damage` mit `status = 'REPORTED'` und `out_of_service_from is not null` lesen.

- [ ] **Step 1: Tests** (`addDamageWithOutageAppearsInOverviewOutages`, `repairClosesOpenWindow`, `photoTooLargeIsRejected` mit 11-MB-ByteArray, `invalidWindowIsRejected`)
- [ ] **Step 2: Umsetzen, grün (clean test), Commit** `"Materialvermietung: Schadensakte mit Ausfallfenster, Fotos und CSV"`

---

### Task 5.2: API-Vertrag Schritt 5 und Bild-Verkleinerung

**Files:** `documentation.yaml` (`getMaterialDamages`, `addMaterialDamage`, `getMaterialDamage`, `updateMaterialDamage`, `addMaterialDamagePhotos` (multipart wie `addDocuments`), `getMaterialDamagePhoto`, `deleteMaterialDamagePhoto`, `getMaterialDamagesCsv`; Schemas `MaterialDamageDto`, `MaterialDamageRequest`, `MaterialDamagePhotoDto`, `MaterialDamageSeverity`, `MaterialDamageStatus`), Client; Create `frontend/src/utils/resizeImage.ts` + `resizeImage.test.ts`

**Interfaces:**
```ts
// resizeImage.ts - verkleinert ein Bild im Browser auf höchstens maxEdge Pixel Kantenlänge, JPEG 0.85. Nicht-Bilder unverändert zurück.
export const resizeImage = (file: File, maxEdge = 2000): Promise<File>
// reine, testbare Hilfsfunktion:
export const targetSize = (width: number, height: number, maxEdge: number): {width: number; height: number}   // proportional, nie vergrößern
```
- [ ] Test für `targetSize` (3000×2000 → 2000×1334; 800×600 bleibt), Umsetzung mit `createImageBitmap` + `OffscreenCanvas`/`canvas.toBlob`, Yaml, generate, build, Commit `"Materialvermietung: API-Vertrag für Schäden, Bildverkleinerung im Browser"`.

---

### Task 5.3: Frontend: Reiter „Schäden", Ausfall-Dialog mit Ersatzwahl, Flotte-Verknüpfung

**Files:**
- Create: `frontend/src/components/material/MaterialDamagesPanel.tsx` (Tabelle je Veranstaltung: Stück, Nummer, gemeldet, Schwere, Status, Verursacher; Filter Status; Knopf „Schaden melden"; CSV-Export-Knopf), `MaterialDamageDialog.tsx` (Felder laut Request; Verursacher-Vorschlag aus `effectiveAssignments` zum Zeitpunkt `reportedAt`; Schwere-Vorschlag setzt Fenster: TOTAL → from=reportedAt, until leer; MINOR → keins; Fotos per `SelectFileButton` + `resizeImage`), `MaterialOutageImpactDialog.tsx` (nach dem Speichern eines Schadens mit Fenster: betroffene Einträge aus `findConflicts(kind === 'OUTAGE')` für dieses Stück; je Lauf Autocomplete „Ersatzstück" (frei im Fenster, richtiger Typ, Nummerngleichheit markiert) → `setMaterialAssignments` mit Ausnahme-Eintrag; „später" schließt nur)
- Create: `frontend/src/components/material/affectedByOutage.ts` + `.test.ts`: `affectedByOutage(effective, matches, itemId, from, until): {requestId, matchId}[]` und `replacementCandidates(items, effective, matches, matchId, materialType, teamNumber): {item, sameNumber: boolean}[]`
- Modify: `MaterialAssignmentPanel.tsx` (Hinweis „Grundzuteilung wieder möglich" mit Knopf „Ausnahme entfernen", wenn ein Ausnahme-Lauf keinen OUTAGE-Konflikt mehr hätte), `MaterialFleetPage.tsx` (Spalte „offene Schäden" verlinkt auf `/material/event/$eventId?tab=damages` ist ohne Event nicht sinnvoll → stattdessen Dialog „Schaden melden" direkt aus der Flotte, ohne Veranstaltungsbezug), `MaterialDashboardPage.tsx`, i18n `material.damage.*`, `material.severity.*`, `material.damageStatus.*`

- [ ] Tests für `affectedByOutage`/`replacementCandidates`, Umsetzung, `npm test`/`build`/eslint, Commit `"Materialvermietung: Schäden melden, Ausfall mit Ersatz je Lauf"`

**Schritt 5 abgeschlossen, wenn:** ein Totalschaden mit offenem Fenster die betroffenen Läufe zeigt, je Lauf ein Ersatz gesetzt wird, die Einteilung die Ausnahmen rot/gelb frei markiert und der CSV-Export läuft.

---

# Schritt 6: Anzeigen

### Task 6.1: Sicht und Feld `material` an den Team-DTOs

**Files:**
- Modify: `afterMigrate.sql` — Sicht `effective_material_for_match_team`:

```sql
-- Wirksames Materialstück je Lauf-Team: Ausnahme je Lauf schlägt die Grundzuteilung. Nur bestätigte Anfragen,
-- nur Kategorie BOAT erreicht die Anzeigen (Spec Abschnitt 11); OTHER bleibt Mein Event und Dashboard vorbehalten.
create view effective_material_for_match_team as
select cmt.id                                                  as competition_match_team,
       mi.id                                                   as material_item,
       mi.number,
       mi.label,
       mt.category,
       (mi.number is null or mi.number <> cr.team_number)      as deviates_from_start_number
from competition_match_team cmt
         join competition_registration cr on cr.id = cmt.competition_registration
         join material_request mr on mr.competition_registration = cr.id and mr.status = 'CONFIRMED'
         join material_offer mo on mo.id = mr.material_offer
         join material_type mt on mt.id = mo.material_type and mt.category = 'BOAT'
         join lateral (
    select ma.material_item
    from material_assignment ma
    where ma.material_request = mr.id
      and (ma.competition_match = cmt.competition_match or ma.competition_match is null)
    order by (ma.competition_match is null)     -- Ausnahme (false) vor Grundzuteilung (true)
    limit 1
    ) chosen on true
         join material_item mi on mi.id = chosen.material_item;
```

(Drop oben im Drop-Block; Sicht muss vor `competition_match_team_with_registration` und `startlist_team` angelegt werden, falls diese sie joinen.)

- Create: `app/material/entity/MaterialForTeamDto.kt`: `data class MaterialForTeamDto(val number: Int?, val label: String, val category: MaterialCategory, val deviatesFromStartNumber: Boolean)`
- Modify: `app/liveDashboard/entity/LiveDashboardDto.kt` (`LiveDashboardTeamDto.material: MaterialForTeamDto?`), `LiveDashboardRepo.getTeams` (Left Join auf die Sicht), `LiveDashboardService.buildTeamDto`
- Modify: `app/eventInfo/entity/UpcomingMatchTeamInfo.kt`, `RunningMatchTeamInfo.kt`, `MatchResultTeamInfo` (+ `material`), `CompetitionMatchTeamRepo.getTeamsForUpcomingMatch/getTeamForRunningMatch/getTeamsForMatchResult` (Left Join), `AthleteBoardDto.kt` (`AthleteBoardTeam.material`, `AthleteBoardResultTeam.material`), `eventInfo/control/Conversions.kt` (durchreichen)
- Modify: `startlist_team`-Sicht (+ `material_number`, `material_label`, `material_deviates`), `CompetitionMatchData.CompetitionMatchTeam` (+ `material`), `StartlistTeamRecord.toData`
- Modify: `MyEventDto.kt` (`MyEventMatchDto`-Team + `material`), `MyEventRepo`
- Modify: `documentation.yaml` (Schema `MaterialForTeamDto`, Feld `material` optional an `LiveDashboardTeamDto`, `UpcomingMatchTeamInfo`, `RunningMatchTeamInfo`, `MatchResultTeamInfo`, `AthleteBoardTeam`, `AthleteBoardResultTeam`, `CompetitionMatchTeam`-Schema der Startliste falls vorhanden, Mein-Event-Team), Client
- Test: `EffectiveMaterialViewTest.kt` (Grundzuteilung sichtbar; Ausnahme je Lauf gewinnt; `deviates` true bei Nummer ≠ team_number; OTHER-Kategorie erscheint nicht)

- [ ] Test, Umsetzung, `clean test`, generate, build, Commit `"Anzeigen: wirksames Materialstück je Lauf-Team an allen Team-DTOs"`

---

### Task 6.2: Darstellungsregel und Mein Event je Lauf

**Files:**
- Create: `frontend/src/components/material/materialLabel.ts` + `.test.ts`
- Modify: `frontend/src/components/results/myEvent/MyEventMatchList.tsx` (je Lauf hinter der Startnummer `materialLabel(...)`, Abweichung mit `<Chip color="warning">`), `MyEventMaterial.tsx` (Block bleibt, ergänzt um „je Lauf: …")

**Interfaces:**
```ts
export type MaterialLabelMode = 'deviationsOnly' | 'always'
// Liefert null, wenn nichts anzuzeigen ist (Regel Spec Abschnitt 11): gleiche Nummer -> null; Abweichung -> label; eigenes Boot -> null bzw. 'own' im Modus always; Kategorie OTHER -> null
export const materialLabel = (material: MaterialForTeamDto | null | undefined, mode: MaterialLabelMode): {text: string; deviates: boolean} | 'own' | null
```
- [ ] Tests (fünf Fälle aus der Regel), Umsetzung, Commit `"Mein Event: Materialstück je Lauf mit Abweichungshinweis"`

---

### Task 6.3: Sprecher- und Live-Dashboard

**Files:**
- Modify: `frontend/src/components/event/deviceSettings.ts` (+ `DASHBOARD_SHOW_MATERIAL_KEY = 'live_dashboard_show_material'`), `DashboardSettingsPopover.tsx` (Schalter `event.liveDashboard.settings.showMaterial`), `LiveDashboardMatchCard.tsx` (hinter Startnummer: `materialLabel(team.material, showMaterial ? 'always' : 'deviationsOnly')`), `LiveDashboardTeamDialog.tsx`
- Modify: `frontend/src/components/speaker/speakerSettings.ts` (+ `showMaterial: boolean`, Default false), `SpeakerSettingsDialog.tsx`, `speakerData.ts` (`SpeakerTeam.material`), `SpeakerMatchPanel.tsx`
- i18n
- [ ] Umsetzung, `npm test`/`build`, Commit `"Sprecher- und Live-Dashboard zeigen Bootsabweichungen"`

---

### Task 6.4: Boards und Startlisten-PDF

**Files:**
- Modify: `app/eventInfo/entity/BoardConfig.kt` (`BoardElement.showMaterial: Boolean?`), `frontend/src/components/event/board/BoardEditor.tsx` (Schalter), `BoardMatchDetailElement.tsx` (`teamRow`: Label anhängen; in der Kürzung fällt es zuerst — dort, wo `showCrew` reduziert wird, `showMaterial` als erstes abschalten), `documentation.yaml` (`BoardElement.showMaterial`)
- Modify: `CompetitionExecutionService.buildPdf` (Z. ~3417: Spalte „Boot" nur, wenn `data.teams.any { it.material?.deviatesFromStartNumber == true }` oder Query `showMaterial=true`), `buildCsv` (Spalte immer), Route/Yaml für den optionalen Query-Parameter `showMaterial` an `getStartList`
- [ ] Umsetzung, Backend-Test für `buildPdf`-Spaltenentscheidung (falls es Tests für `buildPdf` gibt: erweitern; sonst reine Funktion `startListShowsMaterial(teams, forced): Boolean` mit Test), Commit `"Boards und Startlisten zeigen Bootsabweichungen"`

---

### Task 6.5: Livestream-Grafiken

**Files:**
- Modify: `app/stream/entity/StreamSceneDtos.kt` (`StreamGraphicSettings.showMaterial: Boolean?`), `frontend/src/components/event/stream/StreamGraphicConfigDialog.tsx` (Schalter), `frontend/src/components/event/board/streamOverlay/StreamBoatRow.tsx` (Prop `materialText?: string`, gerendert nur in der Langform; bei `showSecondary === false` weglassen), `RunningLowerThird.tsx`, `ResultPanel.tsx`, `UpcomingPanel.tsx`, `documentation.yaml`
- [ ] Umsetzung, `npm test`/`build`, Commit `"Livestream-Grafiken zeigen Bootsabweichungen in der Langform"`

**Schritt 6 abgeschlossen, wenn:** ein Team mit Boot 7 und Startnummer 3 überall als „#3 · Boot 7" erscheint, ein Team mit Boot 3 und Startnummer 3 nirgends zusätzlich, und der Schalter „Material immer zeigen" je Anzeige „eigenes Boot" einblendet.

---

# Abschluss

### Task 7: Seed, Testkatalog, Gesamtlauf

**Files:**
- Create: `docs/seeds/seed-material.sql` (Präfix `5eed0009-…`; Anbieter „Bootshaus Nord", Nutzer `material@test.de` mit Rolle Materialanbieter, Materialarten C1x/C2x/C4x+ (BOAT) und Skull-Paar (OTHER), acht Boote 1–8, Einladung zur Veranstaltung `5eed0001-0000-0000-0000-000000000001` aus `docs/seeds/seed-dm-coastal-2026.sql`, Angebote, Bedarf an drei Wettkämpfen, vier Anfragen in verschiedenen Status, eine Zuteilung mit Abweichung, ein Totalschaden mit offenem Fenster; mehrfach ausführbar per `on conflict do nothing`)
- Create: `docs/testkatalog-materialvermietung.md` (Handtests Block A Anmeldung, B Dashboard, C Fixierung, D Schäden, E Anzeigen — je Fall Vorbedingung, Schritte, Erwartung)
- [ ] Voller Backend-Lauf `./mvnw -o clean test -Ddatabase.url=…`, `npm test`, `npm run build`, `npm run lint` (Fehleranzahl ≤ Baseline 28 Dateien), Commit `"Materialvermietung: Seed und Testkatalog"`
