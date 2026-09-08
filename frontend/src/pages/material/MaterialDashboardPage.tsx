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
import {useUser} from '@contexts/user/UserContext.ts'
import {readMaterialGlobal} from '@authorization/privileges.ts'
import MaterialSettingsPanel from '@components/material/MaterialSettingsPanel.tsx'

export const MATERIAL_TABS = ['requests', 'assignment', 'damages', 'settings'] as const
export type MaterialTab = (typeof MATERIAL_TABS)[number]

/**
 * Material-Planung einer Veranstaltung. providerId ist der eigene Anbieter (materialProviderId
 * am Konto), sonst - für Konten mit READ MATERIAL GLOBAL ohne eigene Zuordnung - der über die
 * Adresse gewählte Anbieter (`?provider=`, siehe SelectMaterialEventPage). Die Reiter Anfragen
 * (2.3 selbst bleibt hier Platzhalter), Zuteilung und Schäden kommen erst mit den Aufgaben 4.3
 * und 5.3 - bis dahin stehen dort nur Hinweise.
 */
const MaterialDashboardPage = () => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const user = useUser()

    const {eventId} = materialEventRoute.useParams()
    const search = materialEventRoute.useSearch()
    const activeTab = search.tab ?? 'requests'

    const mayReadGlobal = user.checkPrivilege(readMaterialGlobal)
    const ownProviderId = user.loggedIn ? user.materialProviderId : undefined
    const providerId = ownProviderId ?? (mayReadGlobal ? search.provider : undefined)

    const navigate = useNavigate()
    const switchTab = (tab: MaterialTab) => {
        navigate({from: materialEventRoute.fullPath, search: prev => ({...prev, tab})}).then()
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
                {providerId ? (
                    <MaterialSettingsPanel eventId={eventId} providerId={providerId} />
                ) : (
                    <Typography>{t('material.fleet.noProvider')}</Typography>
                )}
            </TabPanel>
        </Box>
    )
}

export default MaterialDashboardPage
