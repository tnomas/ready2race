# ADR-0051: Urkunden als Lückentext-Dokumente: PDF und Word aus einer Platzhalterlogik, Vorlagenpakete, Grundlinien-Messung

- Status: angenommen
- Datum: 2025-12-05
- Bereich: domäne, backend, betrieb
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Teilnahme- und Siegerurkunden sollen aus einer hochgeladenen Vorlage mit positionierten Platzhaltern entstehen. Upstream baute dafür im Dezember 2025 die „Gap-Dokumente" mit Versand als Job. Für die Regatta 2026 kamen drei Anforderungen dazu: Siegerurkunden werden auf **vorgedrucktes offizielles Papier** gedruckt (die Vorlage des Verbands ist eine Präsentationsdatei mit verstecktem Designbild); sie müssen für ein ganzes Event, einen Wettkampf oder ein einzelnes Boot erzeugt werden, wahlweise als PDF oder als editierbares Word; und Vorlagen sollen zwischen Installationen wandern, ohne dass jemand die Platzhalter per Maus neu setzt. Die Hausschrift des Verbands ist kommerziell lizenziert.

## Entscheidung

- **Datenmodell** (Migration `V202512051000__gap_documents.sql`): `gap_document_template` (`name`, `type`), `gap_document_placeholder` (`type`, `page`, `rel_left`, `rel_top`, `rel_width`, `rel_height`, `text_align`), `gap_document_template_data` (PDF-Bytes), `gap_document_template_usage` (`type` als Primärschlüssel: **je Dokumenttyp genau eine aktive Vorlage, global**, nicht je Veranstaltung). Migration `V202608061208__award_certificate_templates.sql` ergänzt `font_size`, `bold`, `italic`, `static_text` je Platzhalter, `font_name` je Vorlage und die Tabelle `gap_document_template_font` (hochgeladene Schriftdatei). Jeder Dokumenttyp deklariert seine erlaubten Platzhaltertypen.
- **Ein Platzhalter-Mapping für beide Renderer**: `AwardCertificateLogic.placeholderValues` ist eine reine Funktion, die Platzhalter auf Inhalte abbildet. Der PDF-Pfad rendert mit PDFBox ([ADR-0020](0020-pdf-dsl-auf-pdfbox-mit-dokumentvorlagen.md)); der Word-Pfad (`docx/GapDocumentsDocx.kt`) setzt absolut positionierte Textrahmen per `w:framePr`, kein Drawing-XML. Beide teilen die vertikale Zentrierung und denselben Zeilenumbruch; **PDFBox ist die einzige Stelle mit Schriftmetriken**, der DOCX-Pfad misst mit PDFBox und setzt mit Word. Die Vereinskette bricht nur zwischen Vereinen, nie im Namen.
- **Text-only als Vorgabe**: Der Download liefert standardmäßig nur die Texte (für vorgedrucktes Papier); der Schalter `background` fügt das Vorlagendesign für Blankopapier hinzu. Schrift optional hochladen, Fallback Helvetica. Endpunkte je Wettkampf, Veranstaltung und Einzelurkunde; Vorgabe Plätze 1–3, Modus pro Athlet oder pro Boot.
- **Vorlagenpakete**: `GapDocumentTemplatePackage.kt` definiert ein ZIP mit `template.json` (feldgleich mit den Request-DTOs, `formatVersion`), `template.pdf` und optional der Schriftdatei. Export `GET …/gapDocumentTemplate/{id}/export`, Import `POST /gapDocumentTemplate/import` über dieselben Prüfungen wie der Upload (die Prüfungen wanderten von der Route in den Service). Import **legt immer neu an**, überschreibt nie. Archivgrenzen: jeder Eintrag wird mit `readAtMost(MAX_ENTRY_BYTES)` gelesen (20 MB, auch bei unsicheren Namen), die Gesamtgröße ist auf `MAX_TOTAL_BYTES` = 40 MB gekappt; Pfade mit Verzeichnisanteil oder `..` werden abgelehnt. Das Paket enthält die Schriftdatei; die Lizenzfrage ist bewusst so entschieden, mit Hinweis am Knopf.
- **Löschen per Cascade**: `gap_document_placeholder` bekam wie seine Geschwister `on delete cascade` (Migration `V202608092200__gap_placeholder_cascade.sql`) statt eines zweiten Löschpfads im Service.
- **Grundlinien-Messung beim Einrichten**: Platzhalter werden aus dem Textstrom der Vorlage berechnet, nicht am Bild gemessen: Kastenmitte = Grundlinie + capHeight/2 (Helvetica 0,717 em); der Renderer zentriert den **ganzen Block**, nicht die erste Zeile. Seit 2026-08-11 schrumpft zu langer Text, bis der Block in den Kasten passt; die Kastenhöhe ist damit die Gestaltungsentscheidung. Der Editor arbeitet mit typisierten Zahlenwerten, Pfeiltasten-Nudge, Beispieltext und Live-Vorschau per `FontFace` (Näherung; die Server-Vorschau bleibt verbindlich).

## Verworfene Alternativen

- **Präsentationsdatei direkt einlesen**: die vertikale Absatzlogik des Präsentationsprogramms müsste nachgebaut werden; stattdessen wird der PDF-Export der Vorlage hochgeladen.
- **Layout fest im Code**: nicht für andere Veranstalter nutzbar.
- **Office-Konverter im Container**: Betriebsaufwand und Laufzeit.
- **ASCII-Ersetzung typografischer Zeichen im Word-Pfad** (`9dbc828e` nimmt sie zurück): Word rendert die Originale.
- **Zeilenumbruch beim Aufrufer statt im Renderer** (`849a15e6`): PDF und Word brachen unterschiedlich.
- **Zweiter Löschpfad im Service** (`9fd91766` verworfen zugunsten der Cascade-Migration): die Zusage soll für jeden Aufrufer gelten.
- **Mitgelieferte Standardvorlagen**: fremdes Material und lizenzpflichtige Schriften vertragen sich nicht mit GPL-3.0 ([ADR-0036](0036-lizenz-gplv3-publiccode.md)).
- **Transport über den WebDAV-Export**: der transportiert Veranstaltungsdaten, Vorlagen sind globale Konfiguration ([ADR-0047](0047-webdav-export-jobs-und-datensicherung.md)).
- **Überschreiben beim Import**, **Messung am Bild**, **Nachrüsten aller Schriftschnitte** (nur ein Schnitt wird eingebettet).
- Nicht im Umfang: E-Mail-Versand der Siegerurkunden, Vorlagen je Veranstaltung, Siegerurkunden für Challenge-Events.

## Konsequenzen

- Nach dem Import öffnet sich kein Bearbeiten-Dialog, weil `GET /gapDocumentTemplate/{id}` fehlt (Testkatalog G31); der Import-Dialog bekam später eine Typwahl und aktiviert automatisch, wenn für den Typ keine Vorlage aktiv ist.
- Zwei Renderer aus einer Logik heißt: jede Layout-Änderung muss in PDF **und** DOCX geprüft werden; der Test `d7aafefb` fährt beide Pfade mit einer Fünfer-Vereinskette.
- Externe Programme richten anders aus als der Renderer (einzeilig mittig, mehrzeilig oben); Formularfelder aus Vorlagen-PDFs sind vorher zu entfernen; bei neuen Mustern Feldnamen und Beispielinhalte vergleichen, nicht nur das Bild.
- `GapDocumentTemplateError.NotFound` bleibt bewusst ohne `ErrorCode` (`10b262ca`); Fehler werden auf Deutsch gezeigt.
- Die Zuordnung „eine aktive Vorlage je Typ" ist global; zwei Veranstaltungen mit unterschiedlichen Urkunden brauchen einen manuellen Wechsel oder eine Erweiterung.

## Quellen

- Commits: `7c5e4ee1`, `f8825fdb` (Gap-Dokumente Backend/Frontend), `00a0f06e` (Zuweisung je Typ), `c86d6b7c` (Versand als Event-Aktion), `d436d177` (Downloads), `ffd51db4` (Ausrichtung), `52aafbac` (Siegerurkunden als PDF und Word), `9dbc828e`, `849a15e6` (gleicher Zeilenumbruch), `6a335b48` (Kette bricht zwischen Vereinen), `9d2ec656`, `d7aafefb`, `0551de10`, `43fb5292` (Paketformat), `dc980431`, `aaba5e1a` (Archivgrenzen), `182b1db4`, `be4a0715` (Export/Import), `dbba5486`, `be06f3b0`, `8efec929`, `9cb9722b` (Editor), `03fb4311` (DB-Test), `9fd91766` (Löschen wieder möglich), `10b262ca`
- Migrationen: `V202512051000__gap_documents.sql`, `V202608061208__award_certificate_templates.sql`, `V202608092200__gap_placeholder_cascade.sql`
- Specs: `docs/superpowers/specs/2026-08-05-urkunden-pdf-word-design.md`, `docs/superpowers/plans/2026-08-05-urkunden-pdf-word.md`, `docs/urkundenvorlagen-teilen-design.md`, `docs/urkundenvorlagen-teilen-plan.md`, `docs/superpowers/specs/2026-08-05-testkatalog-crf-2026.md` (G25–G35), `docs/testkatalog-11-08.md`
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/documentTemplate/boundary/GapDocumentTemplatePackage.kt`, `app/certificate/boundary/AwardCertificateLogic.kt`, `docx/GapDocumentsDocx.kt`
- Verwandte ADRs: [ADR-0020](0020-pdf-dsl-auf-pdfbox-mit-dokumentvorlagen.md), [ADR-0021](0021-binaerdaten-in-der-datenbank.md), [ADR-0036](0036-lizenz-gplv3-publiccode.md), [ADR-0047](0047-webdav-export-jobs-und-datensicherung.md), [ADR-0071](0071-vereinskette-statt-renngemeinschaft.md), [ADR-0072](0072-ergebnisse-nach-wertungskategorien-und-partie.md), [ADR-0079](0079-siegerehrungsbogen-und-ergebnisliste-ein-generator.md)
