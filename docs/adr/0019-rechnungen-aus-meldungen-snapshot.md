# ADR-0019: Rechnungen aus Meldungen mit eingefrorenen Kontakt- und Bankdaten; Nachmeldung als eigener Rechnungsmodus; Empfängerkontakte nach heutigem Stand

- Status: angenommen
- Datum: 2025-01-30
- Bereich: domäne, datenbank
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Vereine melden Teams zu einer Veranstaltung und sollen dafür eine Rechnung erhalten. Das System muss dazu wissen, wer Rechnungssteller ist (Kontaktdaten) und wohin gezahlt wird (Bankverbindung). Der erste Entwurf vom Januar 2025 war generisch (`invoice` mit `billed_to`, `payment_due_date`) und wurde im Mai/Juni 2025 vollständig neu aufgebaut, als die Rechnungserzeugung als Hintergrundjob umgesetzt wurde. Im Juli 2025 kam der Snapshot der Stammdaten hinzu, im Juli 2025 die Nachmeldung, im August 2026 im Fork die Kontaktanzeige.

## Entscheidung

1. **Rechnung je Event-Meldung.** `invoice` (Nummer aus dem Nummernkreis, Empfänger, Fälligkeit, Zahlungsempfänger-Felder als Kopie), `invoice_position` und das PDF in `invoice_document_data`. `event_registration_invoice` verbindet Meldung und Rechnung, ein Unique-Index erlaubt genau eine Meldung je Rechnung. Das Event merkt sich `invoices_produced`.
2. **Stammdaten sind Konfiguration.** Bankkonten (`bank_account`) werden global als Zahlungsempfänger zugewiesen, Kontaktinformationen (`contact_information`, `contact_information_usage`) global als Rechnungssteller.
3. **Der Auftrag friert die Werte ein.** `produce_invoice_for_registration` trägt seit `V202507071115__invoice_payment.sql` die konkreten Werte als Spalten (`contact_name`, `contact_address_*`, `contact_email`, `payee_holder`, `payee_iban`, `payee_bic`, `payee_bank`) statt Fremdschlüssel auf Bankkonto und Kontakt. Ändert oder löscht jemand die Stammdaten nach der Beauftragung, bleibt die Rechnung unverändert. Der Job hält `last_error_at`/`last_error` als Fehlerprotokoll.
4. **Produktion als Job, Versand als Mail.** Eine Event-Aktion legt die Aufträge an; der Scheduler arbeitet sie ab und schickt das PDF über die E-Mail-Warteschlange ([ADR-0013](0013-scheduler-und-datenbank-warteschlangen.md)).
5. **Bezahlt-Status ist reversibel.** `invoice.paid_at` darf wieder auf „unbezahlt" zurückgesetzt werden; es gibt eine veranstaltungsweite und eine globale Rechnungsübersicht plus Summenansicht.
6. **Nachmeldung als eigener Modus.** `V202507300900__late_event_registrations.sql`: `event.late_registration_available_to`, `late_payment_due_by`, `late_invoices_produced`; `competition.late_registration_allowed`; je Gebühr ein `late_amount`; jede Wettkampfmeldung trägt `is_late`. Der Rechnungsauftrag bekommt eine eigene `id` und `mode` (`REGULAR`/`LATE`), sodass eine Meldung zwei Rechnungen erhalten kann.
7. **Empfängerkontakte nach heutigem Stand.** `InvoiceDto.billedToContacts` listet die aktuellen Nutzer des Vereins, also genau die Menge, an die das PDF geht. Das ist bewusst kein Snapshot, weil die Anzeige dem Erreichen dient, nicht der Beweisführung; `billed_to_name` bleibt Rückfall. Es gibt keine Telefonnummer, weil `app_user` kein solches Feld hat.

## Verworfene Alternativen

- Generischer Erstentwurf (`invoice` mit `billed_to`, `payment_due_date`): im Mai 2025 komplett gedroppt und neu angelegt (`02a110fc`), weil die Produktion als Job je Meldung eine andere Struktur brauchte; `payment_due_date` war zwischenzeitlich ganz entfernt (`717f94fa`).
- Referenz per Fremdschlüssel im Auftrag: verworfen (`05c69dc0`, Tabelle per `drop table` neu angelegt), weil Stammdatenänderungen sonst bereits beauftragte Rechnungen verändert hätten.
- Snapshot der Empfängerkontakte zur Rechnungserstellung: verworfen, weil der Anwendungsfall „jemanden erreichen" den aktuellen Stand braucht.
- Telefonfeld an `app_user`: nicht gebaut, Umfang unverhältnismäßig zum Nutzen.
- Anbindung an externe Buchhaltung: nicht belegt.

## Konsequenzen

- Zwei Wahrheiten je Rechnung: die eingefrorenen Absender-/Bankdaten (Beweis) und die lebenden Empfängerkontakte (Erreichbarkeit). Wer die Rechnungsansicht liest, muss wissen, welche Spalte welche Semantik hat.
- Der Snapshot macht `produce_invoice_for_registration` breit; jede neue Angabe im Rechnungskopf ist eine Spalte hier plus Kopierlogik beim Beauftragen.
- Der Modus `LATE` verdoppelt Fristen und Erzeugungsschalter am Event. Wer eine dritte Meldephase einführt, muss Enum, Fristen und `invoices_produced`-Marker erweitern; die Auswertung „welche Meldung ist gerade möglich" liegt seit [ADR-0026](0026-meldung-je-verein-teams-je-wettkampf.md) an einer Stelle.
- Rechnungsnummern kommen aus [ADR-0018](0018-nummernkreise-sequence-tabelle.md); ein Testlauf gegen Produktionsdaten verbraucht echte Nummern.

## Quellen

- Commits: `5307508d` (Add generic invoices), `717f94fa` (payment_due_date entfernt), `9cc43c23`/`a2efc1cb` (Bankkonten als Zahlungsempfänger), `191115ce` (Zahlungsempfänger an der Rechnung), `02a110fc` (Rechnungsjobs, Neuaufbau), `7bebd741` (Event-Aktion), `cf77902c` (Erzeugen und Versenden), `7dc19e78`/`34f433eb`/`ebc1f358` (Kontaktinformationen), `05c69dc0` (konkrete Werte statt Referenzen), `92fbd844`/`f46da03f` (paid_at, zurücksetzen), `b277e5f1`/`61808196`/`e48f3178` (Übersichten, Summen), `45dc4dab` (Nachmeldung, mode/id), `e3c03f82`/`940870ef`/`c4050254`/`9f1d4bfa` (Nachmeldung Frontend), `094c4dde`/`eb83b521` (Empfängerkontakte)
- Migrationen: `V202501300930__invoices.sql`, `V202506011100__produce_invoices.sql`, `V202507071115__invoice_payment.sql`, `V202507300900__late_event_registrations.sql`
- Verwandte ADRs: [ADR-0018](0018-nummernkreise-sequence-tabelle.md), [ADR-0013](0013-scheduler-und-datenbank-warteschlangen.md), [ADR-0020](0020-pdf-dsl-auf-pdfbox-mit-dokumentvorlagen.md), [ADR-0021](0021-binaerdaten-in-der-datenbank.md), [ADR-0026](0026-meldung-je-verein-teams-je-wettkampf.md)
