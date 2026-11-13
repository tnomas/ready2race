package de.lambda9.ready2race.testing

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import de.lambda9.ready2race.backend.config.Config
import de.lambda9.ready2race.backend.app.Env
import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.database.initializeDatabase
import de.lambda9.ready2race.backend.module
import de.lambda9.ready2race.testing.kio.DefaultTestComprehensionScope
import de.lambda9.ready2race.testing.kio.TestComprehensionScope
import de.lambda9.ready2race.testing.kio.testComprehension
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.jooq.Jooq
import de.lambda9.tailwind.jooq.JooqQueryPrinter
import io.ktor.serialization.*
import io.ktor.server.application.Application
import io.ktor.server.testing.*
import org.flywaydb.core.Flyway
import org.jooq.ConnectionProvider
import org.jooq.SQLDialect
import org.jooq.impl.DSL
import org.jooq.impl.DataSourceConnectionProvider
import org.jooq.impl.DefaultConfiguration
import org.testcontainers.containers.PostgreSQLContainer
import java.net.ServerSocket
import java.sql.Connection
import java.sql.DriverManager
import java.util.*
import kotlin.test.fail

/**
 * Use this function to unit test against the database, e.g. testing services and repos.
 */
fun testComprehension(block: TestComprehensionScope<JEnv>.() -> Unit) =
    TestRunner.runComprehension(block)

/**
 * Use this function to test end to end behaviour, when you also need access to the database.
 * This test function is pretty slow and should only be used for integration tests, because it has to reset the database.
 *
 * For unit testing just against the database without end to end behaviour, use [testComprehension].
 * For integration testing without needed access to the database inside the test to verify effects, use [testApplication].
 */
fun testApplicationComprehension(block: suspend TestApplicationComprehensionScope<JEnv>.() -> Unit) =
    TestRunner.runApplication(block)

/**
 * Für Nebenläufigkeitstests: jede `.transact()` holt sich eine EIGENE Verbindung aus dem Pool und
 * committet wirklich. So lassen sich zwei echte, gleichzeitig offene Transaktionen gegeneinander
 * laufen lassen (z. B. in zwei Threads), um Sperren und Constraints zu belegen. Weil Daten
 * committet werden, markiert der Lauf die Datenbank als schmutzig (der nächste Test bekommt eine
 * frische Kopie der Template-Datenbank).
 *
 * Alles, was der Test über `!` ausführt, läuft ohne umgebende Transaktion (Autocommit); wer
 * Atomarität braucht, hängt selbst `.transact()` an.
 */
fun testCommittingComprehension(block: CommittingTestScope.() -> Unit) =
    TestRunner.runCommitting(block)

interface CommittingTestScope : TestComprehensionScope<JEnv> {
    val env: JEnv
}

interface TestApplicationExtension {

    fun extendApplication(block: Application.() -> Unit)

}

open class DefaultTestApplicationExtension(val builder: ApplicationTestBuilder) : TestApplicationExtension {
    override fun extendApplication(block: Application.() -> Unit) {
        builder.application { block() }
    }
}

interface TestApplicationComprehensionScope<R> : TestApplicationExtension, TestComprehensionScope<R>, ClientProvider

/** Argon2-Speicher der Test-Konfiguration in KiB (Produktionsvorgabe siehe PasswordUtilities). */
const val TEST_ARGON2_MEMORY_KIB = 64

private object TestRunner {

    /**
     * Wegwerf-Postgres: Daten im RAM, ohne fsync. Für Tests ist Haltbarkeit egal; das beschleunigt
     * DDL (Migration, Template-Kopie) und jeden Commit der App-Tests.
     */
    private val postgres = PostgreSQLContainer("postgres:17")
        .withTmpFs(mapOf("/var/lib/postgresql/data" to "rw"))
        .withCommand("postgres", "-c", "fsync=off", "-c", "synchronous_commit=off", "-c", "full_page_writes=off")

    private const val TEMPLATE_DB = "r2r_template"
    private const val WORK_DB = "r2r_work"
    private val config: Config
    private val connectionProvider: ConnectionProvider
    private val datasource: HikariDataSource

    private var dirty: Boolean

    init {
        // Wie beim echten Start: feste App-Zone vor dem ersten Verbindungsaufbau, damit Tests auf
        // einem Rechner in UTC dasselbe rechnen wie in Berlin.
        de.lambda9.ready2race.backend.AppZone.install(null)
        postgres.start()

        config = Config(
            mode = Config.Mode.TEST,
            http = Config.Http(
                host = "localhost",
                port = -1,
            ),
            database = Config.Database(
                url = urlFor(WORK_DB),
                user = postgres.username,
                password = postgres.password,
                // Jede SQL-Anweisung jedes Tests auf stdout kostet spürbar Zeit; bei Bedarf einschalten.
                logQueries = System.getenv("R2R_TEST_LOG_SQL") == "true",
            ),
            smtp = null,
            security = Config.Security(
                pepper = "pepper",
                // Bewusst klein: die Suite hasht hunderte Male (Admin bei jedem Zurücksetzen,
                // Testkonten). Die echte Vorgabe prüft PasswordUtilitiesTest.
                argon2MemoryKiB = TEST_ARGON2_MEMORY_KIB,
            ),
            admin = Config.Admin(
                email = "admin",
                password = "admin",
            ),
            webDAV = Config.WebDAV(
                urlScheme = "https",
                host = "localhost",
                path = null,
                folderPath = "Ready2Race",
                authUser = "admin",
                authPassword = "admin",
            ),
            mailReceiverWhitelist = null,
            staticFilesPath = "teststatic"
        )

        // Einmal migrieren und initialisieren - in eine Template-Datenbank. Jedes Zurücksetzen kopiert
        // sie danach per `create database ... template` (Bruchteile einer Sekunde) statt
        // flyway.clean() + migrate() + initializeDatabase (mehrere Sekunden je App-Test).
        createTemplate()
        recreateWorkDatabase()

        datasource = HikariDataSource(HikariConfig().apply {
            jdbcUrl = urlFor(WORK_DB)
            driverClassName = "org.postgresql.Driver"
            username = postgres.username
            password = postgres.password
            schema = "ready2race"
        })

        connectionProvider = DataSourceConnectionProvider(datasource)

        dirty = false
    }

    fun runComprehension(block: TestComprehensionScope<JEnv>.() -> Unit) {

        cleanDatabase()

        val connection = connectionProvider.acquire()

        if (connection == null) {
            fail("DB connection could not be acquired")
        } else {

            connection.autoCommit = false
            val env = getEnv(connection)

            try {

                KIO.testComprehension(env, block)

            } catch (t: Throwable) {
                throw t
            } finally {
                connection.rollback()
                connection.autoCommit = true
                connectionProvider.release(connection)
            }
        }
    }

    fun runCommitting(block: CommittingTestScope.() -> Unit) {
        cleanDatabase()
        dirty = true
        val env = getEnv()
        val scope = object : CommittingTestScope,
            TestComprehensionScope<JEnv> by DefaultTestComprehensionScope(env) {
            override val env: JEnv = env
        }
        block(scope)
    }

    fun runApplication(block: suspend TestApplicationComprehensionScope<JEnv>.() -> Unit) = testApplication {

        cleanDatabase()
        dirty = true

        val env = getEnv()

        application {
            module(env)
        }

        val scope = object : TestApplicationComprehensionScope<JEnv>,
            TestApplicationExtension by DefaultTestApplicationExtension(this),
            TestComprehensionScope<JEnv> by DefaultTestComprehensionScope(env),
            ClientProvider by this {}
        block(scope)

    }

    private fun urlFor(database: String) =
        "jdbc:postgresql://${postgres.host}:${postgres.getMappedPort(PostgreSQLContainer.POSTGRESQL_PORT)}/$database"

    /** Verbindung auf die Verwaltungsdatenbank des Containers (nie auf Template oder Arbeits-DB). */
    private fun <A> admin(block: java.sql.Statement.() -> A): A =
        DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password).use { connection ->
            connection.createStatement().use { it.block() }
        }

    private fun createTemplate() {
        admin { execute("create database $TEMPLATE_DB") }

        Flyway.configure()
            .dataSource(urlFor(TEMPLATE_DB), postgres.username, postgres.password)
            .defaultSchema("ready2race")
            .load()
            .migrate()

        HikariDataSource(HikariConfig().apply {
            jdbcUrl = urlFor(TEMPLATE_DB)
            driverClassName = "org.postgresql.Driver"
            username = postgres.username
            password = postgres.password
            schema = "ready2race"
        }).use { templateSource ->
            initializeDatabase(
                Jooq(
                    dsl = DSL.using(DataSourceConnectionProvider(templateSource), SQLDialect.POSTGRES),
                    env = Env(config),
                )
            )
        }

        // Eine Template-Datenbank lässt sich nur kopieren, solange niemand mit ihr verbunden ist.
        admin {
            execute("select pg_terminate_backend(pid) from pg_stat_activity where datname = '$TEMPLATE_DB' and pid <> pg_backend_pid()")
        }
    }

    private fun recreateWorkDatabase() = admin {
        execute("drop database if exists $WORK_DB with (force)")
        execute("create database $WORK_DB template $TEMPLATE_DB")
    }

    private fun cleanDatabase() {
        if (dirty) {
            // Offene Poolverbindungen zeigen auf die alte Arbeits-DB: vorher abräumen, und danach noch
            // einmal, falls der Pool dazwischen eine neue aufgebaut hat (die `with (force)` beendet).
            datasource.hikariPoolMXBean?.softEvictConnections()
            recreateWorkDatabase()
            datasource.hikariPoolMXBean?.softEvictConnections()
            dirty = false
        }
    }

    private fun getEnv(connection: Connection? = null): JEnv {
        val configuration = DefaultConfiguration().apply {
            set(SQLDialect.POSTGRES)
            if (connection != null) {
                set(connection)
            } else {
                set(connectionProvider)
            }
            if (config.database.logQueries) {
                set(JooqQueryPrinter())
            }
        }
        return Jooq(
            dsl = DSL.using(configuration),
            env = Env(config),
        )
    }
}