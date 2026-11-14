package de.lambda9.ready2race.backend.app.auth.boundary

import de.lambda9.ready2race.backend.afterNow
import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.appuser.control.AppUserRepo
import de.lambda9.ready2race.backend.app.auth.control.*
import de.lambda9.ready2race.backend.app.auth.entity.*
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserWithPrivilegesRecord
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.calls.responses.ApiResponse.Companion.noData
import de.lambda9.ready2race.backend.security.PasswordUtilities
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.onNullFail
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.tailwind.core.extensions.kio.recoverDefault
import kotlin.time.Duration.Companion.hours
import kotlin.time.Duration.Companion.minutes
import de.lambda9.tailwind.core.extensions.kio.traverse

object AuthService {

    private val tokenLifetime = 6.hours

    /** Mindestabstand zwischen zwei Verlängerungen derselben Sitzung. */
    val sessionExtendInterval = 1.minutes

    fun getAllPrivileges(): App<Nothing, ApiResponse.Dto<List<PrivilegeDto>>> = KIO.comprehension {
        val records = !PrivilegeRepo.all().orDie()
        records.traverse { it.toPrivilegeDto() }.map {
            ApiResponse.Dto(
                it
            )
        }
    }

    /** Ergebnis der Passwortprüfung: der Nutzer und, falls fällig, sein neu berechneter Hash. */
    data class VerifiedLogin(
        val user: AppUserWithPrivilegesRecord,
        /** Hash mit den aktuellen Parametern, wenn der gespeicherte aus einem älteren Stand ist. */
        val rehashed: String?,
    )

    /**
     * Login in einem Zug - für Aufrufer ohne eigene Transaktionssteuerung (Tests). Die Routen
     * rufen [verifyCredentials] außerhalb und [startSession] innerhalb der Transaktion auf.
     */
    fun login(
        request: LoginRequest,
        onSuccess: (String) -> Unit,
    ): App<AuthError, ApiResponse.Dto<LoginDto>> = KIO.comprehension {
        val verified = !verifyCredentials(request)
        startSession(verified, onSuccess)
    }

    /**
     * Schritt 1 des Logins: Nutzer lesen und Passwort prüfen. Läuft in den Routen AUSSERHALB der
     * Anfrage-Transaktion - jede Leseabfrage gibt ihre Poolverbindung sofort zurück, während
     * Argon2 (rund 55 ms, 19 MiB) rechnet. Vorher hielt jeder Login dabei eine der Verbindungen,
     * und eine Welle falscher Logins ließ Boards und Zeitnahme auf den Pool warten.
     *
     * Bei unbekannter E-Mail wird gegen einen Platzhalter-Hash gerechnet: Beide Fehlschläge
     * dauern gleich lang und antworten gleich ([AuthError.CredentialsIncorrect]).
     *
     * Ein veralteter Hash wird hier schon neu berechnet (der Klartext liegt nur jetzt vor),
     * geschrieben wird er erst in [startSession].
     */
    fun verifyCredentials(
        request: LoginRequest,
    ): App<AuthError, VerifiedLogin> = KIO.comprehension {
        val user = !AppUserRepo.getWithPrivilegesByEmail(request.email).orDie()
        if (user == null) {
            !PasswordUtilities.checkAgainstDummy(request.password)
            return@comprehension KIO.fail(AuthError.CredentialsIncorrect)
        }

        val credentialsOk = !PasswordUtilities.check(request.password, user.password!!)
        val outdated = !PasswordUtilities.needsRehash(user.password!!)
        if (!credentialsOk) {
            // Ein Hash aus einem älteren, billigeren Parameterstand ist in rund einer Millisekunde
            // geprüft - schneller als der Platzhalter einer unbekannten E-Mail. Ohne den Ausgleich
            // verriete die Antwortzeit nun umgekehrt, dass es das Konto gibt.
            if (outdated) {
                !PasswordUtilities.checkAgainstDummy(request.password)
            }
            return@comprehension KIO.fail(AuthError.CredentialsIncorrect)
        }

        // Hashes aus einem älteren Parameterstand (bis 11/2026: 15 KiB Speicher) beim Login mit
        // dem gerade geprüften Klartext neu berechnen. Anders kommt man an den Klartext nicht heran.
        val rehashed = if (outdated) !PasswordUtilities.hash(request.password) else null

        KIO.ok(VerifiedLogin(user, rehashed))
    }

    /**
     * Schritt 2 des Logins, in der Transaktion: neu berechneten Hash schreiben und Sitzung
     * anlegen. Der Hash wird nur ersetzt, wenn der gespeicherte noch derselbe ist wie bei der
     * Prüfung - hat jemand das Passwort dazwischen geändert, bleibt das neue stehen.
     */
    fun startSession(
        verified: VerifiedLogin,
        onSuccess: (String) -> Unit,
    ): App<AuthError, ApiResponse.Dto<LoginDto>> = KIO.comprehension {
        val user = verified.user
        if (verified.rehashed != null) {
            !AppUserRepo.replacePasswordIfUnchanged(user.id!!, user.password!!, verified.rehashed).orDie()
        }

        val record = !user.toSession(tokenLifetime)
        val token = !AppUserSessionRepo.create(record).orDie()
        onSuccess(token)

        user.loginDto().map {
            ApiResponse.Dto(it)
        }
    }

    fun checkLogin(
        token: String?,
    ): App<Nothing, ApiResponse> = KIO.comprehension {

        val user = !useSessionToken(token).recoverDefault { null }

        user?.loginDto()?.map { ApiResponse.Dto(it) } ?: noData
    }

    fun logout(
        token: String?,
        onSuccess: () -> Unit,
    ): App<Nothing, ApiResponse.NoData> = KIO.comprehension {

        !AppUserSessionRepo.delete(token).orDie()
        onSuccess()

        noData
    }

    fun useSessionToken(
        token: String?
    ): App<AuthError, AppUserWithPrivilegesRecord> = KIO.comprehension {

        if (token == null) {
            return@comprehension KIO.fail(AuthError.TokenInvalid)
        }

        val valid = !AppUserSessionRepo.getValid(token).orDie().onNullFail { AuthError.TokenInvalid }

        // Gleitendes Fenster, aber nicht bei jeder Anfrage geschrieben: Boards, Dashboards und
        // Zeitnahme pollen im Sekundentakt. Verlängert wird erst, wenn der letzte Stempel älter als
        // [sessionExtendInterval] ist; eine Sitzung endet so höchstens so viel früher als 6 h nach
        // der letzten Anfrage.
        val newExpiry = tokenLifetime.afterNow()
        if (valid.expiresAt!!.isBefore(newExpiry.minusSeconds(sessionExtendInterval.inWholeSeconds))) {
            !AppUserSessionRepo.extend(token, newExpiry).orDie()
        }

        AppUserRepo.getWithPrivileges(valid.appUser).orDie().onNullFail { AuthError.TokenInvalid }
    }

    fun deleteExpiredTokens(): App<Nothing, Int> =
        AppUserSessionRepo.deleteExpired().orDie()
}