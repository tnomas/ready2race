# Architecture Decision Records

Dieser Ordner ist das Entscheidungsgedächtnis von ready2race. Jede Entscheidung mit Dauerwirkung bekommt ein ADR nach [`template.md`](template.md) mit fortlaufender Nummer. ADRs werden nicht umgeschrieben, sondern durch neue ersetzt; der Status verweist dann auf den Nachfolger. Verworfene Alternativen und wieder ausgebaute Features gehören ausdrücklich hinein.

ADR-0001 bis ADR-0101 wurden am 2026-09-07 aus der Commit-Historie (seit 2024-12-19), den Specs und Plänen unter `docs/superpowers/` und Arbeitsnotizen rekonstruiert und sind entsprechend gekennzeichnet. Die Nummern folgen dem Datum der Entscheidung, nicht dem Thema. Wie der Ordner gepflegt wird, steht in [ADR-0102](0102-ki-faehiges-repository.md) und in `AGENTS.md`, Abschnitt 11. ADR-0103 bis ADR-0108 (2026-11-13) wurden mit der Umsetzung des Review-Zweigs, ADR-0109 bis ADR-0111 (2026-11-14) mit der Übernahme der Materialvermietung geschrieben und nicht rekonstruiert.

## Nach Thema

### Grundlagen und Backend-Architektur

- [ADR-0001](0001-kotlin-ktor-jooq-flyway-backend.md) Backend in Kotlin auf Ktor mit jOOQ, Flyway und Maven
- [ADR-0002](0002-kio-effektsystem.md) KIO-Effektsystem (tailwind-kio) mit Comprehension statt Exceptions
- [ADR-0003](0003-entity-control-boundary-je-domaene.md) Entity-Control-Boundary je Domäne, SQL ausschließlich in Repos
- [ADR-0004](0004-openapi-first-handgepflegte-yaml.md) OpenAPI-first: handgepflegte YAML als Vertrag, generierter und eingecheckter Frontend-Client
- [ADR-0012](0012-eigene-request-validierung-und-parser.md) Eigene Request-Validierung (Validatable) und gemeinsamer Parser; Parsing erst nach Authentifizierung
- [ADR-0013](0013-scheduler-und-datenbank-warteschlangen.md) In-Process-Scheduler mit Datenbank-Warteschlangen für Hintergrundjobs
- [ADR-0017](0017-java-17-zielplattform-jooq-3-19.md) Java 17 als Zielplattform, jOOQ bleibt auf 3.19
- [ADR-0052](0052-typespec-als-zweitbeschreibung.md) TypeSpec unter api/ als Zweitbeschreibung mit chirurgischem Merge; die YAML bleibt Quelle
- [ADR-0057](0057-kio-fail-ohne-bang-ist-no-op.md) KIO.fail ohne „!" ist ein No-Op: Bau- und Review-Regel für jeden Fehlerpfad

### Datenbank und Migrationen

- [ADR-0014](0014-flyway-migrationskonventionen.md) Flyway-Migrationen mit Zeitstempel-Version, outOfOrder, Umbenennen vor dem Merge, Umbau und Abbau getrennt
- [ADR-0015](0015-views-in-aftermigrate-enums-als-text.md) Lese-Views ausschließlich in afterMigrate.sql; Enums als Text ohne Datenbank-Typ
- [ADR-0016](0016-schema-konventionen-uuid-audit-timestamp.md) Schema-Konventionen: UUID-Schlüssel, Audit-Spalten, Unique-Index statt Constraint, Zeitstempel ohne Zeitzone in Europe/Berlin
- [ADR-0018](0018-nummernkreise-sequence-tabelle.md) Nummernkreise über eine eigene sequence-Tabelle
- [ADR-0021](0021-binaerdaten-in-der-datenbank.md) Dokumente und Binärdaten liegen in der Datenbank

### Sicherheit, Sitzungen und Rechte

- [ADR-0007](0007-argon2id-passwort-hashing.md) Passwörter mit Argon2id über password4j
- [ADR-0008](0008-serverseitige-sessions-header-token.md) Serverseitige Sessions mit Datenbank-Token im Header X-Api-Session (kein Cookie, kein JWT)
- [ADR-0009](0009-rate-limiting-im-server.md) Rate-Limiting im Server: Login je E-Mail, Passwort-Reset, publicInfo als Notbremse
- [ADR-0010](0010-privilegien-action-resource-scope.md) Privilegien als Action × Resource × Scope, im Code definiert und beim Start gesät; neue Privilegien erreichen nur die Admin-Rolle
- [ADR-0034](0034-eigenes-bild-captcha.md) Eigenes Bild-Captcha im Backend statt externem Dienst
- [ADR-0035](0035-nutzer-onboarding-einladung-ohne-delete-privileg.md) Nutzer-Onboarding: Selbstregistrierung mit Verifikation, Einladung mit Rollen, Passwort-Reset; Einladungen zurückziehen ohne DELETE-Privileg
- [ADR-0088](0088-timing-websocket-und-geraete-token.md) Timing-WebSocket mit Auth per Subprotokoll und Broadcast nach Commit; Geräte-Token als eine Infrastruktur für Posten, Boards und Szenen; Zeitnahme-Routen unter der Veranstaltung
- [ADR-0106](0106-rueckruf-adressen-in-mails-gegen-frontend-origins-pruefen.md) Rückruf-Adressen in Mails werden gegen `FRONTEND_ORIGINS` bzw. den Host der Anfrage geprüft
- [ADR-0110](0110-rolle-materialanbieter-systemverwaltet-an-anbieter-zuordnung.md) Die Rolle „Materialanbieter“ ist systemverwaltet (Kennung `…0040`), folgt der Anbieter-Zuordnung am Konto und ist nicht kopierbar

### API und Fehlerbehandlung

- [ADR-0011](0011-http-fehlersemantik-und-errorcode-muster.md) HTTP-Fehlersemantik (403/422/409) und ErrorCode-Muster: Backend nennt den Grund, Frontend übersetzt
- [ADR-0046](0046-timecode-adaptive-praezision.md) Ergebniszeiten als Timecode (Millisekunden plus Anzeigeformat) mit adaptiver Anzeigepräzision
- [ADR-0082](0082-hintergrundaktualisierung-etag-polling-und-push.md) Hintergrundaktualisierung: ETag-Polling mit Tick ab Antwort, ergänzt um einen öffentlichen Event-Push-Kanal; Polling bleibt Sicherheitsnetz

### Frontend

- [ADR-0005](0005-frontend-stack-react-vite-mui.md) Frontend-Stack React/Vite/TypeScript mit MUI, TanStack Router, react-hook-form; Kontexte statt Redux
- [ADR-0006](0006-mehrsprachigkeit-i18next-erzwungene-schluessel.md) Mehrsprachigkeit über i18next mit erzwungenen Schlüsseln (de, en, da)
- [ADR-0032](0032-einbettbares-frontend-theme-je-instanz.md) Frontend einbettbar; Theme und Logo je Instanz konfigurierbar; nur Light-Mode
- [ADR-0033](0033-entitytable-entitydialog-grundmuster.md) Generische EntityTable und EntityDialog als Grundmuster; mobile Karten statt Tabellen
- [ADR-0081](0081-kurzbezeichner-kennung-kuerzel-sportneutral.md) Kurzbezeichner überall: Kennung plus Kürzel; Startnummer ist die Bahn; sportneutrale Begriffe und deutsche Umlaute
- [ADR-0086](0086-veranstaltungsmodus-zeitplan-split-und-hinweisbanner.md) Veranstaltungs-Modus im Zeitplan (Split-Layout) statt zweitem Zeitplan-Zugang; Wettkampfseite mit Rücklink; veranstaltungsweiter Hinweisbanner
- [ADR-0103](0103-veranstaltungsbereiche-seitenleiste-breadcrumbs-tiefe-links.md) Veranstaltungsbereiche in der Seitenleiste nach Lebenszyklus, Seitenkopf mit Breadcrumbs, Reiter per Suchparameter
- [ADR-0104](0104-zwei-oberflaechen-drei-theme-geltungsbereiche.md) Zwei Oberflächen, drei Theme-Geltungsbereiche; je Lauf eine Primäraktion, Seltenes in ein flaches Menü
- [ADR-0105](0105-frontend-anfragen-netzfehler-runrequest-download-sitzung-lazy.md) Frontend-Anfragen: Netzfehler als eigener Fall, `runRequest`, ein Download-Helfer, Sitzungsrichtlinie, alle Seiten lazy

### Domäne: Veranstaltung, Meldung, Wettkampf

- [ADR-0022](0022-veranstaltungsstruktur-event-tage-wettkaempfe.md) Veranstaltungsstruktur Event → Veranstaltungstage → Wettkämpfe; „Competition" statt „Race"
- [ADR-0023](0023-wettkampfvorlagen-kopieren-nicht-referenzieren.md) Wettkampf- und Setup-Vorlagen werden kopiert, nicht referenziert
- [ADR-0024](0024-gebuehren-und-benannte-rollen.md) Gebühren als eigene Entität mit Pflicht/Optional; benannte Rollen (NamedParticipant) nur als Rolle
- [ADR-0025](0025-vereine-teilnehmer-scope-own-stammverein.md) Vereine, Teilnehmer, Nutzer: Scope OWN am Verein; Stammverein Pflicht, Zweitvereine nur lesend und meldend
- [ADR-0026](0026-meldung-je-verein-teams-je-wettkampf.md) Meldung: Event-Meldung je Verein, Wettkampfmeldungen als Teams; Registrierungsperioden zentral; Rundmail an Melder
- [ADR-0027](0027-teilnahmebedingungen-global-je-event-manuell.md) Teilnahmebedingungen: global definiert, je Veranstaltung aktiviert, manuell geprüft, mit Prüf-Zeitfenster
- [ADR-0028](0028-wettkampf-setup-runden-matches-vorlagen.md) Wettkampf-Setup: verkettete Runden mit Matches, Seeding und Vorlagen; Match-Benennung nach Teilnehmerzahl bleibt unangetastet
- [ADR-0029](0029-durchfuehrung-laeufe-startnummern-platzierung.md) Durchführung: Meldungen finalisieren, Läufe mit Startnummern; Platzierung deckt alle Starter
- [ADR-0038](0038-ersatzleute-als-eigene-entitaet.md) Ersatzleute (Substitution) als eigene Entität je Meldung und Runde; Aufstellung entscheidet Kotlin, nicht SQL
- [ADR-0043](0043-wertungskategorien-je-meldung.md) Wertungskategorien je Meldung mit Altersbeschränkung je Veranstaltung
- [ADR-0044](0044-abmeldung-dns-dnf-dq-im-freitext.md) Abmeldung als eigene Entität; DNS/DNF/DQ im Freitextfeld statt neuer Spalte; Abmelden bis zum ersten Ergebnis; „erledigt" und „gefahren" getrennt
- [ADR-0049](0049-challenge-events-teilnehmer-ohne-konto.md) Challenge-Veranstaltungen mit Selbsteinreichung; Teilnehmer ohne Konto per E-Mail-Token; Selbstregistrierung; globale Konfiguration als Singleton-Zeile
- [ADR-0084](0084-bedingungen-geltungsbereich-und-protokoll.md) Teilnahmebedingungen mit Geltungsbereich je Tag und je Wettkampf; additive Scan-Bestätigung; Revisionsprotokoll
- [ADR-0085](0085-betrieb-ab-je-veranstaltungstag.md) „Betrieb ab" je Veranstaltungstag, Fenster auf dem Gerät ausgewertet

### Domäne: Durchführung, Laufzustände, Zeitplan

- [ADR-0059](0059-laufzustand-eine-ableitung.md) Der Laufzustand wird an genau einer Stelle abgeleitet; Ablesungen sind Felder, neue Enum-Werte nur mit Begründung
- [ADR-0060](0060-teilergebnisse-zeitstrafen-ausweisen.md) Teilergebnisse ohne Rennende; Zeitstrafen werden ausgewiesen, nie verrechnet
- [ADR-0061](0061-lauf-endet-nur-durch-aktiven-input.md) Ein Lauf endet nur durch aktiven Input; Rückfrage bei offenen Ergebnissen; Beenden zurücknehmen und Lauf zurücksetzen ohne Neuvergabe der Team-IDs
- [ADR-0063](0063-zeitstrahl-slots-feste-uhrzeit-import.md) Zeitstrahl: Zeitplan-Slots mit fester Uhrzeit, geplant vs. real getrennt (started_at/finished_at), Excel-Import als Planungsweg, Verschieben mit Vorschau
- [ADR-0064](0064-aktivierungskette-ganzer-zeitplan.md) Die Aktivierungskette läuft über den ganzen Zeitplan und hält an der ersten Gruppe mit offenem Lauf; der Zeitstrahl ist die einzige Kette
- [ADR-0065](0065-kettenmodus-dreiwertig-regattabuero-beendet-immer.md) Kettenmodus dreiwertig statt Boolean; das Regattabüro kann immer beenden; Enum-Werte bleiben, nur Texte ändern sich
- [ADR-0066](0066-entfaellt-statt-ueberspringen-sichtbar-markieren.md) „Entfällt" statt „Überspringen"; abgesagte Läufe bleiben sichtbar markiert; eine Runde absagen nur aus der Durchführung und nur ohne offene Läufe
- [ADR-0069](0069-pruefungsschweregrad-je-wettkampf.md) Prüfungsschweregrad je Wettkampf als Abweichungstabelle; Check-in-Pflicht als Eigenschaft des Rennformats; keine optimistische Sperre
- [ADR-0070](0070-laufzustaende-preparing-running-klaerung.md) Aktivierung ruft zum Start (PREPARING), „Läuft" nur aus gemessenem oder bestätigtem Start; Zustand „Klärung" für strittige Läufe
- [ADR-0072](0072-ergebnisse-nach-wertungskategorien-und-partie.md) Ergebnisse nach Wertungskategorien mit einer Rechenstelle; Wertung je Partie; der Urkundenplatz bleibt wettkampfweit
- [ADR-0073](0073-folgerunden-automatik-erstellt-aktiviert-nicht.md) Folgerunden-Automatik erstellt Runden, aktiviert aber nichts; Korrekturen laufen über Löschen
- [ADR-0074](0074-freilos-ableitung-kein-zustand.md) Freilos ist eine Ableitung, kein Zustand; Freilos-Name wird am Lauf materialisiert; „Freilos muss fahren"; „Freilos ohne Start" gebaut und ausgebaut

### Domäne: Vereine, Check-in, Bedingungen

- [ADR-0041](0041-checkin-checkout-ereignisprotokoll-arena.md) Check-in/-out als Ereignisprotokoll auf Teilnehmerebene, ohne Kopplung an die Rennlogik; „Arena" statt „Wasser"; ein Scan genügt
- [ADR-0071](0071-vereinskette-statt-renngemeinschaft.md) Vereinskette statt „Renngemeinschaft"; Vereinskürzel und Kürzungsregeln als Daten, Sportwissen nicht im Produktkern
- [ADR-0075](0075-manueller-checkin-mit-begruendung-und-spur.md) Manueller Check-in/-out mit Pflichtbegründung und Änderungsspur, kein Löschen, kein neues Privileg

### Domäne: Materialvermietung

- [ADR-0109](0109-materialvermietung-eigene-domaene-anfragen-ohne-fremdschluessel.md) Materialvermietung als eigene Domäne: Anfragen ohne Fremdschlüssel, Freigabe durch die Meldung, Verursacher als Momentaufnahme, Ausfall nur über die Ausnahme je Lauf
- [ADR-0110](0110-rolle-materialanbieter-systemverwaltet-an-anbieter-zuordnung.md) Die Rolle „Materialanbieter“ ist systemverwaltet (Kennung `…0040`), folgt der Anbieter-Zuordnung am Konto und ist nicht kopierbar
- [ADR-0111](0111-meldungsnummer-und-startnummer-eine-ableitung-des-wirksamen-materials.md) Meldungsnummer und Startnummer im Lauf sind zwei Zahlen; das wirksame Material je Lauf-Team hat genau eine Ableitung; Änderungsmarker; offen: Startnummer aus der Meldungsnummer

### Dokumente, Rechnungen, Exporte

- [ADR-0019](0019-rechnungen-aus-meldungen-snapshot.md) Rechnungen aus Meldungen mit eingefrorenen Kontakt- und Bankdaten; Nachmeldung als eigener Rechnungsmodus; Empfängerkontakte nach heutigem Stand
- [ADR-0020](0020-pdf-dsl-auf-pdfbox-mit-dokumentvorlagen.md) PDF-Erzeugung über eigene DSL auf PDFBox mit hochladbaren Dokumentvorlagen
- [ADR-0042](0042-startlisten-export-ergebnisimport-stabile-kennung.md) Konfigurierbarer Startlisten-Export und Ergebnisimport; stabile Team-Kennung statt Startnummer; Sammelexport und Export-Mappe
- [ADR-0047](0047-webdav-export-jobs-und-datensicherung.md) WebDAV-Export als Job-Warteschlange und Datensicherung als JSON; Serverlayout konfigurierbar; pCloud-Anbindung zurückgestellt
- [ADR-0050](0050-csv-import-zwei-leseversuche.md) CSV-Import mit eigenem Leser; zwei Leseversuche statt einer Parser-Einstellung
- [ADR-0051](0051-urkunden-lueckentext-pdf-word-vorlagenpakete.md) Urkunden als Lückentext-Dokumente: PDF und Word aus einer Platzhalterlogik, Vorlagenpakete, Grundlinien-Messung
- [ADR-0079](0079-siegerehrungsbogen-und-ergebnisliste-ein-generator.md) Siegerehrungsbogen und Ergebnisliste aus einem Generator; Seitenpassung gemessen statt geschätzt; Auswahl per ID

### Öffentliche Anzeigen, Boards, Sprecher

- [ADR-0045](0045-oeffentliche-ergebnisse-live-tab-freigabe.md) Öffentliche Ergebnisseite mit Live-Tab; Ergebnisfreigabe je Veranstaltung (Vorgabe: nur beendete Läufe) als einziges Tor
- [ADR-0058](0058-schiedsrichter-dashboard-eigene-ressource-nutzlast.md) Schiedsrichter-Live-Dashboard als eigene Ressource mit Privileg; Nutzlast statt Takt (gzip, ETag, Crew-Endpunkt); Notizen append-only; Einstellungen geräte-lokal
- [ADR-0062](0062-oeffentliche-anzeigen-cache-marker-rate-limit.md) Öffentliche Anzeigen: Cache je Veranstaltung mit Änderungsmarker, Rate-Limit als Notbremse, Takt-Untergrenze; kein N+1-Umbau
- [ADR-0076](0076-mein-event-band-qr-ohne-anmeldung.md) „Mein Event": persönliches Dashboard per Band-QR ohne Anmeldung, Code nicht in der URL, Bedingungen nur mit Freigabe
- [ADR-0078](0078-board-system-ersetzt-info-ansichten.md) Konfigurierbare Boards ersetzen Info-Ansichten und Athleten-Board; eigenes Recht BOARD; Boards hinter Auth mit Geräte-Token; Timeline-Cursor
- [ADR-0098](0098-sprecher-board-drei-spalten-dashboard.md) Sprecher-Board als Drei-Spalten-Dashboard mit Push und festem Poll-Sicherheitsnetz; Standalone-Demo-Build

### Helfer-App

- [ADR-0039](0039-helfer-app-eigener-bereich-unter-app.md) Helfer-App als eigener Frontend-Bereich unter /app mit eigener Sitzung; ein QR-Code je Entität und Veranstaltung
- [ADR-0040](0040-caterer-abrechnung-als-ereignisprotokoll.md) Verpflegungsabrechnung als reines Ereignisprotokoll ohne Kontostand
- [ADR-0077](0077-helfer-app-als-pwa.md) Helfer-App als installierbare PWA: Service-Worker-Scope über den Ablageort, Sitzungen im localStorage, Offline-Sperre für Schreibaktionen
- [ADR-0099](0099-helfer-app-scannen-zuerst.md) Helfer-App: Scannen zuerst, Veranstaltung und Modus im Gedächtnis, Entscheidungen als reine Funktionen

### Zeitnahme: externer Dienst

- [ADR-0054](0054-externer-zeitnahmedienst-setzung-bleibt-hier.md) Anbindung eines externen Zeitnahmedienstes: die Setzung bleibt bei ready2race, Ergebnisse kommen per Feed-Pull, Anbindung rein additiv
- [ADR-0055](0055-feed-schluessel-lauf-team-id-bahn-aus-rank.md) Schlüssel im Zeitnahme-Feed: Lauf-Team-ID in „Extra info", Bahn aus der Listenposition, Bib nicht mehr als Startnummer
- [ADR-0056](0056-automatischer-feed-abruf-feed-ist-wahrheit.md) Automatischer Feed-Abruf als Scheduler-Job; Handeingabe pausiert je Lauf; der Feed ist Quelle der Wahrheit; Allowlist DNS/DNF/DQ; keine Redirects
- [ADR-0067](0067-zeitnahme-konfiguration-je-wettkampf-vererbt.md) Zeitnahme-Konfiguration je Wettkampf, vom Event vererbt (coalesce), Abweichungen benannt — *ersetzt durch ADR-0080*
- [ADR-0068](0068-benannte-zeitnahme-rennen-statt-adressen.md) Benannte Zeitnahme-Rennen als Zeilen statt zweier fester Adressen — *ersetzt durch ADR-0080*

### Zeitnahme: eigenes Modul

- [ADR-0080](0080-zeitnahmeprofil-baum-vier-ebenen.md) Zeitnahmeprofil-Baum: Rennen und Zeitnahmetyp sind ein Begriff mit vier Vererbungsebenen; das System hängt nur an der Veranstaltung — *angenommen (ersetzt ADR-0067 und ADR-0068)*
- [ADR-0087](0087-eigenes-zeitnahme-modul-append-only.md) Eigenes Zeitnahme-Modul: Zeitmarken als Append-only-Log, Erfassung lokal mit Serveruhr, Echtzeit-Rückschreibung in den bestehenden Ergebnisfluss, Abschneiden statt Runden
- [ADR-0089](0089-startsequenzen-serverseitig-fehlstart.md) Startsequenzen laufen serverseitig; Fehlstart-Rückruf ohne automatische Strafe; die Zeitnahme stempelt Laufzustände, stößt aber keine Kette an; Posten-Boards mit einem Startknopf
- [ADR-0090](0090-scharfschaltung-je-posten.md) Scharfschaltung je Posten: Betriebsart ONETOUCH/ARMED und Zustand getrennt; der Zieleinlauf ohne Zuordnung ist nie gesperrt
- [ADR-0091](0091-toene-gehoeren-dem-zeitnahmetyp.md) Töne gehören dem Zeitnahmetyp: Ton-Sätze je Veranstaltung mit Vorgabesatz, ein Schritt-Typ für alle Folgen, verpasste Töne werden nie nachgeholt
- [ADR-0092](0092-zwischenzeiten-am-lauf-distanz-am-wettkampf.md) Zwischenzeiten werden aus SPLIT-Marken übernommen, die Distanz gehört dem Wettkampf, with_laps entfällt ersatzlos
- [ADR-0093](0093-betrieb-reiter-als-renntag-einstieg.md) Postenverwaltung und Renntag-Einstieg über den Reiter „Betrieb" mit einer Kachel je Rolle; die Boards-Seite als Ort verworfen

### Livestream

- [ADR-0094](0094-stream-overlay-als-board-kachel.md) Stream-Overlay als Board-Kachel mit Chroma-Key ohne neuen Datenpfad — *ersetzt durch ADR-0095*
- [ADR-0095](0095-eigene-stream-domaene-server-entscheidet-on-air.md) Eigene Stream-Domäne: der Server entscheidet „on air", Alpha statt Chroma, Anker-Plätze statt Layout-Editor, Szenen-Token, Herzschlag-Kanal — *angenommen (ersetzt ADR-0094)*
- [ADR-0096](0096-livestream-grafiken-designsystem-regie-board.md) Livestream-Grafiken mit eigenem Designsystem, bühnenfesten Maßen und Kürzungsleiter; Regie-Board mit Phasen-Probemodus statt Dauerschleife
- [ADR-0097](0097-zeitnahme-livestream-sync-eine-sequenz-rechnung.md) Zeitnahme und Livestream: jede Sequenz-Mutation bumpt den Marker, Pause friert die Uhr, eine geteilte Sequenz-Rechnung für Stream, Boards und Schiedsrichter-Dashboard

### Betrieb, Konfiguration, Lieferung

- [ADR-0031](0031-auslieferung-fat-jar-getrenntes-frontend.md) Auslieferung als Fat-Jar, Frontend getrennt gebaut; Docker-Build aus dem Repo entfernt; skipCodegen für Dev-Builds
- [ADR-0048](0048-smtp-override-administration-dev-whitelist.md) SMTP-Konfiguration aus der Datenbank; Privileg-Ressource ADMINISTRATION; E-Mail-Whitelist im Entwicklungsmodus
- [ADR-0083](0083-datenschutz-prod-abzuege-und-datenschutzseite.md) Datenschutz: Produktionsabzüge bleiben aus der Historie; Datenschutzseite statt Consent-Banner — *angenommen (Seite im Fork-main derzeit nicht vorhanden, siehe D4)*
- [ADR-0107](0107-backend-laufzeit-io-dispatcher-pool-argon2-zeitzone-health.md) Backend-Laufzeit: IO-Dispatcher, Pool mit Statement-Timeout, Sitzungsverlängerung, Argon2-Parameter, `AppZone`, Healthcheck, Proxy-Annahme

### Prozess und Arbeitsweise

- [ADR-0030](0030-tests-testcontainers-und-reine-logik.md) Tests gegen echtes Postgres via Testcontainers; Entscheidungen in reinen Logik-Objekten; Frontend nur reine Logik mit Vitest
- [ADR-0036](0036-lizenz-gplv3-publiccode.md) Quellcode unter GPL-3.0, lambda9 als Rechteinhaber, publiccode.yml
- [ADR-0037](0037-upstream-entwicklungsprozess-pull-requests.md) Upstream-Entwicklungsprozess: Ticket-Branches, Review per Pull Request auf GitHub
- [ADR-0053](0053-ki-arbeitsdateien-nicht-im-repo.md) KI-Arbeitsdateien gehören nicht ins Repository (CLAUDE.md ignoriert) — *ersetzt durch ADR-0102*
- [ADR-0100](0100-fork-arbeitsweise-worktrees-merge-richtung-build-db.md) Fork-Arbeitsweise: Sammelzweig, Upstream-Merge-Requests, dann fork/main; Merge-Richtung, ein Worktree je Session, eigene Build-Datenbank, Archiv-Tags statt Zweige
- [ADR-0101](0101-sprach-und-commit-regeln-keine-herkunftsangaben.md) Sprach- und Commit-Regeln: Deutsch mit Umlauten im Fork, Englisch für Upstream-Merge-Requests, keine KI-Attribution, keine Herkunftsangaben
- [ADR-0102](0102-ki-faehiges-repository.md) KI-fähiges Repository: AGENTS.md und CLAUDE.md versioniert, ADR-Ordner als Entscheidungsgedächtnis — *angenommen (ersetzt ADR-0053)*
- [ADR-0108](0108-backend-tests-template-datenbank-committing-concurrent.md) Backend-Tests: Template-Datenbank statt Neumigration, `testCommittingComprehension` und `ConcurrentTx`

## Chronologisch

| Nr | Datum | Titel | Status |
|---|---|---|---|
| [0001](0001-kotlin-ktor-jooq-flyway-backend.md) | 2024-12-19 | Backend in Kotlin auf Ktor mit jOOQ, Flyway und Maven | angenommen |
| [0002](0002-kio-effektsystem.md) | 2024-12-19 | KIO-Effektsystem (tailwind-kio) mit Comprehension statt Exceptions | angenommen |
| [0003](0003-entity-control-boundary-je-domaene.md) | 2024-12-19 | Entity-Control-Boundary je Domäne, SQL ausschließlich in Repos | angenommen |
| [0004](0004-openapi-first-handgepflegte-yaml.md) | 2024-12-19 | OpenAPI-first: handgepflegte YAML als Vertrag, generierter und eingecheckter Frontend-Client | angenommen |
| [0005](0005-frontend-stack-react-vite-mui.md) | 2024-12-19 | Frontend-Stack React/Vite/TypeScript mit MUI, TanStack Router, react-hook-form; Kontexte statt Redux | angenommen |
| [0006](0006-mehrsprachigkeit-i18next-erzwungene-schluessel.md) | 2025-01-13 | Mehrsprachigkeit über i18next mit erzwungenen Schlüsseln (de, en, da) | angenommen |
| [0007](0007-argon2id-passwort-hashing.md) | 2025-01-08 | Passwörter mit Argon2id über password4j | angenommen |
| [0008](0008-serverseitige-sessions-header-token.md) | 2024-12-19 | Serverseitige Sessions mit Datenbank-Token im Header X-Api-Session (kein Cookie, kein JWT) | angenommen |
| [0009](0009-rate-limiting-im-server.md) | 2025-01-09 | Rate-Limiting im Server: Login je E-Mail, Passwort-Reset, publicInfo als Notbremse | angenommen |
| [0010](0010-privilegien-action-resource-scope.md) | 2025-02-13 | Privilegien als Action × Resource × Scope, im Code definiert und beim Start gesät; neue Privilegien erreichen nur die Admin-Rolle | angenommen |
| [0011](0011-http-fehlersemantik-und-errorcode-muster.md) | 2025-01-30 | HTTP-Fehlersemantik (403/422/409) und ErrorCode-Muster: Backend nennt den Grund, Frontend übersetzt | angenommen |
| [0012](0012-eigene-request-validierung-und-parser.md) | 2025-01-23 | Eigene Request-Validierung (Validatable) und gemeinsamer Parser; Parsing erst nach Authentifizierung | angenommen |
| [0013](0013-scheduler-und-datenbank-warteschlangen.md) | 2025-01-28 | In-Process-Scheduler mit Datenbank-Warteschlangen für Hintergrundjobs | angenommen |
| [0014](0014-flyway-migrationskonventionen.md) | 2024-12-19 | Flyway-Migrationen mit Zeitstempel-Version, outOfOrder, Umbenennen vor dem Merge, Umbau und Abbau getrennt | angenommen |
| [0015](0015-views-in-aftermigrate-enums-als-text.md) | 2025-02-13 | Lese-Views ausschließlich in afterMigrate.sql; Enums als Text ohne Datenbank-Typ | angenommen |
| [0016](0016-schema-konventionen-uuid-audit-timestamp.md) | 2024-12-19 | Schema-Konventionen: UUID-Schlüssel, Audit-Spalten, Unique-Index statt Constraint, Zeitstempel ohne Zeitzone in Europe/Berlin | angenommen |
| [0017](0017-java-17-zielplattform-jooq-3-19.md) | 2025-03-07 | Java 17 als Zielplattform, jOOQ bleibt auf 3.19 | angenommen |
| [0018](0018-nummernkreise-sequence-tabelle.md) | 2025-01-30 | Nummernkreise über eine eigene sequence-Tabelle | angenommen |
| [0019](0019-rechnungen-aus-meldungen-snapshot.md) | 2025-01-30 | Rechnungen aus Meldungen mit eingefrorenen Kontakt- und Bankdaten; Nachmeldung als eigener Rechnungsmodus; Empfängerkontakte nach heutigem Stand | angenommen |
| [0020](0020-pdf-dsl-auf-pdfbox-mit-dokumentvorlagen.md) | 2025-04-01 | PDF-Erzeugung über eigene DSL auf PDFBox mit hochladbaren Dokumentvorlagen | angenommen |
| [0021](0021-binaerdaten-in-der-datenbank.md) | 2025-02-26 | Dokumente und Binärdaten liegen in der Datenbank | angenommen |
| [0022](0022-veranstaltungsstruktur-event-tage-wettkaempfe.md) | 2025-01-16 | Veranstaltungsstruktur Event → Veranstaltungstage → Wettkämpfe; „Competition" statt „Race" | angenommen |
| [0023](0023-wettkampfvorlagen-kopieren-nicht-referenzieren.md) | 2025-02-25 | Wettkampf- und Setup-Vorlagen werden kopiert, nicht referenziert | angenommen |
| [0024](0024-gebuehren-und-benannte-rollen.md) | 2025-02-28 | Gebühren als eigene Entität mit Pflicht/Optional; benannte Rollen (NamedParticipant) nur als Rolle | angenommen |
| [0025](0025-vereine-teilnehmer-scope-own-stammverein.md) | 2025-02-21 | Vereine, Teilnehmer, Nutzer: Scope OWN am Verein; Stammverein Pflicht, Zweitvereine nur lesend und meldend | angenommen |
| [0026](0026-meldung-je-verein-teams-je-wettkampf.md) | 2025-02-26 | Meldung: Event-Meldung je Verein, Wettkampfmeldungen als Teams; Registrierungsperioden zentral; Rundmail an Melder | angenommen |
| [0027](0027-teilnahmebedingungen-global-je-event-manuell.md) | 2025-03-25 | Teilnahmebedingungen: global definiert, je Veranstaltung aktiviert, manuell geprüft, mit Prüf-Zeitfenster | angenommen |
| [0028](0028-wettkampf-setup-runden-matches-vorlagen.md) | 2025-03-19 | Wettkampf-Setup: verkettete Runden mit Matches, Seeding und Vorlagen; Match-Benennung nach Teilnehmerzahl bleibt unangetastet | angenommen |
| [0029](0029-durchfuehrung-laeufe-startnummern-platzierung.md) | 2025-06-12 | Durchführung: Meldungen finalisieren, Läufe mit Startnummern; Platzierung deckt alle Starter | angenommen |
| [0030](0030-tests-testcontainers-und-reine-logik.md) | 2025-03-14 | Tests gegen echtes Postgres via Testcontainers; Entscheidungen in reinen Logik-Objekten; Frontend nur reine Logik mit Vitest | angenommen |
| [0031](0031-auslieferung-fat-jar-getrenntes-frontend.md) | 2024-12-19 | Auslieferung als Fat-Jar, Frontend getrennt gebaut; Docker-Build aus dem Repo entfernt; skipCodegen für Dev-Builds | angenommen |
| [0032](0032-einbettbares-frontend-theme-je-instanz.md) | 2025-01-10 | Frontend einbettbar; Theme und Logo je Instanz konfigurierbar; nur Light-Mode | angenommen |
| [0033](0033-entitytable-entitydialog-grundmuster.md) | 2025-02-03 | Generische EntityTable und EntityDialog als Grundmuster; mobile Karten statt Tabellen | angenommen |
| [0034](0034-eigenes-bild-captcha.md) | 2025-02-20 | Eigenes Bild-Captcha im Backend statt externem Dienst | angenommen |
| [0035](0035-nutzer-onboarding-einladung-ohne-delete-privileg.md) | 2025-01-31 | Nutzer-Onboarding: Selbstregistrierung mit Verifikation, Einladung mit Rollen, Passwort-Reset; Einladungen zurückziehen ohne DELETE-Privileg | angenommen |
| [0036](0036-lizenz-gplv3-publiccode.md) | 2025-03-17 | Quellcode unter GPL-3.0, lambda9 als Rechteinhaber, publiccode.yml | angenommen |
| [0037](0037-upstream-entwicklungsprozess-pull-requests.md) | 2025-02-26 | Upstream-Entwicklungsprozess: Ticket-Branches, Review per Pull Request auf GitHub | angenommen |
| [0038](0038-ersatzleute-als-eigene-entitaet.md) | 2025-07-09 | Ersatzleute (Substitution) als eigene Entität je Meldung und Runde; Aufstellung entscheidet Kotlin, nicht SQL | angenommen |
| [0039](0039-helfer-app-eigener-bereich-unter-app.md) | 2025-07-06 | Helfer-App als eigener Frontend-Bereich unter /app mit eigener Sitzung; ein QR-Code je Entität und Veranstaltung | angenommen |
| [0040](0040-caterer-abrechnung-als-ereignisprotokoll.md) | 2025-07-21 | Verpflegungsabrechnung als reines Ereignisprotokoll ohne Kontostand | angenommen |
| [0041](0041-checkin-checkout-ereignisprotokoll-arena.md) | 2025-08-07 | Check-in/-out als Ereignisprotokoll auf Teilnehmerebene, ohne Kopplung an die Rennlogik; „Arena" statt „Wasser"; ein Scan genügt | angenommen |
| [0042](0042-startlisten-export-ergebnisimport-stabile-kennung.md) | 2025-07-28 | Konfigurierbarer Startlisten-Export und Ergebnisimport; stabile Team-Kennung statt Startnummer; Sammelexport und Export-Mappe | angenommen |
| [0043](0043-wertungskategorien-je-meldung.md) | 2025-08-05 | Wertungskategorien je Meldung mit Altersbeschränkung je Veranstaltung | angenommen |
| [0044](0044-abmeldung-dns-dnf-dq-im-freitext.md) | 2025-07-23 | Abmeldung als eigene Entität; DNS/DNF/DQ im Freitextfeld statt neuer Spalte; Abmelden bis zum ersten Ergebnis; „erledigt" und „gefahren" getrennt | angenommen |
| [0045](0045-oeffentliche-ergebnisse-live-tab-freigabe.md) | 2025-08-14 | Öffentliche Ergebnisseite mit Live-Tab; Ergebnisfreigabe je Veranstaltung (Vorgabe: nur beendete Läufe) als einziges Tor | angenommen |
| [0046](0046-timecode-adaptive-praezision.md) | 2025-11-25 | Ergebniszeiten als Timecode (Millisekunden plus Anzeigeformat) mit adaptiver Anzeigepräzision | angenommen |
| [0047](0047-webdav-export-jobs-und-datensicherung.md) | 2025-08-20 | WebDAV-Export als Job-Warteschlange und Datensicherung als JSON; Serverlayout konfigurierbar; pCloud-Anbindung zurückgestellt | angenommen |
| [0048](0048-smtp-override-administration-dev-whitelist.md) | 2025-10-22 | SMTP-Konfiguration aus der Datenbank; Privileg-Ressource ADMINISTRATION; E-Mail-Whitelist im Entwicklungsmodus | angenommen |
| [0049](0049-challenge-events-teilnehmer-ohne-konto.md) | 2025-10-24 | Challenge-Veranstaltungen mit Selbsteinreichung; Teilnehmer ohne Konto per E-Mail-Token; Selbstregistrierung; globale Konfiguration als Singleton-Zeile | angenommen |
| [0050](0050-csv-import-zwei-leseversuche.md) | 2025-10-27 | CSV-Import mit eigenem Leser; zwei Leseversuche statt einer Parser-Einstellung | angenommen |
| [0051](0051-urkunden-lueckentext-pdf-word-vorlagenpakete.md) | 2025-12-05 | Urkunden als Lückentext-Dokumente: PDF und Word aus einer Platzhalterlogik, Vorlagenpakete, Grundlinien-Messung | angenommen |
| [0052](0052-typespec-als-zweitbeschreibung.md) | 2025-12-10 | TypeSpec unter api/ als Zweitbeschreibung mit chirurgischem Merge; die YAML bleibt Quelle | angenommen |
| [0053](0053-ki-arbeitsdateien-nicht-im-repo.md) | 2025-09-10 | KI-Arbeitsdateien gehören nicht ins Repository (CLAUDE.md ignoriert) | ersetzt durch ADR-0102 |
| [0054](0054-externer-zeitnahmedienst-setzung-bleibt-hier.md) | 2026-07-19 | Anbindung eines externen Zeitnahmedienstes: die Setzung bleibt bei ready2race, Ergebnisse kommen per Feed-Pull, Anbindung rein additiv | angenommen |
| [0055](0055-feed-schluessel-lauf-team-id-bahn-aus-rank.md) | 2026-07-23 | Schlüssel im Zeitnahme-Feed: Lauf-Team-ID in „Extra info", Bahn aus der Listenposition, Bib nicht mehr als Startnummer | angenommen |
| [0056](0056-automatischer-feed-abruf-feed-ist-wahrheit.md) | 2026-08-05 | Automatischer Feed-Abruf als Scheduler-Job; Handeingabe pausiert je Lauf; der Feed ist Quelle der Wahrheit; Allowlist DNS/DNF/DQ; keine Redirects | angenommen |
| [0057](0057-kio-fail-ohne-bang-ist-no-op.md) | 2026-08-03 | KIO.fail ohne „!" ist ein No-Op: Bau- und Review-Regel für jeden Fehlerpfad | angenommen |
| [0058](0058-schiedsrichter-dashboard-eigene-ressource-nutzlast.md) | 2026-07-29 | Schiedsrichter-Live-Dashboard als eigene Ressource mit Privileg; Nutzlast statt Takt (gzip, ETag, Crew-Endpunkt); Notizen append-only; Einstellungen geräte-lokal | angenommen |
| [0059](0059-laufzustand-eine-ableitung.md) | 2026-07-29 | Der Laufzustand wird an genau einer Stelle abgeleitet; Ablesungen sind Felder, neue Enum-Werte nur mit Begründung | angenommen |
| [0060](0060-teilergebnisse-zeitstrafen-ausweisen.md) | 2026-07-30 | Teilergebnisse ohne Rennende; Zeitstrafen werden ausgewiesen, nie verrechnet | angenommen |
| [0061](0061-lauf-endet-nur-durch-aktiven-input.md) | 2026-08-02 | Ein Lauf endet nur durch aktiven Input; Rückfrage bei offenen Ergebnissen; Beenden zurücknehmen und Lauf zurücksetzen ohne Neuvergabe der Team-IDs | angenommen |
| [0062](0062-oeffentliche-anzeigen-cache-marker-rate-limit.md) | 2026-08-03 | Öffentliche Anzeigen: Cache je Veranstaltung mit Änderungsmarker, Rate-Limit als Notbremse, Takt-Untergrenze; kein N+1-Umbau | angenommen |
| [0063](0063-zeitstrahl-slots-feste-uhrzeit-import.md) | 2026-08-03 | Zeitstrahl: Zeitplan-Slots mit fester Uhrzeit, geplant vs. real getrennt (started_at/finished_at), Excel-Import als Planungsweg, Verschieben mit Vorschau | angenommen |
| [0064](0064-aktivierungskette-ganzer-zeitplan.md) | 2026-08-04 | Die Aktivierungskette läuft über den ganzen Zeitplan und hält an der ersten Gruppe mit offenem Lauf; der Zeitstrahl ist die einzige Kette | angenommen |
| [0065](0065-kettenmodus-dreiwertig-regattabuero-beendet-immer.md) | 2026-08-04 | Kettenmodus dreiwertig statt Boolean; das Regattabüro kann immer beenden; Enum-Werte bleiben, nur Texte ändern sich | angenommen |
| [0066](0066-entfaellt-statt-ueberspringen-sichtbar-markieren.md) | 2026-08-05 | „Entfällt" statt „Überspringen"; abgesagte Läufe bleiben sichtbar markiert; eine Runde absagen nur aus der Durchführung und nur ohne offene Läufe | angenommen |
| [0067](0067-zeitnahme-konfiguration-je-wettkampf-vererbt.md) | 2026-08-05 | Zeitnahme-Konfiguration je Wettkampf, vom Event vererbt (coalesce), Abweichungen benannt | ersetzt durch ADR-0080 |
| [0068](0068-benannte-zeitnahme-rennen-statt-adressen.md) | 2026-08-09 | Benannte Zeitnahme-Rennen als Zeilen statt zweier fester Adressen | ersetzt durch ADR-0080 |
| [0069](0069-pruefungsschweregrad-je-wettkampf.md) | 2026-08-07 | Prüfungsschweregrad je Wettkampf als Abweichungstabelle; Check-in-Pflicht als Eigenschaft des Rennformats; keine optimistische Sperre | angenommen |
| [0070](0070-laufzustaende-preparing-running-klaerung.md) | 2026-08-09 | Aktivierung ruft zum Start (PREPARING), „Läuft" nur aus gemessenem oder bestätigtem Start; Zustand „Klärung" für strittige Läufe | angenommen |
| [0071](0071-vereinskette-statt-renngemeinschaft.md) | 2026-08-09 | Vereinskette statt „Renngemeinschaft"; Vereinskürzel und Kürzungsregeln als Daten, Sportwissen nicht im Produktkern | angenommen |
| [0072](0072-ergebnisse-nach-wertungskategorien-und-partie.md) | 2026-08-09 | Ergebnisse nach Wertungskategorien mit einer Rechenstelle; Wertung je Partie; der Urkundenplatz bleibt wettkampfweit | angenommen |
| [0073](0073-folgerunden-automatik-erstellt-aktiviert-nicht.md) | 2026-08-09 | Folgerunden-Automatik erstellt Runden, aktiviert aber nichts; Korrekturen laufen über Löschen | angenommen |
| [0074](0074-freilos-ableitung-kein-zustand.md) | 2026-08-10 | Freilos ist eine Ableitung, kein Zustand; Freilos-Name wird am Lauf materialisiert; „Freilos muss fahren"; „Freilos ohne Start" gebaut und ausgebaut | angenommen |
| [0075](0075-manueller-checkin-mit-begruendung-und-spur.md) | 2026-08-09 | Manueller Check-in/-out mit Pflichtbegründung und Änderungsspur, kein Löschen, kein neues Privileg | angenommen |
| [0076](0076-mein-event-band-qr-ohne-anmeldung.md) | 2026-08-09 | „Mein Event": persönliches Dashboard per Band-QR ohne Anmeldung, Code nicht in der URL, Bedingungen nur mit Freigabe | angenommen |
| [0077](0077-helfer-app-als-pwa.md) | 2026-08-09 | Helfer-App als installierbare PWA: Service-Worker-Scope über den Ablageort, Sitzungen im localStorage, Offline-Sperre für Schreibaktionen | angenommen |
| [0078](0078-board-system-ersetzt-info-ansichten.md) | 2026-08-10 | Konfigurierbare Boards ersetzen Info-Ansichten und Athleten-Board; eigenes Recht BOARD; Boards hinter Auth mit Geräte-Token; Timeline-Cursor | angenommen |
| [0079](0079-siegerehrungsbogen-und-ergebnisliste-ein-generator.md) | 2026-08-09 | Siegerehrungsbogen und Ergebnisliste aus einem Generator; Seitenpassung gemessen statt geschätzt; Auswahl per ID | angenommen |
| [0080](0080-zeitnahmeprofil-baum-vier-ebenen.md) | 2026-08-24 | Zeitnahmeprofil-Baum: Rennen und Zeitnahmetyp sind ein Begriff mit vier Vererbungsebenen; das System hängt nur an der Veranstaltung | angenommen (ersetzt ADR-0067 und ADR-0068) |
| [0081](0081-kurzbezeichner-kennung-kuerzel-sportneutral.md) | 2026-08-07 | Kurzbezeichner überall: Kennung plus Kürzel; Startnummer ist die Bahn; sportneutrale Begriffe und deutsche Umlaute | angenommen |
| [0082](0082-hintergrundaktualisierung-etag-polling-und-push.md) | 2026-08-09 | Hintergrundaktualisierung: ETag-Polling mit Tick ab Antwort, ergänzt um einen öffentlichen Event-Push-Kanal; Polling bleibt Sicherheitsnetz | angenommen |
| [0083](0083-datenschutz-prod-abzuege-und-datenschutzseite.md) | 2026-08-09 | Datenschutz: Produktionsabzüge bleiben aus der Historie; Datenschutzseite statt Consent-Banner | angenommen (Seite im Fork-main derzeit nicht vorhanden, siehe D4) |
| [0084](0084-bedingungen-geltungsbereich-und-protokoll.md) | 2026-08-14 | Teilnahmebedingungen mit Geltungsbereich je Tag und je Wettkampf; additive Scan-Bestätigung; Revisionsprotokoll | angenommen |
| [0085](0085-betrieb-ab-je-veranstaltungstag.md) | 2026-08-11 | „Betrieb ab" je Veranstaltungstag, Fenster auf dem Gerät ausgewertet | angenommen |
| [0086](0086-veranstaltungsmodus-zeitplan-split-und-hinweisbanner.md) | 2026-08-09 | Veranstaltungs-Modus im Zeitplan (Split-Layout) statt zweitem Zeitplan-Zugang; Wettkampfseite mit Rücklink; veranstaltungsweiter Hinweisbanner | angenommen |
| [0087](0087-eigenes-zeitnahme-modul-append-only.md) | 2026-08-17 | Eigenes Zeitnahme-Modul: Zeitmarken als Append-only-Log, Erfassung lokal mit Serveruhr, Echtzeit-Rückschreibung in den bestehenden Ergebnisfluss, Abschneiden statt Runden | angenommen |
| [0088](0088-timing-websocket-und-geraete-token.md) | 2026-08-17 | Timing-WebSocket mit Auth per Subprotokoll und Broadcast nach Commit; Geräte-Token als eine Infrastruktur für Posten, Boards und Szenen; Zeitnahme-Routen unter der Veranstaltung | angenommen |
| [0089](0089-startsequenzen-serverseitig-fehlstart.md) | 2026-08-18 | Startsequenzen laufen serverseitig; Fehlstart-Rückruf ohne automatische Strafe; die Zeitnahme stempelt Laufzustände, stößt aber keine Kette an; Posten-Boards mit einem Startknopf | angenommen |
| [0090](0090-scharfschaltung-je-posten.md) | 2026-08-25 | Scharfschaltung je Posten: Betriebsart ONETOUCH/ARMED und Zustand getrennt; der Zieleinlauf ohne Zuordnung ist nie gesperrt | angenommen |
| [0091](0091-toene-gehoeren-dem-zeitnahmetyp.md) | 2026-08-24 | Töne gehören dem Zeitnahmetyp: Ton-Sätze je Veranstaltung mit Vorgabesatz, ein Schritt-Typ für alle Folgen, verpasste Töne werden nie nachgeholt | angenommen |
| [0092](0092-zwischenzeiten-am-lauf-distanz-am-wettkampf.md) | 2026-08-25 | Zwischenzeiten werden aus SPLIT-Marken übernommen, die Distanz gehört dem Wettkampf, with_laps entfällt ersatzlos | angenommen |
| [0093](0093-betrieb-reiter-als-renntag-einstieg.md) | 2026-08-21 | Postenverwaltung und Renntag-Einstieg über den Reiter „Betrieb" mit einer Kachel je Rolle; die Boards-Seite als Ort verworfen | angenommen |
| [0094](0094-stream-overlay-als-board-kachel.md) | 2026-08-13 | Stream-Overlay als Board-Kachel mit Chroma-Key ohne neuen Datenpfad | ersetzt durch ADR-0095 |
| [0095](0095-eigene-stream-domaene-server-entscheidet-on-air.md) | 2026-08-27 | Eigene Stream-Domäne: der Server entscheidet „on air", Alpha statt Chroma, Anker-Plätze statt Layout-Editor, Szenen-Token, Herzschlag-Kanal | angenommen (ersetzt ADR-0094) |
| [0096](0096-livestream-grafiken-designsystem-regie-board.md) | 2026-08-30 | Livestream-Grafiken mit eigenem Designsystem, bühnenfesten Maßen und Kürzungsleiter; Regie-Board mit Phasen-Probemodus statt Dauerschleife | angenommen |
| [0097](0097-zeitnahme-livestream-sync-eine-sequenz-rechnung.md) | 2026-08-29 | Zeitnahme und Livestream: jede Sequenz-Mutation bumpt den Marker, Pause friert die Uhr, eine geteilte Sequenz-Rechnung für Stream, Boards und Schiedsrichter-Dashboard | angenommen |
| [0098](0098-sprecher-board-drei-spalten-dashboard.md) | 2026-08-16 | Sprecher-Board als Drei-Spalten-Dashboard mit Push und festem Poll-Sicherheitsnetz; Standalone-Demo-Build | angenommen |
| [0099](0099-helfer-app-scannen-zuerst.md) | 2026-09-02 | Helfer-App: Scannen zuerst, Veranstaltung und Modus im Gedächtnis, Entscheidungen als reine Funktionen | angenommen |
| [0100](0100-fork-arbeitsweise-worktrees-merge-richtung-build-db.md) | 2026-08-03 | Fork-Arbeitsweise: Sammelzweig, Upstream-Merge-Requests, dann fork/main; Merge-Richtung, ein Worktree je Session, eigene Build-Datenbank, Archiv-Tags statt Zweige | angenommen |
| [0101](0101-sprach-und-commit-regeln-keine-herkunftsangaben.md) | 2026-08-06 | Sprach- und Commit-Regeln: Deutsch mit Umlauten im Fork, Englisch für Upstream-Merge-Requests, keine KI-Attribution, keine Herkunftsangaben | angenommen |
| [0102](0102-ki-faehiges-repository.md) | 2026-09-07 | KI-fähiges Repository: AGENTS.md und CLAUDE.md versioniert, ADR-Ordner als Entscheidungsgedächtnis | angenommen (ersetzt ADR-0053) |
| [0103](0103-veranstaltungsbereiche-seitenleiste-breadcrumbs-tiefe-links.md) | 2026-11-13 | Veranstaltungsbereiche in der Seitenleiste nach Lebenszyklus, Seitenkopf mit Breadcrumbs, Reiter per Suchparameter | angenommen |
| [0104](0104-zwei-oberflaechen-drei-theme-geltungsbereiche.md) | 2026-11-13 | Zwei Oberflächen, drei Theme-Geltungsbereiche; je Lauf eine Primäraktion, Seltenes in ein flaches Menü | angenommen |
| [0105](0105-frontend-anfragen-netzfehler-runrequest-download-sitzung-lazy.md) | 2026-11-13 | Frontend-Anfragen: Netzfehler als eigener Fall, `runRequest`, ein Download-Helfer, Sitzungsrichtlinie, alle Seiten lazy | angenommen |
| [0106](0106-rueckruf-adressen-in-mails-gegen-frontend-origins-pruefen.md) | 2026-11-13 | Rückruf-Adressen in Mails werden gegen `FRONTEND_ORIGINS` bzw. den Host der Anfrage geprüft | angenommen |
| [0107](0107-backend-laufzeit-io-dispatcher-pool-argon2-zeitzone-health.md) | 2026-11-13 | Backend-Laufzeit: IO-Dispatcher, Pool mit Statement-Timeout, Sitzungsverlängerung, Argon2-Parameter, `AppZone`, Healthcheck, Proxy-Annahme | angenommen |
| [0108](0108-backend-tests-template-datenbank-committing-concurrent.md) | 2026-11-13 | Backend-Tests: Template-Datenbank statt Neumigration, `testCommittingComprehension` und `ConcurrentTx` | angenommen |
| [0109](0109-materialvermietung-eigene-domaene-anfragen-ohne-fremdschluessel.md) | 2026-11-14 | Materialvermietung als eigene Domäne: Anfragen ohne Fremdschlüssel, Freigabe durch die Meldung, Verursacher als Momentaufnahme, Ausfall nur über die Ausnahme je Lauf | angenommen |
| [0110](0110-rolle-materialanbieter-systemverwaltet-an-anbieter-zuordnung.md) | 2026-11-14 | Die Rolle „Materialanbieter“ ist systemverwaltet (Kennung `…0040`), folgt der Anbieter-Zuordnung am Konto und ist nicht kopierbar | angenommen |
| [0111](0111-meldungsnummer-und-startnummer-eine-ableitung-des-wirksamen-materials.md) | 2026-11-14 | Meldungsnummer und Startnummer im Lauf sind zwei Zahlen; das wirksame Material je Lauf-Team hat genau eine Ableitung; Änderungsmarker | angenommen (Teilfrage offen) |
