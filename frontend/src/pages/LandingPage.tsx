import {Box} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {UpcomingEventsWidget} from '@components/dashboard/UpcomingEventsWidget.tsx'
import {ArrowForward} from '@mui/icons-material'
import {ButtonLink, PageHeader} from '@components/ui'

const LandingPage = () => {
    const {t} = useTranslation()

    return (
        <Box>
            <PageHeader
                title={t('event.events')}
                actions={
                    <ButtonLink to={'/results'} variant={'text'} endIcon={<ArrowForward />}>
                        {t('landing.liveEventsLink')}
                    </ButtonLink>
                }
            />
            <UpcomingEventsWidget hideRegistration={true} hideTitle={true} />
        </Box>
    )
}

export default LandingPage
