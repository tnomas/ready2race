# ADR-0007: Passwörter mit Argon2id über password4j

- Status: angenommen
- Datum: 2025-01-08
- Bereich: backend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Der Initial-Commit hashte Passwörter mit jBCrypt und hatte den Admin-Zugang fest im Code. Das Upstream-Team wollte einen aktuellen, speicherharten Algorithmus mit einstellbaren Parametern, den ein Betreiber ohne Neubau an seine Hardware anpassen kann, sowie einen serverseitigen Pepper zusätzlich zum Salt.

## Entscheidung

- Passwörter werden mit **Argon2id** über die Bibliothek password4j gehasht (`backend/src/main/kotlin/de/lambda9/ready2race/backend/security/PasswordUtilities.kt`: `.addPepper(config.security.pepper).withArgon2()`).
- Die Parameter stehen in `backend/src/main/resources/psw4j.properties`: `hash.argon2.memory=15`, `iterations=2`, `parallelism=1`, `length=32`, `type=id`, `version=19`, `global.salt.length=64`. Ein Betreiber kann eine eigene Datei per `-Dpsw4j.configuration=…` beim Start übergeben.
- Der Pepper kommt aus der Umgebungsvariable `SECURITY_PEPPER` (Pflicht, siehe `backend/template.env`).
- Der System-Admin (E-Mail, Passwort) kommt aus `ADMIN_EMAIL`/`ADMIN_PASSWORD` und wird bei **jedem** Start in `initializeDatabase` gesetzt bzw. aktualisiert.

## Verworfene Alternativen

- jBCrypt aus dem Initial-Commit: ersetzt, weil Parameter nicht konfigurierbar waren und der Algorithmus nicht speicherhart ist.
- Admin-Zugang im Code: durch Umgebungsvariablen ersetzt (`4ec09882`).

## Konsequenzen

- Ein Wechsel der Argon2-Parameter oder des Peppers macht bestehende Hashes ungültig; es gibt keinen Rehash-Mechanismus beim Login. Wer Parameter ändert, muss Passwörter zurücksetzen lassen.
- `SECURITY_PEPPER` ist ein Geheimnis wie das Datenbankpasswort; eine Raute darin zerlegt die dotenv-Datei.
- Weil `initializeDatabase` den Admin bei jedem Start aus der Umgebung überschreibt, darf ein Wegwerf-Backend mit eigener Env-Datei nie gegen eine geteilte Datenbank starten.
- Die Werte in `psw4j.properties` (`memory=15`) sind als Ausgangspunkt gewählt; `backend/README.md` verweist auf die empfohlenen Einstellungen des Bibliotheksanbieters für stärkere Hardware.

## Quellen

- Commits: `4ec09882` (bcrypt → password4j Argon2, Admin aus der Umgebung), `4df8c468` (`psw4j.properties`, Plugin-Struktur)
- Code: `backend/src/main/resources/psw4j.properties`, `backend/src/main/kotlin/de/lambda9/ready2race/backend/security/PasswordUtilities.kt`, `backend/src/main/kotlin/de/lambda9/ready2race/backend/database/initializeDatabase.kt`, `backend/README.md`
- Verwandte ADRs: [ADR-0008](0008-serverseitige-sessions-header-token.md), [ADR-0035](0035-nutzer-onboarding-einladung-ohne-delete-privileg.md)
