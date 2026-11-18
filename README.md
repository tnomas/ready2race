<p align="center">
  <img src="r2r-logo-dark.svg" alt="Ready2Race" width="320">
</p>

# Ready2Race

Ready2Race ist eine webbasierte Software für Sportveranstaltungen: von der Ausschreibung über Meldungen,
Zeitplan und Zeitnahme bis zu Ergebnissen, Rechnungen, Urkunden und Livestream-Grafiken. Gebaut ist sie
für Regatten im Coastal Rowing, fachlich aber sportartneutral gehalten.

Vereine melden ihre Athleten und Boote online. Die Veranstaltung plant Runden und Läufe, führt sie mit
eigener Zeitnahme oder einem angebundenen Zeitnahmedienst durch, veröffentlicht Ergebnisse live und steuert
Helfer über eine QR-basierte App. Leihboote und anderes Material lassen sich über eine eigene
Materialvermietung anfragen und zuteilen.

## Funktionen

**Planung und Meldung**
- Veranstaltungen mit Wettkampftagen, Wettkämpfen, Kategorien, Gebühren und Dokumenten
- Rundenstrukturen (Vorlauf, Hoffnungslauf, Finale) als wiederverwendbare Vorlagen, Folgerunden automatisch befüllt
- Online-Meldung durch Vereine mit Teams, Ersatzleuten und Abmeldungen
- Bedingungen je Athlet (Nachweise, wahlweise je Tag und je Wettkampf) mit einstellbarem Prüfungsschweregrad
- Rechnungen für Meldegebühren, Versand an die Vereine

**Durchführung**
- Zeitplan mit Startgruppen und Läufen, Laufzustände von „in Vorbereitung“ bis „beendet“, Klärungsfälle
- Eigene Zeitnahme mit Posten am Kurs, Startsequenzen mit Tönen, Zwischenzeiten und Zeitstrafen
- Anbindung externer Zeitnahme (RaceClocker) per Ergebnis-Feed
- Schiedsrichter-Dashboard, Check-in/-out der Boote, Startlisten als PDF oder CSV
- Helfer-App (PWA unter `/app/`) für Scannen, Zeitnahme-Posten und Check-in, Schichtplanung für Helfer

**Ergebnisse und Anzeigen**
- Live-Ergebnisse, Ranglisten nach Wertungskategorien, Siegerehrungsbogen und Urkunden aus eigenen Vorlagen
- Konfigurierbare Boards (Athleten-Anzeige, Tagesprogramm, Sprecher) für Bildschirme vor Ort
- Livestream-Grafiken als Browserquelle für Wirecast oder OBS, mit Regie-Board und Probemodus
- Öffentliche Seiten aktualisieren sich in Echtzeit über Websockets

**Materialvermietung**
- Anbieter verwalten Materialarten (Boote und Sonstiges), einzelne Stücke und Angebote je Veranstaltung
- Vereine fragen Material zu ihren Meldungen an; der Anbieter bestätigt, setzt auf die Warteliste oder lehnt ab
- Grundzuteilung je Meldung, Ausnahmen je Lauf, Schadensakte mit Ausfallzeiten und Fotos
- Wahlweise ist die Meldungsnummer zugleich die Startnummer im Lauf

**Bedienung**
- Veranstaltungsbereiche in der Seitenleiste nach Ablauf geordnet: Vorbereitung, Meldung, Renntag, Nachbereitung
- Schnellsprung in der Kopfleiste (Taste `/`) zu Veranstaltungen, Bereichen und Wettkämpfen
- Tief verlinkbare Reiter, einheitliche Seitenköpfe mit Brotkrumen, Lade-, Fehler- und Leerzustände
- Eigenes Theme je Installation mit garantiertem Textkontrast; je Lauf eine Hauptaktion, Seltenes im Menü

**Verwaltung**
- Rollen und Rechte nach Aktion, Ressource und Reichweite
- Mehrsprachig: Deutsch, Englisch, Dänisch
- Datenaustausch zwischen Installationen über WebDAV

## Technik

| Teil | Stack |
|---|---|
| Backend | Kotlin 2.1, Ktor 3.1, jOOQ, Flyway, KIO-Effektsystem, Java 17 |
| Datenbank | PostgreSQL 17 |
| Frontend | React 18, TypeScript, Vite 6, MUI 6, TanStack Router, i18next |
| API | handgepflegte OpenAPI-3.1-Spezifikation, daraus generierter TypeScript-Client |
| Tests | JUnit mit Testcontainers (Backend), Vitest (Frontend) |

## Schnellstart

Voraussetzungen: Docker, JDK 17 bis 21, Node (LTS, siehe `frontend/.nvmrc`).

### Backend

```bash
cd backend
docker compose up -d          # Entwicklungs-DB (Port 7653) und Build-DB (Port 7652)
cp template.env .env          # Werte eintragen, insbesondere ADMIN_EMAIL und ADMIN_PASSWORD
./mvnw clean package          # Migrationen, jOOQ-Codegen, Kompilieren, Tests
java -jar target/ready2race-api-0.0.1-jar-with-dependencies.jar .env
```

Die API läuft dann auf `http://localhost:8080`, die Swagger-Oberfläche auf
`http://localhost:8080/api/documentation`. Beim Start wird der Admin aus `ADMIN_EMAIL` und
`ADMIN_PASSWORD` angelegt.

### Frontend

```bash
cd frontend
npm install
cp template.env .env          # VITE_API_BASE_URL auf das Backend zeigen lassen
npm run dev                   # http://localhost:5123
```

## Betrieb

- **Backend:** Das Jar braucht eine Java-Laufzeit ab Version 17 und eine PostgreSQL-17-Datenbank. Die
  Env-Datei wird als erstes Argument übergeben; echte Umgebungsvariablen haben Vorrang. Alle Schlüssel
  stehen in [`backend/template.env`](backend/template.env), `MODE=PROD` schaltet die Entwicklungsrouten ab.
  Migrationen laufen beim Start automatisch.
- **Wichtige optionale Schlüssel:** `FRONTEND_ORIGINS` (erlaubte Adressen für Links in E-Mails, in
  Produktion setzen), `APP_TIMEZONE` (Vorgabe `Europe/Berlin`, unabhängig von der Zone des Hosts),
  `TRUSTED_PROXY_HOPS` (Anzahl vorgeschalteter Reverse-Proxys, z. B. `1` hinter nginx),
  `DATABASE_POOL_SIZE` und `DATABASE_STATEMENT_TIMEOUT_MS`.
- **Healthcheck:** `GET /api/health` antwortet ohne Anmeldung mit 204.
- **Frontend:** `npm run build` erzeugt statische Dateien in `frontend/dist`, die ein beliebiger Webserver
  ausliefert. Die Adressen von API, Theme, Schriften und Logos kommen aus der `.env` beim Bauen.
- **Passwort-Hashing:** Argon2id über Password4j. Den Speicherbedarf neuer Hashes steuert
  `SECURITY_ARGON2_MEMORY_KIB` (Vorgabe 19 MiB); ältere Hashes werden beim nächsten Login neu berechnet.
- **Logging:** eigene Log4j2-Konfiguration mit `-Dlog4j.configurationFile=pfad/zur/log4j2.xml`.

## Entwicklung

| Befehl | Wirkung |
|---|---|
| `./mvnw test` | Backend-Tests gegen ein Postgres aus Testcontainers |
| `./mvnw compile -DskipCodegen=true` | Backend kompilieren ohne jOOQ-Codegen |
| `npm test` | Frontend-Tests (Vitest) |
| `npm run build` | Typprüfung und Produktions-Build |
| `npm run lint` | ESLint |
| `npm run generate` | API-Client aus `backend/src/main/resources/openapi/documentation.yaml` neu erzeugen |
| `npm run build:demo` | Sprecher-Board als einzelne HTML-Datei ohne Backend (`frontend/dist-demo/`) |

Eine API-Änderung beginnt in der OpenAPI-Spezifikation, danach folgen Backend und `npm run generate`.
Neue Texte im Frontend brauchen Übersetzungen in allen drei Sprachen, sonst schlägt die Typprüfung fehl.

Weiterführend:

- [`AGENTS.md`](AGENTS.md): Arbeitsanleitung mit Architektur, Konventionen, Fallen und Domänenglossar
- [`docs/adr/`](docs/adr/README.md): Architekturentscheidungen mit Begründung und verworfenen Alternativen
- [`docs/superpowers/`](docs/superpowers/): Design-Specs, Umsetzungspläne und Testkataloge

## Aufbau des Repositorys

```
backend/    Kotlin-API, Migrationen, OpenAPI-Spezifikation
frontend/   React-Anwendung, Helfer-App (src/pwa), Demos (src/demo)
api/        TypeSpec-Beschreibung der API (Dokumentation, nicht Quelle)
docs/       ADRs, Specs, Pläne, Testkataloge, Seeds
```

## Herkunft und Lizenz

Ready2Race wurde von der lambda9 GmbH entwickelt und unter der GNU General Public License v3.0 veröffentlicht.
Dieses Repository führt das Projekt eigenständig weiter. Lizenztext: [LICENSE](LICENSE).
