import {Box, Button, Card, Stack, Typography} from '@mui/material'
import CampaignOutlined from '@mui/icons-material/CampaignOutlined'
import GroupsOutlined from '@mui/icons-material/GroupsOutlined'
import LiveTvOutlined from '@mui/icons-material/LiveTvOutlined'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import SportsScoreOutlined from '@mui/icons-material/SportsScoreOutlined'
import TimerOutlined from '@mui/icons-material/TimerOutlined'
import {ReactNode} from 'react'
import {useTranslation} from 'react-i18next'
import {Link} from '@tanstack/react-router'
import {useUser} from '@contexts/user/UserContext.ts'
import {readUserGlobal, readEventGlobal} from '@authorization/privileges.ts'
import TimingStationPanel from '@components/event/timing/TimingStationPanel.tsx'
import {BetriebTileId, visibleBetriebTiles} from './betriebTiles.ts'
import {EventTab} from '../EventPage.tsx'

export type BetriebTabProps = {
    eventId: string
    /** Reiterwechsel auf der Event-Seite (für den Schichtplan-Verweis in der Helfer-Kachel). */
    switchTab: (tab: EventTab) => void
}

/**
 * Der Betrieb-Reiter: der eine auffindbare Ort für alles, womit die Regatta am Renntag gefahren
 * wird — eine Kachel je Rolle (Schiedsrichter:in, Sprecher:in, Zeitnahme, Livestream,
 * Helfer:innen), jeweils mit kurzem Text und dem Sprung in die Ansicht. Externe bzw.
 * Vollbild-Ansichten (Leitstand, Sprecher, Boards, Erfassung) öffnen in neuem Fenster, weil sie
 * am Renntag auf eigenen Bildschirmen laufen.
 *
 * Der Name „Betrieb" ist bewusst gewählt (das Wortfeld existiert schon: Betriebsbeginn /
 * `operationsStartsAt`); „Posten" wurde verworfen, weil die Zeitnahme-Messstellen so heißen.
 *
 * Welche Kacheln erscheinen, entscheidet `visibleBetriebTiles` (getestet) — nur Ziele, die die
 * Person auch erreichen darf.
 */
const BetriebTab = ({eventId, switchTab}: BetriebTabProps) => {
    const {t} = useTranslation()
    const user = useUser()

    const tiles = visibleBetriebTiles(user.checkPrivilege)
    const show = (tile: BetriebTileId) => tiles.includes(tile)

    const tileCard = (icon: ReactNode, title: string, description: string, actions: ReactNode) => (
        <Card sx={{p: 2, display: 'flex', flexDirection: 'column', gap: 1.5}}>
            <Stack direction="row" spacing={1} alignItems="center">
                {icon}
                <Typography variant="h6">{title}</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{flexGrow: 1}}>
                {description}
            </Typography>
            <Stack spacing={1}>{actions}</Stack>
        </Card>
    )

    return (
        <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
                {t('event.betrieb.intro')}
            </Typography>
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: {xs: '1fr', md: '1fr 1fr'},
                    gap: 2,
                    alignItems: 'stretch',
                }}>
                {show('referee') &&
                    tileCard(
                        <SportsScoreOutlined color="primary" />,
                        t('event.betrieb.referee.title'),
                        t('event.betrieb.referee.description'),
                        <Link to={'/event/$eventId/liveDashboard'} params={{eventId}}>
                            <Button variant="outlined" fullWidth>
                                {t('event.betrieb.referee.open')}
                            </Button>
                        </Link>,
                    )}
                {show('speaker') &&
                    tileCard(
                        <CampaignOutlined color="primary" />,
                        t('event.betrieb.speaker.title'),
                        t('event.betrieb.speaker.description'),
                        <Button
                            variant="outlined"
                            fullWidth
                            component="a"
                            href={`/speaker/event/${eventId}`}
                            target="_blank"
                            rel="noopener"
                            endIcon={<OpenInNewIcon />}>
                            {t('event.betrieb.speaker.open')}
                        </Button>,
                    )}
                {show('livestream') &&
                    tileCard(
                        <LiveTvOutlined color="primary" />,
                        t('event.betrieb.livestream.title'),
                        t('event.betrieb.livestream.description'),
                        <Link to={'/event/$eventId/info'} params={{eventId}}>
                            <Button variant="outlined" fullWidth>
                                {t('event.betrieb.livestream.open')}
                            </Button>
                        </Link>,
                    )}
                {show('helpers') &&
                    tileCard(
                        <GroupsOutlined color="primary" />,
                        t('event.betrieb.helpers.title'),
                        t('event.betrieb.helpers.description'),
                        <>
                            <Button
                                variant="outlined"
                                fullWidth
                                component="a"
                                href="/app"
                                target="_blank"
                                rel="noopener"
                                endIcon={<OpenInNewIcon />}>
                                {t('event.betrieb.helpers.openApp')}
                            </Button>
                            {/* Der Schichtplan wohnt auf dem Organisation-Tab; der ist nur mit
                                Nutzer-Leserecht sichtbar, also gilt das auch für den Verweis. */}
                            {user.checkPrivilege(readEventGlobal) &&
                                user.checkPrivilege(readUserGlobal) && (
                                    <Button
                                        variant="text"
                                        fullWidth
                                        onClick={() => switchTab('organization')}>
                                        {t('event.betrieb.helpers.shifts')}
                                    </Button>
                                )}
                        </>,
                    )}
            </Box>
            {show('timing') && (
                <Card sx={{p: 2, display: 'flex', flexDirection: 'column', gap: 2}}>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <TimerOutlined color="primary" />
                        <Typography variant="h6">{t('event.betrieb.timing.title')}</Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                        {t('event.betrieb.timing.description')}
                    </Typography>
                    {/* Der Leitstand ist der Laptop-Einstieg der Zeitnahme-Leitung - deshalb der
                        prominente Knopf, in neuem Fenster (läuft am Renntag im Vollbild). */}
                    <Button
                        variant="contained"
                        size="large"
                        component="a"
                        href={`/event/${eventId}/timing/leitstand`}
                        target="_blank"
                        rel="noopener"
                        endIcon={<OpenInNewIcon />}>
                        {t('event.betrieb.timing.openLeitstand')}
                    </Button>
                    {/* Die Postenverwaltung wohnt hier, in der Zeitnahme-Kachel des
                        Betrieb-Reiters. Das macht die Verlegung auf die Boards-Seite (Commit
                        cdd5fbc7, feature/timing-module) BEWUSST rückgängig - dort hat sie in der
                        Praxis niemand gefunden (Entscheidung vom 22.08.2026). Die Tabelle trägt
                        die direkten Links je Posten: Erfassung öffnen, Startbildschirm (START),
                        Auf Gerät teilen. */}
                    <TimingStationPanel />
                    <Typography variant="body2" color="text.secondary">
                        {t('event.betrieb.timing.mobileHint')}{' '}
                        <a href="/app/timing" target="_blank" rel="noopener">
                            {t('event.betrieb.timing.mobileLink')}
                        </a>
                    </Typography>
                </Card>
            )}
        </Stack>
    )
}

export default BetriebTab
