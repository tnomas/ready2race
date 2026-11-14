# Review-Zweig: Betriebshinweise zum Ausrollen

Stand 14.11.2026, Zweig `claude/app-review-optimization-2d57f8`. Entscheidungen dazu stehen in
ADR-0106 (Rückruf-Adressen) und ADR-0107 (Laufzeit); Handtests in
`2026-11-13-app-review-testkatalog.md`, Block L. Alles Unverifizierte ist als solches gekennzeichnet.

## 1. Vor dem Ausrollen

1. **Dump der Produktionsdatenbank ziehen.** Der Zweig enthält eine Migration, die Zeilen löscht
   (`V202611131900`), und drei Index-Migrationen. Ein Revert lässt angewandte Migrationsdateien
   stehen und räumt in einer Folge-Migration auf; eine entfernte Migration bricht jede Datenbank,
   die sie schon sah (`flyway repair`).
2. **`FRONTEND_ORIGINS` klären** (Abschnitt 2). Ohne diese Klärung können Registrierung, Einladung
   und Passwort-Reset mit 422 scheitern.
3. **Hinter einem Reverse-Proxy `TRUSTED_PROXY_HOPS` setzen** und den Healthcheck umstellen
   (Abschnitt 4).
4. Backend nach dem Merge **neu bauen und starten**: Vite serviert Quelltext live, das Jar nicht;
   fehlende DTO-Felder rendern sonst still als Leerstring.

## 2. Konfigurationsschlüssel

Alle optional, alle in `backend/template.env` beschrieben, geprüft in `Config.kt`. Fehlt ein
Schlüssel, gilt die Vorgabe; ein bestehender Betrieb startet ohne Änderung.

| Schlüssel | Vorgabe | Wirkung | Wann setzen |
|---|---|---|---|
| `FRONTEND_ORIGINS` | nicht gesetzt | Kommagetrennte Origins (`schema://host:port`), auf die `callbackUrl` in Registrierungs-, Einlade- und Reset-Mails zeigen darf. Gesetzt: nur diese Liste gilt. Nicht gesetzt: der Host der `callbackUrl` muss dem Host-Kopf der Anfrage entsprechen (Port egal); `DEV`/`TEST` erlauben zusätzlich Loopback. `PROD`/`STAGING` warnen beim Start. | **Muss** gesetzt werden, wenn Frontend und API in Produktion auf verschiedenen Hosts liegen oder ein Proxy den Host-Kopf ändert; sonst 422. Auch in die Umgebungsvorlage der Docker-Auslieferung. |
| `APP_TIMEZONE` | `Europe/Berlin` | Die Zeitzone der App (Ist-Starts, Countdown-Anker, Ablaufzeiten, Board-Zeiten), unabhängig von `TZ` und der Zone des Hosts. | Nur bei Veranstaltungen außerhalb Deutschlands; ein Container in UTC braucht ihn nicht mehr. |
| `SECURITY_ARGON2_MEMORY_KIB` | `19456` (19 MiB), Minimum 8 | Speicherbedarf neuer Argon2id-Hashes. Alte Hashes gelten weiter und werden beim nächsten erfolgreichen Login neu geschrieben. `PROD`/`STAGING` warnen unterhalb der Vorgabe. | Senken nur auf sehr kleinen Hosts; hochsetzen nur nach Lastmessung. |
| `DATABASE_POOL_SIZE` | `10` (wie bisher) | Obergrenze des Verbindungspools. | Bei vielen gleichzeitigen Boards und langsamem Mailserver erhöhen (der Mailversand hält während SMTP eine Verbindung). |
| `DATABASE_STATEMENT_TIMEOUT_MS` | `120000` (2 min), `0` = aus | `statement_timeout` je Verbindung. Flyway läuft über eine eigene Verbindung und ist nicht betroffen. | Erhöhen oder `0`, falls lange Exporte (Bündel-ZIP, WebDAV) abgebrochen werden. |
| `SECURITY_ARGON2_MAX_CONCURRENT` | Kernzahl, Minimum 1 | Höchstzahl gleichzeitiger Argon2-Rechnungen (Login, Passwort setzen). Jede belegt `SECURITY_ARGON2_MEMORY_KIB` Heap; weitere warten in Ankunftsreihenfolge. | Senken, wenn der Heap knapp ist (Kernzahl × 19 MiB muss frei sein); mehr als die Kernzahl bringt keinen Durchsatz. |
| `TRUSTED_PROXY_HOPS` | `0` | Anzahl vertrauenswürdiger Reverse-Proxys; `0` ignoriert `X-Forwarded-For`. | `1` im Docker-Verbund hinter nginx; sonst ist die Client-Adresse die des Proxys. |

## 3. Migrationen (in Reihenfolge)

Letzte Nummer vor diesem Zweig: `V202609081000`. Belegt hier: `V202611131900` bis `V202611132020`.

| Migration | Was | Risiko |
|---|---|---|
| `V202611131900__produce_invoice_job_unique` | Löscht Dubletten offener Rechnungsjobs je (Meldung, Rechnungsart) und legt einen Unique-Index an. Der älteste Job (bei Gleichstand die kleinste id) bleibt. | **Löscht Daten.** Vorher zählen: `select event_registration, mode, count(*) from produce_invoice_for_registration group by 1, 2 having count(*) > 1`. Erledigte Jobs werden ohnehin gelöscht, offen sind nur unerledigte oder gescheiterte; eine Dublette hätte eine zweite Rechnung derselben Art erzeugt. |
| `V202611132000__durchfuehrung_fk_indizes` | Drei Fremdschlüssel-Indizes der Durchführung (`competition_match_team.competition_registration`, `substitution.competition_registration`, `substitution.participant_in`). | Ohne `concurrently` (Flyway läuft transaktional): kurze Schreibsperre auf den Tabellen. **Dauer auf Produktion unbekannt.** |
| `V202611132010__email_queue_index` | Teilindex für offene Mails und Index auf Anhängen. | Wie oben; die Tabelle `email` kann groß sein (alle je versandten Mails). Dauer unbekannt. |
| `V202611132020__redundante_indizes` | Entfernt sechs redundante Indizes (Duplikate bzw. von eindeutigen Mehrspalten-Indizes gedeckt). | Gering; nur Schreibvorteil. Vorher prüfen, ob eigene Auswertungen die Namen nutzen. |

Dazu ändert `afterMigrate.sql` die Sicht `event_view` (gleiche Spalten; ein Äquivalenztest gegen die
alte Fassung läuft in der Suite). Nicht gemessen: Plan und Laufzeit gegen einen Produktionsabzug
(`EXPLAIN ANALYZE`). Bei einer manuellen Entwicklungs-DB:
`flyway:clean` braucht jetzt `-Dflyway.cleanDisabled=false`.

## 4. Verhaltensänderungen

### Für Clients und Integrationen

- **Neue Fehlerantworten:** 422 bei fremder `callbackUrl` und bei negativem Challenge-Ergebnis;
  403 statt 500 bei `registrationTemplate` ohne Verein; 404 beim Bearbeiten einer Meldung, wenn die
  `clubId` im Formular nicht zur Meldung gehört; 400 (kaputtes JSON), 404, 413 (Upload zu groß) und
  415 statt 500.
- **Mailansicht** `/api/dev/emails` nur noch im Modus `DEV` (sie zeigt Reset- und Einladungslinks ohne
  Anmeldung). Stacktraces in 500ern nur in `DEV` und `TEST`; `STAGING` verhält sich wie `PROD`.
- **Websockets:** Rahmen über 4 KiB schließen die Verbindung (`TOO_BIG`); das Frontend sendet keine
  Nutzdaten. `DoubleReceive` gilt nur noch auf `/api/login`, `/api/app/login`,
  `/api/user/resetPassword`.
- **Paginierung** hängt den Primärschlüssel als letzten Sortierschlüssel an; die Reihenfolge von
  Zeilen mit gleichem Sortierwert kann sich minimal ändern.
- **Durchführung, „Nächste Runde":** Eine erzeugbare Runde bleibt stehen, statt dass alles
  zurückgerollt wird.
- **Rechenregel (Plätze nach Geschlecht)** gilt auch für die Ummeldung, dort großzügiger.
- **An den Start rufen und „Läuft" (Durchführung, Zeitplan):** Ein Lauf einer anderen Veranstaltung
  als im Pfad antwortet 404, ein beendeter Lauf 409 (Fehlercode
  `LIVE_DASHBOARD_MATCH_ALREADY_FINISHED`, wie am Schiedsrichter-Dashboard). Zurücknehmen bleibt
  erlaubt; wieder geöffnet wird über „Beenden zurücknehmen" oder „Lauf zurücksetzen".
- **Meldungsliste mit Umfang OWN:** `GET /event/{eventId}/eventRegistration` liefert Vereinen mit
  READ REGISTRATION OWN die eigene Meldung; der Bereich „Meldungen" erscheint für sie.
- **Login:** Unbekannte E-Mail und falsches Passwort dauern gleich lang und antworten gleich (401).
  Die Passwortprüfung läuft vor der Anfrage-Transaktion und hält keine Poolverbindung mehr.
- **Registrierung bestätigen nach Meldeschluss:** Konto, Verein und Teilnehmer entstehen; die
  Wettkampfmeldung aus der Registrierung entfällt (Protokollzeile auf INFO), statt dass die ganze
  Bestätigung scheitert.
- **Uploads:** Zu große Dateien antworten 413, ein abgebrochener Upload ohne Antwortversuch; nur ein
  kaputter Multipart-Körper ist 400 („Malformed multipart body"). `400`-Texte enthalten keine
  Klassennamen von Ausnahmen mehr.

### Für Betrieb und Rollen

- **Löschjob für versandte Mails läuft wieder** (war auskommentiert). Mails offener Einladungen und
  Registrierungen bleiben. Die Wirkung auf Produktionsdaten ist nicht gemessen; die Aufbewahrungsfrist
  ist zu entscheiden.
- **Sitzungsdauer:** Die Verlängerung wird höchstens einmal je Minute geschrieben; eine Sitzung endet
  frühestens 6 h − 1 min nach der letzten Anfrage (bisher 6 h).
- **Passwort-Hashing:** neue Hashes mit 19 MiB (gemessen etwa 55 ms je Hash), gleichzeitig höchstens
  `SECURITY_ARGON2_MAX_CONCURRENT`. Unter hoher Login-Last Heap und Wartezeit beobachten.
- **Sprache gespeicherter Nutzer:** Eine unbekannte oder anders geschriebene gespeicherte Sprache
  wird beim Mailversand tolerant aufgelöst (Groß- und Kleinschreibung egal, sonst Deutsch) statt
  mit 500 abzubrechen.
- **Nachwirkungen nach dem Commit** (Änderungsmarker, Pushes an Boards und Stream) laufen auch,
  wenn der Client die Anfrage nach dem Commit abbricht. Websockets abonnieren vor dem ersten Stand.
- **Mailversand:** Sperre, Versand und Vermerk laufen in einer Transaktion (keine Doppelmails bei zwei
  Instanzen) und halten während SMTP eine Pool-Verbindung.
- **Statement-Timeout** (zwei Minuten) kann lange Exporte abbrechen (nicht gemessen).
- **Rolle `STREAM`:** Eine reine STREAM-Rolle sieht „Boards verwalten" und „Sprecher-Board" im Betrieb
  nicht mehr; sie durfte beides ohnehin nicht öffnen. Die Bereiche der Veranstaltungsseite folgen
  der Rechtelage (`eventSections.ts`); ein `?tab=`-Wert, den die Rolle nicht sehen darf, fällt auf
  den ersten sichtbaren Bereich zurück.
- **Healthcheck:** `GET /api/health` antwortet 204 (ohne Anmeldung, ohne Rate-Limit), sonst 500. Der
  Docker-`HEALTHCHECK` ist darauf umzustellen (bisher `GET /api/event`). Der Endpunkt steht bewusst
  nicht in `documentation.yaml`; kein neuer Client nötig.
- **OpenAPI:** Zusätzlich dokumentiert sind 409 an `updateMatchActivation` und
  `markMatchStartedFromExecution`; der generierte Client ändert sich dadurch nicht
  (`npm run generate` ohne Diff).
- Mit `DATABASE_LOG_QUERIES=true` fiel früher der Schutz vor `delete`/`update` ohne `where` weg;
  behoben.
- Das Frontend lädt alle Seiten lazy. Nach einem Deployment lädt ein offener Browser bei einem
  Chunk-Fehler genau einmal neu; der Service Worker der Helfer-App precacht 213 Einträge.

## 5. Bewusst nicht umgesetzt oder vor Produktion zu prüfen

- **Eindeutigkeit gegen Dubletten:** Ein Unique-Index auf der Meldung (BA-15a), der
  `event_participant`-Primärschlüssel und ein Unique-Index auf `lower(email)` brauchen vorher einen
  Zählabzug der Produktionsdaten auf Dubletten; sonst scheitern die Migrationen.
- **Giftpillen in Job-Schleifen** (`last_error` bei Defekt) und die Reihenfolge des Urkunden-Jobs:
  braucht eine Migration und den Umbau der Schleifen; der Rechnungsjob ist abgedeckt.
- **`transact` verschachtelbar:** Eingriff in Bibliotheksverhalten; heute ruft kein Test einen
  Service mit innerem `transact`.
- **Limit-Deckel und gemeinsamer `count` der Paginierung:** Das Frontend lässt `limit` für „alle"
  weg; erst Aufrufer prüfen.
- **Sicherheits-Header und Swagger in `PROD`:** Produktentscheidung; `X-Frame-Options` kollidiert
  womöglich mit der PDF-Vorschau im iframe.
- **Login-Limit je IP:** setzt `TRUSTED_PROXY_HOPS` voraus; Folgeschritt.
- **DB-Prüfungen in Websocket-Handshakes** laufen noch auf dem Event-Loop.
- **Docker:** Die Docker-Dateien liegen nicht auf diesem Zweig. `APP_TIMEZONE` deckt die App ab; der
  Healthcheck auf `/api/health` und `TRUSTED_PROXY_HOPS=1` sind in der Docker-Auslieferung
  nachzuziehen, ebenso `FRONTEND_ORIGINS` in deren Umgebungsvorlage.
- **Fachfragen:** Dürfen D-Personen Männer- und Frauenplätze füllen? Wie lange sollen versandte Mails
  aufbewahrt werden?
- **Offene Rechtefrage Startposten:** Ein Startposten, der nur per Geräte-Token angemeldet ist, darf
  keine Startsequenz steuern (`/timing/sequences/**` verlangt eine Sitzung, sonst 401). Die
  Oberfläche zeigt dort einen Hinweis statt des Knopfes. Ob Geräte-Token das dürfen sollen, ist zu
  entscheiden.
- **Schiedsrichter-Dashboard:** Der Menüeintrag „Lauf aktivieren" erscheint auch an einer beendeten
  Karte, das Backend lehnt ihn aber ab (409). Ob der Eintrag dort entfallen soll, ist offen.
- **Nicht verifiziert:** nichts davon in der laufenden App; Mail-Links hinter Docker-nginx und
  Hoster-Proxy; Board-Push nach Abmeldung; `EXPLAIN ANALYZE` von `event_view` und Indizes; Dauer der
  Index-Migrationen; Login-Last mit 19 MiB je Hash; Statement-Timeout gegen lange Exporte.
- **Frontend:** Die Wirkung der Änderungen in Tabellen, Dialogen und DataGrid im Detail, die
  Tastatur- und Screenreader-Bedienung und das Admin-Theme bei Mandanten mit dunklen Farben sind
  nicht belegt (Testkatalog A, B, J).
- **Materialvermietung** ist nicht Teil dieses Zweigs
  (`2026-11-13-materialvermietung-uebernahme-befund.md`).
