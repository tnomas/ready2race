# Materialvermietung: Befund zur Übernahme

Stand 13.11.2026. Geprüft wurde der Zweig `claude/boat-planning-dashboard-2b3537` gegen den Zweig
`claude/app-review-optimization-2d57f8`, ausschließlich lesend (git log, show, diff, grep,
merge-tree). **Es wurde nichts übernommen, gemergt oder gebaut; kein Test lief, nichts davon wurde
in der laufenden App gesehen.** Der Zweig `claude/boat-planning-dashboard-2b3537` liegt **nur
lokal**: kein Remote-Zweig enthält seine Commits, es gibt keine Sicherung auf `fork`.
Kennzeichnung: **[Code]** im Code bzw. in git belegt, **[Doku]** aus Spec, Plan, Testkatalog oder
Commit-Texten geschlossen.

## Urteil

**Im Kern fertig gebaut, mit Lücken.** Alle sechs Umsetzungsschritte der Spec sind als Code
vorhanden. Kein Handtest ist belegt. Eine **unveränderte Übernahme wäre gefährlich**: Die
Migrationsnummer ist doppelt belegt, und die Rollen-UUID der neuen Rolle ist im aktuellen Stand die
Superadmin-Rolle.

Belege:
1. [Code] 37 Commits (07.09. bis 09.09.2026), 225 Dateien, +21 244/−252. Backend-Domäne
   `app/material` mit Service (988 Zeilen), Routen (475), neun Repos und rund 25 DTOs; 14
   Backend-Testdateien und 8 Vitest-Dateien. Jeder Spec-Abschnitt hat Code.
2. [Code] Die letzten Commits sind Review-Korrekturen, kein Aufbau mehr (z. B. `distinct on` in der
   Sicht, Rückzug nach Vergabeschluss gesperrt); davor Seed und Testkatalog.
3. [Doku] Der Testkatalog des Zweigs (`docs/testkatalog-materialvermietung.md`) hat die Blöcke A bis
   F mit rund 35 Fällen und keinen einzigen Haken; die Checkboxen im Plan sind ebenfalls offen.

## Umfang [Code]

- Abzweig: `merge-base` = `91d6dcf1` (03.09.2026). Der Zweig ist 85 Commits hinter `main` und trägt 37 eigene Commits; der aktuelle Stand hat
  inzwischen 160 Commits, die er nicht kennt.
- Migration `V202609071000__material_rental.sql` (eine Datei, in 8 Commits nachträglich geändert):
  11 Tabellen, die Spalte `app_user.material_provider` und ein Constraint-Trigger
  (`A0_material_request_orphan_cleanup`); `material_request` hat absichtlich keinen Fremdschlüssel
  auf `competition_registration`. Sichten nur in `afterMigrate.sql`, darunter
  `effective_material_for_match_team`.
- API: `documentation.yaml` +1652 Zeilen, `api/src/material.tsp` neu; die Zweitbeschreibung von
  `eventRegistration.tsp` und `event.tsp` fehlt, obwohl die Spec sie nennt.
- Rechte: `Resource.MATERIAL` (READ/UPDATE × OWN/GLOBAL) und die Rolle „Materialanbieter"
  (`00000000-…-0003`), vergeben nur über die Anbieter-Zuordnung.
- Frontend: Seiten unter `pages/material/` (Veranstaltungswahl, Dashboard, Flotte, Admin), 26
  Komponenten unter `components/material/`, Erweiterungen in Meldung, Mein Event, Sprecher,
  Live-Dashboard, Boards, Stream-Grafiken und Startliste; 212 neue i18n-Schlüssel in de, en, da.
- Docs: Spec `docs/superpowers/specs/2026-09-07-materialvermietung-design.md`, Plan, Testkatalog,
  Seed `docs/seeds/seed-material.sql`. **Kein ADR.**

## Fertigstellungsgrad

**Ablauf [Code]:** Bedarf am Wettkampf, Einladung des Anbieters, Angebot, Anfrage im Meldeformular mit
Ampel, Entscheidung des Anbieters (bestätigen, Warteliste, ablehnen), Zuteilung (auch nach
Startnummer, Ausnahme je Lauf), Schaden mit Ausfallfenster und Ersatzwahl, Anzeige in Mein Event und
auf allen Anzeigen, Rückzug durch den Verein mit Mail an den Anbieter. Für die Veranstaltung:
Anbieter ein- und ausladen, offene Anfragen und Schäden als Zahlen, Hinweis vor der Fixierung,
Schalter „Startnummern nach Bootsnummern".

**Bewusst nicht vorhanden [Doku]:** Rückgabe und Abrechnung (Spec Abschnitt 3 schließt Abrechnung
über die Veranstalter-Rechnung, Übergabe-Protokoll am Steg, Schadenskosten und automatisches
Nachrücken von der Warteliste aus). Ebenso nicht gebaut, abweichend von der Spec: Einladung neuer
Nutzer mit Anbieter-Wahl.

**Lücken im Code:** Einziges TODO in `MaterialService.kt` (Rückzugs-Mail immer deutsch, weil Anbieter
kein Sprachfeld haben). Keine leeren Handler, keine unverdrahteten Routen. Vom Verein sieht der
Anbieter nur die Kontakt-E-Mail.

## Qualität (Stichprobe) [Code]

- `KIO.fail` ohne `!`: kein Befund. Views nur in `afterMigrate.sql`: kein Befund. Transaktionen und
  Validierung vor dem Schreiben: kein Befund. Rechte je Route inklusive Anbieterprüfung bei OWN:
  kein Befund.
- Pagination: Anbieter, Arten, Stücke und Schäden sind paginiert; Einladungen, Angebote und die
  Dashboard-Übersicht nicht (bewusste Ein-Aufruf-Übersicht, leichte Abweichung von der Regel).
- **`EventChangeMarker` (mittel):** Unter `app/material` wird der Marker nirgends gebumpt, obwohl
  `effective_material_for_match_team` Boards, Mein Event, Live-Läufe, Startliste und Stream speist
  und deren Caches nur bis zum nächsten Marker gelten. Nicht gebumpt wird bei `setAssignments`
  (auch Ersatzwahl und Ausnahmen), `decideRequest` (Rücknahme von CONFIRMED) und beim Rückzug. Eine
  Bootsänderung erscheint erst nach Ablauf der TTL oder einer fremden Änderung (Regel in AGENTS.md §4).
- **Startnummer (zu klären):** Die Sicht vergleicht `mi.number <> cr.team_number`; im aktuellen
  Stand ist die Startnummer `start_number` je Boot und Lauf (Setzposition bzw. Rang in Folgerunden),
  die von `team_number` abweichen kann. Das Flag „Abweichung" und die angezeigte Nummer können
  auseinanderlaufen.
- **Eingriff in die Meldung:** Commit `62e6fb2a` ändert `EventRegistrationRepo` (+207): Meldungs-IDs
  bleiben beim erneuten Speichern erhalten; der Waisen-Trigger hängt daran. Zentraler Pfad, braucht
  einen vollen Regressionslauf.

## Mergebarkeit

`git merge-tree` meldet **23 Dateien mit Konflikten**.

**Schwer (Fachkonflikt mit dem Rechtekonzept Schritt 1, `V202609081000`):**
- `database/static.kt`: Die Rolle `00000000-…-0003` ist im aktuellen Stand `SUPERADMIN_ROLE`; der
  Zweig vergibt dieselbe UUID als `MATERIAL_PROVIDER_ROLE`. `ensureMaterialProviderRole` würde
  Superadmin vergeben und Nutzern ohne Anbieter bei jedem Update wieder entziehen. Der Seed
  `seed-material.sql` macht `material@test.de` zum Superadmin. Beide Konstanten ließen sich
  übersetzen, der Fehler bliebe still. **Kritisch.**
- `initializeDatabase.kt`, `AppUserService.kt`, `AppUserHasRoleRepo.kt`, `pages/user/UserPage.tsx`
  (7 Blöcke): Der aktuelle Stand sät Rollen über `JobSeeder.sync`, behält mit `deleteManaged` nur
  USER und CLUB_REPRESENTATIVE und verlangt `UpdateStaffGlobal` (`checkAssignable`). Der Zweig nutzt
  `deleteExceptSystem` und `PUT /user/{id}/materialProvider` nur mit `UpdateUserGlobal`; das umgeht
  die STAFF-Regel, und `deleteManaged` entfernte die Materialrolle bei jeder Rollenänderung.
- `Privilege.kt`, `documentation.yaml`, `privileges.ts`, `types.gen.ts` (neu erzeugen, nicht von
  Hand lösen), `afterMigrate.sql` (`app_user_with_privileges` nutzt `every_role_with_privileges`,
  der Zweig `role_with_privileges` plus Join auf `material_provider`).

**Mittel (Frontend-Umbauten):** `routes.tsx` (Seiten laden jetzt lazy), `SidebarContent.tsx`
(Verwaltungsblock), `EventPage.tsx` (Bereichsmodell; die Karte `EventMaterialProvidersCard` hing im
Tab „Organisation", sichtbar nur mit `readEvent && readUserGlobal`), `CompetitionExecution.tsx`
(`runDownload` gegen `showMaterial`), `SpeakerMatchPanel.tsx`, `CompetitionPage.tsx`,
`UserProvider.tsx`. **Leicht:** i18n de/en/da, `api/main.tsp`, `competitionExecution.kt`,
`StreamSceneDtos.kt`.

**Migration (kritisch, ohne git-Konflikt):** `V202609071000` ist bereits durch
`V202609071000__timing_device_token_haertung.sql` belegt; Flyway bricht bei doppelter Version ab.
Die Material-Migration braucht eine Nummer **nach** `V202609081000` (sie setzt auf dem Rollenmodell
auf), im aktuellen Stand nach `V202611132020`; vorher `ls …/db/migration | tail` prüfen.

**Einhängen in das Bereichsmodell (Vorschlag):** Einladung und Angebotsübersicht des Veranstalters
als Karte im Bereich `settings` (Vorbereitung), alternativ ein eigener Bereich `material` in
`eventSections.ts` (sichtbar mit `readEventGlobal`, `case` in `EventPage.tsx`, Beschriftungen in
de/en/da). Anbieter-Dashboard `/material` als Haupteintrag nur mit READ MATERIAL OWN; `/material/admin`
im Verwaltungsblock der Seitenleiste.

## Lücken nach Schwere

1. **Kritisch:** Rollen-UUID `…0003` kollidiert mit `SUPERADMIN_ROLE` (auch im Seed).
2. **Kritisch:** Migrationsversion `V202609071000` doppelt belegt.
3. **Hoch:** Rollenvergabe umgeht die STAFF-/Teilmengen-Regel; `deleteManaged` entfernt die Rolle.
4. **Hoch:** Alle Handtests A–F offen; nichts wurde in der App gesehen.
5. **Hoch:** Der Zweig existiert nur lokal, ohne Remote-Sicherung.
6. **Mittel:** Kein `EventChangeMarker.bump` bei Zuteilung, Entscheidung und Rückzug.
7. **Mittel:** Semantik der Startnummer (`team_number` gegen `start_number`) zu klären.
8. **Mittel:** Eingriff in den Speicherpfad der Meldung (stabile IDs, Waisen-Trigger).
9. **Leicht:** kein ADR; TypeSpec für `eventRegistration`/`event` fehlt; Rückzugs-Mail nur deutsch;
   nur Kontakt-E-Mail des Vereins; Testkatalog nicht am Konventionsort; Einladung neuer Nutzer ohne
   Anbieter-Wahl.

## Schrittfolge der Übernahme (nichts ausgeführt)

0. **Sichern:** `git push fork claude/boat-planning-dashboard-2b3537` bzw. ein Archiv-Tag; nur auf
   ausdrücklichen Zuruf, nie nach `origin`.
1. **Eigener Worktree** vom aktuellen Stand aus; den Stand in eine Kopie des Material-Zweigs mergen
   (erst das Ziel in den eigenen Zweig, dort Konflikte lösen und testen).
2. **Rechte und Rollen** (½–1 Tag): neue Rollen-UUID außerhalb 0000–0033 (z. B. `…0040`); Rolle als
   Job im `JobSeeder` mit passender Ebene; MATERIAL in die Admin- bzw. Superadmin-Jobs;
   `setMaterialProvider` gegen `checkAssignable`/`UpdateStaffGlobal` absichern; `deleteManaged` die
   Materialrolle schonen lassen oder sie als verwaltete Rolle führen; Seed auf die neue UUID.
3. **Migration umnummerieren** auf einen freien Stempel nach dem aktuellen Stand;
   `afterMigrate.sql` zusammenführen; alte Kopien unter `target/classes` löschen; eigene Build-DB.
4. **API:** `documentation.yaml` zusammenführen, `npm run generate` (statt `types.gen.ts` zu
   mergen), `.tsp` nachziehen.
5. **Frontend** (1 Tag): Routen auf `lazyPage`; Seitenleiste und Verwaltungsblock; Veranstalter-Karte
   im Bereichsmodell; `CompetitionExecution` mit `runDownload` und `showMaterial`; `UserPage` auf die
   neue Rollenverwaltung; i18n zusammenführen.
6. **Nachbesserungen:** `EventChangeMarker.bump` in `setAssignments`, `decideRequest` und beim
   Rückzug (über `AfterCommit`); Startnummer-Semantik entscheiden; ADR schreiben; Testkatalog an den
   Konventionsort.
7. **Verifikation** (½–1 Tag): `./mvnw clean test` mit eigener Build-DB; `npm test`,
   `npm run build`, `npm run lint`; Testzahlen wörtlich festhalten.
8. **Handtests** A–F aus dem Testkatalog im Browser (1 Tag); besonders die Rechtefälle (F) gegen das
   neue Rollenmodell.

Gesamtaufwand geschätzt **3–4 Arbeitstage**, eigener Zweig. Risiken: stille Superadmin-Vergabe, falls
die UUID übersehen wird; Regression in der Meldung durch die stabilen IDs; Konflikte in den
Anzeigen-DTOs, die im aktuellen Stand umgebaut wurden (automatisch gemergte Dateien müssen trotzdem
übersetzt und getestet werden).
