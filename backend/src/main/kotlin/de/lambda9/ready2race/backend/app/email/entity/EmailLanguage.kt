package de.lambda9.ready2race.backend.app.email.entity

enum class EmailLanguage {
    EN,
    DE,
    DA,
    ;

    companion object {
        /** Sprache, wenn die gespeicherte fehlt oder unbekannt ist. */
        val DEFAULT = DE

        /**
         * Löst eine gespeicherte Sprache (Nutzer, Einladung, Vorlage) auf. Groß-/Kleinschreibung
         * und Leerraum sind egal, ein unbekannter oder fehlender Wert ergibt [DEFAULT] - eine
         * abweichende Schreibweise in der Datenbank darf keinen Mailversand und keine Meldung
         * mit einem 500er abbrechen.
         */
        fun fromStored(value: String?): EmailLanguage {
            val trimmed = value?.trim() ?: return DEFAULT
            return entries.firstOrNull { it.name.equals(trimmed, ignoreCase = true) } ?: DEFAULT
        }
    }
}
