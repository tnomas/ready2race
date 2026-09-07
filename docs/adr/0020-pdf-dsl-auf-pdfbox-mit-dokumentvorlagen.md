# ADR-0020: PDF-Erzeugung über eigene DSL auf PDFBox mit hochladbaren Dokumentvorlagen

- Status: angenommen
- Datum: 2025-04-01
- Bereich: backend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Meldeberichte und Rechnungen sollen als PDF im Layout des Veranstalters entstehen: mit Briefkopf, Seitenrändern und Tabellen, ohne dass der Veranstalter Code anfasst. Das Upstream-Team lambda9 baute dafür im März/April 2025 eine eigene Schicht über Apache PDFBox 3 (Ticket #15250). Später kamen Startlisten, Ergebnislisten, Urkunden und der Siegerehrungsbogen als weitere Erzeugnisse hinzu.

## Entscheidung

- PDFs entstehen ausschließlich über das Paket `backend/src/main/kotlin/de/lambda9/ready2race/backend/pdf/`: `Document`, `Page`, `Element`, `BlockBuilder`, `DocumentBuilder`, `PageTemplate`, `RenderContext`, `SizeContext`, `elements/` (Text mit Zeilenumbruch, Tabellen, Seitenumbrüche), `util.kt` (Sanitizing von Textknoten). Fachcode beschreibt ein Dokument mit dieser DSL und ruft nie direkt PDFBox.
- **Dokumentvorlagen** sind hochgeladene PDFs mit Seitenrändern, die als Hintergrund unter den Inhalt gelegt werden: Tabelle `document_template` mit Bytes in `document_template_data` (`V202503210940__registration_results.sql`). Die Ebenenreihenfolge ist fest: Vorlage unten, Inhalt darüber (`ab937751`).
- Zuweisung je `DocumentType` global (`document_template_usage`) und je Veranstaltung (`event_document_template_usage`); die Veranstaltung übersteuert den globalen Eintrag.
- Vorlagendateien werden beim Hochladen auf ihren Typ geprüft (`58a82a00`), während Veranstaltungsdokumente jeden Dateityp erlauben (`74919f8e`). Der Content-Type wird aus dem Dateinamen abgeleitet (`b1d86c2f`).
- Die Vorschau rendert die Vorlage mit Beispieldaten und zeigt sie im iframe (`979938c0`, `522a109c`).
- Erste Anwendung war der Meldebericht (`event_registration_report`, `f0d0403c`).

## Verworfene Alternativen

- HTML-zu-PDF- oder Reporting-Bibliothek: nicht belegt; die DSL gibt volle Kontrolle über Layout und Vorlagen-Ebene ohne Browser-Engine im Backend.
- Vorschau in neuem Tab: durch den iframe ersetzt (`522a109c`), weil die Vorschau im Kontext des Formulars bleiben soll.

## Konsequenzen

- Jedes neue Erzeugnis (Startliste, Urkunde, Ehrungsbogen) baut auf derselben DSL auf; das hält das Layout einheitlich, verlangt aber, dass Layout-Funktionen (Messen, Umbruch) in der DSL ergänzt werden statt je Erzeugnis.
- **`page { }` ist keine harte Seitengrenze.** Der Inhalt eines Blocks fließt bei Überlauf auf die nächste Seite. Wer „eine Seite je X" zusagt, muss die tatsächliche Seitenzahl messen; das wurde beim Siegerehrungsbogen gelernt ([ADR-0079](0079-siegerehrungsbogen-und-ergebnisliste-ein-generator.md)).
- Text muss saniert werden: Ein Unicode-Whitespace-Fehler im Rendering wurde zentral in der DSL behoben (`e96d5989`), nicht in den Aufrufern.
- Die Vorlagen-Bytes liegen in der Datenbank ([ADR-0021](0021-binaerdaten-in-der-datenbank.md)); Vorlagen wandern beim Kopieren einer Datenbank mit.
- Die Lückentext-Urkunden ([ADR-0051](0051-urkunden-lueckentext-pdf-word-vorlagenpakete.md)) sind eine zweite Vorlagenart (`gap_document_template`) mit eigener Platzhalterlogik; die Hintergrund-Vorlage dieses ADR ist davon unabhängig.

## Quellen

- Commits: `18973399` (WIP: DSL for pdfbox), `b04123a5` (LayerUtilities), `8cc2fac8` (Text und Tabelle), `5a9221df` (Zeilenumbruch), `1a0176c3` (Seitenumbrüche), `430c16b0` (Sanitizing), `ab937751` (Ebenenreihenfolge), `f0d0403c` (Meldebericht), `173d5132`/`ae7c9c83`/`d26caf44` (Vorlagen-API und Frontend), `885b3afa` (Merge #14), `979938c0`/`522a109c` (Vorschau), `58a82a00`/`74919f8e`/`b1d86c2f` (Typprüfung, Content-Type), `e96d5989` (Unicode-Whitespace)
- Migrationen: `V202503210940__registration_results.sql`
- Verwandte ADRs: [ADR-0019](0019-rechnungen-aus-meldungen-snapshot.md), [ADR-0021](0021-binaerdaten-in-der-datenbank.md), [ADR-0051](0051-urkunden-lueckentext-pdf-word-vorlagenpakete.md), [ADR-0079](0079-siegerehrungsbogen-und-ergebnisliste-ein-generator.md)
