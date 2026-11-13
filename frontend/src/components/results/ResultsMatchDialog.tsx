import {
    Box,
    Button,
    Chip,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    Typography,
    useMediaQuery,
    useTheme,
} from '@mui/material'
import {alpha} from '@mui/material/styles'
import StatusChip from '@components/event/match/StatusChip.tsx'
import {primaryTextColor, statusTextColor} from '../../theme/themeColors.ts'
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined'
import {format} from 'date-fns'
import BaseDialog from '@components/BaseDialog.tsx'
import {useTranslation} from 'react-i18next'
import {ResultsMatchInfo} from '@components/results/ResultsMatchCard.tsx'

import {sortByPlaces, compareNullsHigh} from '@utils/helpers.ts'
import {groupByRatingCategory, hasRatingCategories} from '@utils/ratingCategorySections.ts'
import {failedLabel} from '@utils/matchResultStatus.ts'
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined'
import TimingProviderAttribution from '@components/results/TimingProviderAttribution.tsx'

type Props<M extends ResultsMatchInfo> = {
    match: M | null
    dialogOpen: boolean
    closeDialog: () => void
}

const ResultsMatchDialog = <M extends ResultsMatchInfo>({
    match,
    dialogOpen,
    closeDialog,
}: Props<M>) => {
    const {t} = useTranslation()
    const theme = useTheme()

    const smallScreenLayout = useMediaQuery(`(max-width:${theme.breakpoints.values.sm}px)`)

    // Der Dialog bedient zwei Formen: das Ergebnis eines gefahrenen Laufs und den laufenden Lauf.
    // Ohne die gemeinsame Annotation bliebe hier eine Vereinigung zweier Listen stehen, die sich
    // nicht am Stück gruppieren lässt.
    const sortedTeams: ResultsMatchInfo['teams'][number][] = match
        ? 'executionOrder' in match
            ? match.teams.slice().sort((a, b) => compareNullsHigh(a.startNumber, b.startNumber))
            : sortByPlaces(match.teams)
        : []

    // Ergebnisse werden je Wertungskategorie getrennt gezeigt und je Abschnitt ab 1 gezählt. Ein
    // Lauf ohne Kategorien liefert genau einen namenlosen Abschnitt - dann bleibt die Anzeige die
    // gewohnte gemeinsame Liste, ohne Überschrift.
    const sections = groupByRatingCategory(sortedTeams, team =>
        'ratingCategory' in team ? team.ratingCategory : null,
    )
    const showSectionHeadings = hasRatingCategories(sections)
    // Der Vorbehalt am veröffentlichten Ergebnis, wie auf der Karte (siehe ResultsMatchCard).
    const provisional = match !== null && 'clarification' in match && match.clarification === true

    return (
        <BaseDialog
            open={dialogOpen}
            onClose={closeDialog}
            fullScreen={smallScreenLayout}
            maxWidth={!smallScreenLayout ? 'md' : undefined}>
            {match && (
                <>
                    <DialogTitle sx={{pr: 7}}>
                        <Stack spacing={0.5}>
                            <Typography
                                variant={'h2'}
                                component={'span'}
                                sx={{overflowWrap: 'anywhere'}}>
                                {match.competitionName}
                            </Typography>
                            {/* Ein Laufname, der nur die Runde wiederholt („Zeitfahren"),
                                erscheint nicht doppelt. */}
                            <Typography
                                component={'span'}
                                color={'text.secondary'}
                                sx={{overflowWrap: 'anywhere'}}>
                                {[
                                    match.roundName,
                                    match.matchName !== match.roundName ? match.matchName : null,
                                ]
                                    .filter(Boolean)
                                    .join(' · ')}
                            </Typography>
                            {(match.categoryName || provisional) && (
                                <Stack direction={'row'} spacing={1} sx={{flexWrap: 'wrap'}}>
                                    {match.categoryName && (
                                        <Chip
                                            label={match.categoryName}
                                            variant={'outlined'}
                                            color={'primary'}
                                            size={'small'}
                                        />
                                    )}
                                    <StatusChip
                                        chip={
                                            provisional
                                                ? {
                                                      labelKey: 'event.match.status.provisional',
                                                      color: 'warning',
                                                  }
                                                : null
                                        }
                                    />
                                </Stack>
                            )}
                        </Stack>
                    </DialogTitle>
                    <DialogContent>
                        <Stack spacing={3}>
                            {/* Uhrzeit und Nennung der Zeitnahme in einer Zeile, gleich zu Anfang:
                                Wer die Zeiten gemessen hat, gehört zur Zeitangabe und nicht in eine
                                Fußzeile, die erst nach dem Durchblättern aller Boote auftaucht.
                                Auf schmalen Anzeigen bricht die Nennung in die zweite Zeile um. */}
                            {(match.startTime || 'timingProviderName' in match) && (
                                <Stack
                                    direction={'row'}
                                    spacing={2}
                                    alignItems={'center'}
                                    flexWrap={'wrap'}
                                    useFlexGap>
                                    {match.startTime && (
                                        <Stack direction={'row'} spacing={1} alignItems={'center'}>
                                            <ScheduleOutlinedIcon color={'primary'} />
                                            <Typography>
                                                {format(
                                                    new Date(match.startTime),
                                                    t('format.datetime'),
                                                )}
                                            </Typography>
                                        </Stack>
                                    )}
                                    {'timingProviderName' in match && (
                                        <TimingProviderAttribution matches={[match]} inline />
                                    )}
                                </Stack>
                            )}
                            {sections.map(section => (
                                <Box component={'section'} key={section.category?.id ?? 'none'}>
                                    {showSectionHeadings && (
                                        <Typography variant={'h3'} sx={{mb: 1}}>
                                            {section.category?.name ??
                                                t('event.ratingCategory.withoutCategory')}
                                        </Typography>
                                    )}
                                    <RankingHeader />
                                    {section.entries.map(team => (
                                        <TeamRow key={team.teamId} team={team} />
                                    ))}
                                </Box>
                            ))}
                        </Stack>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={closeDialog}>{t('common.close')}</Button>
                    </DialogActions>
                </>
            )}
        </BaseDialog>
    )
}

type Team = ResultsMatchInfo['teams'][number]
type Participant = Team['participants'][number]

/**
 * Raster der Ergebniszeilen. Telefon: Platz | Mannschaft | Zeit, Besatzung darunter über die
 * volle Breite. Ab md eine echte Tabelle: Platz | Mannschaft | Besatzung | Zeit mit Kopfzeile.
 */
const rowGrid = {
    display: 'grid',
    gridTemplateColumns: {
        xs: '3rem minmax(0, 1fr) auto',
        md: '3.5rem minmax(0, 1.1fr) minmax(0, 1.4fr) 7rem',
    },
    columnGap: {xs: 1.5, md: 2.5},
    rowGap: 0.75,
} as const

const RankingHeader = () => {
    const {t} = useTranslation()
    return (
        <Box
            aria-hidden
            sx={{
                ...rowGrid,
                display: {xs: 'none', md: 'grid'},
                pb: 1,
                borderBottom: 1,
                borderColor: 'divider',
                '& > *': {
                    typography: 'overline',
                    color: 'text.secondary',
                    lineHeight: 1.4,
                },
            }}>
            <Box>{t('results.ranking.place')}</Box>
            <Box>{t('results.ranking.team')}</Box>
            <Box>{t('results.ranking.crew')}</Box>
            <Box sx={{textAlign: 'right'}}>{t('results.ranking.time')}</Box>
        </Box>
    )
}

const compareParticipants = (a: Participant, b: Participant) =>
    a.namedRole === b.namedRole
        ? a.firstName === b.firstName
            ? a.lastName > b.lastName
                ? 1
                : -1
            : a.firstName > b.firstName
              ? 1
              : -1
        : (a.namedRole ?? '') > (b.namedRole ?? '')
          ? 1
          : -1

const TeamRow = ({team}: {team: Team}) => {
    const {t} = useTranslation()
    // Unterscheidet die Ergebnis-Mannschaft von der eines laufenden Laufs. Bewusst an
    // `deregistered`: Zeit, Zeitstrafe und `failed` trägt inzwischen auch die laufende
    // Mannschaft (Teilergebnisse).
    const result = 'deregistered' in team ? team : null
    // Gezeigt wird der Platz innerhalb der Wertungskategorie; team.place bleibt der Platz im
    // Lauf und ist nur seine Grundlage. Als Ordnungszahl, damit er nicht wie eine Startnummer liest.
    const place = result?.categoryPlace ?? null
    const statusText = result
        ? result.failed
            ? failedLabel(result.failedReason, t('event.competition.execution.results.failed'))
            : result.deregistered
              ? t('event.competition.registration.deregister.deregistered') +
                (result.deregisteredReason ? ` (${result.deregisteredReason})` : '')
              : null
        : null
    const time = result && !result.failed ? result.timeString : null

    return (
        <Box
            sx={{
                ...rowGrid,
                py: 1.5,
                borderBottom: 1,
                borderColor: 'divider',
                '&:last-of-type': {borderBottom: 0},
                alignItems: 'start',
            }}>
            {/* Platz; ohne Platz (laufender Lauf) die Startnummer, klar beschriftet */}
            <Box sx={{gridRow: {xs: 'span 2', md: 'auto'}}}>
                {place ? (
                    <PlaceBadge place={place} />
                ) : !statusText && 'startNumber' in team && team.startNumber != null ? (
                    <Box>
                        <Typography variant={'caption'} color={'text.secondary'} component={'p'}>
                            {t('results.ranking.startNumber')}
                        </Typography>
                        <Typography sx={{fontWeight: 700, fontVariantNumeric: 'tabular-nums'}}>
                            {team.startNumber}
                        </Typography>
                    </Box>
                ) : (
                    <Typography color={'text.secondary'} aria-hidden>
                        –
                    </Typography>
                )}
            </Box>
            <Box sx={{minWidth: 0}}>
                <Typography sx={{fontWeight: 600, overflowWrap: 'anywhere'}}>
                    {team.clubsFull ?? team.clubName}
                </Typography>
                <Typography
                    variant={'body2'}
                    color={'text.secondary'}
                    sx={{overflowWrap: 'anywhere'}}>
                    {[t('club.registeredBy') + ' ' + team.clubName, team.teamName]
                        .filter(Boolean)
                        .join(' | ')}
                </Typography>
                {statusText && (
                    <Typography variant={'body2'} sx={{fontWeight: 600, mt: 0.25}}>
                        {statusText}
                    </Typography>
                )}
                {result && result.penaltySeconds != null && (
                    <Typography
                        variant={'body2'}
                        sx={{color: theme => statusTextColor(theme, 'warning'), mt: 0.25}}>
                        {t('event.competition.execution.results.penalty', {
                            seconds: result.penaltySeconds,
                        })}
                        {result.penaltyNote ? ` · ${result.penaltyNote}` : ''}
                    </Typography>
                )}
            </Box>
            <Box
                sx={{
                    gridColumn: {xs: '2 / -1', md: '3'},
                    gridRow: {xs: '2', md: 'auto'},
                    minWidth: 0,
                }}>
                <Stack spacing={0.25}>
                    {team.participants
                        .slice()
                        .sort(compareParticipants)
                        .map(participant => (
                            <Typography
                                key={participant.participantId}
                                variant={'body2'}
                                sx={{overflowWrap: 'anywhere'}}>
                                {participant.firstName} {participant.lastName}
                                {/* Jahrgang hinter dem Namen (Wunsch von Lea, 10.08.2026) */}
                                {participant.year != null ? ` (${participant.year})` : ''}
                                {(participant.namedRole || participant.externalClubName) && (
                                    <Box component={'span'} sx={{color: 'text.secondary'}}>
                                        {' · '}
                                        {[participant.namedRole, participant.externalClubName]
                                            .filter(Boolean)
                                            .join(' · ')}
                                    </Box>
                                )}
                            </Typography>
                        ))}
                </Stack>
            </Box>
            <Box
                sx={{
                    gridColumn: {xs: '3', md: '4'},
                    gridRow: {xs: '1', md: 'auto'},
                    textAlign: 'right',
                }}>
                {time && (
                    <Stack
                        direction={'row'}
                        spacing={0.5}
                        sx={{alignItems: 'center', justifyContent: 'flex-end'}}>
                        <TimerOutlinedIcon
                            aria-hidden
                            sx={{fontSize: 16, color: 'text.secondary'}}
                        />
                        <Typography
                            sx={{
                                fontWeight: 600,
                                fontVariantNumeric: 'tabular-nums',
                                whiteSpace: 'nowrap',
                            }}>
                            {time}
                        </Typography>
                    </Stack>
                )}
            </Box>
        </Box>
    )
}

/** Platz als Ordnungszahl („1."); die ersten drei in einer getönten Marke. */
const PlaceBadge = ({place}: {place: number}) => (
    <Box
        sx={theme => ({
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '2.25rem',
            height: '2.25rem',
            px: 0.75,
            borderRadius: '50%',
            fontWeight: 700,
            fontSize: '1.125rem',
            fontVariantNumeric: 'tabular-nums',
            ...(place <= 3
                ? {
                      bgcolor: alpha(theme.palette.primary.main, 0.14),
                      color: primaryTextColor(theme),
                  }
                : {color: 'text.primary'}),
        })}>
        {place}.
    </Box>
)

export default ResultsMatchDialog
