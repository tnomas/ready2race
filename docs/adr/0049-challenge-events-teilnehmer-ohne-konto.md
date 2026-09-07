# ADR-0049: Challenge-Veranstaltungen mit Selbsteinreichung; Teilnehmer ohne Konto per E-Mail-Token; Selbstregistrierung; globale Konfiguration als Singleton-Zeile

- Status: angenommen
- Datum: 2025-10-24
- Bereich: domäne, backend, datenbank
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Neben klassischen Wettkämpfen mit Läufen und Zeitnahme wollte ein Kunde des Upstream-Teams eine „Challenge": Teilnehmende reichen über einen Zeitraum eigene Ergebnisse ein, gegebenenfalls mit Nachweisbild, und werden je Verein und je Person gerankt. Solche Teilnehmende haben oft kein Nutzerkonto und keinen Vereinsvertreter, der sie meldet. Einige Einstellungen dafür gelten für die ganze Instanz, nicht je Veranstaltung.

## Entscheidung

- **Challenge als Eigenschaft der Veranstaltung**: `event.challenge_event`, `event.challenge_match_result_type`, `event.self_submission` (Migration `V202510221445__challenge_events.sql`). Das Ergebnis ist ein `result_value` (Integer) an `competition_match_team`; ein optionales Nachweisbild liegt in `competition_match_team_document` mit Bytes-Tabelle `competition_match_team_document_data` ([ADR-0021](0021-binaerdaten-in-der-datenbank.md)). Je Wettkampf gibt es `competition_properties_challenge_config` mit `start_at`, `end_at` und `result_confirmation_image_required`. Ergebnisse können bei der Meldung direkt mitgegeben werden.
- **Verifikation**: `event.submission_needs_verification`; verifizierte Ergebnisse tragen `result_verified_by`/`result_verified_at` (Migration `V202512031130__challenge_result_verification.sql`), mit Filter „unverifiziert" in der Verwaltung.
- **Teilnehmer ohne Konto**: Teilnehmer bekommen E-Mail und Zugangstoken (Migration `V202510301200__participant_email.sql`); der Bereich `eventParticipant` liefert über `EventParticipantRepo.getByToken` die Challenge-Sicht ohne Anmeldung. Token können erneut versandt werden. E-Mail-Vergleiche sind case-insensitiv.
- **Selbstregistrierung**: `event.participant_self_registration` erlaubt Meldungen ohne Vereinsvertreter. Die Registrierung ist in Teilnehmer- und App-Nutzer-Registrierung getrennt (eigene Schritte, gefilterter Wettkampf-Endpoint); Teilnehmeranlage als Vereinsvertreter ist optional; das Captcha ([ADR-0034](0034-eigenes-bild-captcha.md)) erscheint erst im letzten Schritt. Vereinsvertreter-Anfragen werden über `app_user_club_representative_approval` (`approved` dreiwertig) freigegeben.
- **Globale Konfiguration als Singleton-Zeile**: Tabelle `global_configurations` mit `id boolean primary key default true check (id = true)`, also genau einer Zeile, und `create_club_on_registration` (Migration `V202512031145__particiant_self_registration.sql`). Weitere instanzweite Einstellungen (Theme, [ADR-0032](0032-einbettbares-frontend-theme-je-instanz.md)) folgen diesem Muster und hängen am Privileg `ADMINISTRATION` ([ADR-0048](0048-smtp-override-administration-dev-whitelist.md)).

## Verworfene Alternativen

- **Registrierungs-Wizard für Challenge-Events entfernen** (`22390c70`, `db9d5030`, 2025-10-28): zwei Tage später zurückgenommen (`7e2ad82d`); stattdessen bekam der Wizard einen Deaktivierungsmechanismus für einzelne Schritte.
- **Eigene Nutzerkonten für Challenge-Teilnehmende**: implizit verworfen durch den Token-Zugang; die Hürde „Konto anlegen" hätte die Teilnahme gebremst.

## Konsequenzen

- Das Datenmodell trägt zwei Veranstaltungsarten in einer Tabelle; viele Stellen prüfen `challenge_event` und verzweigen. Wer die Durchführung (Läufe, Kette, Zeitnahme) ändert, muss sicherstellen, dass Challenge-Veranstaltungen nicht betroffen sind. Siegerurkunden für Challenge-Events sind ausdrücklich nicht im Umfang ([ADR-0051](0051-urkunden-lueckentext-pdf-word-vorlagenpakete.md)).
- Der Token ist ein Anmeldeersatz: Wer die E-Mail mitliest, sieht die Ergebnisse. Der Token ist an einen Teilnehmer gebunden, nicht an eine Sitzung ([ADR-0008](0008-serverseitige-sessions-header-token.md)).
- Der Tippfehler im Migrationsnamen (`particiant`) bleibt für immer, weil Flyway-Dateien nach dem Ausrollen nicht umbenannt werden ([ADR-0014](0014-flyway-migrationskonventionen.md)).
- `create_club_on_registration` entscheidet instanzweit, ob bei Selbstregistrierung ein Verein angelegt wird; `club.name` ist seit `V202512021800__club_name_unique.sql` eindeutig, doppelte Vereinsnamen aus der Selbstregistrierung schlagen also fehl.
- Der Fork des Projektinhabers nutzt Challenge-Veranstaltungen nicht; das Modell muss trotzdem bei jeder Änderung an `event` und `competition_match_team` mitgedacht werden.

## Quellen

- Commits: `75277a11` (Challenge-Events, Selbsteinreichung), `942ae219` (Zeitspanne), `de589a9f` (Ergebnis bei Meldung), `1e83aea6`, `020023d9` (Ranglisten), `2c2d2af2`, `38b1edeb` (Verifikation), `22390c70`, `db9d5030`, `7e2ad82d` (Wizard entfernt und reaktiviert), `6b68ac23` (E-Mail/Token für Teilnehmer), `d2f1ba0c` (Token erneut senden), `0880d16f`, `27a75506` (Challenge-Teilnehmersicht), `3644039c` (E-Mail case-insensitiv), `3ee0be28` (globale Konfigurationen, Selbstregistrierung), `9c539e6f` (Vereinsvertreter-Freigabe), `78c0c1dd`, `84fea663`, `916c77f4` (Stepper), `19dcea76` (Captcha im letzten Schritt), `b67746a1`, `468701db`, `0248ed2d`
- Migrationen: `V202510221445__challenge_events.sql`, `V202510301200__participant_email.sql`, `V202512031130__challenge_result_verification.sql`, `V202512031145__particiant_self_registration.sql`
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/eventParticipant/`, `app/globalConfigurations/`
- Verwandte ADRs: [ADR-0008](0008-serverseitige-sessions-header-token.md), [ADR-0021](0021-binaerdaten-in-der-datenbank.md), [ADR-0025](0025-vereine-teilnehmer-scope-own-stammverein.md), [ADR-0032](0032-einbettbares-frontend-theme-je-instanz.md), [ADR-0034](0034-eigenes-bild-captcha.md), [ADR-0035](0035-nutzer-onboarding-einladung-ohne-delete-privileg.md), [ADR-0048](0048-smtp-override-administration-dev-whitelist.md), [ADR-0051](0051-urkunden-lueckentext-pdf-word-vorlagenpakete.md)
