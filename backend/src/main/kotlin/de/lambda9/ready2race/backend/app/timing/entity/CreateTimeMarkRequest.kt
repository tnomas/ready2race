package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.backend.validation.validate
import de.lambda9.ready2race.backend.validation.validators.Validator
import java.util.UUID
import kotlin.math.abs

data class CreateTimeMarkRequest(
    val id: UUID,
    val station: UUID,
    val timestampMillis: Long,
) : Validatable {
    override fun validate(): ValidationResult =
        this::timestampMillis validate withinClockSkew

    // Der Stempel kommt vom Gerät. Eine völlig verstellte Uhr (oder ein Zufallswert) setzte sonst
    // Marken in fernen Jahren, die die Zeitenlisten sortieren und in die offiziellen Zeiten
    // einfließen. Ein Tag in beide Richtungen deckt jede plausible Abweichung und die
    // Offline-Warteschlange der Helfer-App; eine Marke von gestern gehört nachgetragen, nicht erfasst.
    private val withinClockSkew: Validator<Long?>
        get() = Validator { value ->
            if (value != null && abs(value - System.currentTimeMillis()) > MAX_CLOCK_SKEW_MILLIS) {
                ValidationResult.Invalid.Message { "is more than $MAX_CLOCK_SKEW_MILLIS ms away from the server clock" }
            } else {
                ValidationResult.Valid
            }
        }

    companion object {
        /** Ein Tag - so weit darf ein Zeitstempel von der Serveruhr abweichen. */
        const val MAX_CLOCK_SKEW_MILLIS = 86_400_000L

        val example get() = CreateTimeMarkRequest(
            id = UUID.randomUUID(),
            station = UUID.randomUUID(),
            timestampMillis = 1755430000000,
        )
    }
}
