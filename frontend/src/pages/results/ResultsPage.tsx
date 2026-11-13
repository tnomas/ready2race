import MatchResults from '@components/results/MatchResults.tsx'
import {Box, Card, IconButton, Tab, Tabs, useMediaQuery, useTheme} from '@mui/material'
import {a11yProps} from '@utils/helpers.ts'
import {ReactElement, useState} from 'react'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import {EventAvailable, LocationOn} from '@mui/icons-material'
import {format} from 'date-fns'
import TabPanel from '@components/tab/TabPanel.tsx'
import CellTowerOutlinedIcon from '@mui/icons-material/CellTowerOutlined'
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined'
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined'
import PersonIcon from '@mui/icons-material/Person'
import PercentIcon from '@mui/icons-material/Percent'
import PersonPinIcon from '@mui/icons-material/PersonPin'
import {resultsEventRoute} from '@routes'
import ResultsLiveMatches from '@components/results/ResultsLiveMatches.tsx'
import {useTranslation} from 'react-i18next'
import {CompetitionChoiceDto} from '@api/types.gen.ts'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import {getEvent, getPublicProgram} from '@api/sdk.gen.ts'
import ResultsProgram from '@components/results/ResultsProgram.tsx'
import {useNavigate} from '@tanstack/react-router'
import {ErrorState, IconButtonLink, LoadingState} from '@components/ui'
import PublicPageHeader, {PublicMetaItem} from '@components/results/PublicPageHeader.tsx'
import ResultsClubRanking from '@components/results/ResultsClubRanking.tsx'
import ResultsIndividualRanking from '@components/results/ResultsIndividualRanking.tsx'
import {MyEventPanel} from '@components/results/myEvent/MyEventPanel.tsx'
import {initialResultsTab, ResultsTab} from './resultsTab.ts'
import {formatEventDateRange} from './publicEventsLogic.ts'

export type ChallengeResultsTab = 'club' | 'individual' | 'relative'

const ResultsPage = () => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const {eventId} = resultsEventRoute.useParams()
    const navigate = useNavigate()

    const [competitionSelected, setCompetitionSelected] = useState<CompetitionChoiceDto | null>(
        null,
    )

    // Der gewählte Wettkampf spiegelt sich in der Adresse (?competition=…), damit ein Link auf
    // einen Wettkampf teilbar ist — dieselbe Idee wie ?tab=… für die QR-Aushänge. replace statt
    // push: der Zurück-Knopf soll die Seite verlassen, nicht durch jede Wettkampfwahl zurücklaufen.
    const selectCompetition = (value: CompetitionChoiceDto | null) => {
        setCompetitionSelected(value)
        void navigate({
            to: '.',
            search: prev => ({...prev, competition: value?.id}),
            replace: true,
        })
    }

    // Direkteinstieg über die URL (siehe resultsTab.ts): Der QR-Einstieg leitet mit
    // ?tab=my-event weiter, QR-Aushänge zeigen mit ?tab=live direkt auf den Live-Reiter, und
    // ?tab=results ist das ausgeschriebene Default-Ziel.
    const {tab: tabFromSearch, competition: competitionFromSearch} = resultsEventRoute.useSearch()
    const [activeResultsTab, setActiveResultsTab] = useState<ResultsTab>(
        initialResultsTab(tabFromSearch),
    )
    const switchResultsTab = (tab: ResultsTab) => {
        selectCompetition(null)
        setActiveResultsTab(tab)
    }

    const [activeChallengeTab, setActiveChallengeTab] = useState<ChallengeResultsTab>('club')
    const switchChallengeTab = (tab: ChallengeResultsTab) => {
        selectCompetition(null)
        setActiveChallengeTab(tab)
    }

    const {data: programData} = useFetch(signal => getPublicProgram({signal, path: {eventId}}), {
        deps: [eventId],
    })
    const hasProgram = (programData?.length ?? 0) > 0
    // Solange das Programm noch lädt (oder es keines gibt), existiert der Zeitplan-Reiter nicht —
    // ein ?tab=schedule-Einstieg fällt dann sauber auf die Ergebnisse zurück, statt die Tabs auf
    // einen nicht gerenderten Wert zu stellen.
    const effectiveResultsTab: ResultsTab =
        activeResultsTab === 'schedule' && !hasProgram ? 'latest-results' : activeResultsTab

    const {
        data: eventData,
        pending: eventPending,
        reload: reloadEvent,
    } = useFetch(
        signal =>
            getEvent({
                signal,
                path: {eventId: eventId},
            }),
        {
            onResponse: ({error}) => {
                if (error)
                    feedback.error(
                        t('common.load.error.single', {
                            entity: t('event.event'),
                        }),
                    )
            },
            deps: [eventId],
        },
    )

    const dateRange = eventData
        ? formatEventDateRange({from: eventData.firstEventDay, to: eventData.lastEventDay}, date =>
              format(date, t('format.date')),
          )
        : null

    if (eventPending && !eventData) {
        return <LoadingState variant={'page'} />
    }
    if (!eventData) {
        return (
            <>
                <PublicPageHeader
                    back={
                        <IconButtonLink to={'/results'} aria-label={t('results.page.allEvents')}>
                            <ArrowBackIcon />
                        </IconButtonLink>
                    }
                    title={t('landing.liveEventsLink')}
                />
                <Card>
                    <ErrorState onRetry={reloadEvent} />
                </Card>
            </>
        )
    }

    const resultsTabs: ResultsTabItem<ResultsTab>[] = [
        {
            value: 'latest-results',
            label: t('results.tabs.results'),
            icon: <EmojiEventsOutlinedIcon />,
        },
        {value: 'live', label: t('results.tabs.live'), icon: <CellTowerOutlinedIcon />},
        ...(hasProgram
            ? [
                  {
                      value: 'schedule' as const,
                      label: t('results.tabs.schedule'),
                      icon: <CalendarMonthOutlinedIcon />,
                  },
              ]
            : []),
        {value: 'my-event', label: t('myEvent.tab'), icon: <PersonPinIcon />},
    ]
    const challengeTabs: ResultsTabItem<ChallengeResultsTab>[] = [
        {value: 'club', label: t('results.challengeTabs.club'), icon: <EmojiEventsOutlinedIcon />},
        {value: 'relative', label: t('results.challengeTabs.relative'), icon: <PercentIcon />},
        {value: 'individual', label: t('results.challengeTabs.individual'), icon: <PersonIcon />},
    ]

    return (
        <>
            <PublicPageHeader
                back={
                    competitionSelected !== null ? (
                        <IconButton
                            onClick={() => selectCompetition(null)}
                            aria-label={t('results.page.allCompetitions')}>
                            <ArrowBackIcon />
                        </IconButton>
                    ) : (
                        <IconButtonLink to={'/results'} aria-label={t('results.page.allEvents')}>
                            <ArrowBackIcon />
                        </IconButtonLink>
                    )
                }
                overline={t('results.page.overline')}
                title={eventData.name}
                meta={
                    (dateRange || eventData.location) && (
                        <>
                            {dateRange && (
                                <PublicMetaItem icon={<EventAvailable />}>
                                    {dateRange}
                                </PublicMetaItem>
                            )}
                            {eventData.location && (
                                <PublicMetaItem icon={<LocationOn />}>
                                    {eventData.location}
                                </PublicMetaItem>
                            )}
                        </>
                    )
                }
            />
            {!eventData.challengeEvent ? (
                <>
                    {/* Neu aufbauen, sobald der Zeitplan-Reiter erscheint: sonst bleibt der
                        Unterstrich unter dem Reiter stehen, der vor dem Nachladen aktiv war. */}
                    <ResultsTabBar
                        key={hasProgram ? 'with-schedule' : 'without-schedule'}
                        name={'results'}
                        tabs={resultsTabs}
                        active={effectiveResultsTab}
                        onChange={switchResultsTab}
                        label={t('results.page.views')}
                    />
                    <TabPanel index={'latest-results'} activeTab={effectiveResultsTab}>
                        <MatchResults
                            eventId={eventId}
                            competitionSelected={competitionSelected}
                            setCompetitionSelected={selectCompetition}
                            initialCompetitionId={competitionFromSearch}
                            notice={eventData.notice}
                        />
                    </TabPanel>
                    <TabPanel index={'live'} activeTab={effectiveResultsTab}>
                        <ResultsLiveMatches eventId={eventId} />
                    </TabPanel>
                    {hasProgram && (
                        <TabPanel index={'schedule'} activeTab={effectiveResultsTab}>
                            <ResultsProgram eventId={eventId} />
                        </TabPanel>
                    )}
                    <TabPanel index={'my-event'} activeTab={effectiveResultsTab}>
                        <MyEventPanel eventId={eventId} />
                    </TabPanel>
                </>
            ) : (
                <>
                    <ResultsTabBar
                        name={'challengeResults'}
                        tabs={challengeTabs}
                        active={activeChallengeTab}
                        onChange={switchChallengeTab}
                        label={t('results.page.views')}
                    />
                    <TabPanel index={'club'} activeTab={activeChallengeTab}>
                        <ResultsClubRanking eventData={eventData} totalRanking={true} />
                    </TabPanel>
                    <TabPanel index={'relative'} activeTab={activeChallengeTab}>
                        <ResultsClubRanking eventData={eventData} totalRanking={false} />
                    </TabPanel>
                    <TabPanel index={'individual'} activeTab={activeChallengeTab}>
                        <ResultsIndividualRanking eventData={eventData} />
                    </TabPanel>
                </>
            )}
        </>
    )
}

type ResultsTabItem<T extends string> = {value: T; label: string; icon: ReactElement}

/**
 * Reiterleiste der Ergebnisseite: gleich breite Reiter, die auch bei 390 px alle vier ohne
 * Scrollen zeigen (vorher lief „Mein Event" aus dem Bild). Klebt beim Scrollen oben, damit der
 * Wechsel zwischen Ergebnissen und Live auf langen Listen nicht erst nach oben führt.
 */
const ResultsTabBar = <T extends string>({
    name,
    tabs,
    active,
    onChange,
    label,
}: {
    name: string
    tabs: ResultsTabItem<T>[]
    active: T
    onChange: (tab: T) => void
    label: string
}) => {
    const theme = useTheme()
    const small = useMediaQuery(theme.breakpoints.down('sm'))
    return (
        <Box
            sx={{
                position: 'sticky',
                top: 0,
                zIndex: theme.zIndex.appBar,
                bgcolor: 'canvas',
                mx: {xs: -2, sm: 0},
                px: {xs: 1, sm: 0},
                mb: 2,
                borderBottom: 1,
                borderColor: 'divider',
            }}>
            <Tabs
                value={active}
                onChange={(_, value: T) => onChange(value)}
                variant={'fullWidth'}
                aria-label={label}>
                {tabs.map(tab => (
                    <Tab
                        key={tab.value}
                        label={tab.label}
                        icon={tab.icon}
                        iconPosition={small ? 'top' : 'start'}
                        sx={{
                            minWidth: 0,
                            minHeight: small ? 60 : 52,
                            px: {xs: 0.5, sm: 2},
                            fontSize: {xs: '0.8125rem', sm: '0.9375rem'},
                            lineHeight: 1.2,
                            cursor: 'pointer',
                        }}
                        {...a11yProps(name, tab.value)}
                    />
                ))}
            </Tabs>
        </Box>
    )
}

export default ResultsPage
