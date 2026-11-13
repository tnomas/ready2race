import {Box, Button, Card, Stack, Typography} from '@mui/material'
import CampaignOutlined from '@mui/icons-material/CampaignOutlined'
import ConnectedTvOutlined from '@mui/icons-material/ConnectedTvOutlined'
import DeskOutlined from '@mui/icons-material/DeskOutlined'
import GroupsOutlined from '@mui/icons-material/GroupsOutlined'
import LiveTvOutlined from '@mui/icons-material/LiveTvOutlined'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import PlayCircleOutlined from '@mui/icons-material/PlayCircleOutlined'
import SportsScoreOutlined from '@mui/icons-material/SportsScoreOutlined'
import TimerOutlined from '@mui/icons-material/TimerOutlined'
import TuneOutlined from '@mui/icons-material/TuneOutlined'
import {ReactNode, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {Link} from '@tanstack/react-router'
import {useUser} from '@contexts/user/UserContext.ts'
import TimingStationPanel from '@components/event/timing/TimingStationPanel.tsx'
import ManageRunningMatchesDialog from '@components/event/match/ManageRunningMatchesDialog.tsx'
import CheckSeverityDialog from '@components/event/liveDashboard/CheckSeverityDialog.tsx'
import {
    BetriebActionId,
    BetriebTileId,
    visibleBetriebActions,
    visibleBetriebTiles,
} from './betriebTiles.ts'

export type BetriebTabProps = {
    eventId: string
    /**
     * Bereichswechsel auf der Event-Seite: Zeitplan (Regattabüro-Kachel) und Schichtplan
     * (Helfer-Kachel). Bewusst nur diese zwei Ziele, damit der Reiter nicht am Typ der
     * Veranstaltungsseite hängt.
     */
    switchTab: (tab: 'organization' | 'schedule') => void
}

/**
 * Der Betrieb-Reiter: der eine auffindbare Ort für alles, womit die Regatta am Renntag gefahren
 * wird — eine Kachel je Rolle (Regattabüro, Schiedsrichter:in, Sprecher:in, Zeitnahme, Anzeigen,
 * Livestream, Helfer:innen), jeweils mit kurzem Text und dem Sprung in die Ansicht.
 *
 * Fensterregel: Vollbild-Arbeitsplätze, die am Renntag auf eigenen Bildschirmen laufen
 * (Schiedsrichter-Dashboard, Sprecher-Board, Regie, Leitstand, Helfer-App, mobile Erfassung),
 * öffnen IMMER in neuem Fenster, mit `OpenInNew`-Icon und über den Router-`<Link>` (rohe `href`
 * ignorieren den `basepath`). Verwaltungsseiten (Boards, Szenen, Posten-Tabelle) öffnen im
 * selben Fenster.
 *
 * Der Name „Betrieb" ist bewusst gewählt (das Wortfeld existiert schon: Betriebsbeginn /
 * `operationsStartsAt`); „Posten" wurde verworfen, weil die Zeitnahme-Messstellen so heißen.
 *
 * Welche Kacheln und Zusatzknöpfe erscheinen, entscheiden `visibleBetriebTiles` und
 * `visibleBetriebActions` (getestet) — nur Ziele, die die Person auch erreichen darf.
 */
const BetriebTab = ({eventId, switchTab}: BetriebTabProps) => {
    const {t} = useTranslation()
    const user = useUser()

    const [manageRunningMatchesOpen, setManageRunningMatchesOpen] = useState(false)
    const [checkSeverityOpen, setCheckSeverityOpen] = useState(false)

    const tiles = visibleBetriebTiles(user.checkPrivilege)
    const actions = visibleBetriebActions(user.checkPrivilege)
    const show = (tile: BetriebTileId) => tiles.includes(tile)
    const can = (action: BetriebActionId) => actions.includes(action)

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
                {/* Regattabüro: bis zum 13.11.2026 lag „Laufende Läufe verwalten" als Knopf auf
                    der Übersicht (Karte „Öffentliche Anzeigen") — fachlich die Arbeit des
                    Regattabüros, nicht der Anzeigen. Der Zeitplan ist dessen Arbeitsfläche
                    (Veranstaltungs-Modus, ADR-0086), deshalb der Sprung dorthin. */}
                {show('raceOffice') &&
                    tileCard(
                        <DeskOutlined color="primary" />,
                        t('event.betrieb.raceOffice.title'),
                        t('event.betrieb.raceOffice.description'),
                        <>
                            {can('manageRunningMatches') && (
                                <Button
                                    variant="outlined"
                                    fullWidth
                                    startIcon={<PlayCircleOutlined />}
                                    onClick={() => setManageRunningMatchesOpen(true)}>
                                    {t('event.competition.execution.match.manageRunning')}
                                </Button>
                            )}
                            {can('openSchedule') && (
                                <Button
                                    variant="text"
                                    fullWidth
                                    onClick={() => switchTab('schedule')}>
                                    {t('event.betrieb.raceOffice.openSchedule')}
                                </Button>
                            )}
                        </>,
                    )}
                {show('referee') &&
                    tileCard(
                        <SportsScoreOutlined color="primary" />,
                        t('event.betrieb.referee.title'),
                        t('event.betrieb.referee.description'),
                        <>
                            <Link
                                to={'/event/$eventId/liveDashboard'}
                                params={{eventId}}
                                target="_blank"
                                rel="noopener">
                                <Button variant="outlined" fullWidth endIcon={<OpenInNewIcon />}>
                                    {t('event.betrieb.referee.open')}
                                </Button>
                            </Link>
                            {/* Prüfungen verwalten: vorher in der Karte „Schiedsrichter-Dashboard"
                                auf der Übersicht, mit demselben zusätzlichen Recht. */}
                            {can('checkSeverity') && (
                                <Button
                                    variant="text"
                                    fullWidth
                                    startIcon={<TuneOutlined />}
                                    onClick={() => setCheckSeverityOpen(true)}>
                                    {t('event.liveDashboard.checkSeverity.manage')}
                                </Button>
                            )}
                        </>,
                    )}
                {show('speaker') &&
                    tileCard(
                        <CampaignOutlined color="primary" />,
                        t('event.betrieb.speaker.title'),
                        t('event.betrieb.speaker.description'),
                        <Link
                            to={'/speaker/event/$eventId'}
                            params={{eventId}}
                            target="_blank"
                            rel="noopener">
                            <Button variant="outlined" fullWidth endIcon={<OpenInNewIcon />}>
                                {t('event.betrieb.speaker.open')}
                            </Button>
                        </Link>,
                    )}
                {/* Anzeigen und Livestream sind seit dem 31.08.2026 ZWEI Kacheln: das eine sind
                    die öffentlichen Bildschirme am Gelände, das andere die Overlay-Szenen der
                    Bildregie — wer das eine sucht, soll nicht durch das andere müssen. */}
                {show('boards') &&
                    tileCard(
                        <ConnectedTvOutlined color="primary" />,
                        t('event.betrieb.boards.title'),
                        t('event.betrieb.boards.description'),
                        <Link to={'/event/$eventId/info'} params={{eventId}}>
                            <Button variant="outlined" fullWidth>
                                {t('event.betrieb.boards.open')}
                            </Button>
                        </Link>,
                    )}
                {show('livestream') &&
                    tileCard(
                        <LiveTvOutlined color="primary" />,
                        t('event.betrieb.livestream.title'),
                        t('event.betrieb.livestream.description'),
                        <>
                            <Link
                                to={'/event/$eventId/streamPanel'}
                                params={{eventId}}
                                target="_blank"
                                rel="noopener">
                                <Button variant="contained" fullWidth endIcon={<OpenInNewIcon />}>
                                    {t('event.betrieb.livestream.openDirector')}
                                </Button>
                            </Link>
                            <Link to={'/event/$eventId/streamScenes'} params={{eventId}}>
                                <Button variant="outlined" fullWidth>
                                    {t('event.betrieb.livestream.open')}
                                </Button>
                            </Link>
                        </>,
                    )}
                {show('helpers') &&
                    tileCard(
                        <GroupsOutlined color="primary" />,
                        t('event.betrieb.helpers.title'),
                        t('event.betrieb.helpers.description'),
                        <>
                            <Link to={'/app'} target="_blank" rel="noopener">
                                <Button variant="outlined" fullWidth endIcon={<OpenInNewIcon />}>
                                    {t('event.betrieb.helpers.openApp')}
                                </Button>
                            </Link>
                            {/* Der Schichtplan wohnt im Bereich „Team & Helfer"; der ist nur mit
                                Nutzer-Leserecht sichtbar, also gilt das auch für den Verweis. */}
                            {can('openShifts') && (
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
                    <Link
                        to={'/event/$eventId/timing/leitstand'}
                        params={{eventId}}
                        target="_blank"
                        rel="noopener">
                        <Button
                            variant="contained"
                            size="large"
                            fullWidth
                            endIcon={<OpenInNewIcon />}>
                            {t('event.betrieb.timing.openLeitstand')}
                        </Button>
                    </Link>
                    {/* Die Postenverwaltung wohnt hier, in der Zeitnahme-Kachel des
                        Betrieb-Reiters. Das macht die Verlegung auf die Boards-Seite (Commit
                        cdd5fbc7, feature/timing-module) BEWUSST rückgängig - dort hat sie in der
                        Praxis niemand gefunden (Entscheidung vom 22.08.2026). Die Tabelle trägt
                        die direkten Links je Posten: Erfassung öffnen, Startbildschirm (START),
                        Auf Gerät teilen. */}
                    <TimingStationPanel />
                    <Typography variant="body2" color="text.secondary">
                        {t('event.betrieb.timing.mobileHint')}{' '}
                        <Link to={'/app/timing'} target="_blank" rel="noopener">
                            {t('event.betrieb.timing.mobileLink')}
                        </Link>
                    </Typography>
                </Card>
            )}
            {manageRunningMatchesOpen && (
                <ManageRunningMatchesDialog
                    open={manageRunningMatchesOpen}
                    onClose={() => setManageRunningMatchesOpen(false)}
                    eventId={eventId}
                />
            )}
            {checkSeverityOpen && (
                <CheckSeverityDialog
                    open={checkSeverityOpen}
                    onClose={() => setCheckSeverityOpen(false)}
                    eventId={eventId}
                />
            )}
        </Stack>
    )
}

export default BetriebTab
