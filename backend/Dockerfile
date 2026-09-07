# syntax=docker/dockerfile:1.7
#
# Backend-Image in zwei Stufen.
#
# Der Maven-Bau braucht eine laufende PostgreSQL-Datenbank: Flyway spielt die
# Migrationen ein, und jOOQ erzeugt daraus den typsicheren Datenbankcode. Die
# Baustufe installiert deshalb PostgreSQL 17 neben Maven, startet ihn nur für
# den Bau und wirft ihn danach mitsamt allem anderen weg. Die Laufstufe enthält
# nur noch das JRE, Schriften für die PDF-Erzeugung und das fertige Jar.

FROM maven:3.9-eclipse-temurin-21 AS build

# PostgreSQL 17 aus dem offiziellen PGDG-Repository, damit die Bauzeit-Datenbank
# derselben Hauptversion entspricht wie die Datenbank im Betrieb.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl gnupg; \
    . /etc/os-release; \
    install -d /usr/share/postgresql-common/pgdg; \
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
        -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc; \
    echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends postgresql-17; \
    rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY pom.xml ./
COPY src ./src

# Das Maven-Repository liegt in einem BuildKit-Cache und überlebt den Bau; beim
# zweiten Bau werden keine Abhängigkeiten mehr geladen. Die Zugangsdaten unten
# gelten nur für die Wegwerf-Datenbank innerhalb dieser Baustufe.
RUN --mount=type=cache,target=/root/.m2 set -eux; \
    pg_ctlcluster 17 main start; \
    su postgres -c "psql -v ON_ERROR_STOP=1 \
        -c \"CREATE USER developer WITH PASSWORD 'sql';\" \
        -c 'CREATE DATABASE \"ready2race-build\" OWNER developer;'"; \
    mvn -B --no-transfer-progress package -DskipTests \
        -Ddatabase.url=jdbc:postgresql://localhost:5432/ready2race-build; \
    pg_ctlcluster 17 main stop; \
    mv target/ready2race-api-*-jar-with-dependencies.jar /build/app.jar


FROM eclipse-temurin:21-jre AS runtime

# fontconfig und DejaVu: PDFBox sucht beim Rendern nach Systemschriften, ohne
# sie hagelt es Warnungen. curl für den Healthcheck.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends fontconfig fonts-dejavu-core curl; \
    rm -rf /var/lib/apt/lists/*; \
    useradd --system --create-home --home-dir /app --shell /usr/sbin/nologin ready2race; \
    mkdir -p /data/static; \
    chown -R ready2race:ready2race /data

WORKDIR /app
COPY --from=build --chown=ready2race:ready2race /build/app.jar /app/app.jar

# Standardwerte, die im Container immer passen. Alles Weitere (Datenbank, SMTP,
# Admin, Pepper) kommt aus der Umgebung, siehe .env.example im Wurzelverzeichnis.
ENV MODE=PROD \
    HTTP_HOST=0.0.0.0 \
    HTTP_PORT=8080 \
    STATIC_FILES_PATH=/data/static \
    JAVA_OPTS="-XX:MaxRAMPercentage=75"

USER ready2race
EXPOSE 8080
VOLUME ["/data/static"]

# GET /api/health antwortet ohne Anmeldung und ohne Rate-Limit mit 204, solange
# ein `select 1` über den Verbindungspool gelingt: Lebenszeichen für Server und
# Datenbank zugleich. Die lange Anlaufzeit deckt Migrationen auf einer leeren
# Datenbank ab.
HEALTHCHECK --interval=15s --timeout=5s --start-period=120s --retries=5 \
    CMD curl -fsS "http://localhost:${HTTP_PORT}/api/health" > /dev/null || exit 1

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -Djava.awt.headless=true -jar /app/app.jar"]
