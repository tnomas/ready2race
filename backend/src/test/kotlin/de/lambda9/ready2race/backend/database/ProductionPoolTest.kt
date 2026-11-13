package de.lambda9.ready2race.backend.database

import com.zaxxer.hikari.HikariDataSource
import de.lambda9.ready2race.backend.app.Env
import de.lambda9.ready2race.backend.config.Config
import de.lambda9.ready2race.backend.database.generated.tables.references.CAPTCHA
import de.lambda9.tailwind.core.KIO.Companion.unsafeRunSync
import de.lambda9.tailwind.core.extensions.exit.fold
import de.lambda9.tailwind.jooq.Jooq
import org.testcontainers.containers.PostgreSQLContainer
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.fail

/**
 * Der Pool, wie ihn der echte Start baut (Env.create + migrateDatabase) - der Test-Runner baut
 * seinen eigenen und sieht diese Einstellungen nicht. Eigener Container, weil der Start gegen eine
 * leere Datenbank migrieren soll.
 */
class ProductionPoolTest {

    private val postgres = PostgreSQLContainer("postgres:17")

    @BeforeTest
    fun start() = postgres.start()

    @AfterTest
    fun stop() = postgres.stop()

    private fun config(
        mode: Config.Mode = Config.Mode.PROD,
        poolSize: Int = Config.Database.DEFAULT_POOL_SIZE,
        statementTimeoutMs: Long = Config.Database.DEFAULT_STATEMENT_TIMEOUT_MS,
        logQueries: Boolean = false,
    ) = Config(
        mode = mode,
        http = Config.Http(host = "localhost", port = -1),
        database = Config.Database(
            url = postgres.jdbcUrl,
            user = postgres.username,
            password = postgres.password,
            logQueries = logQueries,
            poolSize = poolSize,
            statementTimeoutMs = statementTimeoutMs,
        ),
        smtp = null,
        mailReceiverWhitelist = null,
        security = Config.Security(pepper = "pepper"),
        admin = Config.Admin(email = "admin", password = "admin"),
        staticFilesPath = "teststatic",
        webDAV = null,
    )

    @Test
    fun `Vorgaben ohne neue Schluessel - Pool 10, Timeout 2 min, Migration laeuft`() {
        val config = config()
        migrateDatabase(config)
        val (env, ds) = Env.create(config)
        try {
            assertEquals(10, (ds as HikariDataSource).maximumPoolSize)
            assertEquals(0L, ds.leakDetectionThreshold, "in PROD keine Leck-Warnungen")
            val timeout = Jooq.query { fetchValue("show statement_timeout") as String }.unsafeRunSync(env)
                .fold(onSuccess = { it }, onError = { fail("$it") }, onDefect = { throw it })
            assertEquals("2min", timeout)
            // Die migrierte Datenbank ist erreichbar und im Schema ready2race.
            val captchas = Jooq.query { fetchCount(CAPTCHA) }.unsafeRunSync(env)
                .fold(onSuccess = { it }, onError = { fail("$it") }, onDefect = { throw it })
            assertEquals(0, captchas)
        } finally {
            (ds as HikariDataSource).close()
        }
    }

    @Test
    fun `Anweisung ueber dem Timeout wird abgebrochen`() {
        val config = config(statementTimeoutMs = 200, poolSize = 3, mode = Config.Mode.STAGING)
        val (env, ds) = Env.create(config)
        try {
            assertEquals(3, (ds as HikariDataSource).maximumPoolSize)
            assertTrue(ds.leakDetectionThreshold > 0, "außerhalb PROD mit Leck-Erkennung")
            Jooq.query { execute("select pg_sleep(2)") }.unsafeRunSync(env).fold(
                onSuccess = { fail("pg_sleep(2) lief trotz 200 ms Timeout durch") },
                onError = { assertTrue("statement timeout" in it.message.orEmpty(), it.message) },
                onDefect = { assertTrue("statement timeout" in it.message.orEmpty(), it.message) },
            )
        } finally {
            (ds as HikariDataSource).close()
        }
    }

    @Test
    fun `Schutz vor delete ohne where bleibt auch mit Abfrage-Log aktiv`() {
        val config = config(logQueries = true)
        migrateDatabase(config)
        val (env, ds) = Env.create(config)
        try {
            Jooq.query { deleteFrom(CAPTCHA).execute() }.unsafeRunSync(env).fold(
                onSuccess = { fail("delete ohne where wurde ausgeführt") },
                onError = { },
                onDefect = { },
            )
        } finally {
            (ds as HikariDataSource).close()
        }
    }
}
