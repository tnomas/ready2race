import {Box, Tab, Typography} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {useNavigate} from '@tanstack/react-router'
import {materialEventRoute} from '@routes'
import TabSelectionContainer from '@components/tab/TabSelectionContainer.tsx'
import TabPanel from '@components/tab/TabPanel.tsx'
import {a11yProps} from '@utils/helpers.ts'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import {getEvent} from '@api/sdk.gen.ts'
import Throbber from '@components/Throbber.tsx'
import {useDocumentTitle} from '@utils/useDocumentTitle.ts'

export const MATERIAL_TABS = ['requests', 'assignment', 'damages', 'settings'] as const
export type MaterialTab = (typeof MATERIAL_TABS)[number]

/**
 * Gerüst für die Material-Planung einer Veranstaltung: die Reiter selbst kommen erst mit den
 * Aufgaben 2.3 (Anfragen), 4.3 (Zuteilung) und 5.3 (Schäden/Einstellungen) — hier stehen bis
 * dahin nur Platzhalter, damit Route und Navigation schon jetzt stehen.
 */
const MaterialDashboardPage = () => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const {eventId} = materialEventRoute.useParams()
    const {tab} = materialEventRoute.useSearch()
    const activeTab = tab ?? 'requests'

    const navigate = useNavigate()
    const switchTab = (tab: MaterialTab) => {
        navigate({from: materialEventRoute.fullPath, search: {tab}}).then()
    }

    const tabProps = (tab: MaterialTab) => a11yProps('material', tab)

    const {data: event, pending} = useFetch(signal => getEvent({signal, path: {eventId}}), {
        onResponse: ({error}) => {
            if (error) {
                feedback.error(t('common.load.error.single', {entity: t('event.event')}))
            }
        },
        deps: [eventId],
    })

    useDocumentTitle(event?.name, t('material.material'))

    return (
        <Box>
            <Typography variant={'h1'}>{event ? event.name : t('material.material')}</Typography>
            {pending && !event && <Throbber />}
            <TabSelectionContainer activeTab={activeTab} setActiveTab={switchTab}>
                <Tab label={t('material.dashboard.tabs.requests')} {...tabProps('requests')} />
                <Tab label={t('material.dashboard.tabs.assignment')} {...tabProps('assignment')} />
                <Tab label={t('material.dashboard.tabs.damages')} {...tabProps('damages')} />
                <Tab label={t('material.dashboard.tabs.settings')} {...tabProps('settings')} />
            </TabSelectionContainer>
            <TabPanel index={'requests'} activeTab={activeTab}>
                <Typography>{t('material.dashboard.comingSoon')}</Typography>
            </TabPanel>
            <TabPanel index={'assignment'} activeTab={activeTab}>
                <Typography>{t('material.dashboard.comingSoon')}</Typography>
            </TabPanel>
            <TabPanel index={'damages'} activeTab={activeTab}>
                <Typography>{t('material.dashboard.comingSoon')}</Typography>
            </TabPanel>
            <TabPanel index={'settings'} activeTab={activeTab}>
                <Typography>{t('material.dashboard.comingSoon')}</Typography>
            </TabPanel>
        </Box>
    )
}

export default MaterialDashboardPage
