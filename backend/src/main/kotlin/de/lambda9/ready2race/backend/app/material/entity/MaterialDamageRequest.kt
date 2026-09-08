package de.lambda9.ready2race.backend.app.material.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.backend.validation.validate
import de.lambda9.ready2race.backend.validation.validators.StringValidators.notBlank
import java.time.LocalDateTime
import java.util.UUID

/**
 * `causedByRegistration` bleibt ein reiner Verweis auf die Meldung - der Dienst löst ihn beim
 * Schreiben zum Verursacher-Schnappschuss auf (`causedByTeam`/`Club`/`Competition`, Spec Abschnitt
 * 10). Das Ausfallfenster (`until >= from`) prüft der Dienst gegen `MaterialError.InvalidOutageWindow`,
 * weil `REPAIRED` das Fenster erst noch schließen kann (siehe Service) - hier reicht die
 * einfachere Prüfung, dass ein Reparaturdatum vorliegt, wenn der Status das verlangt.
 */
class MaterialDamageRequest(
    val materialItem: UUID,
    val reportedAt: LocalDateTime,
    val description: String,
    val severity: MaterialDamageSeverity,
    val status: MaterialDamageStatus,
    val causedByRegistration: UUID?,
    val outOfServiceFrom: LocalDateTime?,
    val outOfServiceUntil: LocalDateTime?,
    val repairedAt: LocalDateTime?,
) : Validatable {

    override fun validate(): ValidationResult = ValidationResult.allOf(
        this::description validate notBlank,
        if (status == MaterialDamageStatus.REPAIRED && repairedAt == null) {
            ValidationResult.Invalid.Field(
                "repairedAt",
                ValidationResult.Invalid.Message { "is required when status is REPAIRED" },
            )
        } else {
            ValidationResult.Valid
        },
    )

    companion object {
        val example
            get() = MaterialDamageRequest(
                materialItem = UUID.randomUUID(),
                reportedAt = LocalDateTime.now(),
                description = "Riss im Rumpf, Steuerbordseite",
                severity = MaterialDamageSeverity.MAJOR,
                status = MaterialDamageStatus.REPORTED,
                causedByRegistration = null,
                outOfServiceFrom = LocalDateTime.now(),
                outOfServiceUntil = null,
                repairedAt = null,
            )
    }
}
