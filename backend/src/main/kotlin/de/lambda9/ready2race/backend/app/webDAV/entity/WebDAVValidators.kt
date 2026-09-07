package de.lambda9.ready2race.backend.app.webDAV.entity

import de.lambda9.ready2race.backend.validation.validators.Validator

/**
 * Ob ein Name als EIN Ordnername auf dem WebDAV-Server taugt: kein Trennzeichen, kein
 * Punktverzeichnis. Alles andere verließe den vorgesehenen Zielordner.
 */
fun isSingleFolderName(name: String): Boolean =
    !name.contains('/') && !name.contains('\\') && name != "." && name != ".."

/** Validator-Form von [isSingleFolderName] für Request-DTOs. */
val noPathSegmentsOrDots: Validator<String?>
    get() = Validator.simple("must be a single folder name without / or \\ and not . or ..") { isSingleFolderName(it) }
