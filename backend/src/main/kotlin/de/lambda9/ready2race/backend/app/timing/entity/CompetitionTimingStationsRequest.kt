package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.backend.validation.validate
import de.lambda9.ready2race.backend.validation.validators.IntValidators.notNegative
import de.lambda9.ready2race.backend.validation.validators.Validator.Companion.collection
import java.util.UUID

/** Ein Posten dieses Wettkampfs mit seinem Meter; 0 ist der Start und damit erlaubt. */
data class CompetitionTimingStationEntry(
    val timingStation: UUID,
    val distanceMeters: Int,
) : Validatable {
    override fun validate(): ValidationResult = this::distanceMeters validate notNegative
}

/**
 * Die VOLLSTÄNDIGE Liste der Posten dieses Wettkampfs — was hier fehlt, wird gelöscht. Die
 * Oberfläche denkt in Listen (Kontrollkästchen und Meter-Felder, ein Speichern-Knopf), nicht in
 * einzelnen Zeilen; eine leere Liste räumt den Wettkampf ab.
 *
 * Dass derselbe Posten nur einmal vorkommt, prüft der Dienst und nicht die Validierung: Der
 * Doppeleintrag ist ein fachlicher Fehler mit eigener Antwort
 * ([CompetitionTimingStationError.DuplicateStation]). Ohne diese Ablehnung käme er sogar durch —
 * das Schreiben setzt je Posten ein `on conflict do update`, der zweite Meter überschriebe also
 * still den ersten und die Liste hätte eine Bedeutung, die niemand so gemeint hat.
 */
data class CompetitionTimingStationsRequest(
    val stations: List<CompetitionTimingStationEntry>,
) : Validatable {
    override fun validate(): ValidationResult = this::stations validate collection

    companion object {
        val example get() = CompetitionTimingStationsRequest(
            stations = listOf(
                CompetitionTimingStationEntry(
                    timingStation = UUID.fromString("00000000-0000-0000-0000-000000000000"),
                    distanceMeters = 0,
                ),
            ),
        )
    }
}
