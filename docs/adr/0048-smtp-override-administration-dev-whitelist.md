# ADR-0048: SMTP-Konfiguration aus der Datenbank; Privileg-Ressource ADMINISTRATION; E-Mail-Whitelist im Entwicklungsmodus

- Status: angenommen
- Datum: 2025-10-22
- Bereich: backend, betrieb
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Der Mailversand war nur über Umgebungsvariablen konfigurierbar; Betreiber sollten Host, Zugang und Absender ohne Neustart im UI ändern können. Damit brauchte es ein Recht für „Administration", das nicht an eine einzelne Einstellung gebunden ist. Getrennt davon durften Registrierungs- und Token-Mails im Entwicklungs- und Testbetrieb keine echten Empfänger erreichen, gerade weil Produktionsabzüge lokal eingespielt werden ([ADR-0083](0083-datenschutz-prod-abzuege-und-datenschutzseite.md)).

## Entscheidung

- **SMTP-Override in der Datenbank**: Tabelle `smtp_config_override` (Migration `V202510231450__smtp_config_override.sql`) mit `host`, `port`, `username`, `password`, `smtp_strategy`, `from_address`, `from_name`, `smtp_localhost`, `reply_to`. Existiert eine Zeile, überschreibt sie die Werte aus der Umgebung; die UI dafür liegt in der Administration (`app/email`, `SmtpConfigOverrideDto`).
- **Privileg-Ressource `ADMINISTRATION`** mit `READ`/`UPDATE` im Scope `GLOBAL` (`Privilege.kt`). Die zunächst SMTP-spezifischen Privilegien wurden zu `ReadAdministrationConfigGlobal`/`UpdateAdministrationConfigGlobal` verallgemeinert, als weitere globale Konfigurationen (Theme, Selbstregistrierung) dazukamen. Neue globale Einstellungen hängen an dieser Ressource, nicht an einer je Einstellung.
- **Whitelist im Entwicklungsmodus**: `Config.mailReceiverWhitelist` wird aus `WHITELIST_EMAIL_RECEIVER` (JSON-Liste von regulären Ausdrücken) gelesen. `EmailService` versendet nur, wenn die Liste fehlt oder der Empfänger auf einen Ausdruck passt; sonst bleibt die Mail in der Warteschlange und ist über `EmailDebugRepo` einsehbar. Die Dev-Route `GET /api/dev/emails` (`dev/dev.kt`) rendert diese Ablage als HTML; sie wird nur registriert, wenn `Config.Mode` nicht `PROD` ist. Der Dev-Knopf im QR-Scanner ist in Produktion verborgen.

## Verworfene Alternativen

- **Privileg je Konfigurationsart** (`1fc11460` legte SMTP-spezifische Privilegien an, `3ee0be28` benannte sie um): verworfen, weil jede weitere globale Einstellung sonst ein neues Privileg und einen manuellen Rollenschritt je Auslieferung brauchte ([ADR-0010](0010-privilegien-action-resource-scope.md)).
- **Konfiguration ausschließlich per Umgebung**: der Ausgangszustand; verworfen, weil Betreiber ohne Deployment-Zugriff Absender und Zugang ändern müssen.
- **Mailversand im Dev-Modus abschalten**: es gab eine Abschaltphase; `dd2b6a8b` („Enable emails again") aktivierte den Versand wieder, die Whitelist ersetzt die Abschaltung.

## Konsequenzen

- Das SMTP-Passwort liegt im Klartext in `smtp_config_override.password`; die Tabelle ist nur mit `ADMINISTRATION`-Recht lesbar, aber jeder Datenbankabzug enthält es. Die Datensicherung ([ADR-0047](0047-webdav-export-jobs-und-datensicherung.md)) exportiert die Tabelle nicht.
- Eine Migration musste wegen der Reihenfolge umbenannt werden (`0fea2d3f`); die Datei heißt heute `V202510231450__…`, obwohl der Commit vom 2025-10-22 stammt ([ADR-0014](0014-flyway-migrationskonventionen.md)).
- Ohne gesetzte `WHITELIST_EMAIL_RECEIVER` versendet auch ein lokaler Dev-Server echte Mails, sobald ein SMTP-Zugang konfiguriert ist. Wer mit einem Produktionsabzug arbeitet, muss die Whitelist setzen; die Regel ist nicht erzwungen.
- Der Modus-Schalter `Config.Mode` (DEV/TEST/PROD) trägt mehr als die Dev-Routen: er entscheidet auch über Whitelist-Verhalten und sichtbare Dev-Knöpfe; ein Deployment im falschen Modus ist ein Sicherheitsproblem.

## Quellen

- Commits: `1fc11460` (SMTP config to UI, Privilege.kt), `0fea2d3f` (Fix migration order), `3ee0be28` (Umbenennung zu Administration, globale Konfigurationen), `a22fe719` (Whitelist-Mailservice im Dev/Test-Modus), `6be3d354` (Whitelist-Fixes), `dd2b6a8b` (Enable emails again)
- Migrationen: `V202510231450__smtp_config_override.sql`
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/config/Config.kt` (`mailReceiverWhitelist`, `Mode`), `app/email/boundary/EmailService.kt`, `app/email/control/EmailDebugRepo.kt`, `dev/dev.kt`, `app/auth/entity/Privilege.kt` (`ADMINISTRATION`)
- Verwandte ADRs: [ADR-0010](0010-privilegien-action-resource-scope.md), [ADR-0012](0012-eigene-request-validierung-und-parser.md), [ADR-0013](0013-scheduler-und-datenbank-warteschlangen.md), [ADR-0014](0014-flyway-migrationskonventionen.md), [ADR-0032](0032-einbettbares-frontend-theme-je-instanz.md), [ADR-0049](0049-challenge-events-teilnehmer-ohne-konto.md), [ADR-0083](0083-datenschutz-prod-abzuege-und-datenschutzseite.md)
