package de.lambda9.ready2race.backend.app.role.entity

import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.auth.entity.Privilege.*
import de.lambda9.ready2race.backend.database.*
import java.util.UUID

/**
 * Ein Job ist eine im Code definierte Rolle: Schlüssel, feste Rollen-ID, Ebene und Privilegien.
 * Beim Start werden Jobs als statische Rollen gesät und synchronisiert; eigene Rollen entstehen
 * als Kopie eines Jobs und tragen dessen Schlüssel.
 *
 * Die Privilegien sind der Stand vor dem Ressourcen-Schnitt (Schritt 2 des Rechtekonzepts):
 * Bis dahin tragen operative Jobs die heutigen breiten Rechte, damit sie ab sofort vergeben
 * und nachgetragen werden können. Anzeigename und Beschreibung übersetzt das Frontend über
 * `job.<key>.name` und `job.<key>.description`; `defaultName` ist nur der Datenbankname.
 */
sealed class Job(
    val key: String,
    val roleId: UUID,
    val level: RoleLevel,
    val defaultName: String,
    val privileges: List<Privilege>,
) {

    data object Superadmin : Job(
        "SUPERADMIN", SUPERADMIN_ROLE, RoleLevel.GLOBAL, "Superadmin",
        Privilege.entries,
    )

    data object Admin : Job(
        "ADMIN", ADMIN_ROLE, RoleLevel.GLOBAL, "Admin",
        Privilege.entries - UpdateSystemGlobal,
    )

    data object User : Job(
        "USER", USER_ROLE, RoleLevel.SELF, "User",
        listOf(ReadUserOwn, UpdateUserOwn),
    )

    data object ClubRepresentative : Job(
        "CLUB_REPRESENTATIVE", CLUB_REPRESENTATIVE_ROLE, RoleLevel.CLUB, "Club representative",
        listOf(
            ReadClubOwn, UpdateClubOwn,
            ReadEventOwn,
            ReadRegistrationOwn, CreateRegistrationOwn, UpdateRegistrationOwn,
            ReadInvoiceOwn,
            UpdateResultOwn, ReadResultOwn,
        ),
    )

    /**
     * Trägt STAFF schon jetzt; nutzbar wird es mit dem Team-Reiter der Veranstaltung in
     * Schritt 3 - die Nutzerseite verlangt zusätzlich UPDATE USER.
     */
    data object CompetitionManagement : Job(
        "COMPETITION_MANAGEMENT", COMPETITION_MANAGEMENT_ROLE, RoleLevel.GLOBAL, "Competition management",
        listOf(
            CreateEventGlobal, ReadEventGlobal, UpdateEventGlobal, DeleteEventGlobal,
            ReadRegistrationGlobal, UpdateRegistrationGlobal,
            CreateSubstitutionGlobal, DeleteSubstitutionGlobal,
            ReadInvoiceGlobal,
            ReadClubGlobal,
            ReadResultGlobal, UpdateResultGlobal,
            ReadLiveDashboardGlobal, UpdateLiveDashboardGlobal,
            ReadBoardGlobal, UpdateBoardGlobal,
            ReadStreamGlobal, UpdateStreamGlobal,
            UpdateAppTimingGlobal, UpdateAppEventRequirementGlobal, UpdateAppQrManagementGlobal,
            UpdateAppCompetitionCheckGlobal, UpdateAppCatererGlobal,
            ReadUserGlobal,
            ReadStaffGlobal, UpdateStaffGlobal,
            ReadRoleGlobal,
        ),
    )

    data object RegistrationOffice : Job(
        "REGISTRATION_OFFICE", REGISTRATION_OFFICE_ROLE, RoleLevel.GLOBAL, "Registration office",
        listOf(
            ReadEventGlobal,
            ReadRegistrationGlobal, UpdateRegistrationGlobal,
            CreateSubstitutionGlobal, DeleteSubstitutionGlobal,
            ReadClubGlobal,
        ),
    )

    data object Finance : Job(
        "FINANCE", FINANCE_ROLE, RoleLevel.GLOBAL, "Finance",
        listOf(
            ReadEventGlobal,
            CreateInvoiceGlobal, ReadInvoiceGlobal, UpdateInvoiceGlobal,
            ReadRegistrationGlobal,
            ReadClubGlobal,
        ),
    )

    data object Judge : Job(
        "JUDGE", JUDGE_ROLE, RoleLevel.EVENT, "Judge",
        listOf(ReadEventGlobal, ReadLiveDashboardGlobal, UpdateLiveDashboardGlobal, ReadResultGlobal),
    )

    data object Timekeeper : Job(
        "TIMEKEEPER", TIMEKEEPER_ROLE, RoleLevel.EVENT, "Timekeeper",
        listOf(ReadEventGlobal, UpdateAppTimingGlobal),
    )

    data object Announcer : Job(
        "ANNOUNCER", ANNOUNCER_ROLE, RoleLevel.EVENT, "Announcer",
        listOf(ReadEventGlobal, ReadBoardGlobal, UpdateBoardGlobal, ReadResultGlobal),
    )

    data object StreamDirector : Job(
        "STREAM_DIRECTOR", STREAM_DIRECTOR_ROLE, RoleLevel.EVENT, "Stream director",
        listOf(ReadEventGlobal, ReadStreamGlobal, UpdateStreamGlobal, ReadResultGlobal),
    )

    data object HelperRequirements : Job(
        "HELPER_REQUIREMENTS", HELPER_REQUIREMENTS_ROLE, RoleLevel.EVENT, "Helper: requirements",
        listOf(UpdateAppEventRequirementGlobal),
    )

    data object HelperAccessPass : Job(
        "HELPER_ACCESS_PASS", HELPER_ACCESS_PASS_ROLE, RoleLevel.EVENT, "Helper: access passes",
        listOf(UpdateAppQrManagementGlobal),
    )

    data object HelperCheckIn : Job(
        "HELPER_CHECK_IN", HELPER_CHECK_IN_ROLE, RoleLevel.EVENT, "Helper: check-in",
        listOf(UpdateAppCompetitionCheckGlobal),
    )

    data object HelperCatering : Job(
        "HELPER_CATERING", HELPER_CATERING_ROLE, RoleLevel.EVENT, "Helper: catering",
        listOf(UpdateAppCatererGlobal),
    )

    companion object {
        /** Über Reflexion ermittelt, deshalb einmalig: [byKey] liegt auf dem Anfrageweg. */
        val entries: List<Job> by lazy { Job::class.sealedSubclasses.map { it.objectInstance!! } }
        fun byKey(key: String): Job? = entries.firstOrNull { it.key == key }
    }
}
