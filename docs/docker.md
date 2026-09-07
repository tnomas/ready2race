# Ready2Race mit Docker betreiben

Der Verbund besteht aus drei Containern:

| Dienst    | Inhalt                                                       | Port nach außen |
|-----------|--------------------------------------------------------------|-----------------|
| `db`      | PostgreSQL 17 mit eigenem Volume                             | keiner          |
| `backend` | Ktor-API, Migrationen beim Start, Volume für Theme und Logos | keiner          |
| `web`     | Frontend in nginx, reicht `/api` und `/static` ans Backend   | `R2R_PORT`      |

Nach außen gibt es also genau einen HTTP-Port. Domain und TLS übernimmt ein
Reverse-Proxy davor, zum Beispiel Caddy, Traefik oder nginx.

## Voraussetzungen

- Docker mit Compose-Plugin (`docker compose version` zeigt v2).
- Für den lokalen Bau etwa 3 GB freier Arbeitsspeicher für Docker. Ein JDK oder
  Node auf dem Host braucht es nicht.
- Ein SMTP-Zugang. Einladungen, Registrierungen und Rechnungen laufen über
  Mail. Ohne erreichbaren Server startet die Anwendung trotzdem, die Mails
  bleiben dann in der Warteschlange liegen.

## Erster Start

```bash
cp .env.example .env
```

In der `.env` mindestens ausfüllen:

- `POSTGRES_PASSWORD`: Passwort der Datenbank. Wird beim ersten Start gesetzt
  und ändert sich danach nicht mehr über diese Datei.
- `ADMIN_EMAIL` und `ADMIN_PASSWORD`: der erste Administrator.
- `SECURITY_PEPPER`: zum Beispiel aus `openssl rand -hex 32`. Nach dem ersten
  Start nie mehr ändern, sonst passt kein gespeichertes Passwort mehr.
- `SMTP_*`: der Mailversand.
- `FRONTEND_ORIGINS`: die öffentliche Adresse, z. B. `https://regatta.example.org`.
  Links in Mails (Passwort-Reset, Einladung, Registrierung) dürfen nur dorthin
  zeigen. Ohne den Schlüssel gilt der `Host`-Kopf der Anfrage, den ein Client
  frei wählen kann; in Produktion also immer setzen.

Dann bauen und starten:

```bash
docker compose up -d --build
```

Der erste Bau dauert einige Minuten, weil Maven und npm alle Abhängigkeiten
laden. Spätere Bauten nutzen den BuildKit-Cache und sind deutlich schneller.
Das Backend startet erst, wenn die Datenbank bereit ist, und nginx erst, wenn
das Backend seinen Healthcheck besteht. Danach ist die Anwendung unter
`http://<server>:8090` erreichbar (oder dem Port aus `R2R_PORT`).

```bash
docker compose ps          # alle drei Dienste "healthy"?
docker compose logs -f backend
```

## Fertige Images statt lokalem Bau

Der Workflow in `.github/workflows/docker-images.yml` baut bei jedem Push auf
`main` beide Images und veröffentlicht sie in der GitHub Container Registry.
Ein Server braucht dann keinen Bau mehr:

```bash
# in .env
R2R_IMAGE_PREFIX=ghcr.io/tnomas/
R2R_IMAGE_TAG=latest
```

```bash
docker compose pull
docker compose up -d --no-build
```

Die Pakete müssen in GitHub auf öffentlich stehen, oder der Server meldet sich
vorher mit `docker login ghcr.io` an.

## Reverse-Proxy mit TLS

Beispiel für Caddy, der sich das Zertifikat selbst besorgt:

```
regatta.example.org {
    reverse_proxy localhost:8090
}
```

Mit einem solchen Proxy davor in der `.env` `TRUSTED_PROXY_HOPS=2` setzen
(der äußere Proxy und nginx im Dienst `web`). Nur dann sieht das Backend für
seine Rate-Limits die echte Client-Adresse. Die Vorgabe `1` passt, wenn
Clients direkt auf `R2R_PORT` zugreifen; ein zu hoher Wert erlaubt Clients,
ihre Adresse zu fälschen.

Websockets laufen ohne weitere Einstellung durch, Caddy und nginx reichen den
Upgrade-Header von sich aus weiter. Bei nginx als äußerem Proxy müssen
`proxy_set_header Upgrade $http_upgrade;` und
`proxy_set_header Connection "upgrade";` gesetzt sein, sonst bleiben Zeitnahme,
Boards und Livestream-Szenen stumm.

## Daten und Sicherung

Zwei Volumes halten alles, was nicht im Image liegt:

- `db-data`: die Datenbank.
- `static-data`: Theme, hochgeladene Schriften und Logos.

Sicherung der Datenbank:

```bash
docker compose exec db pg_dump -U ready2race -Fc ready2race > ready2race-$(date +%F).dump
```

Wiederherstellung in einen leeren Verbund:

```bash
docker compose up -d db
docker compose exec -T db pg_restore -U ready2race -d ready2race --clean --if-exists < ready2race-2026-09-07.dump
docker compose up -d
```

## Aktualisieren

```bash
git pull
docker compose up -d --build
```

Beziehungsweise mit fertigen Images `docker compose pull && docker compose up -d`.
Migrationen laufen beim Start des Backends automatisch. Vor einem größeren
Sprung lohnt ein Dump wie oben.

Ältere Compose-Versionen (vor 2.5) ersetzen einen laufenden Container nach
einem Neubau nicht von selbst. Zeigt `docker compose ps` nach dem Bau noch die
alte Startzeit, hilft `docker compose up -d --force-recreate`.

## Betriebsmodus

`MODE=PROD` ist der Standard. `STAGING` verhält sich nach außen wie `PROD`
(keine Mail-Ansicht, keine Stacktraces in Fehlerantworten). Zusammen mit
`WHITELIST_EMAIL_RECEIVER` ergibt das einen Testserver, der niemanden
versehentlich anschreibt. Die Entwicklerseite `/api/dev/emails` gibt es nur
mit `MODE=DEV`, und die gehört nicht auf einen erreichbaren Server.

## Konfiguration im Detail

Alle Schlüssel stehen kommentiert in `.env.example`. Die Datenbankverbindung,
der Port des Backends und der Ablageort der statischen Dateien sind in
`docker-compose.yml` fest verdrahtet, weil sie sich aus dem Verbund ergeben.
Wer das Backend an eine externe Datenbank hängen will, überschreibt
`DATABASE_URL`, `DATABASE_USER` und `DATABASE_PASSWORD` dort und entfernt den
Dienst `db`.

Das Frontend wird mit relativen Adressen gebaut (`/api`, `/static/...`), weil
nginx beides unter derselben Herkunft ausliefert. Soll das Frontend gegen ein
Backend unter einer anderen Adresse laufen, gibt man diese beim Bau mit:

```bash
docker compose build --build-arg VITE_API_BASE_URL=https://api.example.org/api web
```

## Bekannte Eigenheiten

- Der Backend-Bau startet innerhalb des Images eine eigene PostgreSQL-Instanz,
  weil Flyway und jOOQ zur Bauzeit eine Datenbank brauchen. Das ist gewollt
  und hat mit der Betriebsdatenbank nichts zu tun.
- Alle Container laufen mit `TZ=Europe/Berlin`, und die App rechnet über
  `APP_TIMEZONE` in derselben Zone. Andere Zeitzone in der `.env` über `TZ`
  setzen, und zwar vor dem ersten Start der Datenbank.
- Der Healthcheck des Backends ruft `GET /api/health` (204, ohne Anmeldung);
  er prüft Server und Datenbankverbindung zugleich.
- Optionale Feinsteuerung über die `.env`: `DATABASE_POOL_SIZE`,
  `DATABASE_STATEMENT_TIMEOUT_MS`, `SECURITY_ARGON2_MEMORY_KIB`,
  `SECURITY_ARGON2_MAX_CONCURRENT`. Bedeutung und Vorgaben stehen in
  `backend/template.env`.
- Port 8090 ist nur der Standard. Er lässt sich über `R2R_PORT` verschieben,
  wenn er auf dem Server schon belegt ist.
