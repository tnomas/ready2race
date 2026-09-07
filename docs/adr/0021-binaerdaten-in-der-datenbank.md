# ADR-0021: Dokumente und Binärdaten liegen in der Datenbank

- Status: angenommen
- Datum: 2025-02-26
- Bereich: datenbank
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Veranstaltungen brauchen Dokumente (Ausschreibung, Regelwerk) mit Typen, die im Meldeprozess sichtbar sind. Die Anwendung wird als Einzel-Jar ohne Reverse-Proxy ausgeliefert ([ADR-0031](0031-auslieferung-fat-jar-getrenntes-frontend.md)); ein Dateisystem-Pfad oder ein Objektspeicher wäre eine zusätzliche Betriebsabhängigkeit, die bei jeder Installation eingerichtet und gesichert werden müsste.

## Entscheidung

- Metadaten und Bytes sind getrennt: Je Dokumentart gibt es eine Tabelle mit Metadaten (Name, Typ, Audit-Spalten) und eine `*_data`-Tabelle mit einer `bytea`-Spalte. Erster Fall: `event_document` und `event_document_data` (`V202502251615__event_documents.sql`) mit `event_document_type` (Beschreibung, im Meldeprozess sichtbar, `e4685bc3`).
- Dasselbe Muster gilt für alle späteren Binärdaten: `document_template_data`, `event_registration_report_data`, `invoice_document_data`, `competition_match_team_document_data`, `gap_document_template_data`, `webdav_export_data`, `webdav_import_data`, Mail-Anhänge.
- Downloads laufen über die Anwendung mit `Content-Disposition`; der Header ist in CORS exponiert, damit das eingebettete Frontend den Dateinamen lesen kann.
- Die Ausnahme sind statische Dateien (Logos, Theme, Schriften): Sie liegen unter `STATIC_FILES_PATH` und werden über `/static` ausgeliefert, weil sie Konfiguration der Instanz sind, nicht Fachdaten.

## Verworfene Alternativen

- Dateisystem oder Objektspeicher (S3-artig): nicht belegt; ein zweiter Speicherort hätte Sicherung, Rechte und Konsistenz zwischen Datenbank und Ablage zu einem Betriebsthema gemacht.

## Konsequenzen

- Ein Datenbankdump enthält alles; Umzug und Sicherung sind ein Schritt. Umgekehrt wächst die Datenbank mit jedem PDF, und ein Produktionsabzug ist entsprechend groß ([ADR-0083](0083-datenschutz-prod-abzuege-und-datenschutzseite.md)).
- Die Trennung Metadaten/Bytes erlaubt Listen ohne Bytes-Transport; jede Liste muss aber bewusst die `*_data`-Tabelle weglassen, sonst zieht sie Megabytes.
- Große Uploads gehen durch den Anwendungsprozess und die Transaktion; es gibt kein Streaming an einen externen Speicher.
- Neue Dokumentarten brauchen zwei Tabellen und die Konvention muss von Hand eingehalten werden; es gibt keine gemeinsame Basistabelle.

## Quellen

- Commits: `18f2bea0` (Dokumenttypen), `642fce7c` (Dokumente im Backend), `c7830ca5` (Frontend, Up-/Download), `708b8269` (Typzuweisung), `e4685bc3` (Beschreibung im Meldeprozess), `3aa27391` (Mails mit Anhängen), `18973399` (Vorlagen-Bytes)
- Migrationen: `V202502251615__event_documents.sql`, `V202503210940__registration_results.sql`, `V202506011100__produce_invoices.sql`, `V202512051000__gap_documents.sql`, `V202509101500__webdav_export_data.sql`
- Verwandte ADRs: [ADR-0016](0016-schema-konventionen-uuid-audit-timestamp.md), [ADR-0020](0020-pdf-dsl-auf-pdfbox-mit-dokumentvorlagen.md), [ADR-0031](0031-auslieferung-fat-jar-getrenntes-frontend.md), [ADR-0047](0047-webdav-export-jobs-und-datensicherung.md)
