import {Box, IconButton, Stack, Tab, Tabs, Typography} from '@mui/material'
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import RefreshIcon from '@mui/icons-material/Refresh'
import {getEvent, getLatestMatchResults, getRunningMatches, getUpcomingMatches} from '@api/sdk.gen.ts'
import SpeakerMatchDialog from '@components/speaker/SpeakerMatchDialog.tsx'
import SpeakerProgramTable from '@components/speaker/SpeakerProgramTable.tsx'
import SpeakerResultsList from '@components/speaker/SpeakerResultsList.tsx'
import SpeakerTimeline from '@components/speaker/SpeakerTimeline.tsx'
import {
    computeSpeakerBadges,
    mergeSpeakerMatches,
    SpeakerMatch,
    speakerColors,
} from '@components/speaker/speakerData.ts'
import Throbber from '@components/Throbber.tsx'
import {useFetch} from '@utils/hooks.ts'
import {Link, useParams} from '@tanstack/react-router'
import {format} from 'date-fns'
import {useEffect, useMemo, useState} from 'react'
import {useTranslation} from 'react-i18next'

const RELOAD_INTERVAL = 20000
const FETCH_LIMIT = 500

type SpeakerTab = 'timeline' | 'program' | 'results'

const SpeakerBoardPage = () => {
    const {t} = useTranslation()
    const {eventId} = useParams({from: '/speaker/event/$eventId'})

    const [tab, setTab] = useState<SpeakerTab>('timeline')
    const [selectedMatch, setSelectedMatch] = useState<SpeakerMatch | null>(null)
    const [fullscreen, setFullscreen] = useState(false)
    const [now, setNow] = useState(new Date())

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

    const {data: upcomingData, reload: reloadUpcoming} = useFetch(
        signal => getUpcomingMatches({signal, path: {eventId}, query: {limit: FETCH_LIMIT}}),
        {deps: [eventId], autoReloadInterval: RELOAD_INTERVAL},
    )

    const {data: runningData, reload: reloadRunning} = useFetch(
        signal => getRunningMatches({signal, path: {eventId}, query: {limit: FETCH_LIMIT}}),
        {deps: [eventId], autoReloadInterval: RELOAD_INTERVAL},
    )

    const {data: resultsData, reload: reloadResults} = useFetch(
        signal => getLatestMatchResults({signal, path: {eventId}, query: {limit: FETCH_LIMIT}}),
        {deps: [eventId], autoReloadInterval: RELOAD_INTERVAL},
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
        <Box
            sx={{
                minHeight: '100vh',
                bgcolor: speakerColors.background,
                color: speakerColors.text,
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
                    borderBottom: `1px solid ${speakerColors.border}`,
                    position: 'sticky',
                    top: 0,
                    bgcolor: speakerColors.background,
                    zIndex: 10,
                }}>
                <Link to={'/speaker'}>
                    <IconButton sx={{color: speakerColors.textSecondary}}>
                        <ArrowBackIcon />
                    </IconButton>
                </Link>
                <Box sx={{minWidth: 0}}>
                    <Typography variant={'h6'} noWrap fontWeight={'bold'}>
                        🎙️ {eventData?.name ?? t('speaker.title')}
                    </Typography>
                    <Typography variant={'caption'} sx={{color: speakerColors.textSecondary}}>
                        {t('speaker.subtitle')}
                        {runningCount > 0 && (
                            <Typography
                                component={'span'}
                                variant={'caption'}
                                fontWeight={'bold'}
                                sx={{color: speakerColors.running}}>
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
                        '& .MuiTab-root': {color: speakerColors.textSecondary},
                        '& .Mui-selected': {color: `${speakerColors.text} !important`},
                        '& .MuiTabs-indicator': {bgcolor: speakerColors.upcoming},
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
                <IconButton onClick={reloadAll} sx={{color: speakerColors.textSecondary}}>
                    <RefreshIcon />
                </IconButton>
                <IconButton onClick={toggleFullscreen} sx={{color: speakerColors.textSecondary}}>
                    {fullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
                </IconButton>
            </Stack>
            <Box sx={{flex: 1, p: 2}}>
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
                            />
                        )}
                        {tab === 'results' && (
                            <SpeakerResultsList
                                matches={matches}
                                badges={badges}
                                onSelectMatch={setSelectedMatch}
                            />
                        )}
                    </>
                )}
            </Box>
            <SpeakerMatchDialog
                match={dialogMatch}
                badges={badges}
                onClose={() => setSelectedMatch(null)}
            />
        </Box>
    )
}

export default SpeakerBoardPage
