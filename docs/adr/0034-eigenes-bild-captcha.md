# ADR-0034: Eigenes Bild-Captcha im Backend statt externem Dienst

- Status: angenommen
- Datum: 2025-02-20
- Bereich: backend, frontend
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Registrierung und „Passwort vergessen" sind öffentliche Formulare, die E-Mails auslösen. Sie brauchen Schutz gegen automatisierte Aufrufe. Ein externer Captcha-Dienst hätte eine Abhängigkeit von einem Drittanbieter, dessen Skripte auf Vereinsseiten eingebettet würden ([ADR-0032](0032-einbettbares-frontend-theme-je-instanz.md)), und Datenschutzfragen mitgebracht.

## Entscheidung

- `CaptchaService` (`backend/…/app/captcha/boundary/CaptchaService.kt`) erzeugt mit `java.awt` ein Schiebe-Captcha: ein Bild 480×100 px (`CAPTCHA_WIDTH`/`CAPTCHA_HEIGHT`) mit zufälligen Formen und einem Zielkreis; der Nutzer schiebt einen Regler auf die Position des Ziels. Die Lösung wird mit Toleranz geprüft.
- Die Lösung liegt fünf Minuten (`CHALLENGE_LIFETIME`) in der Tabelle `captcha` (`V202502201700__captcha.sql`); abgelaufene Einträge räumt ein Scheduler-Job alle fünf Minuten ab ([ADR-0013](0013-scheduler-und-datenbank-warteschlangen.md)).
- Endpunkt unter `/api/captcha` (`captcha.kt`); das Frontend bindet die Komponente `FormInputCaptcha` ein und schickt Captcha-ID und Lösung mit dem Formular.
- Gilt für Selbstregistrierung und Passwort-Reset ([ADR-0035](0035-nutzer-onboarding-einladung-ohne-delete-privileg.md)). Zusätzlich greift das Rate-Limit `resetPassword` (5 je 5 Minuten, [ADR-0009](0009-rate-limiting-im-server.md)).

## Verworfene Alternativen

- Externer Captcha-Anbieter: nicht belegt und nicht gebaut; keine Fremdskripte, kein Datenabfluss, keine Kosten.
- Passwort-Reset ohne Captcha (`2e4d87cd`): war nur eine Etappe während der Entwicklung, das Captcha kam mit `bedc4617` an beide Formulare.

## Konsequenzen

- Das Captcha ist ein Hindernis für einfache Skripte, kein Schutz gegen gezielte Angriffe mit Bilderkennung. Zusammen mit Rate-Limits und E-Mail-Verifikation reicht das für den Anwendungsfall.
- Das Bild wird serverseitig gerendert (`java.awt` im Headless-Modus); die JVM braucht die entsprechenden Bibliotheken, was auf schlanken Basisimages fehlen kann.
- Barrierefreiheit: Ein Schiebe-Captcha ohne Audio-Alternative ist für Screenreader-Nutzer nicht lösbar. Es gibt keine Alternative im System.
- Die Toleranz ist eine Konstante im Code; wer sie ändert, ändert Sicherheit und Bedienbarkeit zugleich.

## Quellen

- Commits: `f7452795` (WIP Captcha), `2e4d87cd` (Passwort-Reset ohne Captcha, Etappe), `bedc4617` (Captcha finalisiert), `84a4cd1e` (Registration Captcha)
- Migrationen: `V202502201700__captcha.sql`
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/captcha/`
- Verwandte ADRs: [ADR-0009](0009-rate-limiting-im-server.md), [ADR-0013](0013-scheduler-und-datenbank-warteschlangen.md), [ADR-0032](0032-einbettbares-frontend-theme-je-instanz.md), [ADR-0035](0035-nutzer-onboarding-einladung-ohne-delete-privileg.md)
