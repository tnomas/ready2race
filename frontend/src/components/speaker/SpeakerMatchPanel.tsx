import {
    Box,
    Chip,
    IconButton,
    Stack,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    ToggleButton,
    Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import {format} from 'date-fns'
import {useTranslation} from 'react-i18next'
import {TimingSequenceDto} from '@api/types.gen.ts'
import SequenceCountdown from '@components/timing/SequenceCountdown.tsx'
import {splitRunningEntries} from '@utils/timing/sequenceDisplay.ts'
import {
    medalEmoji,
    SpeakerBadges,
    SpeakerMatch,
    SpeakerTeam,
    statusColorOf,
} from './speakerData.ts'
import {useSpeakerSettings} from './speakerSettings.ts'
import {sequenceOfMatch, SpeakerTiming} from './speakerTiming.ts'
import SpeakerPanel from './SpeakerPanel.tsx'
import {ParticipantBadges} from './SpeakerBadges.tsx'

type Props = {
    match: SpeakerMatch | null
    badges: SpeakerBadges
    timing: SpeakerTiming
    followLive: boolean
    onToggleFollowLive: (follow: boolean) => void
    onSelectParticipant: (participantId: string) => void
}

const sortTeams = (teams: SpeakerTeam[], finished: boolean): SpeakerTeam[] =>
    [...teams].sort((a, b) => {
        if (finished) {
            if (a.place != undefined && b.place != undefined) return a.place - b.place
            if (a.place != undefined) return -1
            if (b.place != undefined) return 1
        }
        return (a.startNumber ?? Number.MAX_SAFE_INTEGER) - (b.startNumber ?? Number.MAX_SAFE_INTEGER)
    })

/**
 * Die Live-Zeile über der Boote-Tabelle: wo die Startsequenz des Laufs gerade steht. Nur für
 * scharfe/laufende/pausierte Sequenzen — alles Erledigte erzählt die Tabelle selbst besser.
 */
const SequenceStrip = ({
    sequence,
    timing,
}: {
    sequence: TimingSequenceDto
    timing: SpeakerTiming
}) => {
    const {t} = useTranslation()
    const {colors} = useSpeakerSettings()
    const split = splitRunningEntries(sequence)
    const startedCount = sequence.entries.filter(entry => entry.status === 'STARTED').length
    const countedTotal = sequence.entries.filter(entry => entry.status !== 'SKIPPED').length
    const nextRef =
        split.next !== undefined ? timing.index.byTeam.get(split.next.competitionMatchTeam) : undefined
    const nextLabel = nextRef
        ? [
              nextRef.team.startNumber != undefined ? `#${nextRef.team.startNumber}` : null,
              nextRef.team.clubName ?? nextRef.team.teamName ?? null,
          ]
              .filter(Boolean)
              .join(' ')
        : null

    return (
        <Box
            sx={{
                mx: 1.5,
                mt: 1.5,
                p: 1.5,
                borderRadius: 1,
                border: `1px solid ${colors.running}`,
                bgcolor: `${colors.running}14`,
            }}>
            <Stack direction={'row'} spacing={2} alignItems={'center'} flexWrap={'wrap'} useFlexGap>
                <Typography variant={'body2'} fontWeight={'bold'} sx={{color: colors.running}}>
                    {sequence.state === 'ARMED'
                        ? `⏻ ${t('speaker.timing.sequenceArmed')}`
                        : sequence.state === 'PAUSED'
                          ? `⏸ ${t('speaker.timing.sequencePaused')}`
                          : `▶ ${t('speaker.timing.sequenceRunning')}`}
                </Typography>
                <Typography variant={'body2'} sx={{color: colors.text}}>
                    {t('speaker.timing.sequenceProgress', {
                        started: startedCount,
                        total: countedTotal,
                    })}
                </Typography>
                {sequence.state === 'RUNNING' && split.targetMillis !== undefined && (
                    <Stack direction={'row'} spacing={1} alignItems={'baseline'} sx={{ml: 'auto'}}>
                        {nextLabel && (
                            <Typography variant={'body2'} sx={{color: colors.textSecondary}}>
                                {t('speaker.timing.nextStart')}: {nextLabel}
                            </Typography>
                        )}
                        <SequenceCountdown
                            targetMillis={split.targetMillis}
                            now={timing.serverNow}
                            overdueLabel={t('speaker.timing.startNow')}
                            // Die Töne gehören dem Startbereich — das Sprecher-Board zählt stumm mit.
                            tonePlan={[]}
                            sx={{fontSize: '1.4rem', color: colors.running, '&[data-overdue="true"]': {fontSize: '1.4rem'}}}
                        />
                    </Stack>
                )}
            </Stack>
        </Box>
    )
}

/**
 * Das Herzstück der Mitte: die Details des gewählten Laufs als stehendes Panel — Nachfolger des
 * früheren Match-Dialogs. Ergänzt um die Live-Sicht der Zeitnahme: Startsequenz-Zeile,
 * Fehlstart-Banner und Start-/Ziel-Häkchen je Boot, solange der Lauf nicht beendet ist.
 */
const SpeakerMatchPanel = ({
    match,
    badges,
    timing,
    followLive,
    onToggleFollowLive,
    onSelectParticipant,
}: Props) => {
    const {t} = useTranslation()
    const {settings, colors, updateSettings} = useSpeakerSettings()

    const headerExtra = (
        <ToggleButton
            value={'follow'}
            size={'small'}
            selected={followLive}
            onChange={() => onToggleFollowLive(!followLive)}
            sx={{
                color: colors.textSecondary,
                borderColor: colors.border,
                py: 0.25,
                px: 1,
                whiteSpace: 'nowrap',
                '&.Mui-selected': {
                    color: colors.running,
                    bgcolor: `${colors.running}22`,
                },
            }}>
            ● {t('speaker.dashboard.followLive')}
        </ToggleButton>
    )

    if (!match) {
        return (
            <SpeakerPanel title={t('speaker.dashboard.detailsTitle')} headerExtra={headerExtra}>
                <Typography sx={{color: colors.textSecondary, p: 3, textAlign: 'center'}}>
                    {t('speaker.dashboard.noSelection')}
                </Typography>
            </SpeakerPanel>
        )
    }

    const finished = match.status === 'FINISHED'
    const teams = sortTeams(match.teams, finished)

    // Zeitnahme-Anbindung des Laufs: gleiche Partie-Id, Boote über die Startnummer verheiratet
    // (die Sprecherdaten führen die Meldungs-Id, die Zeitnahme die Partie-Team-Id).
    const timingMatch = timing.index.byMatch.get(match.matchId)
    const progressByStartNumber = new Map<number, {started: boolean; finished: boolean}>()
    timingMatch?.teams.forEach(team => {
        const live = timing.teamProgress.get(team.competitionMatchTeam)
        progressByStartNumber.set(team.startNumber, {
            started: live?.started ?? team.started,
            finished: live?.finished ?? team.finished,
        })
    })
    const showProgress = !finished && progressByStartNumber.size > 0
    const sequence = sequenceOfMatch(timing.sequences, timing.index, match.matchId)
    const falseStart = timing.falseStarts.find(event => event.matchId === match.matchId)

    const headerCellSx = {
        color: colors.textSecondary,
        borderBottom: `1px solid ${colors.border}`,
        fontWeight: 'bold',
        whiteSpace: 'nowrap',
    }
    const bodyCellSx = {
        color: colors.text,
        borderBottom: `1px solid ${colors.border}`,
        verticalAlign: 'top',
    }

    return (
        <SpeakerPanel
            title={
                <Stack
                    component={'span'}
                    direction={'row'}
                    spacing={1}
                    alignItems={'center'}
                    flexWrap={'wrap'}
                    useFlexGap>
                    <span>{match.competitionName}</span>
                    {match.categoryName && (
                        <Chip
                            size={'small'}
                            label={match.categoryName}
                            sx={{color: colors.text, borderColor: colors.border}}
                            variant={'outlined'}
                        />
                    )}
                    <Chip
                        size={'small'}
                        label={
                            match.cancelled
                                ? t('speaker.status.CANCELLED')
                                : match.status === 'RUNNING'
                                  ? `● ${t('speaker.status.RUNNING')}`
                                  : match.status === 'FINISHED'
                                    ? `✓ ${t('speaker.status.FINISHED')}`
                                    : t('speaker.status.UPCOMING')
                        }
                        sx={{
                            bgcolor: `${match.cancelled ? colors.now : statusColorOf(colors, match.status)}22`,
                            color: match.cancelled ? colors.now : statusColorOf(colors, match.status),
                            fontWeight: 'bold',
                        }}
                    />
                </Stack>
            }
            subtitle={
                [match.roundName, match.matchName].filter(Boolean).join(' · ') +
                (match.startTime
                    ? ` · ${t('speaker.match.start')} ${format(match.startTime, t('format.time'))}`
                    : '') +
                (match.status === 'RUNNING' && match.elapsedMinutes != undefined
                    ? ` · ${t('speaker.match.elapsed', {minutes: match.elapsedMinutes})}`
                    : '')
            }
            headerExtra={headerExtra}
            settings={
                <Stack direction={'row'} alignItems={'center'} justifyContent={'space-between'}>
                    <Typography variant={'body2'}>{t('speaker.panelSettings.showYears')}</Typography>
                    <Switch
                        size={'small'}
                        checked={settings.matchShowYears}
                        onChange={(_, checked) => updateSettings({matchShowYears: checked})}
                    />
                </Stack>
            }>
            {falseStart && (
                <Box
                    sx={{
                        mx: 1.5,
                        mt: 1.5,
                        p: 1.5,
                        borderRadius: 1,
                        border: `1px solid ${colors.now}`,
                        bgcolor: `${colors.now}1f`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                    }}>
                    <Typography variant={'body2'} fontWeight={'bold'} sx={{color: colors.now, flex: 1}}>
                        ⚠ {t('speaker.timing.falseStart')}
                    </Typography>
                    <IconButton
                        size={'small'}
                        onClick={() => timing.dismissFalseStart(match.matchId)}
                        sx={{color: colors.now}}>
                        <CloseIcon fontSize={'small'} />
                    </IconButton>
                </Box>
            )}
            {sequence && <SequenceStrip sequence={sequence} timing={timing} />}
            <Table size={'small'} sx={{mt: 1}}>
                <TableHead>
                    <TableRow>
                        <TableCell sx={headerCellSx}>
                            {finished ? t('speaker.match.place') : t('speaker.match.startNumber')}
                        </TableCell>
                        <TableCell sx={headerCellSx}>{t('speaker.match.team')}</TableCell>
                        <TableCell sx={headerCellSx}>{t('speaker.match.participants')}</TableCell>
                        {showProgress && (
                            <TableCell sx={headerCellSx} align={'center'}>
                                {t('speaker.timing.progress')}
                            </TableCell>
                        )}
                        {finished && (
                            <TableCell sx={headerCellSx} align={'right'}>
                                {t('speaker.match.time')}
                            </TableCell>
                        )}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {teams.map(team => {
                        const live =
                            team.startNumber != undefined
                                ? progressByStartNumber.get(team.startNumber)
                                : undefined
                        return (
                            <TableRow key={team.teamId} sx={{'&:last-child td': {border: 0}}}>
                                <TableCell sx={{...bodyCellSx, whiteSpace: 'nowrap'}}>
                                    {finished ? (
                                        team.deregistered ? (
                                            <Typography
                                                variant={'body2'}
                                                sx={{color: colors.textSecondary}}>
                                                {t('speaker.match.deregistered')}
                                            </Typography>
                                        ) : team.failed ? (
                                            <Typography variant={'body2'} sx={{color: colors.now}}>
                                                {team.failedReason || t('speaker.match.failed')}
                                            </Typography>
                                        ) : team.place != undefined ? (
                                            <Typography fontWeight={'bold'}>
                                                {team.place <= 3 ? medalEmoji(team.place) : ''}{' '}
                                                {team.place}.
                                            </Typography>
                                        ) : (
                                            '–'
                                        )
                                    ) : (
                                        (team.startNumber ?? '–')
                                    )}
                                </TableCell>
                                <TableCell sx={bodyCellSx}>
                                    <Typography fontWeight={'bold'} variant={'body2'}>
                                        {team.clubName ?? team.clubsFull ?? ''}
                                    </Typography>
                                    {team.teamName && (
                                        <Typography
                                            variant={'caption'}
                                            sx={{color: colors.textSecondary}}>
                                            {team.teamName}
                                        </Typography>
                                    )}
                                </TableCell>
                                <TableCell sx={bodyCellSx}>
                                    {team.participants.map(participant => (
                                        <Typography key={participant.participantId} variant={'body2'}>
                                            <Typography
                                                component={'span'}
                                                variant={'body2'}
                                                onClick={() =>
                                                    onSelectParticipant(participant.participantId)
                                                }
                                                sx={{
                                                    cursor: 'pointer',
                                                    textDecorationLine: 'underline',
                                                    textDecorationColor: colors.border,
                                                    textUnderlineOffset: '3px',
                                                    '&:hover': {color: colors.upcoming},
                                                }}>
                                                {participant.firstName} {participant.lastName}
                                            </Typography>
                                            {settings.matchShowYears &&
                                                participant.year != undefined && (
                                                    <Typography
                                                        component={'span'}
                                                        variant={'caption'}
                                                        sx={{color: colors.textSecondary}}>
                                                        {' '}
                                                        ({t('speaker.match.yearShort')}{' '}
                                                        {participant.year})
                                                    </Typography>
                                                )}
                                            {participant.namedRole && (
                                                <Typography
                                                    component={'span'}
                                                    variant={'caption'}
                                                    sx={{color: colors.textSecondary}}>
                                                    {' '}
                                                    – {participant.namedRole}
                                                </Typography>
                                            )}{' '}
                                            <ParticipantBadges
                                                participant={participant}
                                                badges={badges}
                                                currentMatchId={match.matchId}
                                            />
                                        </Typography>
                                    ))}
                                </TableCell>
                                {showProgress && (
                                    <TableCell
                                        sx={{...bodyCellSx, whiteSpace: 'nowrap'}}
                                        align={'center'}>
                                        {live?.finished ? (
                                            <Typography
                                                variant={'body2'}
                                                fontWeight={'bold'}
                                                sx={{color: colors.running}}>
                                                🏁 {t('speaker.timing.finished')}
                                            </Typography>
                                        ) : live?.started ? (
                                            <Typography variant={'body2'} sx={{color: colors.running}}>
                                                ▶ {t('speaker.timing.started')}
                                            </Typography>
                                        ) : (
                                            <Typography
                                                variant={'body2'}
                                                sx={{color: colors.textSecondary}}>
                                                –
                                            </Typography>
                                        )}
                                    </TableCell>
                                )}
                                {finished && (
                                    <TableCell
                                        sx={{...bodyCellSx, whiteSpace: 'nowrap'}}
                                        align={'right'}>
                                        {team.timeString ?? ''}
                                    </TableCell>
                                )}
                            </TableRow>
                        )
                    })}
                </TableBody>
            </Table>
        </SpeakerPanel>
    )
}

export default SpeakerMatchPanel
