package de.lambda9.ready2race.backend.calls.requests

import de.lambda9.ready2race.backend.config.Config
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Die Mail-Links bestehen aus `callbackUrl + token`. Ein fremder Host in der `callbackUrl` würde
 * den Token (Passwort-Reset, Einladung, Registrierung, Challenge-Zugang) an Dritte schicken.
 */
class CallbackUrlsTest {

    private val configured = CallbackUrls.parseOrigins("https://regatta.example.org, http://localhost:5123")

    @Test
    fun configuredOriginsAllowAnyPathOnThatOrigin() {
        assertTrue(CallbackUrls.isAllowed("https://regatta.example.org/resetPassword/", Config.Mode.PROD, configured, "evil.example"))
        assertTrue(CallbackUrls.isAllowed("https://Regatta.Example.org:443/basis/challenge/", Config.Mode.PROD, configured, null))
        assertTrue(CallbackUrls.isAllowed("http://localhost:5123/invitation/", Config.Mode.PROD, configured, null))
    }

    @Test
    fun configuredOriginsRejectEverythingElse() {
        val mode = Config.Mode.PROD
        assertFalse(CallbackUrls.isAllowed("https://evil.example/r?t=", mode, configured, "regatta.example.org"))
        assertFalse(CallbackUrls.isAllowed("http://regatta.example.org/resetPassword/", mode, configured, null), "Schema zählt")
        assertFalse(CallbackUrls.isAllowed("https://regatta.example.org:8443/x/", mode, configured, null), "Port zählt")
        assertFalse(CallbackUrls.isAllowed("https://regatta.example.org.evil.example/", mode, configured, null))
        assertFalse(CallbackUrls.isAllowed("https://regatta.example.org@evil.example/", mode, configured, null))
        assertFalse(CallbackUrls.isAllowed("https://user@regatta.example.org/", mode, configured, null))
        assertFalse(CallbackUrls.isAllowed("javascript:alert(1)//", mode, configured, null))
        assertFalse(CallbackUrls.isAllowed("//evil.example/", mode, configured, null))
        assertFalse(CallbackUrls.isAllowed("/relative/", mode, configured, null))
        assertFalse(CallbackUrls.isAllowed("http://localhost:8080/", mode, configured, null))
        assertFalse(CallbackUrls.isAllowed("nicht eine url", mode, configured, null))
    }

    @Test
    fun withoutConfigurationTheRequestHostDecides() {
        assertTrue(CallbackUrls.isAllowed("https://regatta.example.org/resetPassword/", Config.Mode.PROD, null, "regatta.example.org"))
        assertTrue(CallbackUrls.isAllowed("https://regatta.example.org:5123/x/", Config.Mode.PROD, null, "Regatta.example.org"), "Port egal")
        assertFalse(CallbackUrls.isAllowed("https://evil.example/r?t=", Config.Mode.PROD, null, "regatta.example.org"))
        assertFalse(CallbackUrls.isAllowed("http://localhost:5123/", Config.Mode.PROD, null, "regatta.example.org"))
        assertFalse(CallbackUrls.isAllowed("http://localhost:5123/", Config.Mode.STAGING, null, null))
    }

    @Test
    fun withoutConfigurationDevAllowsLoopback() {
        // Vite (5123/51xx) und Backend (8080/81xx) laufen lokal auf verschiedenen Ports.
        assertTrue(CallbackUrls.isAllowed("http://localhost:5140/resetPassword/", Config.Mode.DEV, null, "localhost"))
        assertTrue(CallbackUrls.isAllowed("http://127.0.0.1:5123/x/", Config.Mode.DEV, null, "localhost"))
        assertTrue(CallbackUrls.isAllowed("http://[::1]:5123/x/", Config.Mode.DEV, null, null))
        assertFalse(CallbackUrls.isAllowed("https://evil.example/", Config.Mode.DEV, null, "localhost"))
    }

    @Test
    fun originsAreNormalizedAndValidated() {
        assertEquals(listOf("https://a.example:443", "http://b.example:8090"), CallbackUrls.parseOrigins("https://A.example/,http://b.example:8090"))
        assertFailsWith<IllegalArgumentException> { CallbackUrls.parseOrigins("https://a.example/pfad") }
        assertFailsWith<IllegalArgumentException> { CallbackUrls.parseOrigins("ftp://a.example") }
        assertFailsWith<IllegalArgumentException> { CallbackUrls.parseOrigins("a.example") }
        assertFailsWith<IllegalArgumentException> { CallbackUrls.parseOrigins(" , ") }
    }
}
