package de.lambda9.ready2race.backend.database

import java.util.UUID

// users
val SYSTEM_USER = UUID.fromString("00000000-0000-0000-0000-000000000000")!!

// roles
val ADMIN_ROLE = UUID.fromString("00000000-0000-0000-0000-000000000000")!!
val USER_ROLE = UUID.fromString("00000000-0000-0000-0000-000000000001")!!
val CLUB_REPRESENTATIVE_ROLE = UUID.fromString("00000000-0000-0000-0000-000000000002")!!
val SUPERADMIN_ROLE = UUID.fromString("00000000-0000-0000-0000-000000000003")!!

// Jobs der Ebene Veranstalter (bis zum Mandanten-Umbau GLOBAL)
val COMPETITION_MANAGEMENT_ROLE = UUID.fromString("00000000-0000-0000-0000-000000000010")!!
val REGISTRATION_OFFICE_ROLE = UUID.fromString("00000000-0000-0000-0000-000000000011")!!
val FINANCE_ROLE = UUID.fromString("00000000-0000-0000-0000-000000000012")!!

// Jobs der Ebene Veranstaltung (Scope EVENT kommt in Schritt 3, bis dahin GLOBAL)
val JUDGE_ROLE = UUID.fromString("00000000-0000-0000-0000-000000000020")!!
val TIMEKEEPER_ROLE = UUID.fromString("00000000-0000-0000-0000-000000000021")!!
val ANNOUNCER_ROLE = UUID.fromString("00000000-0000-0000-0000-000000000022")!!
val STREAM_DIRECTOR_ROLE = UUID.fromString("00000000-0000-0000-0000-000000000023")!!
val HELPER_REQUIREMENTS_ROLE = UUID.fromString("00000000-0000-0000-0000-000000000030")!!
val HELPER_ACCESS_PASS_ROLE = UUID.fromString("00000000-0000-0000-0000-000000000031")!!
val HELPER_CHECK_IN_ROLE = UUID.fromString("00000000-0000-0000-0000-000000000032")!!
val HELPER_CATERING_ROLE = UUID.fromString("00000000-0000-0000-0000-000000000033")!!

// Systemverwaltete Rolle der Materialvermietung: folgt allein der Anbieter-Zuordnung
// (`app_user.material_provider`, AppUserService.setMaterialProvider). Bewusst außerhalb der
// belegten Bereiche 0000-0003 und 0010-0033 - die frühere Kennung …0003 war die Superadmin-Rolle.
val MATERIAL_PROVIDER_ROLE = UUID.fromString("00000000-0000-0000-0000-000000000040")!!

// Rollen, die andere Abläufe verwalten und die die Rollenverwaltung weder vergibt noch entzieht:
// jedes Konto trägt USER, die Vereinsfreigabe vergibt CLUB_REPRESENTATIVE, die Anbieter-Zuordnung
// MATERIAL_PROVIDER. Siehe AppUserHasRoleRepo.deleteManaged und AppUserService.update.
val ROLES_MANAGED_ELSEWHERE = setOf(USER_ROLE, CLUB_REPRESENTATIVE_ROLE, MATERIAL_PROVIDER_ROLE)
