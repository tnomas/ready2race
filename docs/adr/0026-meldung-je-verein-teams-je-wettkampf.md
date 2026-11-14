# ADR-0026: Meldung: Event-Meldung je Verein, Wettkampfmeldungen als Teams; Registrierungsperioden zentral; Rundmail an Melder

- Status: angenommen
- Datum: 2025-02-26
- Bereich: domäne, backend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Vereine melden Teams zu Wettkämpfen. Die Meldung muss bis Meldeschluss bearbeitbar sein, Dokumente und Gebühren berücksichtigen und mit einer Bestätigung enden. Mit Nachmeldung und Challenge-Veranstaltungen kamen weitere Meldezeiträume hinzu, deren Prüfung sich im Code mehrfach wiederholte. Im August 2026 fehlte dem Veranstalter ein Weg, allen meldenden Vereinen eine Nachricht zu schicken.

## Entscheidung

**Struktur**
- `event_registration` ist eindeutig je (Event, Verein): Unique-Index `event_registration_unique_for_club` in `V202502140000__event_registration.sql`. Sie bündelt die `competition_registration`s: je Team ein optionaler Name, Teilnehmer je benannter Rolle (`competition_registration_named_participant`), gewählte optionale Gebühren (`competition_registration_optional_fee`).
- Der Meldeprozess läuft im Frontend als Wizard (`contexts/eventRegistration/`), die Meldung ist updatable und endet mit Bestätigungsmail samt Anhängen und Zusammenfassung (`16c1e631`, `e3bf860d`).
- Regeln beim Melden: Teams desselben Vereins werden je Wettkampf durchnummeriert (`bdca4f7c`); ein Teilnehmer darf pro Wettkampf nur einmal gemeldet werden; die Geschlechterverteilung wird gegen die Anzahlen der Rollen validiert (`bde837f4`); Alters- und Geschlechtsprüfung laufen im Backend, auch bei Ersatzleuten (`d96c4f6d`, `50646062`). Wettkampfmeldungen sind erst nach der Event-Meldung sichtbar (`dea552ec`).
- Startnummern gehören nicht in die Meldung, sondern in die Durchführung ([ADR-0029](0029-durchfuehrung-laeufe-startnummern-platzierung.md)).

**Registrierungsperioden**
- Regulär, Nachmeldung und Challenge-Zeitraum werden als ein Objekt zurückgegeben (`5d1b4a9a`); die Frage „ist eine Meldung möglich und welcher Typ" beantwortet genau eine Stelle im Backend, mit spezifischen Fehlern in `EventRegistrationError` (`ba07c129`). Beim Finalisieren wird der Registrierungszustand erneut geprüft.

**Rundmail an alle Melder**
- Empfängerkreis ist `event_registration.created_by`, nicht der Verein: Es erreicht die Person, die gemeldet hat. Gelöschte Ersteller bleiben sichtbar, aber nicht wählbar; ein veralteter Dialog lässt den ganzen Versand scheitern statt still jemanden auszulassen.
- Eine eigene Mail je Empfänger mit Platzhaltern; ein Melder gewinnt gegen eine gleich lautende freie Adresse. Die Zeilen überleben das Senden sieben Tage als Nachweis. Keine Migration.
- Der Dienst liegt bewusst neben `EventRegistrationService` (über 1200 Zeilen), weil er mit dem Meldevorgang nichts zu tun hat.

## Verworfene Alternativen

- Startnummern im Meldebericht (`314b8607`): eine Woche später entfernt (`f9971764`), weil Startnummern erst bei der Durchführung vergeben werden.
- Meldung je Veranstaltungstag: im Erstentwurf angelegt, nie genutzt ([ADR-0022](0022-veranstaltungsstruktur-event-tage-wettkaempfe.md)).
- Periodenprüfung als Tupel an mehreren Stellen: durch das Perioden-Objekt ersetzt (`45890000`, `5d1b4a9a`).
- Sammelmail mit sichtbaren Adressen oder Anbindung an den Verein statt an den Melder: verworfen (Datenschutz, und der Verein hat keine Adresse).

## Konsequenzen

- „Ein Verein, eine Event-Meldung" ist im Schema hart; zwei Abteilungen eines Vereins müssen sich eine Meldung teilen.
- Alle Meldevalidierungen sitzen im Backend; das Frontend zeigt nur die Fehlercodes ([ADR-0011](0011-http-fehlersemantik-und-errorcode-muster.md)). Wer eine neue Regel einführt, ergänzt `EventRegistrationError` und den ErrorCode.
- `EventRegistrationService` ist groß. Neue Funktionen rund um Meldungen gehören in eigene Dienste, wie die Rundmail vorführt.
- Eine Änderung am Meldezeitraum-Modell (dritte Phase) berührt genau eine Auswertungsstelle, aber auch die Fristen am Event ([ADR-0019](0019-rechnungen-aus-meldungen-snapshot.md)).
- Ersatzleute nach Meldeschluss sind eine eigene Entität ([ADR-0038](0038-ersatzleute-als-eigene-entitaet.md)), Abmeldungen ebenfalls ([ADR-0044](0044-abmeldung-dns-dnf-dq-im-freitext.md)); die Meldung selbst wird nach dem Finalisieren nicht mehr verändert.

## Quellen

- Commits: `f85ee970`/`1b74044c` (Event registration), `ac7da9b6` (updatable), `931c3403` (Dokumente), `22af000c` (Merge #1), `2bc8bcc2` (Wettkampfmeldungen bearbeiten/löschen), `16c1e631`/`e3bf860d` (Bestätigungsmail), `bdca4f7c` (Durchnummerierung), `314b8607`/`f9971764` (Startnummern rein und raus), `bde837f4` (Geschlechterverteilung, Mehrfachmeldung), `dea552ec` (Sichtbarkeit), `496709bf` (Kategoriefilter), `c1d7eeee` (Teamname), `b3c50054` (Meldungsansicht), `45890000`/`5d1b4a9a`/`ba07c129`/`6a8ac815` (Registrierungsperioden), `d96c4f6d`/`50646062` (Geschlecht/Alter im Backend), `59c219b3`/`ce99887d` (Rundmail)
- Migrationen: `V202502140000__event_registration.sql`
- Verwandte ADRs: [ADR-0011](0011-http-fehlersemantik-und-errorcode-muster.md), [ADR-0019](0019-rechnungen-aus-meldungen-snapshot.md), [ADR-0022](0022-veranstaltungsstruktur-event-tage-wettkaempfe.md), [ADR-0024](0024-gebuehren-und-benannte-rollen.md), [ADR-0025](0025-vereine-teilnehmer-scope-own-stammverein.md), [ADR-0029](0029-durchfuehrung-laeufe-startnummern-platzierung.md), [ADR-0038](0038-ersatzleute-als-eigene-entitaet.md), [ADR-0044](0044-abmeldung-dns-dnf-dq-im-freitext.md), [ADR-0049](0049-challenge-events-teilnehmer-ohne-konto.md)
