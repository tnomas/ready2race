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
import {useUser} from '@contexts/user/UserContext.ts'
import TimingStationPanel from '@components/event/timing/TimingStationPanel.tsx'
import ManageRunningMatchesDialog from '@components/event/match/ManageRunningMatchesDialog.tsx'
import CheckSeverityDialog from '@components/event/liveDashboard/CheckSeverityDialog.tsx'
import {
    BetriebActionId,
    BetriebTileId,
    orderBetriebTiles,
    visibleBetriebActions,
    visibleBetriebTiles,
} from './betriebTiles.ts'
import {ButtonLink} from '@components/ui'

export type BetriebTabProps = {
    eventId: string
    /**
     * Bereichswechsel auf der Event-Seite: Zeitplan (Regattabüro-Kachel) und Schichtplan
     * (Helfer-Kachel). Bewusst nur diese zwei Ziele, damit der Reiter nicht am Typ der
     * Veranstaltungsseite hängt.
     */
    switchTab: (tab: 'organization' | 'schedule') => void
    /**
     * Challenge-Veranstaltung: „Laufende Läufe verwalten" und „Prüfungen verwalten" entfallen
     * (siehe `visibleBetriebActions`).
     */
    challengeEvent?: boolean
}

/**
 * Der Betrieb-Reiter: die Startseite des Renntags — eine Kachel je Rolle, nach Häufigkeit geordnet
 * (Schiedsrichter:in, Regattabüro, Zeitnahme, Sprecher:in, Livestream, Anzeigen, Helfer:innen;
 * siehe `BETRIEB_TILE_ORDER`), jeweils mit einem Satz „wofür" und dem direkten Sprung. Darunter
 * die Zeitnahme-Posten als eigener Abschnitt.
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
const BetriebTab = ({eventId, switchTab, challengeEvent = false}: BetriebTabProps) => {
    const {t} = useTranslation()
    const user = useUser()

    const [manageRunningMatchesOpen, setManageRunningMatchesOpen] = useState(false)
    const [checkSeverityOpen, setCheckSeverityOpen] = useState(false)

    const tiles = orderBetriebTiles(visibleBetriebTiles(user.checkPrivilege))
    const actions = visibleBetriebActions(user.checkPrivilege, {challengeEvent})
    const can = (action: BetriebActionId) => actions.includes(action)

    // Gemeinsame Größe der Knöpfe: Daumen-tauglich, auch auf dem Tablet am Steg.
    // `&&` hebt die Spezifität über die Mobil-Regel des Verwaltungs-Themes (44 px unter sm).
    const buttonSx = {'&&': {minHeight: 48}}

    /**
     * Eine Kachel: Symbol + Rolle, EIN Satz „wofür", darunter die Primäraktion (gefüllt) und
     * höchstens ein, zwei leise Zweitwege. Alle Kacheln gleich gebaut, damit das Auge am Renntag
     * nicht suchen muss.
     */
    const tileCard = (
        id: BetriebTileId,
        icon: ReactNode,
        title: string,
        description: string,
        primary: ReactNode,
        secondary?: ReactNode,
    ) => (
        <Card
            key={id}
            component="section"
            aria-labelledby={`betrieb-tile-${id}`}
            sx={{p: 2, display: 'flex', flexDirection: 'column', gap: 1.25}}>
            <Stack direction="row" spacing={1} alignItems="center">
                {icon}
                <Typography id={`betrieb-tile-${id}`} variant="h6" component="h2">
                    {title}
                </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{flexGrow: 1}}>
                {description}
            </Typography>
            <Stack spacing={0.5}>
                {primary}
                {secondary}
            </Stack>
        </Card>
    )

    const renderTile = (tile: BetriebTileId): ReactNode => {
        switch (tile) {
            case 'referee':
                return tileCard(
                    tile,
                    <SportsScoreOutlined color="primary" />,
                    t('event.betrieb.referee.title'),
                    t('event.betrieb.referee.description'),
                    <ButtonLink
                        to={'/event/$eventId/liveDashboard'}
                        params={{eventId}}
                        target="_blank"
                        rel="noopener"
                        variant="contained"
                        fullWidth
                        sx={buttonSx}
                        endIcon={<OpenInNewIcon />}>
                        {t('event.betrieb.referee.open')}
                    </ButtonLink>,
                    // Prüfungen verwalten: vorher in der Karte „Schiedsrichter-Dashboard" auf der
                    // Übersicht, mit demselben zusätzlichen Recht.
                    can('checkSeverity') && (
                        <Button
                            variant="text"
                            fullWidth
                            sx={buttonSx}
                            startIcon={<TuneOutlined />}
                            onClick={() => setCheckSeverityOpen(true)}>
                            {t('event.liveDashboard.checkSeverity.manage')}
                        </Button>
                    ),
                )
            // Regattabüro: bis zum 13.11.2026 lag „Laufende Läufe verwalten" als Knopf auf der
            // Übersicht — fachlich die Arbeit des Regattabüros. Der Zeitplan ist dessen
            // Arbeitsfläche (Veranstaltungs-Modus, ADR-0086), deshalb der Sprung dorthin.
            case 'raceOffice':
                return tileCard(
                    tile,
                    <DeskOutlined color="primary" />,
                    t('event.betrieb.raceOffice.title'),
                    t('event.betrieb.raceOffice.description'),
                    can('manageRunningMatches') ? (
                        <Button
                            variant="contained"
                            fullWidth
                            sx={buttonSx}
                            startIcon={<PlayCircleOutlined />}
                            onClick={() => setManageRunningMatchesOpen(true)}>
                            {t('event.competition.execution.match.manageRunning')}
                        </Button>
                    ) : null,
                    can('openSchedule') && (
                        <Button
                            variant={can('manageRunningMatches') ? 'text' : 'contained'}
                            fullWidth
                            sx={buttonSx}
                            onClick={() => switchTab('schedule')}>
                            {t('event.betrieb.raceOffice.openSchedule')}
                        </Button>
                    ),
                )
            // Der Leitstand ist der Laptop-Einstieg der Zeitnahme-Leitung, in neuem Fenster (läuft
            // am Renntag im Vollbild). Die Posten-Tabelle steht als eigener Abschnitt unter den
            // Kacheln (siehe unten), damit die Kachel so kurz bleibt wie die anderen.
            case 'timing':
                return tileCard(
                    tile,
                    <TimerOutlined color="primary" />,
                    t('event.betrieb.timing.title'),
                    t('event.betrieb.timing.description'),
                    <ButtonLink
                        to={'/event/$eventId/timing/leitstand'}
                        params={{eventId}}
                        target="_blank"
                        rel="noopener"
                        variant="contained"
                        fullWidth
                        sx={buttonSx}
                        endIcon={<OpenInNewIcon />}>
                        {t('event.betrieb.timing.openLeitstand')}
                    </ButtonLink>,
                    <ButtonLink
                        to={'/app/timing'}
                        target="_blank"
                        rel="noopener"
                        variant="text"
                        fullWidth
                        sx={buttonSx}
                        endIcon={<OpenInNewIcon />}>
                        {t('event.betrieb.timing.mobileLink')}
                    </ButtonLink>,
                )
            case 'speaker':
                return tileCard(
                    tile,
                    <CampaignOutlined color="primary" />,
                    t('event.betrieb.speaker.title'),
                    t('event.betrieb.speaker.description'),
                    <ButtonLink
                        to={'/speaker/event/$eventId'}
                        params={{eventId}}
                        target="_blank"
                        rel="noopener"
                        variant="contained"
                        fullWidth
                        sx={buttonSx}
                        endIcon={<OpenInNewIcon />}>
                        {t('event.betrieb.speaker.open')}
                    </ButtonLink>,
                )
            // Anzeigen und Livestream sind seit dem 31.08.2026 ZWEI Kacheln: das eine sind die
            // öffentlichen Bildschirme am Gelände, das andere die Overlay-Szenen der Bildregie.
            case 'livestream':
                return tileCard(
                    tile,
                    <LiveTvOutlined color="primary" />,
                    t('event.betrieb.livestream.title'),
                    t('event.betrieb.livestream.description'),
                    <ButtonLink
                        to={'/event/$eventId/streamPanel'}
                        params={{eventId}}
                        target="_blank"
                        rel="noopener"
                        variant="contained"
                        fullWidth
                        sx={buttonSx}
                        endIcon={<OpenInNewIcon />}>
                        {t('event.betrieb.livestream.openDirector')}
                    </ButtonLink>,
                    <ButtonLink
                        to={'/event/$eventId/streamScenes'}
                        params={{eventId}}
                        variant="text"
                        fullWidth
                        sx={buttonSx}>
                        {t('event.betrieb.livestream.open')}
                    </ButtonLink>,
                )
            case 'boards':
                return tileCard(
                    tile,
                    <ConnectedTvOutlined color="primary" />,
                    t('event.betrieb.boards.title'),
                    t('event.betrieb.boards.description'),
                    <ButtonLink
                        to={'/event/$eventId/info'}
                        params={{eventId}}
                        variant="outlined"
                        fullWidth
                        sx={buttonSx}>
                        {t('event.betrieb.boards.open')}
                    </ButtonLink>,
                )
            case 'helpers':
                return tileCard(
                    tile,
                    <GroupsOutlined color="primary" />,
                    t('event.betrieb.helpers.title'),
                    t('event.betrieb.helpers.description'),
                    <ButtonLink
                        to={'/app'}
                        target="_blank"
                        rel="noopener"
                        variant="outlined"
                        fullWidth
                        sx={buttonSx}
                        endIcon={<OpenInNewIcon />}>
                        {t('event.betrieb.helpers.openApp')}
                    </ButtonLink>,
                    // Der Schichtplan wohnt im Bereich „Team & Helfer"; der ist nur mit
                    // Nutzer-Leserecht sichtbar, also gilt das auch für den Verweis.
                    can('openShifts') && (
                        <Button
                            variant="text"
                            fullWidth
                            sx={buttonSx}
                            onClick={() => switchTab('organization')}>
                            {t('event.betrieb.helpers.shifts')}
                        </Button>
                    ),
                )
        }
    }

    return (
        <Stack spacing={3}>
            <Typography variant="body2" color="text.secondary">
                {t('event.betrieb.intro')}
            </Typography>
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                        xs: 'minmax(0, 1fr)',
                        sm: 'repeat(2, minmax(0, 1fr))',
                        lg: 'repeat(3, minmax(0, 1fr))',
                    },
                    gap: 2,
                    alignItems: 'stretch',
                }}>
                {tiles.map(renderTile)}
            </Box>
            {/* Die Postenverwaltung wohnt im Betrieb — das macht die Verlegung auf die
                Boards-Seite (Commit cdd5fbc7, feature/timing-module) BEWUSST rückgängig, dort hat
                sie in der Praxis niemand gefunden (Entscheidung vom 22.08.2026). Seit dem
                13.11.2026 als eigener Abschnitt unter den Kacheln statt im Bauch der
                Zeitnahme-Kachel: die Arbeitsplätze stehen damit oben ohne Scrollen. Die Tabelle
                trägt die direkten Links je Posten: Erfassung öffnen, Startbildschirm (START), Auf
                Gerät teilen. */}
            {tiles.includes('timing') && (
                <Card sx={{p: 2, display: 'flex', flexDirection: 'column', gap: 1}}>
                    {/* Den Titel „Posten" trägt die Tabelle selbst. */}
                    <TimingStationPanel />
                    <Typography variant="body2" color="text.secondary">
                        {t('event.betrieb.timing.stationsHint')}
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
