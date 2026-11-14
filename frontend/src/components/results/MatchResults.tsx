import {useFeedback, useFetch} from '@utils/hooks.ts'
import {getCompetitionsHavingResults, getLatestMatchResults} from '@api/sdk.gen.ts'
import {Box, Button, Card, CardActionArea, Chip, Divider, Stack, Typography} from '@mui/material'
import {alpha} from '@mui/material/styles'
import {ArrowBack, ChevronRight, EmojiEventsOutlined} from '@mui/icons-material'
import {EmptyState, LoadingState, SectionHeader} from '@components/ui'
import {primaryTextColor} from '../../theme/themeColors.ts'
import {useTranslation} from 'react-i18next'
import {useEffect, useState} from 'react'
import {CompetitionChoiceDto, EventNoticeDto, LatestMatchResultInfo} from '@api/types.gen.ts'
import ResultsMatchDialog from '@components/results/ResultsMatchDialog.tsx'
import ResultsMatchCard from '@components/results/ResultsMatchCard.tsx'
import EventNoticeBanner from '@components/eventNotice/EventNoticeBanner.tsx'
import TimingProviderAttribution from '@components/results/TimingProviderAttribution.tsx'

type Props = {
    eventId: string
    competitionSelected: CompetitionChoiceDto | null
    setCompetitionSelected: (value: CompetitionChoiceDto | null) => void
    /**
     * Wettkampf-Id aus der Adresse (?competition=…): sobald die Wettkampfliste da ist, wird
     * die passende Auswahl gesetzt — so ist ein Link auf einen Wettkampf teilbar. Eine
     * unbekannte Id läuft ins Leere und die Seite startet mit der Übersicht.
     */
    initialCompetitionId?: string
    /**
     * Der veranstaltungsweite Hinweis aus dem EventDto der Seite. Dieser Tab pollt nicht —
     * der Banner ist so aktuell wie der Rest des Tabs (Stand des Seitenaufrufs); live
     * nachgezogen wird er auf dem Live-Tab und in "Mein Event".
     */
    notice?: EventNoticeDto | null
}

const MatchResults = ({
    eventId,
    competitionSelected,
    setCompetitionSelected,
    initialCompetitionId,
    notice,
}: Props) => {
    const matchesLimit = 100 // todo

    const {t} = useTranslation()
    const feedback = useFeedback()

    const {data: competitionsData, pending: competitionsPending} = useFetch(
        signal =>
            getCompetitionsHavingResults({
                signal,
                path: {eventId},
            }),
        {
            onResponse: response => {
                if (response.error) {
                    feedback.error(
                        t('common.load.error.multiple.short', {
                            entity: t('event.competition.competitions'),
                        }),
                    )
                }
            },
            deps: [eventId],
        },
    )

    const onClickCompetition = (competition: CompetitionChoiceDto) => {
        setCompetitionSelected(competition)
    }

    // Direkteinstieg aus der Adresse: genau einmal beim Eintreffen der Liste, danach gehört
    // die Auswahl wieder der Bedienung (sonst käme nach „zurück zur Übersicht" die Vorwahl wieder).
    const [initialApplied, setInitialApplied] = useState(false)
    useEffect(() => {
        if (initialApplied || !competitionsData) return
        setInitialApplied(true)
        if (initialCompetitionId && !competitionSelected) {
            const match = competitionsData.data.find(c => c.id === initialCompetitionId)
            if (match) {
                setCompetitionSelected(match)
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [competitionsData])

    // „Zuletzt beendet": die frischesten Ergebnisse quer über alle Wettkämpfe, als Einstieg
    // ohne Wettkampfwahl — wer nur wissen will, was gerade reingekommen ist, muss sich nicht
    // durch die Liste klicken. Der Endpoint ist derselbe, nur ohne competitionId.
    const latestLimit = 8
    const {data: latestData} = useFetch(
        signal =>
            getLatestMatchResults({
                signal,
                path: {eventId},
                query: {limit: latestLimit},
            }),
        {
            preCondition: () => competitionSelected === null,
            deps: [eventId, competitionSelected],
        },
    )

    const {data: matchResultsData, pending: matchResultsPending} = useFetch(
        signal =>
            getLatestMatchResults({
                signal,
                path: {eventId},
                query: {
                    limit: matchesLimit,
                    competitionId: competitionSelected?.id,
                },
            }),
        {
            preCondition: () => competitionSelected !== null,
            onResponse: response => {
                if (response.error) {
                    feedback.error(
                        t('common.load.error.multiple.short', {
                            entity: t('results.matchResults.matchResults'),
                        }),
                    )
                }
            },
            deps: [eventId, competitionSelected, competitionsData, matchesLimit],
        },
    )

    const [dialogOpen, setDialogOpen] = useState(false)
    const [matchSelected, setMatchSelected] = useState<LatestMatchResultInfo | null>(null)
    const onClickMatch = (match: LatestMatchResultInfo) => {
        setDialogOpen(true)
        setMatchSelected(match)
    }
    const closeDialog = () => {
        setDialogOpen(false)
        setMatchSelected(null)
    }

    return (
        <>
            <Stack spacing={2}>
                <EventNoticeBanner notice={notice} />
                {competitionsPending || (competitionSelected && matchResultsPending) ? (
                    <LoadingState variant={'section'} />
                ) : !competitionSelected ? (
                    competitionsData?.data.length === 0 ? (
                        <Card>
                            <EmptyState
                                icon={<EmojiEventsOutlined />}
                                title={t('results.matchResults.noResultsEvent')}
                            />
                        </Card>
                    ) : (
                        <Stack spacing={4}>
                            {(latestData?.length ?? 0) > 0 && (
                                <Box component={'section'}>
                                    <SectionHeader
                                        title={t('results.matchResults.latestSection')}
                                    />
                                    <Stack spacing={1.5}>
                                        {latestData
                                            ?.slice()
                                            .sort((a, b) =>
                                                (a.startTime ?? '') > (b.startTime ?? '') ? -1 : 1,
                                            )
                                            .map(match => (
                                                <ResultsMatchCard
                                                    match={match}
                                                    selectMatch={onClickMatch}
                                                    key={match.matchId}
                                                    competition={{
                                                        competitionName: match.competitionName,
                                                        competitionCategory:
                                                            match.categoryName ?? undefined,
                                                    }}
                                                />
                                            ))}
                                    </Stack>
                                </Box>
                            )}
                            <Box component={'section'}>
                                <SectionHeader
                                    title={t('results.matchResults.byCompetitionSection')}
                                />
                                {/* Eine Karte mit Zeilen statt einer Karte je Wettkampf: die
                                    Liste lässt sich wie ein Aushang überfliegen, die Kennung
                                    steht als feste Spalte vorn. */}
                                <Card>
                                    {competitionsData?.data.map((competition, index) => (
                                        <Box key={competition.id}>
                                            {index > 0 && <Divider />}
                                            <CardActionArea
                                                onClick={() => onClickCompetition(competition)}
                                                sx={{cursor: 'pointer'}}>
                                                <CompetitionLine competition={competition} />
                                            </CardActionArea>
                                        </Box>
                                    ))}
                                </Card>
                            </Box>
                        </Stack>
                    )
                ) : (
                    <>
                        <Box>
                            <Button
                                size={'small'}
                                startIcon={<ArrowBack />}
                                onClick={() => setCompetitionSelected(null)}
                                sx={{ml: -1, mb: 1}}>
                                {t('results.page.allCompetitions')}
                            </Button>
                            {/* Überschrift des gewählten Wettkampfs: vorher ein Chip, der auf dem
                                Telefon nicht umbrach und lange Namen abschnitt. */}
                            <Box
                                sx={{
                                    display: 'flex',
                                    columnGap: 1.5,
                                    rowGap: 0.5,
                                    flexWrap: 'wrap',
                                    alignItems: 'center',
                                }}>
                                <IdentifierBadge identifier={competitionSelected.identifier} />
                                <Typography
                                    variant={'h2'}
                                    sx={{minWidth: 0, overflowWrap: 'anywhere'}}>
                                    {competitionSelected.name}
                                </Typography>
                                {competitionSelected.category && (
                                    <Chip
                                        label={competitionSelected.category}
                                        color="primary"
                                        variant="outlined"
                                        size="small"
                                    />
                                )}
                            </Box>
                        </Box>
                        {matchResultsData?.length === 0 ? (
                            <Card>
                                <EmptyState
                                    icon={<EmojiEventsOutlined />}
                                    title={t('results.matchResults.noResults')}
                                />
                            </Card>
                        ) : (
                            <>
                                {matchResultsData
                                    ?.sort((a, b) =>
                                        (a.startTime ?? '') > (b.startTime ?? '') ? -1 : 1,
                                    )
                                    .map(match => (
                                        <ResultsMatchCard
                                            match={match}
                                            selectMatch={onClickMatch}
                                            key={match.matchId}
                                        />
                                    ))}
                                <TimingProviderAttribution matches={matchResultsData ?? []} />
                            </>
                        )}
                    </>
                )}
            </Stack>
            <ResultsMatchDialog
                match={matchSelected}
                dialogOpen={dialogOpen}
                closeDialog={closeDialog}
            />
        </>
    )
}

/** Die Kennung (Rennnummer) als feste, gleich breite Marke vor dem Namen. */
const IdentifierBadge = ({identifier}: {identifier: string}) => (
    <Box
        component={'span'}
        sx={theme => ({
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '2.5rem',
            height: '1.75rem',
            px: 1,
            borderRadius: 1,
            bgcolor: alpha(theme.palette.primary.main, 0.1),
            color: primaryTextColor(theme),
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            flexShrink: 0,
        })}>
        {identifier}
    </Box>
)

const CompetitionLine = ({competition}: {competition: CompetitionChoiceDto}) => (
    <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5, px: {xs: 2, sm: 2.5}, py: 1.75}}>
        <IdentifierBadge identifier={competition.identifier} />
        <Box
            sx={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                columnGap: 1,
                rowGap: 0.5,
                flexWrap: 'wrap',
                alignItems: 'center',
            }}>
            <Typography sx={{fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere'}}>
                {competition.name}
            </Typography>
            {competition.category && (
                <Chip
                    label={competition.category}
                    color="primary"
                    variant="outlined"
                    size="small"
                />
            )}
        </Box>
        <ChevronRight aria-hidden sx={{color: 'text.secondary', flexShrink: 0}} />
    </Box>
)

export default MatchResults
