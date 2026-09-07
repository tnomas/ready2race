package de.lambda9.ready2race.backend.database

import java.util.UUID

// users
val SYSTEM_USER = UUID.fromString("00000000-0000-0000-0000-000000000000")!!

// roles
val ADMIN_ROLE = UUID.fromString("00000000-0000-0000-0000-000000000000")!!
val USER_ROLE = UUID.fromString("00000000-0000-0000-0000-000000000001")!!
val CLUB_REPRESENTATIVE_ROLE = UUID.fromString("00000000-0000-0000-0000-000000000002")!!

// Nicht in deleteExceptSystem() aufnehmen: die Rolle soll über die Nutzerverwaltung
// zuweisbar und entfernbar bleiben (siehe initializeDatabase.kt, persistRole static = false).
val MATERIAL_PROVIDER_ROLE = UUID.fromString("00000000-0000-0000-0000-000000000003")!!

// Remember to exclude system roles in deleteExceptSystem()