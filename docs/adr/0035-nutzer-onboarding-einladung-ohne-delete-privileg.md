# ADR-0035: Nutzer-Onboarding: Selbstregistrierung mit Verifikation, Einladung mit Rollen, Passwort-Reset; Einladungen zurückziehen ohne DELETE-Privileg

- Status: angenommen
- Datum: 2025-01-31
- Bereich: domäne, backend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Vereinsnutzer sollen sich selbst registrieren; Veranstalter laden Mitarbeitende mit vorbelegten Rollen ein; alle brauchen einen Passwort-Reset. Jeder dieser Vorgänge löst eine E-Mail aus und muss nachvollziehbar mit ihr verknüpft sein. Im August 2026 fehlte im Fork die Möglichkeit, eine Einladung zurückzuziehen oder erneut zu senden; man wartete sieben Tage auf den Aufräumjob.

## Entscheidung

- **Drei Vorgangstabellen** (`V202502030930__user_registrations.sql`, `V202412161600__users_and_sessions.sql`): `app_user_registration` (Selbstregistrierung mit E-Mail-Verifikation), `app_user_invitation` mit `app_user_invitation_has_role` (Einladung mit Rollen), `app_user_password_reset`. Jeder Vorgang trägt einen Token, der per Link in der Mail bestätigt wird.
- **Mail ↔ Vorgang** ist verknüpft: `app_user_invitation_to_email` und `app_user_registration_to_email` ordnen die Warteschlangen-Mail dem Vorgang zu ([ADR-0013](0013-scheduler-und-datenbank-warteschlangen.md)). `app_user_invitation_to_email` hat einen Unique-Index auf die Einladung.
- **Ablauf per Job**: Abgelaufene Registrierungen, Einladungen und Resets löscht der Scheduler stündlich (`Application.kt`, „Delete expired user invitations").
- **System-Nutzer**: `system_user` kann Admin-Einladungen erzeugen und ist in Nutzerlisten ausgeblendet (die View filtert die Admin-Rolle, `9bae2431`). Die Nutzerverwaltung erlaubt Rollen- und Privilegieneingabe ([ADR-0010](0010-privilegien-action-resource-scope.md)).
- **Captcha** schützt Registrierung und Reset ([ADR-0034](0034-eigenes-bild-captcha.md)); Rate-Limits ergänzen ([ADR-0009](0009-rate-limiting-im-server.md)).
- **Einladungen zurückziehen und erneut senden** (`d77031d0`): `DELETE /api/user/invitation/{invitationId}` und `PUT …/resend` hängen am Einladen-Recht `Privilege.CreateUserGlobal` (`app/appuser/boundary/user.kt`), nicht an einem neuen `DELETE`-Privileg auf `USER`. Absender der erneuten Mail ist, wer den Versand auslöst. Der erneute Versand macht ein Upsert auf `app_user_invitation_to_email`, weil der Unique-Index sonst einen 500er wirft.
- Im Frontend laufen diese Aktionen über `customEntityActions` der `EntityTable`, nicht über den eingebauten Papierkorb ([ADR-0033](0033-entitytable-entitydialog-grundmuster.md)).

## Verworfene Alternativen

- Neues `DELETE`-Privileg auf `USER`: verworfen, weil ein neues Privileg nur die Admin-Rolle erreicht und für alle anderen Rollen eine Migration plus Rollenzuweisung in Produktion nötig wäre ([ADR-0010](0010-privilegien-action-resource-scope.md)).
- Sieben Tage auf den Aufräumjob warten: der Zustand vor `d77031d0`, für den Betrieb unbrauchbar.

## Konsequenzen

- Wer einladen darf, darf Einladungen auch löschen und erneut senden. Das ist eine bewusste Kopplung von Rechten; ein feineres Modell bräuchte ein Privileg und den Rollen-Rollout.
- Die Regel „kein `DELETE` auf `USER`" gilt weiter: `EntityTable`s Papierkorb bleibt in der Nutzerverwaltung aus, Löschaktionen dort sind immer `customEntityActions`.
- Drei Vorgangstabellen mit ähnlichem Aufbau sind Pflegeaufwand; eine spätere Erweiterung (z. B. Teilnehmer-Selbstregistrierung mit Wettkampfmeldung, `V202512031145`) hängt Zusatztabellen an `app_user_registration` statt eine vierte Vorgangsart zu erfinden ([ADR-0049](0049-challenge-events-teilnehmer-ohne-konto.md)).
- Die Mail-Zuordnung verlangt bei jedem neuen Versandweg einen Upsert-Gedanken; ein zweiter Versand ohne Upsert ist der bekannte 500er.

## Quellen

- Commits: `b8d2c463` (Register-Request), `acaa03a6` (Mail-Vorlagen, Registrierung), `94909784` (Einladung), `ff8743b6` (Ablaufjob, Rollen an der Einladung), `2c577f32` (Passwort-Reset), `c4f86d71`/`22e5c82f` (offene Einladungen/Registrierungen, Mail-Zuordnung), `7331062e` (Einladungsseite), `9bae2431` (Sichtbarkeit für Admin und system_user), `df17889a` (updateAppUser), `6c9b5ef1` (Fehlerbehandlung bei Verifikation), `d77031d0` (Einladungen zurückziehen und erneut verschicken), `a6adcc2e` (Menüeintrag „Rollen" am Recht der Seite)
- Migrationen: `V202412161600__users_and_sessions.sql`, `V202502030930__user_registrations.sql`
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/appuser/boundary/user.kt`, `AppUserService.kt`
- Verwandte ADRs: [ADR-0007](0007-argon2id-passwort-hashing.md), [ADR-0009](0009-rate-limiting-im-server.md), [ADR-0010](0010-privilegien-action-resource-scope.md), [ADR-0013](0013-scheduler-und-datenbank-warteschlangen.md), [ADR-0033](0033-entitytable-entitydialog-grundmuster.md), [ADR-0034](0034-eigenes-bild-captcha.md), [ADR-0049](0049-challenge-events-teilnehmer-ohne-konto.md)
