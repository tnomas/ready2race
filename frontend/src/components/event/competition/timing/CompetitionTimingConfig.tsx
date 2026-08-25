import {Box, Stack, Typography} from '@mui/material'
import {Trans, useTranslation} from 'react-i18next'
import {competitionRoute, eventRoute} from '@routes'
import InlineLink from '@components/InlineLink.tsx'
import TimingProfileTree from '@components/event/timing/TimingProfileTree.tsx'

/**
 * Der Zeitnahme-Tab eines Wettkampfs: nur noch der Ausschnitt des Zeitnahmeprofil-Baums, der zu
 * diesem Wettkampf gehört.
 *
 * Zeitnahme-System und die beiden Dateiformate gelten für die ganze Veranstaltung — zwei
 * Zeitnahme-Softwares in einer Regatta gibt es nicht, und alle Wettkämpfe exportieren dieselben
 * Spalten. Die frühere Übersteuerung je Wettkampf erzeugte nur Zustände, die man erklären und beim
 * Ändern der Voreinstellung im Auge behalten musste. Hier wird deshalb ausschließlich zugeordnet,
 * womit dieser Wettkampf gestoppt wird; der Hinweis oben führt zu dem, was woanders gepflegt wird.
 */
const CompetitionTimingConfig = () => {
    const {t} = useTranslation()

    const {eventId} = eventRoute.useParams()
    const {competitionId} = competitionRoute.useParams()

    return (
        // Ohne Karte wie die Nachbar-Tabs (Durchführung, Wettbewerbsablauf): dort steht der Inhalt
        // blank auf der Seite, eine Karte nur hier sähe nach einem fremden Bildschirm aus.
        <Box sx={{maxWidth: 900}}>
            <Stack spacing={3}>
                <Box>
                    <Typography variant={'h2'} gutterBottom>
                        {t('event.competition.timing.tabTitle')}
                    </Typography>
                    <Typography variant={'body2'} color={'text.secondary'}>
                        <Trans i18nKey={'event.competition.timing.inheritedHint.1'} />
                        <InlineLink
                            to={'/event/$eventId'}
                            params={{eventId}}
                            search={{tab: 'settings'}}>
                            <Trans i18nKey={'event.competition.timing.inheritedHint.2'} />
                        </InlineLink>
                        <Trans i18nKey={'event.competition.timing.inheritedHint.3'} />
                    </Typography>
                </Box>
                <TimingProfileTree eventId={eventId} competitionId={competitionId} />
            </Stack>
        </Box>
    )
}

export default CompetitionTimingConfig
