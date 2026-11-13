package de.lambda9.ready2race.backend.app

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import de.lambda9.ready2race.backend.config.Config
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.jooq.DeleteOrUpdateWithoutWhereListener
import de.lambda9.tailwind.jooq.Jooq
import de.lambda9.tailwind.jooq.JooqQueryPrinter
import org.jooq.ExecuteListener
import org.jooq.SQLDialect
import org.jooq.impl.DSL
import org.jooq.impl.DefaultConfiguration
import org.jooq.impl.DefaultExecuteListenerProvider
import java.io.PrintWriter
import java.util.Properties
import javax.sql.DataSource

data class Env(
    val config: Config,
) {

    companion object {

        /**
         * Hikari-Pool nach [Config.Database]. Bisher baute `Jooq.create` den Pool nur aus URL,
         * Zugang und Schema; Poolgröße, Statement-Timeout und Leck-Erkennung waren nicht
         * einstellbar, und eine hängende Abfrage hielt ihre Verbindung unbegrenzt.
         */
        fun hikariConfig(config: Config): HikariConfig {
            val db = config.database
            val props = Properties().apply {
                // Wie bisher in Jooq.create: Treiber-Logausgaben nach stdout.
                put("dataSource.logWriter", PrintWriter(System.out))
            }
            return HikariConfig(props).apply {
                jdbcUrl = db.url
                driverClassName = "org.postgresql.Driver"
                username = db.user
                password = db.password
                schema = "ready2race"
                maximumPoolSize = db.poolSize
                if (db.statementTimeoutMs > 0) {
                    // Gilt je Sitzung für jede Anweisung; 0 hieße „ohne Grenze".
                    connectionInitSql = "set statement_timeout = ${db.statementTimeoutMs}"
                }
                if (config.mode != Config.Mode.PROD) {
                    // Nur eine Warnung mit Stacktrace im Log, keine Wirkung auf die Verbindung.
                    leakDetectionThreshold = LEAK_DETECTION_THRESHOLD_MS
                }
            }
        }

        private const val LEAK_DETECTION_THRESHOLD_MS = 60_000L

        fun create(config: Config): Pair<JEnv, DataSource> {
            val env = Env(
                config = config
            )

            val dataSource = HikariDataSource(hikariConfig(config))

            val listeners = listOfNotNull<ExecuteListener>(
                DeleteOrUpdateWithoutWhereListener(),
                if (config.database.logQueries) {
                    JooqQueryPrinter { query ->
                        !query.contains("""select "ready2race"."email"""")
                    }
                } else null,
            )

            val configuration = DefaultConfiguration()
                .set(dataSource)
                .set(SQLDialect.POSTGRES)
                // Beide Listener in EINEM Aufruf: ein zweites set(...) ersetzte die Liste, und mit
                // eingeschaltetem Abfrage-Log fiel der Schutz vor delete/update ohne where weg.
                .set(*listeners.map { DefaultExecuteListenerProvider(it) }.toTypedArray())

            return Jooq(dsl = DSL.using(configuration), env = env) to dataSource
        }
    }

}

typealias JEnv = Jooq<Env>

typealias App<E, A> = KIO<JEnv, E, A>
