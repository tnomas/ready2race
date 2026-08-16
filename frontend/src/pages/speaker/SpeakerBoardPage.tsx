import {Box, IconButton, Stack, Tab, Tabs, Typography} from '@mui/material'
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import RefreshIcon from '@mui/icons-material/Refresh'
import SettingsIcon from '@mui/icons-material/Settings'
import {getEvent, getLatestMatchResults, getRunningMatches, getUpcomingMatches} from '@api/sdk.gen.ts'
import SpeakerMatchDialog from '@components/speaker/SpeakerMatchDialog.tsx'
import SpeakerParticipantDialog from '@components/speaker/SpeakerParticipantDialog.tsx'
import SpeakerProgramTable from '@components/speaker/SpeakerProgramTable.tsx'
import SpeakerResultsList from '@components/speaker/SpeakerResultsList.tsx'
import SpeakerSettingsDialog from '@components/speaker/SpeakerSettingsDialog.tsx'
import SpeakerTimeline from '@components/speaker/SpeakerTimeline.tsx'
import {
    computeSpeakerBadges,
    mergeSpeakerMatches,
    SpeakerMatch,
} from '@components/speaker/speakerData.ts'
import {
    loadSpeakerSettings,
    resolveSpeakerColors,
    saveSpeakerSettings,
    SpeakerSettings,
    SpeakerSettingsContext,
} from '@components/speaker/speakerSettings.ts'
import Throbber from '@components/Throbber.tsx'
import {useFetch} from '@utils/hooks.ts'
import {Link, useParams} from '@tanstack/react-router'
import {format} from 'date-fns'
import {useEffect, useMemo, useState} from 'react'
import {useTranslation} from 'react-i18next'

const FETCH_LIMIT = 500

type SpeakerTab = 'timeline' | 'program' | 'results'

const SpeakerBoardPage = () => {
    const {t} = useTranslation()
    const {eventId} = useParams({from: '/speaker/event/$eventId'})

    const [tab, setTab] = useState<SpeakerTab>('timeline')
    const [selectedMatch, setSelectedMatch] = useState<SpeakerMatch | null>(null)
    const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [fullscreen, setFullscreen] = useState(false)
    const [now, setNow] = useState(new Date())

    const [settings, setSettings] = useState<SpeakerSettings>(loadSpeakerSettings)
    const colors = useMemo(() => resolveSpeakerColors(settings), [settings])
    const updateSettings = (update: Partial<SpeakerSettings>) =>
        setSettings(previous => {
            const next = {...previous, ...update}
            saveSpeakerSettings(next)
            return next
        })

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 15000)
        return () => clearInterval(timer)
    }, [])

    useEffect(() => {
        const onFullscreenChange = () => setFullscreen(document.fullscreenElement != null)
        document.addEventListener('fullscreenchange', onFullscreenChange)
        return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
    }, [])

    const toggleFullscreen = () => {
        if (document.fullscreenElement) {
            document.exitFullscreen()
        } else {
            document.documentElement.requestFullscreen().catch(() => {})
        }
    }

    const {data: eventData} = useFetch(
        signal => getEvent({signal, path: {eventId}}),
        {deps: [eventId]},
    )

    const reloadInterval = settings.refreshSeconds * 1000

    const {data: upcomingData, reload: reloadUpcoming} = useFetch(
        signal => getUpcomingMatches({signal, path: {eventId}, query: {limit: FETCH_LIMIT}}),
        {deps: [eventId, reloadInterval], autoReloadInterval: reloadInterval},
    )

    const {data: runningData, reload: reloadRunning} = useFetch(
        signal => getRunningMatches({signal, path: {eventId}, query: {limit: FETCH_LIMIT}}),
        {deps: [eventId, reloadInterval], autoReloadInterval: reloadInterval},
    )

    const {data: resultsData, reload: reloadResults} = useFetch(
        signal => getLatestMatchResults({signal, path: {eventId}, query: {limit: FETCH_LIMIT}}),
        {deps: [eventId, reloadInterval], autoReloadInterval: reloadInterval},
    )

    const loaded = upcomingData != null || runningData != null || resultsData != null

    const matches = useMemo(
        () => mergeSpeakerMatches(upcomingData ?? [], runningData ?? [], resultsData ?? []),
        [upcomingData, runningData, resultsData],
    )

    const badges = useMemo(() => computeSpeakerBadges(matches), [matches])

    // keep the open dialog in sync with fresh data
    const dialogMatch = useMemo(
        () =>
            selectedMatch
                ? (matches.find(match => match.matchId === selectedMatch.matchId) ?? selectedMatch)
                : null,
        [selectedMatch, matches],
    )

    const reloadAll = () => {
        reloadUpcoming()
        reloadRunning()
        reloadResults()
    }

    const runningCount = matches.filter(match => match.status === 'RUNNING').length

    return (
        <SpeakerSettingsContext.Provider value={{settings, colors, updateSettings}}>
            <Box
            sx={{
                minHeight: '100vh',
                bgcolor: colors.background,
                color: colors.text,
                display: 'flex',
                flexDirection: 'column',
            }}>
            <Stack
                direction={'row'}
                alignItems={'center'}
                spacing={2}
                sx={{
                    px: 2,
                    py: 1,
                    borderBottom: `1px solid ${colors.border}`,
                    position: 'sticky',
                    top: 0,
                    bgcolor: colors.background,
                    zIndex: 10,
                }}>
                <Link to={'/speaker'}>
                    <IconButton sx={{color: colors.textSecondary}}>
                        <ArrowBackIcon />
                    </IconButton>
                </Link>
                <Box sx={{minWidth: 0}}>
                    <Typography variant={'h6'} noWrap fontWeight={'bold'}>
                        🎙️ {eventData?.name ?? t('speaker.title')}
                    </Typography>
                    <Typography variant={'caption'} sx={{color: colors.textSecondary}}>
                        {t('speaker.subtitle')}
                        {runningCount > 0 && (
                            <Typography
                                component={'span'}
                                variant={'caption'}
                                fontWeight={'bold'}
                                sx={{color: colors.running}}>
                                {' '}
                                · ● {t('speaker.liveCount', {count: runningCount})}
                            </Typography>
                        )}
                    </Typography>
                </Box>
                <Tabs
                    value={tab}
                    onChange={(_, value: SpeakerTab) => setTab(value)}
                    sx={{
                        mx: 'auto',
                        '& .MuiTab-root': {color: colors.textSecondary},
                        '& .Mui-selected': {color: `${colors.text} !important`},
                        '& .MuiTabs-indicator': {bgcolor: colors.upcoming},
                    }}>
                    <Tab value={'timeline'} label={t('speaker.tabs.timeline')} />
                    <Tab value={'program'} label={t('speaker.tabs.program')} />
                    <Tab value={'results'} label={t('speaker.tabs.results')} />
                </Tabs>
                <Typography
                    variant={'h6'}
                    fontWeight={'bold'}
                    sx={{fontVariantNumeric: 'tabular-nums'}}>
                    {format(now, t('format.time'))}
                </Typography>
                <IconButton onClick={reloadAll} sx={{color: colors.textSecondary}}>
                    <RefreshIcon />
                </IconButton>
                <IconButton
                    onClick={() => setSettingsOpen(true)}
                    sx={{color: colors.textSecondary}}>
                    <SettingsIcon />
                </IconButton>
                <IconButton onClick={toggleFullscreen} sx={{color: colors.textSecondary}}>
                    {fullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
                </IconButton>
            </Stack>
            <Box sx={{flex: 1, p: 2, zoom: settings.scalePercent / 100}}>
                {!loaded ? (
                    <Throbber />
                ) : (
                    <>
                        {tab === 'timeline' && (
                            <SpeakerTimeline
                                matches={matches}
                                badges={badges}
                                now={now}
                                onSelectMatch={setSelectedMatch}
                            />
                        )}
                        {tab === 'program' && (
                            <SpeakerProgramTable
                                matches={matches}
                                badges={badges}
                                onSelectMatch={setSelectedMatch}
                                onSelectParticipant={setSelectedParticipantId}
                            />
                        )}
                        {tab === 'results' && (
                            <SpeakerResultsList
                                matches={matches}
                                badges={badges}
                                onSelectMatch={setSelectedMatch}
                                onSelectParticipant={setSelectedParticipantId}
                            />
                        )}
                    </>
                )}
            </Box>
            <SpeakerMatchDialog
                match={dialogMatch}
                badges={badges}
                onClose={() => setSelectedMatch(null)}
                onSelectParticipant={setSelectedParticipantId}
            />
            <SpeakerParticipantDialog
                participantId={selectedParticipantId}
                badges={badges}
                now={now}
                onClose={() => setSelectedParticipantId(null)}
                onSelectMatch={setSelectedMatch}
            />
            <SpeakerSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
            </Box>
        </SpeakerSettingsContext.Provider>
    )
}

export default SpeakerBoardPage
