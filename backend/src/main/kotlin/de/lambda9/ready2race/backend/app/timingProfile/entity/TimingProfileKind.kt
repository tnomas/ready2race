package de.lambda9.ready2race.backend.app.timingProfile.entity

/**
 * Welche Art von Zeitnahmeprofil eine Veranstaltung benutzt. Nicht frei wählbar: [RACE] gilt bei
 * `event.timing_system = RACECLOCKER`, [MODE] bei `INTERN`. Bei `WEBSCORER` und ohne gesetztes
 * System gibt es kein Profil — dann ist die Art `null` und der Baum bleibt leer.
 */
enum class TimingProfileKind { RACE, MODE }
