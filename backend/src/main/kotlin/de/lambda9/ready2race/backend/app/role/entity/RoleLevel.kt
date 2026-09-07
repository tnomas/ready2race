package de.lambda9.ready2race.backend.app.role.entity

/**
 * Ebene, auf der eine Rolle zugewiesen wird. ORGANIZER ist für den Mandanten-Umbau reserviert
 * und trägt noch keine Rollen.
 */
enum class RoleLevel {
    SELF,
    CLUB,
    EVENT,
    ORGANIZER,
    GLOBAL,
}
