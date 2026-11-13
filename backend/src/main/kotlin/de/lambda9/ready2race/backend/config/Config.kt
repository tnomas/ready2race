package de.lambda9.ready2race.backend.config

import com.fasterxml.jackson.module.kotlin.readValue
import de.lambda9.ready2race.backend.applyNotNull
import de.lambda9.ready2race.backend.calls.serialization.jsonMapper
import de.lambda9.ready2race.backend.parsing.Parser
import de.lambda9.ready2race.backend.parsing.Parser.Companion.boolean
import de.lambda9.ready2race.backend.parsing.Parser.Companion.enum
import de.lambda9.ready2race.backend.parsing.Parser.Companion.int
import de.lambda9.ready2race.backend.parsing.Parser.Companion.json
import de.lambda9.ready2race.backend.parsing.Parser.Companion.jsonEscaped
import de.lambda9.tailwind.core.Cause
import de.lambda9.tailwind.core.IO
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.KIO.Companion.unsafeRunSync
import de.lambda9.tailwind.core.extensions.exit.getOrElse
import de.lambda9.tailwind.core.extensions.exit.getOrThrow
import de.lambda9.tailwind.core.extensions.kio.andThenNotNull
import de.lambda9.tailwind.core.extensions.kio.mapNotNull
import de.lambda9.tailwind.core.extensions.kio.onNullFail
import de.lambda9.tailwind.core.extensions.kio.recover
import de.lambda9.ready2race.backend.calls.requests.CallbackUrls
import de.lambda9.ready2race.backend.security.PasswordUtilities
import io.github.cdimascio.dotenv.Dotenv
import io.github.oshai.kotlinlogging.KotlinLogging
import org.simplejavamail.api.mailer.Mailer
import org.simplejavamail.api.mailer.config.TransportStrategy
import org.simplejavamail.mailer.MailerBuilder
import java.time.ZoneId

private val logger = KotlinLogging.logger {}

data class Config(
    val mode: Mode,
    val http: Http,
    val database: Database,
    val smtp: Smtp?,
    val mailReceiverWhitelist: List<Regex>?,
    val security: Security,
    val admin: Admin,
    val staticFilesPath: String,
    val webDAV: WebDAV?,
    /**
     * Normalisierte Origins (`schema://host:port`), auf die Links in Mails zeigen dürfen
     * (`FRONTEND_ORIGINS`). `null` heißt: nicht gesetzt, Rückfallregel in
     * [de.lambda9.ready2race.backend.calls.requests.CallbackUrls].
     */
    val frontendOrigins: List<String>? = null,
    /**
     * Zeitzone der App (`APP_TIMEZONE`, z. B. `Europe/Berlin`). `null` heißt: nicht gesetzt,
     * dann gilt [de.lambda9.ready2race.backend.AppZone.DEFAULT_ID] - ausdrücklich NICHT die Zone
     * des Hosts.
     */
    val timezone: ZoneId? = null,
    /**
     * Anzahl vertrauenswürdiger Reverse-Proxys vor dem Backend (`TRUSTED_PROXY_HOPS`). `0` heißt:
     * `X-Forwarded-For` wird ignoriert. Siehe [de.lambda9.ready2race.backend.plugins.clientAddress].
     */
    val trustedProxyHops: Int = 0,
) {

    enum class Mode {
        /**
         * A mode for local development.
         */
        DEV,

        /**
         * A mode for a test server deployment
         */
        STAGING,

        /**
         * A mode for a production server deployment
         */
        PROD,

        /**
         * A mode, when tests run.
         */
        TEST;

        /**
         * Entwicklerwerkzeuge wie die Mailansicht `/api/dev/emails` geben Reset- und Einladungslinks
         * ohne Anmeldung heraus. Sie gibt es deshalb nur lokal, nie auf einem erreichbaren Server
         * (auch nicht STAGING).
         */
        val devRoutesEnabled: Boolean get() = this == DEV

        /** Stacktraces in 500er-Antworten nur dort, wo kein Fremder mitliest. */
        val exposesDefectDetails: Boolean get() = this == DEV || this == TEST
    }

    data class Http(
        val host: String,
        val port: Int,
    )

    data class Database(
        val url: String,
        val user: String,
        val password: String,
        val logQueries: Boolean,
        /** Größe des Verbindungspools (`DATABASE_POOL_SIZE`). */
        val poolSize: Int = DEFAULT_POOL_SIZE,
        /**
         * Obergrenze je SQL-Anweisung in Millisekunden (`DATABASE_STATEMENT_TIMEOUT_MS`), `0` = ohne
         * Grenze. Gilt nicht für Flyway-Migrationen beim Start.
         */
        val statementTimeoutMs: Long = DEFAULT_STATEMENT_TIMEOUT_MS,
    ) {
        companion object {
            const val DEFAULT_POOL_SIZE = 10
            const val DEFAULT_STATEMENT_TIMEOUT_MS = 120_000L
        }
    }

    data class Smtp(
        val host: String,
        val port: Int,
        val user: String,
        val password: String,
        val strategy: TransportStrategy,
        val from: From,
        val replyTo: String?,
        val localhost: String?,
    ) {
        data class From(
            val name: String?,
            val address: String,
        )

        fun createMailer(): Mailer = MailerBuilder
            .withSMTPServerHost(host)
            .withSMTPServerPort(port)
            .withSMTPServerUsername(user)
            .withSMTPServerPassword(password)
            .withTransportStrategy(strategy)
            .applyNotNull(localhost) {
                withProperties(mapOf("mail.smtp.localhost" to it))
            }
            .withProperties(mapOf("mail.mime.allowutf8" to "true"))
            .buildMailer()
    }

    data class Security(
        val pepper: String,
        /**
         * Speicherbedarf neuer Argon2id-Hashes in KiB (`SECURITY_ARGON2_MEMORY_KIB`). Ältere Hashes
         * werden mit ihren eigenen Parametern geprüft und beim nächsten Login neu berechnet.
         */
        val argon2MemoryKiB: Int = PasswordUtilities.DEFAULT_ARGON2_MEMORY_KIB,
        /**
         * Höchstzahl gleichzeitiger Argon2-Rechnungen (Login, Passwort setzen). Vorgabe: Kernzahl.
         * Jede Rechnung belegt [argon2MemoryKiB] Heap.
         */
        val argon2MaxConcurrent: Int = PasswordUtilities.defaultArgon2MaxConcurrent(),
    )

    data class Admin(
        val email: String,
        val password: String,
    )

    data class WebDAV(
        val urlScheme: String,
        val host: String,
        val path: String?,
        val folderPath: String?,
        val authUser: String,
        val authPassword: String,
        val layout: Layout = Layout.NEXTCLOUD,
    ) {

        /**
         * Wo ein Server die Dateien eines Nutzers ablegt. Das unterscheidet sich zwischen den
         * Anbietern und lässt sich nicht aus Host oder Pfad ableiten.
         */
        enum class Layout {

            /**
             * Nextcloud und ownCloud: die Dateien liegen unter `remote.php/dav/files/<user>`.
             */
            NEXTCLOUD,

            /**
             * Der Freigabepfad ist zugleich die Wurzel — so arbeiten pCloud und die meisten
             * schlichten WebDAV-Server.
             */
            PLAIN,
        }
    }

    companion object {

        private inline fun <reified T : Any> Dotenv.optional(key: String, parser: Parser<T>): IO<ParseEnvError, T?> =
            KIO.ok(get(key)).andThenNotNull { value ->
                parser(value) { task ->
                    task.mapError { ParseEnvError.UnparsableValue(key, value, T::class) }
                }
            }

        private fun Dotenv.optional(key: String): IO<ParseEnvError, String?> =
            optional(key) { it }

        private inline fun <reified T : Any> Dotenv.required(key: String, parser: Parser<T>): IO<ParseEnvError, T> =
            optional(key, parser).onNullFail { ParseEnvError.MissingKey(key) }

        private fun Dotenv.required(key: String): IO<ParseEnvError, String> =
            required(key) { it }

        fun Dotenv.parseConfig(): Config = KIO.comprehension {

            val mode = !required("MODE", enum<Mode>())

            val http = run {
                val host = !required("HTTP_HOST")
                val port = !required("HTTP_PORT", int)

                Http(host = host, port = port)
            }

            val database = run {
                val url = !required("DATABASE_URL")
                val user = !required("DATABASE_USER")
                val password = !required("DATABASE_PASSWORD")
                val logQueries = !optional("DATABASE_LOG_QUERIES", boolean) ?: false
                val poolSize = !optional("DATABASE_POOL_SIZE", int) ?: Database.DEFAULT_POOL_SIZE
                val statementTimeoutMs = (!optional("DATABASE_STATEMENT_TIMEOUT_MS", int))?.toLong()
                    ?: Database.DEFAULT_STATEMENT_TIMEOUT_MS

                if (poolSize < 1) {
                    !KIO.fail(ParseEnvError.UnparsableValue("DATABASE_POOL_SIZE", poolSize.toString(), Int::class))
                }
                if (statementTimeoutMs < 0) {
                    !KIO.fail(ParseEnvError.UnparsableValue("DATABASE_STATEMENT_TIMEOUT_MS", statementTimeoutMs.toString(), Int::class))
                }

                Database(
                    url = url,
                    user = user,
                    password = password,
                    logQueries = logQueries,
                    poolSize = poolSize,
                    statementTimeoutMs = statementTimeoutMs,
                )
            }

            val smtp = run {
                val host = !required("SMTP_HOST")
                val port = !required("SMTP_PORT", int)
                val user = !required("SMTP_USER")
                val password = !required("SMTP_PASSWORD")
                val strategy = !required("SMTP_STRATEGY", enum<TransportStrategy>())
                val name = !optional("SMTP_FROM_NAME")
                val address = !required("SMTP_FROM_ADDRESS")
                val replyTo = !optional("SMTP_REPLY")
                val localhost = !optional("SMTP_LOCALHOST")

                val from = Smtp.From(name = name, address = address)

                Smtp(
                    host = host,
                    port = port,
                    user = user,
                    password = password,
                    strategy = strategy,
                    from = from,
                    replyTo = replyTo,
                    localhost = localhost,
                )
            }

            val receiverWhitelist = run {
                !optional("WHITELIST_EMAIL_RECEIVER", jsonEscaped<List<String>>())
                    .mapNotNull { list ->
                        list.map { it.toRegex() }
                    }
            }

            val security = run {
                val pepper = !required("SECURITY_PEPPER")
                val argon2MemoryKiB = !optional("SECURITY_ARGON2_MEMORY_KIB", int)
                    ?: PasswordUtilities.DEFAULT_ARGON2_MEMORY_KIB

                if (argon2MemoryKiB < PasswordUtilities.MIN_ARGON2_MEMORY_KIB) {
                    !KIO.fail(
                        ParseEnvError.UnparsableValue(
                            "SECURITY_ARGON2_MEMORY_KIB",
                            argon2MemoryKiB.toString(),
                            Int::class
                        )
                    )
                }
                if (argon2MemoryKiB < PasswordUtilities.DEFAULT_ARGON2_MEMORY_KIB && (mode == Mode.PROD || mode == Mode.STAGING)) {
                    logger.warn {
                        "SECURITY_ARGON2_MEMORY_KIB=$argon2MemoryKiB is below the recommended ${PasswordUtilities.DEFAULT_ARGON2_MEMORY_KIB} KiB"
                    }
                }

                val argon2MaxConcurrent = !optional("SECURITY_ARGON2_MAX_CONCURRENT", int)
                    ?: PasswordUtilities.defaultArgon2MaxConcurrent()
                if (argon2MaxConcurrent < 1) {
                    !KIO.fail(
                        ParseEnvError.UnparsableValue(
                            "SECURITY_ARGON2_MAX_CONCURRENT",
                            argon2MaxConcurrent.toString(),
                            Int::class
                        )
                    )
                }

                Security(
                    pepper = pepper,
                    argon2MemoryKiB = argon2MemoryKiB,
                    argon2MaxConcurrent = argon2MaxConcurrent,
                )
            }

            val admin = run {
                val email = !required("ADMIN_EMAIL")
                val password = !required("ADMIN_PASSWORD")

                Admin(email = email, password = password)
            }

            val staticFilesPath = !required("STATIC_FILES_PATH")

            val webDAV = run {
                val urlScheme = !optional("WEBDAV_URL_SCHEME")
                val host = !optional("WEBDAV_HOST")
                val path = !optional("WEBDAV_PATH")
                val folderPath = !optional("WEBDAV_FOLDER_PATH")
                val authUser = !optional("WEBDAV_AUTH_USER")
                val authPassword = !optional("WEBDAV_AUTH_PASSWORD")

                // Bewusst nicht Teil des Pflichtbündels unten: ohne Angabe bleibt es beim bisherigen
                // Nextcloud-Layout, damit bestehende Deployments unverändert weiterlaufen.
                val layout = !optional("WEBDAV_LAYOUT", enum<WebDAV.Layout>())

                if (urlScheme != null && host != null && authUser != null && authPassword != null) {
                    WebDAV(
                        urlScheme = urlScheme,
                        host = host,
                        path = path,
                        folderPath = folderPath,
                        authUser = authUser,
                        authPassword = authPassword,
                        layout = layout ?: WebDAV.Layout.NEXTCLOUD
                    )
                } else if (urlScheme == null && host == null && authUser == null && authPassword == null && path == null && folderPath == null) {
                    null
                } else {
                    !KIO.fail(
                        listOf(
                            "WEBDAV_URL_SCHEME" to urlScheme,
                            "WEBDAV_HOST" to host,
                            "WEBDAV_PATH" to path,
                            "WEBDAV_FOLDER_PATH" to folderPath,
                            "WEBDAV_AUTH_USER" to authUser,
                            "WEBDAV_AUTH_PASSWORD" to authPassword
                        ).partition { it.second != null }
                            .let { (given, missing) ->
                                ParseEnvError.IncompleteBundle(
                                    given = given.map { it.first },
                                    missing = missing.map { it.first }
                                )
                            }
                    )
                }
            }

            val frontendOrigins = !optional("FRONTEND_ORIGINS") { CallbackUrls.parseOrigins(it) }
            // Bewusst nicht `TZ`: Basis-Images setzen das gern auf UTC, und dann folgte die App wieder
            // still der Zone des Containers.
            val timezone = !optional("APP_TIMEZONE") { ZoneId.of(it.trim()) }
            val trustedProxyHops = !optional("TRUSTED_PROXY_HOPS", int) ?: 0
            if (trustedProxyHops < 0) {
                !KIO.fail(ParseEnvError.UnparsableValue("TRUSTED_PROXY_HOPS", trustedProxyHops.toString(), Int::class))
            }

            val config = Config(
                mode = mode,
                http = http,
                database = database,
                smtp = smtp,
                mailReceiverWhitelist = receiverWhitelist,
                security = security,
                admin = admin,
                staticFilesPath = staticFilesPath,
                webDAV = webDAV,
                frontendOrigins = frontendOrigins,
                timezone = timezone,
                trustedProxyHops = trustedProxyHops,
            )

            if (frontendOrigins == null && (mode == Mode.PROD || mode == Mode.STAGING)) {
                logger.warn {
                    "FRONTEND_ORIGINS is not set: links in e-mails are only checked against the request's Host header. " +
                        "Set FRONTEND_ORIGINS to the origin(s) the frontend is served from, e.g. https://regatta.example.org"
                }
            }

            KIO.ok(config)
        }
            .unwrap()
    }

}