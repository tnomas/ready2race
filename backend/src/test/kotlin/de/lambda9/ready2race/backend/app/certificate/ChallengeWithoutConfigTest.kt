package de.lambda9.ready2race.backend.app.certificate

import de.lambda9.ready2race.backend.app.certificate.boundary.CertificateService
import de.lambda9.ready2race.backend.app.competitionRegistration.seedEvent
import de.lambda9.ready2race.backend.app.competitionRegistration.seedNamedParticipant
import de.lambda9.ready2race.backend.app.competitionRegistration.seedSingleCompetition
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.jooq.Jooq
import kotlin.test.Test

/**
 * Ein Wettkampf einer Challenge-Veranstaltung ohne Zeile in
 * `competition_properties_challenge_config` (so kommt er aus dem WebDAV-Import, der die
 * Konfiguration nicht mitnimmt) ließ die Urkunden-Wege an `challengeEndAt!!` sterben.
 */
class ChallengeWithoutConfigTest {

    @Test
    fun certificateJobsDoNotDieOnACompetitionWithoutChallengeConfig() = testComprehension {
        val eventId = seedEvent()
        !Jooq.query { update(EVENT).set(EVENT.CHALLENGE_EVENT, true).where(EVENT.ID.eq(eventId)).execute() }
        seedSingleCompetition(eventId, seedNamedParticipant())

        !CertificateService.createCertificateOfParticipationJobs(eventId)
    }
}
