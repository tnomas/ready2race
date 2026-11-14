# ADR-0047: WebDAV-Export als Job-Warteschlange und Datensicherung als JSON; Serverlayout konfigurierbar; pCloud-Anbindung zurückgestellt

- Status: angenommen
- Datum: 2025-08-20
- Bereich: backend, betrieb, datenbank
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Dokumente einer Veranstaltung (Startlisten, Ergebnisse, Rechnungen, Reports) sollen automatisch auf einen WebDAV-Speicher, damit Regattabüro und Verein sie ohne Anmeldung in ready2race finden. Ein erster Ansatz lud alles synchron als ZIP hoch und blockierte den Aufruf. Kurz darauf sollten auch Stammdaten und ganze Veranstaltungen zwischen Instanzen übertragbar bzw. sicherbar sein. Im August 2026 sollte der Export zusätzlich auf einen pCloud-Speicher, der ein anderes Pfadlayout hat und mit `409` auf Ordneranlagen antwortete.

## Entscheidung

- **Export als Warteschlange**: Tabellen `webdav_export_process`, `webdav_export_folder` und `webdav_export` (Migration `V202508221100__webdav_export.sql`) mit Status je Ordner und je Datei (`done_at`/`exported_at`, `error_at`, `error`). Ein dynamisch getakteter Job (`scheduleDynamic`, 10 s, [ADR-0013](0013-scheduler-und-datenbank-warteschlangen.md)) arbeitet sie ab; Fehler werden je Datei protokolliert, nicht für den ganzen Prozess. Eine Statusansicht zeigt den Fortschritt.
- **HTTP-Client ist der ktor-Client (CIO)**; okhttp wurde aus dem `pom.xml` entfernt. WebDAV-Funktionen sind Coroutinen mit einer eigenen `CoroutineComprehension` im KIO-Umfeld ([ADR-0002](0002-kio-effektsystem.md)).
- **Datensicherung als JSON je Entitätstyp**: `WebDAVExportType` unterscheidet Dokumentexporte (`INVOICES`, `REGISTRATION_RESULTS`, `DOCUMENTS`, `RESULTS`, `START_LISTS`) von Datenexporten (`DB_USERS`, `DB_PARTICIPANTS`, `DB_BANK_ACCOUNTS`, `DB_RATING_CATEGORIES`, `DB_EVENT`, `DB_COMPETITION` u. a.). Tabellen `webdav_export_data`, `webdav_export_dependency` (Abhängigkeitsgraph), `webdav_import_process`, `webdav_import_data` (Migration `V202509101500__webdav_export_data.sql`); ein `manifest.json` beschreibt das Paket. Export über jOOQ-Records statt handgeschriebener Data-Classes; der Import löst Abhängigkeiten auf. **Passwörter werden nicht exportiert.** Export- und Importordner sind konfigurierbar. Der Dienst ist in `WebDAVService`, `WebDAVExportService` und `WebDAVImportService` geteilt.
- **Serverlayout konfigurierbar** (2026-08-13): `Config.WebDAV.Layout` mit `NEXTCLOUD` (Pfad `remote.php/dav/files/<user>/…`) und `PLAIN`, gesetzt über die optionale Umgebungsvariable `WEBDAV_LAYOUT`, Vorgabe `NEXTCLOUD`, damit bestehende Deployments unverändert laufen. `WebDAVService` normalisiert jedes Pfadsegment auf Unicode-NFC (`java.text.Normalizer`), sendet Ordneradressen mit abschließendem Schrägstrich, und ein `409` meldet die volle Zieladresse.
- **pCloud-Anbindung zurückgestellt**: Trotz dieser drei Härtungen blieb ein `409` beim `MKCOL` ungeklärt. Die Commits wurden am 2026-08-13 vor der Regatta aus dem Sammelzweig entfernt und lagen auf einem eigenen Zweig; am 2026-08-22 wurden die Härtungen als `webdav-nfc` in `main` gemergt (`3f95d798`). Der nächste Schritt ist eine Handprüfung per `PROPFIND`/`MKCOL` durch den Projektinhaber, nicht weiteres Raten.

## Verworfene Alternativen

- **Synchroner ZIP-Export** (`cc9cce55`) → **Einzeldateien** (`044ea832`) → **Jobs** (`212ccd85`): die ersten beiden Stufen blockierten den Aufruf und ließen bei einem Fehler alles scheitern.
- **okhttp** als HTTP-Client (`2ce497d3` ersetzt es): zweiter Client neben ktor ohne Coroutine-Integration.
- **Eigene Export-Data-Classes** je Entität (`a75a9c65` entfernt sie für Bankkonten): doppelte Pflege neben den jOOQ-Records.
- **try/catch in `importData`** (`3b1bd09e` entfernt): widerspricht dem KIO-Fehlerfluss.
- **Urkundenvorlagen über WebDAV transportieren**: verworfen, weil der WebDAV-Export Veranstaltungsdaten transportiert und Vorlagen globale Konfiguration sind; sie bekamen ein eigenes Paketformat ([ADR-0051](0051-urkunden-lueckentext-pdf-word-vorlagenpakete.md)).

## Konsequenzen

- Der Export ist robust gegen einzelne Fehler, aber asynchron: nach dem Klick ist die Datei nicht sofort da, und der Betreiber muss die Statusansicht lesen.
- Die Datensicherung ist an die jOOQ-Records gebunden; Schemaänderungen an exportierten Tabellen ändern das Exportformat ohne Versionsnummer. Ein Import in eine Instanz mit anderem Schema ist nicht abgesichert.
- Das Export- und Importformat kennt Wertungskategorien und Konfigurationen, aber nicht die Dimensionen der Teilnahmebedingungen; der Sammelexport ist dort „dimensionsblind" ([ADR-0084](0084-bedingungen-geltungsbereich-und-protokoll.md)).
- `WEBDAV_LAYOUT` ist bewusst nicht Teil des Pflichtbündels der Konfiguration; ein Tippfehler führt zu einem Parserfehler beim Start ([ADR-0012](0012-eigene-request-validierung-und-parser.md)), nicht zu stillem Fallback.
- pCloud bleibt offen. Wer die Anbindung wieder aufnimmt, sollte die drei ausgeschlossenen Ursachen (NFD-Umlaute, fehlender Schrägstrich, Tippfehler in der Adresse) nicht erneut prüfen.

## Quellen

- Commits: `fcf64e7b` (wip WebDAV-Export), `cc9cce55` (ZIP), `044ea832` (Einzeldateien), `212ccd85` (Jobs), `94a6ff34` (Status), `4a839b73` (Ordner-Warteschlangen), `2ce497d3` (ktor statt okhttp), `ec64138e` (Export/Import von Datenbankeinträgen), `b7db21ed` (drei Services), `2b20235f` (kein Passwort im Export), `3b1bd09e` (try/catch entfernt), `a75a9c65`, `cdbe5eb8` (jOOQ-Records), `c08fe8f9` (Import-UI), `858e7683` (Ordner konfigurierbar), `683b7794` (Serverlayout), `ce4ea29e` (NFC), `cea96f7a` (409 mit Zieladresse), `d3345751` (Schrägstrich), `d85691cb` (Merge in Sammelzweig), `1e3ca7f1` (Stand, auf den zurückgesetzt wurde), `3f95d798` (Merge webdav-nfc in main)
- Migrationen: `V202508221100__webdav_export.sql`, `V202509101500__webdav_export_data.sql`
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/webDAV/`, `backend/src/main/kotlin/de/lambda9/ready2race/backend/config/Config.kt` (`WebDAV.Layout`, `WEBDAV_LAYOUT`), `Application.kt` (`scheduleDynamic`)
- Verwandte ADRs: [ADR-0002](0002-kio-effektsystem.md), [ADR-0012](0012-eigene-request-validierung-und-parser.md), [ADR-0013](0013-scheduler-und-datenbank-warteschlangen.md), [ADR-0021](0021-binaerdaten-in-der-datenbank.md), [ADR-0051](0051-urkunden-lueckentext-pdf-word-vorlagenpakete.md), [ADR-0084](0084-bedingungen-geltungsbereich-und-protokoll.md)
