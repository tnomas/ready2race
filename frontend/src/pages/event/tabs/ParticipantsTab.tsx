import {Stack} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {EventDto, ParticipantForEventDto, ParticipantTrackingDto} from '@api/types.gen.ts'
import {readRegistrationGlobal} from '@authorization/privileges.ts'
import {useUser} from '@contexts/user/UserContext.ts'
import {useEntityAdministration} from '@utils/hooks.ts'
import ParticipantForEventTable from '@components/participant/ParticipantForEventTable.tsx'
import ParticipantTrackingLogTable from '@components/event/participantTracking/ParticipantTrackingLogTable.tsx'

type Props = {
    event: EventDto
}

/** Bereich „Teilnehmende": Teilnehmer-Tabelle und (mit globalem Melde-Leserecht) Check-in-Protokoll. */
const ParticipantsTab = ({event}: Props) => {
    const {t} = useTranslation()
    const user = useUser()

    const participantForEventProps = useEntityAdministration<ParticipantForEventDto>(
        t('club.participant.title'),
        {entityCreate: false, entityUpdate: false},
    )
    const participantTrackingProps = useEntityAdministration<ParticipantTrackingDto>(
        t('club.participant.tracking.entry'),
        {entityCreate: false, entityUpdate: false},
    )

    return (
        <Stack spacing={2}>
            <ParticipantForEventTable
                eventData={event}
                {...participantForEventProps.table}
                title={t('event.participants')}
            />
            {user.checkPrivilege(readRegistrationGlobal) && (
                <ParticipantTrackingLogTable
                    {...participantTrackingProps.table}
                    title={t('club.participant.tracking.log')}
                />
            )}
        </Stack>
    )
}

export default ParticipantsTab
