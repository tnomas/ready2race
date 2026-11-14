package de.lambda9.ready2race.backend.app.material.entity

/**
 * Das wirksame Materialstück eines Lauf-Teams, aus der Sicht `effective_material_for_match_team`
 * (Task 6.1): eine Ausnahme je Lauf schlägt die Grundzuteilung für den ganzen Wettkampf. Nur
 * bestätigte Anfragen der Kategorie [MaterialCategory.BOAT] erreichen diese Anzeigen - OTHER
 * (Riemen, Steuerausrüstung, ...) bleibt "Mein Event" und dem Anbieter-Dashboard vorbehalten.
 */
data class MaterialForTeamDto(
    /** Die Nummer am Rumpf - null, wenn der Anbieter dem Stück keine gepflegt hat. */
    val number: Int?,
    val label: String,
    val category: MaterialCategory,
    /**
     * true, wenn [number] fehlt oder von der Startnummer des Teams in DIESEM Lauf
     * (`competition_match_team.start_number`) abweicht - derselben Zahl, die die Anzeige neben
     * dem Boot zeigt ("#3 · Boot 7").
     */
    val deviatesFromStartNumber: Boolean,
)
