# ADR-0106: Rückruf-Adressen in Mails werden gegen `FRONTEND_ORIGINS` bzw. den Host der Anfrage geprüft

- Status: angenommen
- Datum: 2026-11-13
- Bereich: backend
- Rekonstruiert: ja, aus der Commit-Historie des Zweigs

## Kontext

Registrierung, Einladung und Passwort-Reset nehmen vom Frontend eine `callbackUrl` entgegen und bauen daraus den Link in der Mail. Wer die Adresse frei wählen kann, lässt das System Mails mit Links auf eine fremde Seite verschicken (Passwort-Reset-Token an Dritte). Das Backend kennt nicht von sich aus, unter welcher Adresse das Frontend liegt: In der Entwicklung sind es zwei Ports, in der Docker-Auslieferung ein nginx, im Betrieb womöglich zwei Hosts.

## Entscheidung

- Jede Route, die eine `callbackUrl` annimmt, prüft sie über `ApplicationCall.checkCallbackUrl` (`calls/requests/CallbackUrls.kt`; aufgerufen in `user.kt`, `eventRegistration.kt`, `competitionRegistration.kt`, `eventParticipant.kt`). Eine nicht erlaubte Adresse ergibt 422.
- **Erlaubt** sind die Origins aus dem optionalen Schlüssel `FRONTEND_ORIGINS` (kommagetrennt, `schema://host:port`, normalisiert); ist er gesetzt, gilt ausschließlich diese Liste. Ist er nicht gesetzt, muss der Host der `callbackUrl` dem Host-Kopf der Anfrage entsprechen (Port egal); in `DEV` und `TEST` ist dann zusätzlich Loopback (`localhost`) erlaubt. Nur `http` und `https` ohne Benutzerangabe sind zulässig. `PROD` und `STAGING` ohne gesetzten Schlüssel warnen beim Start.
- Die Mailansicht `/api/dev/emails` gibt Reset- und Einladungslinks aus und existiert deshalb nur im Modus `DEV`.

## Verworfene Alternativen

- **Feste Adresse aus der Konfiguration, `callbackUrl` aus der Anfrage streichen:** bricht Betriebe mit mehreren Frontend-Adressen und die lokale Entwicklung.
- **Nur Schema und Pfad prüfen:** lässt jeden Host zu.
- **Allowlist als Pflichtschlüssel:** hätte jede bestehende Installation beim Update nicht starten lassen.
- **Der Host-Kopf allein, ohne Schlüssel:** scheitert hinter einem Proxy, der den Host-Kopf ändert.

## Konsequenzen

- **Betrieb:** Liegen Frontend und API in Produktion auf verschiedenen Hosts oder hinter einem Proxy, der den Host-Kopf ändert, muss `FRONTEND_ORIGINS` gesetzt sein, sonst scheitern Registrierung, Einladung und Passwort-Reset mit 422. Gehört auch in die Umgebungsvorlage der Docker-Auslieferung.
- Das Frontend bekommt bei einer abgelehnten Adresse 422 (`RequestError.CallbackUrlNotAllowed`); das Backend loggt die abgelehnte Adresse und nennt `FRONTEND_ORIGINS` als Abhilfe. Mail-Links über den Docker-nginx und einen Hoster-Proxy sind nicht in echt belegt.
- Neue Routen mit `callbackUrl` müssen `checkCallbackUrl` aufrufen; `CallbackUrlsTest` und `CallbackUrlHttpIT` decken die Regel und die Routen ab.

## Quellen

- Code: `backend/src/main/kotlin/de/lambda9/ready2race/backend/calls/requests/CallbackUrls.kt`, `backend/template.env`, `backend/src/main/kotlin/de/lambda9/ready2race/backend/config/Config.kt`
- Verwandte ADRs: ADR-0008 (Sitzungen), ADR-0009 (Rate-Limiting)
