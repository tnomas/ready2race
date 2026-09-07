# ADR-0013: In-Process-Scheduler mit Datenbank-Warteschlangen für Hintergrundjobs

- Status: angenommen
- Datum: 2025-01-28
- Bereich: backend, betrieb
- Rekonstruiert: ja, aus Commit-Historie, Specs und Arbeitsnotizen am 2026-09-07

## Kontext

Wiederkehrende Aufgaben (Mails versenden, abgelaufene Sitzungen und Einladungen löschen, Rechnungen erzeugen, später Exporte, Startsequenzen und Feed-Abrufe) sollten ohne externe Queue oder zusätzlichen Prozess laufen, weil die Anwendung als einzelnes Jar bei Vereinen betrieben wird. Mails müssen zuverlässig und mit Anhängen ankommen, auch wenn der SMTP-Server gerade nicht erreichbar ist.

## Entscheidung

- **Ein eigener Scheduler** (`backend/src/main/kotlin/de/lambda9/ready2race/backend/schedule/Scheduler.kt`) läuft im Anwendungsprozess und wird in `Application.kt` über `scheduleJobs(env)` gestartet. Jobs sind KIO-Effekte mit Env-Kontext.
- Zwei Job-Arten: `scheduleFixed(name, interval)` für feste Takte und `scheduleDynamic(name, interval, emptyDelay, processedDelay, defectDelay)` für Warteschlangen. Der Rückgabewert steuert den nächsten Lauf: `DynamicIntervalJobState.Processed` (sofort weiter), `Empty` (länger warten), `Defect` (Wiederholung nach Fehler), `Fatal(reason)` (Job beendet sich).
- **Warteschlangen sind Datenbanktabellen.** Ein Job holt den nächsten fälligen Eintrag, verarbeitet ihn und markiert ihn. Beispiele: `email` (`priority`, `dont_send_before`, `keep_after_sending`, `sent_at`, `last_error`, `last_error_at`) mit Anhängen in `email_attachment` (bytea); `invoice*`, `certificate_of_event_participation_sending_job`, `webdav_export*`, `webdav_import*`.
- **Jobs Stand September 2026:** „Send next email" (10 s), „Produce next invoice" (5 min), „Send next certificate of participation" (5 min, Defekt 1 h), „Export next file to WebDAV Server" und „Import next file from WebDAV Server" (10 s), „Fire due start sequence entries" (1 s, mit `transact()` und Broadcast nach Commit), Feed-Abruf-Herzschlag (1 s bei Arbeit, 30 s leer), „Delete expired session tokens" (5 min), abgelaufene Registrierungen/Einladungen/Passwort-Resets (1 h), Captchas (5 min).
- **E-Mail:** Versand über Simple Java Mail; Vorlagen je Sprache als JSON ([ADR-0006](0006-mehrsprachigkeit-i18next-erzwungene-schluessel.md)); Registrierungen und Einladungen werden der Mail zugeordnet, damit sie nachverfolgbar sind. SMTP-Zugang aus der Umgebung, später aus der Datenbank überschreibbar ([ADR-0048](0048-smtp-override-administration-dev-whitelist.md)).

Neue Hintergrundarbeit wird als Tabelle plus `scheduleDynamic`-Job gebaut, nicht als Thread, Timer oder externer Dienst.

## Verworfene Alternativen

- Externe Job-Queue oder Message-Broker: nicht belegt; hätte einen zweiten Prozess beim Betreiber verlangt.
- Kotlin „context receivers" für den Env-Kontext im Scheduler: erwogen und wegen experimentellem Status vertagt; stattdessen ein künstlicher Kontext (`29f9439b`).
- Job „Delete sent emails": auskommentiert in `Application.kt`; gesendete Mails bleiben nach `keep_after_sending` liegen, das Löschen ist nicht aktiv.

## Konsequenzen

- Der Scheduler läuft außerhalb von `respondKIO`; Effekte nach dem Commit (Broadcasts) müssen von Hand nach `transact()` gehängt werden (Kommentar in `Application.kt`).
- Ein Job auf `Fatal` beendet sich still bis zum Neustart. Der WebDAV-Export geht ohne gültige Konfiguration sofort auf `Fatal`; nach jeder Env-Änderung ist ein Neustart nötig.
- Mehrere Instanzen desselben Backends würden dieselben Warteschlangen konkurrierend abarbeiten; das ist nicht vorgesehen und nicht abgesichert.
- Takte sind im Code fest; wer den Feed-Abruf oder die Startsequenzen feiner braucht, ändert `Application.kt`.
- Anhänge in `email_attachment` als bytea machen die Tabelle groß ([ADR-0021](0021-binaerdaten-in-der-datenbank.md)); die Entwicklungsansicht `/api/dev/emails` zeigt die Warteschlange ohne Versand.

## Quellen

- Commits: `17822e34` (`schedule/Schedule.kt` im Initial-Commit), `29f9439b` (Scheduler mit künstlichem Env-Kontext), `3aa27391` (flexibleres Scheduling, E-Mails), `a3cf1d33` (Logger), `875817dd` (Sitzungen aufräumen), `ff8743b6` (Einladungen aufräumen), `58eaa063` (Test für KIO und DB-Env), `02a110fc` (Rechnungsjobs), `acaa03a6` (E-Mail-Vorlagen), `f3fd1ad6` (Registrierung/Einladung an Mail gehängt), `16c1e631`, `f4ecfddc` (Bestätigungsmail mit Anhängen)
- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/schedule/`, `Application.kt` (`scheduleJobs`), `backend/src/main/resources/db/migration/V202501251200__emails.sql`
- Verwandte ADRs: [ADR-0002](0002-kio-effektsystem.md), [ADR-0006](0006-mehrsprachigkeit-i18next-erzwungene-schluessel.md), [ADR-0008](0008-serverseitige-sessions-header-token.md), [ADR-0021](0021-binaerdaten-in-der-datenbank.md), [ADR-0047](0047-webdav-export-jobs-und-datensicherung.md), [ADR-0048](0048-smtp-override-administration-dev-whitelist.md), [ADR-0056](0056-automatischer-feed-abruf-feed-ist-wahrheit.md), [ADR-0089](0089-startsequenzen-serverseitig-fehlstart.md)
