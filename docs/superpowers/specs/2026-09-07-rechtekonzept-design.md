# Design: Rechtekonzept

**Stand:** 2026-09-07
**Branch:** `claude/r2r-rechtekonzept-67714e`
**Gilt für:** Privilegien, Rollen, Zuweisungen und deren Prüfung in Backend und Frontend

## 1. Problem

Ein Privileg ist heute ein Tripel aus Aktion, Ressource und Scope. Vier Aktionen, zwei Scopes
(OWN, GLOBAL), 17 Ressourcen, 48 Privilegien. Drei statische Rollen: Admin, User,
Vereinsvertreter. Das Modell hat sich über anderthalb Jahre gut geschlagen, trägt aber die
Jobs eines Veranstaltungstags nicht mehr:

- **UPDATE EVENT ist ein Sammelrecht.** 189 Verwendungen in 38 Modulen. Wer Zeitplan schieben
  darf, darf auch Gebühren ändern, Rechnungen anlegen und Dokumentvorlagen löschen. Board und
  Stream wurden im August abgespalten, der Rest nicht.
- **UPDATE USER GLOBAL ist faktisch Admin.** Die Rollenverwaltung prüft nicht, ob man die
  vergebenen Rechte selbst besitzt. Wer Nutzer verwalten darf, kann sich eine Rolle mit allen
  Privilegien bauen und zuweisen.
- **Neue Privilegien erreichen nur die drei statischen Rollen.** Der Startcode trägt nur bei
  Admin, User und Vereinsvertreter nach. Die selbst angelegte „Schiedsrichter:in“ auf
  Produktion hatte deshalb kein Recht auf das Live-Dashboard. Jedes Release mit neuer
  Ressource braucht Handarbeit, und nichts im Produkt weist darauf hin.
- **Der Rollendialog zeigt rohe Strings** wie `UPDATE.APP_TIMING.GLOBAL`. Ohne Gruppierung,
  Übersetzung oder Beschreibung ist die Liste nur für Entwickler lesbar.
- **Rollen gelten installationsweit.** Eine Schiedsrichterin mit Recht auf das Dashboard hat
  es für alle Veranstaltungen, die je auf der Installation liegen. Ein Konto je Regatta ist der
  einzige Ausweg.
- **Lücken und Leichen.** Ummeldungen haben keinen OWN-Scope, ihre Lese-Endpunkte hängen am
  CREATE-Recht. Drei Privilegien werden nirgends geprüft. `DELETE REGISTRATION OWN` steht in
  der Vereinsrolle und tut nichts. Die Frontend-Konstanten für `DELETE REGISTRATION` tragen die
  Aktion UPDATE, was nur deshalb nicht auffällt, weil sie ungenutzt sind.
- **Frontend und Backend weichen ab.** Eine reine Zeitnahme-Rolle darf serverseitig, sieht aber
  die Timing-Kachel nicht. Zwei handgepflegte Listen (`Privilege.kt`, `privileges.ts`) müssen
  synchron bleiben.
- **Keine Doku, keine maschinenlesbare Zuordnung** von Endpunkt zu Privileg.

## 2. Zielbild

- **Jobs statt Baukasten.** Jeder Job aus Vorbereitung und Veranstaltungstag ist im Code
  definiert, mit Name, Beschreibung, Ebene und Privilegien. Der Betreiber weist Jobs zu, baut
  sie aber nicht. Neue Rechte landen automatisch beim richtigen Job.
- **Vier Ebenen, eine Leiter.** Installation, Veranstaltung, Verein, Selbst. Zwischen
  Veranstaltung und Installation bleibt Platz für den Veranstalter (Mandant), siehe Abschnitt 11.
- **Ein Recht, ein Mechanismus.** Browser und Helfer-App prüfen dieselben Privilegien. Es gibt
  keine App-Sonderrechte mehr.
- **Vergabe ohne Ausweitung.** Niemand vergibt Rechte, die er nicht selbst hat. Niemand ändert
  die eigenen Zuweisungen. Nach oben ist dicht.
- **Vereine sehen, woran sie beteiligt sind**, und melden bis Meldeschluss selbst um.
- **Lesbar und belegt.** Die Rollen-UI zeigt Privilegien mit Namen und Beschreibung. Eine
  erzeugte Matrix im Repo zeigt je Job, was er darf. Ein Test stellt sicher, dass keine Route
  ohne Prüfung online geht.
- **Generische Semantik.** Die App ist nicht nur fürs Rudern. Ressourcen und Jobs heißen
  Veranstaltung, Wettkampf, Meldung, Team, nicht Regatta, Rennen, Boot.

## 3. Nicht Teil dieses Vorhabens

- **Der Mandant.** Kein Veranstalter-Objekt, keine Veranstalter-Spalte an Veranstaltungen.
  Abschnitt 11 beschreibt, wie der spätere Umbau hier anschließt.
- **Ummeldungen am Veranstaltungstag** innerhalb eines Zeitfensters vor dem Lauf. Vereine
  melden bis Meldeschluss um, danach die Meldestelle.
- **Die Materialvermietung** selbst. Sie entsteht in einer parallelen Session und reiht sich
  als Ressource RENTAL und Job „Materialvermieter“ ein.
- **OpenAPI-Sicherheitsschemata.** Die maschinenlesbare Zuordnung Endpunkt zu Privileg kommt
  über den Routen-Test (Abschnitt 8), nicht über die handgepflegte Yaml.
- **Teilnehmerkonten.** Teilnehmer haben weiterhin kein Konto. Ihr Band bleibt ein Schlüssel,
  siehe Abschnitt 7.

## 4. Ressourcen

Die Ressource benennt einen fachlichen Bereich, nicht einen Bildschirm und nicht einen Kanal.
Der Schnitt ersetzt UPDATE EVENT als Sammelrecht und die fünf APP_-Ressourcen.

| Ressource | Deckt ab | Ebene | OWN |
|---|---|---|---|
| ADMINISTRATION | Konfiguration, WebDAV, Betrieb | Installation | nein |
| USER | Konten, Einladungen | Installation | ja (ich) |
| ROLE | Rollen, Zuweisungen, Einladung in Jobs | Installation, Veranstaltung | nein |
| CLUB | Vereine | Installation | ja |
| TEMPLATE | Wettkampf-, Aufbau-, Dokument- und Urkundenvorlagen | Installation | nein |
| EVENT | Stammdaten, Tage, Kontakte, Dokumente, Dokumenttypen, Export | Veranstalter | ja (lesend, beteiligt) |
| COMPETITION | Wettkämpfe, Kategorien, Aufbau, Gebühren, Wertungskategorien, benannte Rollen, Startlisten-Konfiguration, Pace-Referenz | Veranstalter | nein |
| REGISTRATION | Meldungen, Teilnehmer | Veranstalter | ja |
| SUBSTITUTION | Ummeldungen | Veranstalter | ja, neu |
| INVOICE | Rechnungen, Bankkonten | Veranstalter | ja (lesend) |
| TASK | Aufgaben, Schichten, Arbeitstypen | Veranstalter | nein |
| PARTICIPANT_REQUIREMENT | Bedingungen pflegen und prüfen | Veranstaltung | nein |
| EXECUTION | Zeitplan, Läufe, Startlisten, Folgerunden, Ergebnisimport, Siegerehrung | Veranstaltung | ja (lesend, beteiligt) |
| JUDGING | Strafen, Klärung, Schiedsrichter-Dashboard | Veranstaltung | nein |
| TIMING | Posten, Profile, Sequenzen, Zeitnahme-Anbindung | Veranstaltung | nein |
| RESULT | Ergebnisse, Urkunden | Veranstaltung | ja (lesend, beteiligt) |
| BOARD | Anzeigetafeln, Sprecher-Dashboard | Veranstaltung | nein |
| STREAM | Livestream-Grafiken, Regie | Veranstaltung | nein |
| PARTICIPANT_TRACKING | Check-in, Check-out, Wettkampf-Check, Waage | Veranstaltung | ja (lesend, beteiligt) |
| ACCESS_PASS | Bänder und QR-Codes zuordnen | Veranstaltung | nein |
| CATERING | Verpflegung | Veranstaltung | nein |
| RENTAL | Materialvermietung | Veranstaltung | nein |

Entscheidungen darin:

- **Die fünf APP_-Ressourcen verschwinden.** Die Helfer-App leitet ihre Modi aus
  PARTICIPANT_REQUIREMENT, ACCESS_PASS, PARTICIPANT_TRACKING, CATERING und TIMING ab. Ein
  Recht, egal ob per Browser oder per App genutzt.
- **LIVE_DASHBOARD wird JUDGING.** Benannt nach dem Job, nicht nach dem Bildschirm.
- **WEB_DAV geht in ADMINISTRATION auf.** Es ist Speicherkonfiguration.
- **EVENT bedeutet nur noch Stammdaten.** Alles Operative hat eine eigene Ressource.
- **„Veranstalter“-Ebene heißt bis zum Mandanten-Umbau GLOBAL.** Die Spalte in der Tabelle
  dokumentiert, welche Ressourcen später auf ORGANIZER wandern.
- **Aktionen bleiben CREATE, READ, UPDATE, DELETE.** Nicht jede Ressource hat jede Aktion; es
  werden nur Privilegien definiert, die auch geprüft werden.

Die Zuordnung der 38 Module, die heute an EVENT hängen, steht in Anhang A. Sie ist Stand der
Analyse und wird im Umsetzungsplan je Modul gegen den Code geprüft.

## 5. Scopes und Prüfung

### 5.1 Die Leiter

| Scope | Level | Bedeutung | Bedingung |
|---|---|---|---|
| OWN | 1 | mein Verein, ich selbst, Veranstaltungen mit eigener Beteiligung | vom Endpunkt geprüft |
| EVENT | 2 | eine bestimmte Veranstaltung | Nutzer ist der Veranstaltung zugeordnet |
| ORGANIZER | 3 | reserviert für den Mandanten | noch nicht definiert |
| GLOBAL | 4 | die ganze Installation | keine |

Ein höherer Scope besteht jede Prüfung eines niedrigeren, wie heute über `level >=`. Neu ist die
Bedingung je Stufe: EVENT besteht nur, wenn die Zuordnung zur geprüften Veranstaltung vorliegt.
Ohne Veranstaltungs-ID im Aufruf besteht EVENT nicht.

### 5.2 Prüfung im Backend

Die Funktionen in `calls/requests/Extensions.kt` bleiben, bekommen aber die Veranstaltung als
Parameter:

- `authenticate(privilege)` für Privilegien, deren Ressource keinen EVENT-Scope kennt.
- `authenticate(privilege, eventId)` für alle anderen.
- `authenticate(action, resource, eventId)` liefert wie heute Nutzer und höchsten Scope. Der
  Endpunkt entscheidet bei OWN selbst.
- `authenticateAny`, `optionalAuthenticate` und die WebSocket-Variante analog.

Die Privileg-Definitionen tragen ihre erlaubten Scopes im Typ. Ein Privileg mit EVENT-Scope
passt nur in die Variante mit ID. Ein vergessener Parameter ist damit ein Kompilierfehler, kein
Sicherheitsloch.

Die Zuordnung Nutzer zu Veranstaltungen kommt mit der Sitzung: Der View, der heute die
Privilegien liefert, liefert je Privileg zusätzlich die Menge der Veranstaltungen (leer bei
GLOBAL und OWN). Die Prüfung ist dann ein Lookup im Speicher, keine Datenbankabfrage.

### 5.3 OWN

OWN wird weiterhin vom Endpunkt geprüft, aber über gemeinsame Helfer statt über
`user.club == x` an 25 Stellen:

- `ownsClub(user, clubId)`: Verein des Nutzers.
- `ownsRegistration(user, registrationId)`: Meldung gehört zum Verein des Nutzers.
- `participatesIn(user, eventId)`: Verein des Nutzers hat mindestens eine Meldung an der
  Veranstaltung. Das ist die Bedeutung von OWN bei EVENT, EXECUTION, RESULT und
  PARTICIPANT_TRACKING. Listen werden dort zusätzlich auf die eigenen Teams gefiltert, wo das
  Sinn hat (Check-ins ja, Startlisten nein).
- `registrationWindowOpen(eventId)`: Meldefenster der Veranstaltung ist offen.

Die Repo-Filter behalten ihr Muster als jOOQ-Condition, bauen aber auf denselben Bedingungen
auf. Die dreifach kopierte Self-Submission-Prüfung im Challenge-Service wird zu einem Helfer
„OWN-Zugriff auf Meldung im Zeitfenster“, den Ummeldung und Self-Submission gemeinsam nutzen.

### 5.4 Ummeldung durch den Verein

`CREATE/DELETE SUBSTITUTION OWN` besteht, wenn die Meldung zum Verein gehört und das
Meldefenster der Veranstaltung offen ist. Nach Meldeschluss ist die Meldestelle zuständig. Die
Lese-Endpunkte für mögliche Aus- und Einwechslungen prüfen `READ SUBSTITUTION`, nicht CREATE.

## 6. Jobs und Rollen

### 6.1 Jobs im Code

Ein `sealed class Job` im Backend mit Schlüssel, Ebene, Privilegien und Übersetzungsschlüsseln
für Name und Beschreibung. Die Tabelle `role` bekommt `job text null` (Schlüssel des Jobs, aus
dem die Rolle stammt) und `level text not null` (SELF, CLUB, EVENT, GLOBAL; ORGANIZER
reserviert). Statische Rollen sind genau die Jobs.

| Job | Ebene | Kern |
|---|---|---|
| Superadmin | Installation | alles; einzige Rolle mit USER auf Admin-Konten und ROLE GLOBAL |
| Admin | Installation | alles außer Superadmin-Konten und Rollenverwaltung nach oben |
| Wettkampfleitung (Anzeige: Regattaleitung) | Veranstalter | EVENT, COMPETITION, EXECUTION, TASK, TEMPLATE, ROLE EVENT; lesend alles Operative |
| Meldestelle | Veranstalter | REGISTRATION, SUBSTITUTION; lesend EVENT, COMPETITION, EXECUTION |
| Kasse | Veranstalter | INVOICE; lesend REGISTRATION, CLUB |
| Schiedsrichter | Veranstaltung | JUDGING; lesend EXECUTION, TIMING, RESULT |
| Zeitnahme | Veranstaltung | TIMING; lesend EXECUTION |
| Sprecher | Veranstaltung | BOARD; lesend EXECUTION, RESULT, TIMING |
| Regie | Veranstaltung | STREAM; lesend EXECUTION, RESULT |
| Helfer Bedingungen | Veranstaltung | PARTICIPANT_REQUIREMENT |
| Helfer Ausgabe | Veranstaltung | ACCESS_PASS |
| Helfer Check-in | Veranstaltung | PARTICIPANT_TRACKING |
| Helfer Catering | Veranstaltung | CATERING |
| Materialvermieter | Veranstaltung | RENTAL |
| Vereinsvertreter | Verein | CLUB OWN, REGISTRATION OWN, SUBSTITUTION OWN; lesend INVOICE, EVENT, EXECUTION, RESULT, PARTICIPANT_TRACKING OWN |
| Nutzer | Selbst | USER OWN |

Die vollständige Matrix Job × Privileg wird aus den Definitionen erzeugt (Abschnitt 8) und ist
im Umsetzungsplan auszuarbeiten; die Tabelle nennt den Kern.

### 6.2 Nachtragen beim Start

`initializeDatabase` sät alle Jobs als statische Rollen und synchronisiert sie: fehlende
Privilegien kommen dazu, entfernte gehen weg. Das ersetzt den heutigen Sonderweg für drei
Rollen. Der Admin-Durchgriff im View `app_user_with_privileges` (Rolle `0000…` bekommt alles)
entfällt; der View liefert, was zugeordnet ist.

### 6.3 Eigene Rollen

Entstehen nur als Kopie eines Jobs und tragen dessen Schlüssel in `job`. Sie speichern ihre
Privilegien absolut. Bekommt der Job in einem Release ein neues Privileg, wird es auch den
Kopien nachgetragen. Verliert er eines, behalten die Kopien es, und die UI zeigt es als
Abweichung. Eine Kopie bleibt auf der Ebene ihres Jobs und kann nur Privilegien tragen, deren
Scope zur Ebene passt.

### 6.4 Zuweisung

`app_user_has_role` und `app_user_invitation_has_role` bekommen `event uuid null` mit
Fremdschlüssel auf `event` und Cascade. Rollen der Ebene EVENT brauchen eine Veranstaltung, alle
anderen dürfen keine haben; das prüft der Service. Der Primärschlüssel wird
`(app_user, role, event)` mit `event` als `coalesce`-Ausdruck im Unique-Index, damit ein Konto
bei zwei Veranstaltungen verschiedene Jobs haben kann.

## 7. Vergabe und Sicherheit

### 7.1 Drei Regeln

Alle im Backend geprüft, in `RoleService` und `AppUserService`:

1. **Kein Teilmengen-Bruch.** Wer eine Rolle anlegt, ändert oder zuweist, muss jedes ihrer
   Privilegien selbst besitzen, im gleichen oder höheren Scope, und bei EVENT für dieselbe
   Veranstaltung.
2. **Nicht an sich selbst.** Niemand ändert die eigenen Rollenzuweisungen. Auch der Admin
   nicht, der Superadmin schon.
3. **Nach oben ist dicht.** Konten mit Superadmin-Rolle sieht und bearbeitet nur ein
   Superadmin. Der Systemnutzer bleibt technischer Superadmin. Der 404-statt-403-Sonderfall bei
   fremden Admins wird ein sauberes 403.

### 7.2 Wer vergibt was

- **Rollen verwalten** (anlegen, kopieren, ändern, löschen): `UPDATE ROLE GLOBAL`. Haben Admin
  und Superadmin.
- **Installations- und Vereins-Rollen zuweisen**: `UPDATE USER GLOBAL` plus Regel 1.
- **Veranstaltungs-Jobs zuweisen**: `UPDATE ROLE EVENT` für die Veranstaltung. Hat die
  Wettkampfleitung. Sie stellt ihr Tagesteam selbst zusammen, ohne Konten oder Rollen ändern zu
  können.
- **In einen Job einladen**: derselbe Aufruf. Die Einladung trägt Rolle plus Veranstaltung, das
  Konto entsteht beim Annehmen mit dem Job „Nutzer“ plus dem Veranstaltungs-Job. Wer einlädt,
  braucht nur `UPDATE ROLE EVENT`, nicht `CREATE USER GLOBAL`. Damit fehlt in der Kette kein
  Recht, wenn am Regattatag schnell jemand dazukommt.

### 7.3 Bänder und QR-Codes

Bänder sind Schlüssel, keine Subjekte des Rechtesystems.

- **Teilnehmerband.** Der Teilnehmer hat kein Konto. Das Band öffnet genau eine Sicht, „Mein
  Event“, über den öffentlichen Endpunkt mit Rate-Limit. Regel: Ein Band öffnet nie mehr als die
  eigene Teilnehmersicht. Keine Rolle, keine Privilegien.
- **Helferband.** Ein Konto bekommt je Veranstaltung ein Band. Es identifiziert den Helfer beim
  Scan und gibt keine Rechte. Ein Band an ein Konto binden geht nur, wenn das Konto dieser
  Veranstaltung zugeordnet ist oder GLOBAL-Rechte hat.

### 7.4 Was geschlossen wird

- Lese-Endpunkte für mögliche Ummeldungen prüfen READ statt CREATE.
- `CREATE CLUB OWN`, `CREATE REGISTRATION GLOBAL`, `DELETE REGISTRATION GLOBAL/OWN` entfallen.
  Abmeldung ist ein eigener Ablauf mit eigener Prüfung.
- `UPDATE USER GLOBAL` verliert die Rollenverwaltung an ROLE.
- Öffentliche Endpunkte stehen in einer expliziten Liste (Abschnitt 8).

## 8. Prüfbarkeit und Doku

- **Routen-Test.** Ein Backend-Test läuft alle registrierten Routen ab und stellt sicher, dass
  jede entweder eine Privilegprüfung trägt oder in einer expliziten Liste öffentlicher Routen
  steht. Ob Ktor die Prüfung an der Route sichtbar macht, klärt der Plan; falls nicht, wird die
  Prüfung als Routen-Attribut registriert, das `authenticate` setzt und der Test liest.
- **Matrix-Tests.** Je Job ein Test gegen Postgres nach dem Muster der bestehenden
  `*PrivilegeHttpIT`: dieser Job besteht diese Prüfungen und fällt bei jenen durch.
- **Erzeugte Matrix.** Ein Test schreibt `docs/rechte-matrix.md` (Job × Ressource × Aktion ×
  Scope) aus den Job-Definitionen und schlägt fehl, wenn die eingecheckte Datei abweicht.
- **Erzeugte Frontend-Konstanten.** Derselbe Mechanismus schreibt
  `frontend/src/authorization/privileges.generated.ts` mit Privilegien, Jobs, Ressourcen und
  Übersetzungsschlüsseln. Die handgepflegte Datei entfällt.

## 9. Frontend

- **Prüfung mit Veranstaltung.** `checkPrivilege(privilege, eventId?)` und
  `getPrivilegeScope(action, resource, eventId?)` im Nutzerkontext. Die Sitzung bringt je
  Privileg die zugeordneten Veranstaltungen mit. Routen unter `/event/$eventId` lesen die ID aus
  dem Pfad und reichen sie durch.
- **Sichtbarkeit folgt der Prüfung.** Kacheln (`betriebTiles`), Sidebar und Helfer-App-Modi
  (`appAccess`) bleiben reine, getestete Funktionen, fragen aber dieselben Privilegien wie das
  Backend. Die ODER-Verknüpfungen bei Stream und Timing in `routes.tsx` entfallen.
- **Rollen-UI.** Der Rollendialog zeigt Privilegien gruppiert nach Ressource, mit übersetztem
  Namen und Beschreibung, Scope als Spalte. Eine Rolle zeigt ihren Job und die Abweichungen.
  Anlegen nur über „Kopie von Job“. Rollen ohne Job (Altbestand) tragen den Hinweis „ohne
  Vorlage“.
- **Team-Reiter an der Veranstaltung.** Liste der zugeordneten Konten mit Job und Helferband.
  Hinzufügen aus bestehenden Konten oder per Einladung mit E-Mail und Job, Entfernen. Sichtbar
  ab `READ ROLE EVENT`, bearbeitbar ab `UPDATE ROLE EVENT`.
- **Helfer-App.** Die Veranstaltungsauswahl zeigt nur Veranstaltungen, denen das Konto
  zugeordnet ist oder für die es GLOBAL-Rechte hat.
- **Vereinsvertreter.** Sieht Zeitplan, Startlisten, Ergebnisse und Check-ins jeder
  Veranstaltung, an der sein Verein beteiligt ist, mit eigenen Teams hervorgehoben. Ummelden
  bis Meldeschluss.

## 10. Migration und Reihenfolge

### 10.1 Daten

Eine Migration je Schritt. Bestehende statische Rollen werden auf die Jobs Admin, Nutzer,
Vereinsvertreter gemappt. Bestehende eigene Rollen bleiben erhalten, `job` bleibt leer. Ihre
Privilegien werden per Tabelle auf die neuen umgeschrieben, damit niemand nach dem Release
weniger darf als vorher:

| alt | neu |
|---|---|
| UPDATE EVENT GLOBAL | UPDATE EVENT, COMPETITION, EXECUTION, JUDGING, TIMING, TASK, TEMPLATE, PARTICIPANT_REQUIREMENT, ACCESS_PASS, PARTICIPANT_TRACKING, CATERING GLOBAL; READ auf alles Operative |
| READ EVENT GLOBAL | READ EVENT, COMPETITION, EXECUTION, TIMING, RESULT GLOBAL |
| READ EVENT OWN | READ EVENT, EXECUTION, RESULT, PARTICIPANT_TRACKING OWN |
| UPDATE LIVE_DASHBOARD GLOBAL | UPDATE JUDGING GLOBAL |
| READ LIVE_DASHBOARD GLOBAL | READ JUDGING GLOBAL |
| UPDATE APP_TIMING GLOBAL | UPDATE TIMING GLOBAL |
| UPDATE APP_EVENT_REQUIREMENT GLOBAL | UPDATE PARTICIPANT_REQUIREMENT GLOBAL |
| UPDATE APP_QR_MANAGEMENT GLOBAL | UPDATE ACCESS_PASS GLOBAL |
| UPDATE APP_COMPETITION_CHECK GLOBAL | UPDATE PARTICIPANT_TRACKING GLOBAL |
| UPDATE APP_CATERER GLOBAL | UPDATE CATERING GLOBAL |
| READ/UPDATE WEB_DAV GLOBAL | READ/UPDATE ADMINISTRATION GLOBAL |
| DELETE REGISTRATION *, CREATE CLUB OWN, CREATE REGISTRATION GLOBAL | entfällt |

Alte Tripel ohne Ziel werden gelöscht. Die Umschreibung ist bewusst großzügig: Wer heute
UPDATE EVENT hatte, darf danach alles Operative, und der Betreiber engt über Jobs ein.

### 10.2 Schritte

Jeder für sich mergebar, jeder mit eigener Migration und eigenem Handtest:

1. **Jobs, ROLE, Vergaberegeln, Superadmin.** Noch alles GLOBAL. Schließt Rechteausweitung und
   Nachtragen. Rollendialog mit Namen, Gruppierung, Kopie-von-Job.
2. **Ressourcen-Schnitt.** EVENT wird in 38 Modulen ersetzt, Umschreibung in der Migration,
   Frontend-Konstanten und Matrix erzeugt.
3. **EVENT-Scope.** Zuweisung mit Veranstaltung, Prüfung mit ID, Team-Reiter, Einladung in
   Job, Helfer-App-Auswahl.
4. **Verein.** SUBSTITUTION OWN mit Meldefenster, Lesezugriff auf Beteiligtes, OWN-Helfer
   zusammenziehen, Self-Submission auf den Helfer umstellen.
5. **Routen-Test, Matrix-Tests, Aufräumen der Leichen, Doku.**

### 10.3 Parallele Worktrees

- Eigene Build-Datenbank je Worktree, jOOQ dagegen erzeugen, nach dem Wechsel `clean`.
- Migrationsstempel dieses Zweigs werden den anderen Sessions gemeldet.
- Konfliktstelle ist `Privilege.kt`, nicht die Migration. Die Materialvermieter-Session trägt
  RENTAL nach heutigem Muster ein; Schritt 1 erweitert die Datei nur, erst Schritt 2 baut sie um.

## 11. Anschluss für den Mandanten

Der spätere Umbau findet vor:

- **Scope-Level 3 ORGANIZER** ist reserviert und in `Scope` als Wert vorhanden, aber ohne
  Privilegien. Die Leiter `level >=` funktioniert unverändert.
- **Ebene ORGANIZER** in `role.level` ist reserviert.
- **Die Ressourcen der Ebene „Veranstalter“** (Tabelle in Abschnitt 4) sind die, deren
  GLOBAL-Privilegien dann auf ORGANIZER wandern: EVENT, COMPETITION, REGISTRATION,
  SUBSTITUTION, INVOICE, TASK. Die Jobs Wettkampfleitung, Meldestelle und Kasse wechseln von
  GLOBAL auf ORGANIZER.
- **Die Zuweisung** bekommt neben `event` eine Spalte `organizer`. Rollen der Ebene ORGANIZER
  brauchen eine, wie EVENT-Rollen eine Veranstaltung. Die Bedingung für ORGANIZER in der Prüfung
  lautet „Veranstaltung gehört zum Veranstalter, dem der Nutzer zugeordnet ist“.
- **Nicht mandantengebunden bleiben** USER, CLUB, TEMPLATE (mit Frage, ob Vorlagen je
  Veranstalter kopiert werden) und ADMINISTRATION. Vereine melden bei mehreren Veranstaltern
  und gehören keinem.
- **Offene Datenfragen** für dann: Bankkonten, Dokumentvorlagen, Zeitnahmeprofile,
  Konfiguration je Veranstalter oder je Installation.

## Anhang A: Module zu Ressourcen

Stand der Analyse; im Plan je Modul gegen den Code zu prüfen. Module, die heute an EVENT hängen:

| Modul | Ressource |
|---|---|
| event, eventDay, contactInformation, eventDocument, eventDocumentType, eventExportBundle, eventInfo | EVENT |
| competition, competitionCategory, competitionSetup, namedParticipant, fee, ratingcategory, startListConfig, paceReference | COMPETITION |
| competitionTemplate, competitionSetupTemplate, documentTemplate | TEMPLATE |
| eventRegistration, participant | REGISTRATION |
| eventSchedule, competitionExecution (Läufe, Startlisten, Folgerunden), matchResultImportConfig, raceclocker (Ergebnisimport), awardCeremony | EXECUTION |
| liveDashboard, competitionExecution (Strafen, Klärung) | JUDGING |
| timing, timingConfig, timingProfile, raceclocker (Anbindung) | TIMING |
| results, certificate | RESULT |
| task, workShift, workType | TASK |
| participantRequirement | PARTICIPANT_REQUIREMENT |
| stream | STREAM |
| bankAccount | INVOICE |
| auth | keine (Login, Sitzung) |

Grenzfälle, die der Plan entscheidet: `competitionExecution` und `raceclocker` bedienen zwei
Ressourcen und werden auf Endpunkt-Ebene zugeordnet. `certificate` liegt bei RESULT, weil
Urkunden aus Ergebnissen entstehen, obwohl die Vorlage unter TEMPLATE liegt.
