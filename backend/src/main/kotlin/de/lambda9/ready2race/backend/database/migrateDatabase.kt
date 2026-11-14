package de.lambda9.ready2race.backend.database

import de.lambda9.ready2race.backend.config.Config
import org.flywaydb.core.Flyway

/**
 * Flyway beim Start, über eine EIGENE Verbindung statt über den Anwendungspool: Der Pool setzt je
 * Sitzung ein `statement_timeout` (`DATABASE_STATEMENT_TIMEOUT_MS`), und eine lange Migration
 * (Index auf einer großen Tabelle, Backfill) darf daran nicht scheitern - sonst startet die App nicht.
 *
 * `outOfOrder(true)`: Merges bringen Migrationen mit älteren Versionsnummern als bereits
 * angewendete; ohne das schlägt der Start auf bestehenden Datenbanken fehl.
 */
fun migrateDatabase(config: Config) {
    Flyway(
        Flyway.configure()
            .dataSource(config.database.url, config.database.user, config.database.password)
            .schemas("ready2race")
            .outOfOrder(true)
    ).migrate()
}
