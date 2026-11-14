import {Box} from '@mui/material'
import {useEntityAdministration} from '@utils/hooks.ts'
import EventTable from '@components/event/EventTable.tsx'
import EventDialog from '@components/event/EventDialog.tsx'
import {useTranslation} from 'react-i18next'
import {EventDto} from '@api/types.gen.ts'
import {PageHeader} from '@components/ui'

const EventsPage = () => {
    const {t} = useTranslation()

    const administrationProps = useEntityAdministration<EventDto>(t('event.event'))

    return (
        <Box>
            <PageHeader title={t('event.events')} />
            {/* Ohne Tabellentitel: der Seitenkopf trägt ihn bereits. */}
            <EventTable {...administrationProps.table} />
            <EventDialog {...administrationProps.dialog} />
        </Box>
    )
}

export default EventsPage
