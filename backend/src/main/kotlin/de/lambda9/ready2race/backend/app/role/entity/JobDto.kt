package de.lambda9.ready2race.backend.app.role.entity

import de.lambda9.ready2race.backend.app.auth.entity.PrivilegeDto

/**
 * Ein Job, wie ihn die Oberfläche zur Auswahl anbietet. Anzeigename und Beschreibung
 * übersetzt das Frontend über den [key]; hier stehen nur Ebene und Privilegien.
 */
data class JobDto(
    val key: String,
    val level: String,
    val privileges: List<PrivilegeDto>,
)
