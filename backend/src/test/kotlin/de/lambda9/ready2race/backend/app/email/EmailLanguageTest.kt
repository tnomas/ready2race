package de.lambda9.ready2race.backend.app.email

import de.lambda9.ready2race.backend.app.email.entity.EmailLanguage
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Die gespeicherte Sprache eines Nutzers ist ein freier Text. `valueOf` warf bei "de" statt "DE"
 * und machte das Absenden einer Meldung zum 500er; die Auflösung ist deshalb tolerant.
 */
class EmailLanguageTest {

    @Test
    fun resolvesRegardlessOfCase() {
        assertEquals(EmailLanguage.DE, EmailLanguage.fromStored("DE"))
        assertEquals(EmailLanguage.DE, EmailLanguage.fromStored("de"))
        assertEquals(EmailLanguage.EN, EmailLanguage.fromStored("En"))
        assertEquals(EmailLanguage.DA, EmailLanguage.fromStored(" da "))
    }

    @Test
    fun unknownOrMissingFallsBackToTheDefault() {
        assertEquals(EmailLanguage.DEFAULT, EmailLanguage.fromStored("fr"))
        assertEquals(EmailLanguage.DEFAULT, EmailLanguage.fromStored(""))
        assertEquals(EmailLanguage.DEFAULT, EmailLanguage.fromStored(null))
        assertEquals(EmailLanguage.DE, EmailLanguage.DEFAULT)
    }
}
