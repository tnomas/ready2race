# Materialvermietung: Betriebshinweise zum Ausrollen

Stand 14.11.2026, Zweig `claude/materialvermietung-uebernahme-9cf945`. Entscheidungen: ADR-0109 (Domäne), ADR-0110
(Rolle), ADR-0111 (Nummern); Handtests: `2026-11-14-materialvermietung-testkatalog.md`. Alles Unverifizierte ist als solches
gekennzeichnet.

## 1. Vor dem Ausrollen

1. **Dump der Produktionsdatenbank ziehen.** Die Migration legt Tabellen an, löscht keine Daten; ein Revert lässt sie aber
   stehen und räumt in einer Folge-Migration auf (`flyway repair` nötig, wenn die Datei entfernt wird).
2. **`FRONTEND_ORIGINS` klären** (Abschnitt 5): Das Meldeformular schickt eine Rückruf-Adresse mit.
3. Backend nach dem Merge **neu bauen und starten**; Vite serviert Quelltext live, das Jar nicht, fehlende DTO-Felder rendern
   sonst still als Leerstring.
4. Die Abschnitte 6 und 7 abarbeiten.

## 2. Migrationen

| Migration | Was | Risiko |
|---|---|---|
| `V202611140800__material_rental.sql` | 11 Tabellen der Materialvermietung, die Spalte `app_user.material_provider` und der aufgeschobene Constraint-Trigger `A0_material_request_orphan_cleanup`. Sichten stehen in `afterMigrate.sql` (u. a. `effective_material_for_match_team`, `material_request_view`). | Legt nur neu an, ändert vorhandene Daten nicht. Datenbanken, auf denen der **alte** Material-Zweig lief, tragen die Version `V202609071000__material_rental` (und die alte Rollenkennung `…0003` am Anbieter-Konto) und **lassen sich nicht hochziehen**: Flyway findet die Datei nicht mehr, die Tabellen existieren schon. Solche Datenbanken neu aufsetzen (nur Entwicklungs-/Testdatenbanken; Produktion kannte den alten Zweig nicht). |
| `V202611140840__material_fk_indizes.sql` | Sechs Fremdschlüssel-Indizes (Schadensfotos, Einladungen, Konten, Materialarten an Stück, Angebot und Bedarf). | Ohne `concurrently` (Flyway läuft transaktional): kurze Schreibsperre; die Tabellen sind klein. Nach Datenbestand in Produktion nicht gemessen. |
| `V202611141330__startnummer_aus_meldungsnummer.sql` | Spalte `event.team_numbers_as_start_numbers boolean not null default false`; `event_view` liest sie (`afterMigrate.sql`). | Vorgabe `false`: für jede bestehende Veranstaltung bleibt alles, wie es war, auch bei schon fixierten Meldungen nach Bootsnummern (der Schalter wurde bis dahin nicht gespeichert). Wer dort die neue Wirkung will, refinalisiert mit dem Schalter. Ändert keine Läufe. |

Letzte Nummer vor diesem Zweig: `V202611132020`. Nach `git mv` einer Migration die alte Kopie unter
`backend/target/classes/db/migration/` löschen. Der Seed `docs/seeds/seed-material.sql` setzt auf den Namen der neuen Rolle
und auf einen ausgeführten DM-Seed.

## 3. Neue Rolle und neuer Job

- Der Job `MATERIAL_PROVIDER` (Rolle `00000000-0000-0000-0000-000000000040`, Ebene Verein, READ/UPDATE MATERIAL OWN) wird
  beim Start vom `JobSeeder` gesät. Er ist **systemverwaltet** und **nicht kopierbar** (`GET /role/jobs` listet ihn nicht,
  `POST /role` mit ihm ergibt 400).
- **Vergeben** wird er nur über die Anbieter-Zuordnung am Konto (Nutzerseite oder `PUT /user/{id}/materialProvider`).
  Wer das darf: UPDATE USER GLOBAL für die Route, zusätzlich UPDATE STAFF GLOBAL, die Teilmenge der Rolle (READ und UPDATE
  MATERIAL OWN) und nicht am eigenen Konto; Superadmin-Konten nur mit UPDATE SYSTEM. Normale Rollenvergabe und Einladung
  vergeben ihn nicht.
- MATERIAL GLOBAL (alle Anbieter und Materialarten) tragen nur Admin und Superadmin; neue Privilegien erreichen zunächst nur die
  Admin-Rolle (ADR-0010). Veranstalter brauchen READ MATERIAL GLOBAL, um Anbieter einzuladen.
- **Einladen** eines Anbieters zu einer Veranstaltung verlangt UPDATE EVENT GLOBAL **und** READ MATERIAL GLOBAL (Route mit
  `authenticateAll`); Ausladen nur UPDATE EVENT GLOBAL. Eigene Veranstalter-Rollen ohne MATERIAL GLOBAL können Anbieter nicht
  mehr einladen (403); Rolle um READ MATERIAL GLOBAL ergänzen, wenn sie es sollen.
- Ein Anbieter mit zugeordneten Konten lässt sich nicht löschen (409 `MATERIAL_PROVIDER_HAS_USERS`); erst die Zuordnungen lösen.
- Rollback auf einen Stand ohne den Job: Die Rolle `…0040` bleibt in der Datenbank, Konten behalten sie; ohne Anbieter-Zuordnung
  ist sie wirkungslos.

## 4. Fotos

Schadensfotos liegen in Postgres (`material_damage_photo_data`). Grenzen: **10 MB je Datei, 50 MB je Anfrage, 20 Dateien je
Upload**; das Backend liest höchstens bis zur Restgrenze und bricht dann ab (Antwort 400 `MATERIAL_PHOTO_TOO_LARGE`, bei
Überschreiten von Proxy- oder Server-Grenzen 413). Erlaubt sind JPEG, PNG, WebP, GIF und HEIC, geprüft an den Bytes (SVG nicht,
sonst 415 `MATERIAL_PHOTO_INVALID_TYPE`). Das Frontend verkleinert vor dem Hochladen auf etwa 2000 px Kantenlänge, nacheinander.
Ein vorgeschalteter Proxy (z. B. nginx) braucht ein `client_max_body_size` von mindestens 50 MB für die Foto-Route; in diesem Zweig
ist keine nginx-Konfiguration eingecheckt, ob die ausgelieferte Konfiguration das erlaubt, ist **nicht geprüft**. Die Datenbank wächst mit den Fotos; Aufräumen geschieht nur mit dem Schaden
(Kaskade).

## 5. Rückzugs-Mail und `FRONTEND_ORIGINS`

- **Rückzugs-Mail** (`MATERIAL_REQUEST_WITHDRAWN`): geht an die Kontaktadresse des Anbieters, in der Sprache des Kontos mit dieser
  Adresse, sonst Deutsch; neue Texte de/en/da und die Zeile `##competitions##` („Kennung Name · Verein Meldungsname · Menge × Art“).
  **Im Admin überschriebene Vorlagen behalten ihren alten Text** und zeigen die neue Zeile nicht; wer die Vorlage angepasst hat,
  übernimmt den neuen Text von Hand. Verschickt wird sie auch, wenn ein Veranstalter (GLOBAL) eine Meldung mit bestätigter Anfrage
  löscht.
- **`FRONTEND_ORIGINS`:** Das Meldeformular sendet eine `callbackUrl` mit; fehlt die Adresse in der Allowlist (bzw. weicht der
  Host vom Host-Kopf ab), antwortet das Backend 422 `CALLBACK_URL_NOT_ALLOWED`, und das Formular nennt die aufgerufene Adresse
  („Adresse nicht freigegeben“). Liegen Frontend und API in Produktion auf verschiedenen Hosts oder ändert ein Proxy den
  Host-Kopf, muss `FRONTEND_ORIGINS` gesetzt sein (ADR-0106, `2026-11-13-app-review-betriebshinweise.md`). Lokal geht das
  Formular nur von `localhost` und `127.0.0.1`.

## 6. Verhaltensänderungen gegenüber dem alten Material-Zweig

- **Alle CSV-Exporte der App schreiben jetzt ausdrücklich UTF-8** (`CSV.write`, vorher die Standardkodierung der JVM). Die CSV der
  Schadensakte hat zusätzlich eine BOM (Excel erkennt Umlaute) und Klartext statt Enum-Werten; der Dateiname hat keine Leerzeichen.
  `Content-Type` bleibt `text/csv` ohne `charset`. Excel selbst wurde nicht geöffnet.
- **Das erneute Speichern der Meldung gilt für alle Veranstaltungen, nicht nur mit Material:** Eine bestehen bleibende Meldung behält
  Meldungsnummer, Namen und Anlagedaten (`created_at`/`created_by`); vorher gingen sie verloren (der Fehler bestand schon vor der
  Übernahme). Bereits geschehene Verluste lassen sich nicht rekonstruieren; ein Refinalisieren („behalten“) vergibt neue Nummern an
  Teams ohne Nummer. Ein neues Team bekommt seine Nummer erst bei der nächsten Fixierung.
- Die Übersicht der Anbieter nennt nur noch Teams mit einer Anfrage bei diesem Anbieter.
- Mein Event zeigt den Block „Leihmaterial“ auch für Meldungen mit Lauf; die Startliste (PDF) zeigt das Boot einmal je Team in der
  Kopfzeile.

- Ein Verein kann eine Meldung mit aktiver Anfrage bei **geschlossener Vergabe** nicht mehr entfernen (409
  `MATERIAL_REMOVAL_REQUESTS_CLOSED`); bei offener Vergabe wird die Anfrage zurückgezogen und bei bestätigten die Mail verschickt.
- Warteliste und Ablehnung löschen die Zuteilungen der Anfrage. Die Art eines Angebots mit Anfragen und eines zugeteilten
  Stücks ist fest; ein Stück mit Schadensakte lässt sich nur ausmustern.
- Die Sicht `effective_material_for_match_team` wählt deterministisch (Ausnahme vor Grundzuteilung, kleinste Nummer) und vergleicht
  mit der Startnummer im Lauf; die Grundzuteilung paart mit der Meldungsnummer.
- **Startnummer aus Meldungsnummer** (ADR-0111, Abschnitt 4, Entscheidung 14.11.2026): Jede Fixierung speichert den Schalter
  „Meldungsnummern nach Bootsnummern vergeben“ an der Veranstaltung (mit Schalter an, ohne aus). Gesetzt nimmt **jede danach
  angelegte Runde** (erste Runde, Folgerunden, Automatik) die Meldungsnummer als Startnummer; „abweichend“ erscheint dann nur bei
  echter Abweichung. **Bestehende Läufe ändert die Fixierung nie**, auch ohne Ergebnisse: zum Angleichen die Runde löschen und neu
  anlegen (nur ohne Ergebnisse möglich), am besten vor dem Startlisten-Export und vor dem Verteilen an Zeitnahme-Posten.
  Mit Schalter schreibt der **RaceClocker-Abgleich keine Listenpositionen** mehr in die Startnummern: Ein Umsortieren in RaceClocker
  ändert in R2R nichts (Zeiten kommen weiter an). Grenzen: In Folgerunden sind Listen nach Bootsnummer statt nach Setzplatz geordnet,
  und der Freilos-Chip einer Folgerunde zeigt „Freilos“ ohne Zahl. Wer refinalisiert, prüft den vorbelegten Haken – ohne ihn
  nummerieren künftige Runden wieder nach Setzposition.
- Nach Meldeschluss können Vereine über die API noch anfragen oder zurückziehen, solange der Anbieter die Vergabe offen lässt.

## 7. Vor einem Produktiveinsatz von Hand zu prüfen

Nichts davon ist bisher in der laufenden App belegt, soweit der Testkatalog nicht ausdrücklich „bestanden“ sagt:

1. Testkatalog `2026-11-14-materialvermietung-testkatalog.md`: Die Handtests H1 bis H3 und F4 sind eingetragen (66 Fälle, 0 fehlgeschlagen),
   Block G (Startnummer aus Meldungsnummer, 9 Fälle) ist **offen**;
   von Hand bleiben die Fälle „nicht gelaufen“/„nicht testbar“ und der Abschnitt „Nicht belegt und offen“, vor allem die Anmeldung
   über das Login-Formular (nie getestet), Excel-Öffnen der CSV, Fotos von der Handykamera, 768 px, en/da, verdeckter Tab.
2. Wirecast/OBS-Handtest der Stream-Grafik (die Anzeigen selbst sind im Browser gesehen).
3. Rückzugs-Mail und Meldeformular über die **echte** Adresse (`FRONTEND_ORIGINS`, Docker-nginx, Hoster-Proxy), Foto-Upload
   mit 10 MB und 50 MB hinter dem nginx.
4. Die Messung der Sicht und der Anzeige-Abfragen gegen Produktionsdaten (`EXPLAIN` nur am Seed-Umfang); en/da-Texte gegenlesen.
5. Vor einer Regatta mit Leihbooten: mit Schalter fixieren, **dann** Runden anlegen; Block G des Testkatalogs (vor allem G7,
   RaceClocker-Abruf nach Umsortieren) einmal gegen die echte Zeitnahme durchspielen.
