package de.lambda9.ready2race.backend.app.timing.entity

/**
 * [START], [SPLIT] und [FINISH] erfassen Zeitmarken. [ANZEIGE] ist ein rein lesender
 * Bildschirm-Posten (Startschiedsrichter-/Athleten-Anzeige): er spiegelt über `linked_station`
 * einen START-Posten (oder ohne Verknüpfung alle Startsequenzen der Veranstaltung), erfasst aber
 * nie selbst - Marken auf ANZEIGE weist der Service ab, und Geräte-Tokens von ANZEIGE-Posten
 * dürfen ausschließlich Lesewege.
 */
enum class TimingStationType { START, SPLIT, FINISH, ANZEIGE }
