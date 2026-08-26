package de.lambda9.ready2race.backend.app.eventRegistration.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.backend.validation.validate
import de.lambda9.ready2race.backend.validation.validators.StringValidators.maxLength
import de.lambda9.ready2race.backend.validation.validators.StringValidators.notBlank
import de.lambda9.ready2race.backend.validation.validators.Validator.Companion.allOf
import de.lambda9.ready2race.backend.validation.validators.Validator.Companion.notNull
import java.util.*

data class CompetitionRegistrationTeamUpsertDto(
    val id: UUID?,
    val clubId: UUID?,
    val optionalFees: List<UUID>?,
    val namedParticipants: List<CompetitionRegistrationNamedParticipantUpsertDto>,
    val ratingCategory: UUID?,
    /**
     * Der Name der Mannschaft, wenn sie einen führt - "RG Eckernförde/Kappeln". Leer ist der
     * Normalfall; dann zeigt jede Anzeige die Vereine der Crew als Kette.
     *
     * Nicht zu verwechseln mit dem Zähler `competition_registration.name` ("#1", "#2"), den der
     * Dienst selbst vergibt und beim Löschen neu vergibt.
     */
    val displayName: String?,
    val callbackUrl: String? = null,
) : Validatable {
    override fun validate(): ValidationResult = ValidationResult.allOf(
        this::callbackUrl validate notNull,
        // Leer heißt "kein Name" und kommt als null; eine Eingabe aus lauter Leerzeichen wäre
        // dagegen ein Name, den niemand sieht und der trotzdem die Vereinskette verdeckt.
        // MAX_DISPLAY_NAME_LENGTH deckelt, was Urkunde und Siegerehrungsbogen noch setzen können.
        this::displayName validate allOf(notBlank, maxLength(MAX_DISPLAY_NAME_LENGTH)),
    )

    companion object {
        /**
         * Die Vereinskette wird an ihren ` / `-Grenzen umgebrochen; ein Mannschaftsname hat keine
         * und fiele auf den Umbruch an Wortgrenzen zurück. 80 Zeichen sind rund das Doppelte des
         * längsten Vereinsnamens der echten Meldedaten und passen auf der Urkunde noch in zwei
         * Zeilen.
         */
        const val MAX_DISPLAY_NAME_LENGTH = 80

        val example
            get() = CompetitionRegistrationTeamUpsertDto(
                id = UUID.randomUUID(),
                clubId = UUID.randomUUID(),
                optionalFees = emptyList(),
                namedParticipants = emptyList(),
                ratingCategory = UUID.randomUUID(),
                displayName = "RG Eckernförde/Kappeln",
                callbackUrl = "https://ready2race.info/challenge/",
            )
    }
}