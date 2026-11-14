# ADR-0025: Vereine, Teilnehmer, Nutzer: Scope OWN am Verein; Stammverein Pflicht, Zweitvereine nur lesend und meldend

- Status: angenommen
- Datum: 2025-02-21
- Bereich: domäne, datenbank
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Meldungen werden von Vereinen für ihre Athleten abgegeben. Ein Nutzer handelt deshalb immer für einen Verein, und das Rechtemodell ([ADR-0010](0010-privilegien-action-resource-scope.md)) braucht einen Bezugspunkt für den Scope OWN. Im August 2026 zeigte sich im Fork, dass Personen, die in zwei Vereinen rudern (im Küstenrudern der Normalfall), doppelt angelegt wurden; damit zerfielen Bändchen, Bedingungen, Check-in und Ergebnisse.

## Entscheidung

- `club` und `participant` (Vorname, Nachname, Jahrgang, Geschlecht M/F/O, Telefon) liegen in `V202502140000__event_registration.sql`. `participant.club` ist ein Pflicht-Fremdschlüssel und heißt seit 2026-08-14 ausdrücklich **Stammverein**.
- Ein `app_user` gehört zu einem Verein; Scope OWN bezieht sich auf diesen Verein. Wer `READ CLUB OWN` hat, sieht seinen Verein und dessen Teilnehmer.
- Gastruderer aus Vereinen, die es im System nicht gibt: `participant.external = true` mit Pflichtfeld `external_club_name` (Check-Constraint `chk_extern_has_club_name`). Das ist ein Freitext, kein Datensatz.
- Der Jahrgang ist Pflicht (`V202506271400__participant_year_not_null.sql`); Teilnehmer in Verwendung können nicht gelöscht werden (`70762813`); für die Meldung gibt es eine Vereinssuche (`36993cd0`).
- **Zweitvereine** (`V202608142000__participant_additional_club.sql`): `participant_additional_club(participant, club)` trägt die weiteren Vereine; der zusammengesetzte Primärschlüssel verhindert Doppeleinträge. Der Stammverein steht nicht noch einmal in dieser Tabelle; die Regel prüft `ParticipantClubService.add`, weil die Datenbank sie nicht ausdrücken kann.
- Nur Lesewege und die Vereinsprüfung beim Melden sind auf Zweitvereine geweitet. `ParticipantRepo.update/delete` filtern weiterhin auf `participant.club`. Telefon und E-Mail sind für Zweitvereine ausgeblendet.
- Der Veranstaltungsschalter `event.cross_club_registration` (Vorgabe aus) erlaubt Meldenden, Personen anderer Vereine über eine gedeckelte Suche mit schmalem DTO zu sehen und zu melden. Der Ummelde-Vorrat folgt dem meldenden Verein der Mannschaft.
- Pflege der Zweitvereine mit `UPDATE CLUB`, kein neues Privileg. Die Rechnung folgt weiterhin `event_registration.club`.

## Verworfene Alternativen

- Aufweichung des Pflicht-Fremdschlüssels (nullable `participant.club` oder reine n:m-Tabelle): verworfen, weil jede Sicht, jeder Filter und jede Rechteprüfung auf `participant.club` aufbaut und ein Umbau kurz vor der Regatta nicht tragbar war.
- Zweiter Weg für Gastruderer über die Zweitvereine: nicht gebaut; `external` bleibt der Pfad für Vereine ohne Datensatz.
- Neues Privileg für Zweitvereinspflege: verworfen, weil neue Privilegien nur die Admin-Rolle erreichen ([ADR-0010](0010-privilegien-action-resource-scope.md)).

## Konsequenzen

- Eine Person ist ein Datensatz mit einer Bändchen-/QR-Identität; alles, was an der Person hängt, bleibt konsistent.
- Wer eine neue Lesesicht auf Teilnehmer baut, muss entscheiden, ob Zweitvereine sichtbar sind; die Vorgabe ist „ja für Lesen und Melden, nein für Ändern". Beim Umbau wurde ein offenes Scheunentor im Upsert-Pfad geschlossen; ähnliche Lücken sind bei neuen Schreibpfaden zu erwarten.
- Die Regel „Stammverein nicht in `participant_additional_club`" ist nur im Service abgesichert; direkte SQL-Importe können sie verletzen.
- Doppelt angelegte Personen aus der Zeit vor 2026-08-14 sind nicht automatisch zusammengeführt worden.

## Quellen

- Commits: `730ca857` (Vereine und Teilnehmer), `329bc7f4` (Geschlecht), `36993cd0` (Vereinssuche), `800b570a` (Scope für Teilnehmer), `955074e7`/`de610b53` (Jahrgang Pflicht), `70762813` (Löschen in Verwendung verhindert), `c73ff69d` (Vereinsbearbeitung), `76c68e65` (Eine Person mehreren Vereinen zuordnen)
- Migrationen: `V202502140000__event_registration.sql`, `V202506271400__participant_year_not_null.sql`, `V202608142000__participant_additional_club.sql` (mit ausführlichem Kopfkommentar zur Begründung)
- Verwandte ADRs: [ADR-0010](0010-privilegien-action-resource-scope.md), [ADR-0026](0026-meldung-je-verein-teams-je-wettkampf.md), [ADR-0027](0027-teilnahmebedingungen-global-je-event-manuell.md), [ADR-0041](0041-checkin-checkout-ereignisprotokoll-arena.md), [ADR-0076](0076-mein-event-band-qr-ohne-anmeldung.md)
