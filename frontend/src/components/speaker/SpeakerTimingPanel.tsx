import {Box, IconButton, MenuItem, Select, Stack, Typography} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import {useTranslation} from 'react-i18next'
import {TimingSequenceDto, TimingStationDto} from '@api/types.gen.ts'
import SequenceCountdown from '@components/timing/SequenceCountdown.tsx'
import {formatTimeOfDay} from '@components/timing/leitstand/format.ts'
import {splitRunningEntries} from '@utils/timing/sequenceDisplay.ts'
import {useSpeakerSettings} from './speakerSettings.ts'
import {SpeakerTiming, TimingTeamRef} from './speakerTiming.ts'
import SpeakerPanel from './SpeakerPanel.tsx'

type Props = {
    timing: SpeakerTiming
    /** Lesbares Etikett einer Partie (aus den Sprecherdaten); null, wenn dort unbekannt. */
    matchLabelOf: (matchId: string) => string | null
    onSelectMatch: (matchId: string) => void
}

const teamLabel = (ref: TimingTeamRef | undefined, fallback: string): string => {
    if (!ref) return fallback
    return [
        ref.team.startNumber != undefined ? `#${ref.team.startNumber}` : null,
        ref.team.clubName ?? ref.team.teamName ?? null,
    ]
        .filter(Boolean)
        .join(' ')
}

/**
 * Rechte Spalte, oberes Panel: die Echtzeit-Lage der Zeitnahme. Je START-Posten die aktive
 * Startsequenz (Countdown läuft stumm — die Töne gehören ans Wasser), darunter der
 * Zieleinlauf-Ticker der FINISH-Posten. Fehlstärte erscheinen als rote Banner ganz oben und
 * zusätzlich als Markierung im Programm.
 */
const SpeakerTimingPanel = ({timing, matchLabelOf, onSelectMatch}: Props) => {
    const {t} = useTranslation()
    const {settings, colors, updateSettings} = useSpeakerSettings()

    const startStations = timing.stations.filter(station => station.type === 'START')
    const activeSequences = startStations
        .map(station => ({station, sequence: timing.sequences.get(station.id)}))
        .filter(
            (entry): entry is {station: TimingStationDto; sequence: TimingSequenceDto} =>
                entry.sequence !== undefined &&
                (entry.sequence.state === 'ARMED' ||
                    entry.sequence.state === 'RUNNING' ||
                    entry.sequence.state === 'PAUSED'),
        )

    const unauthorized = timing.wsStatus === 'UNAUTHORIZED'

    return (
        <SpeakerPanel
            title={`⏱ ${t('speaker.timing.title')}`}
            subtitle={
                unauthorized
                    ? undefined
                    : timing.wsStatus === 'OPEN'
                      ? t('speaker.timing.live')
                      : t('speaker.timing.connecting')
            }
            settings={
                <Stack direction={'row'} alignItems={'center'} justifyContent={'space-between'} spacing={2}>
                    <Typography variant={'body2'}>{t('speaker.panelSettings.tickerLimit')}</Typography>
                    <Select
                        size={'small'}
                        value={settings.timingTickerLimit}
                        onChange={event =>
                            updateSettings({timingTickerLimit: Number(event.target.value)})
                        }
                        sx={{
                            color: colors.text,
                            '& .MuiOutlinedInput-notchedOutline': {borderColor: colors.border},
                            '& .MuiSvgIcon-root': {color: colors.textSecondary},
                        }}>
                        {[5, 8, 15, 25].map(limit => (
                            <MenuItem key={limit} value={limit}>
                                {limit}
                            </MenuItem>
                        ))}
                    </Select>
                </Stack>
            }>
            {unauthorized ? (
                <Typography sx={{color: colors.textSecondary, p: 2, textAlign: 'center'}}>
                    {t('speaker.timing.unauthorized')}
                </Typography>
            ) : !timing.hasTimingData ? (
                <Typography sx={{color: colors.textSecondary, p: 2, textAlign: 'center'}}>
                    {t('speaker.timing.noStations')}
                </Typography>
            ) : (
                <Box sx={{p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5}}>
                    {timing.falseStarts.map(event => {
                        const label =
                            matchLabelOf(event.matchId) ??
                            timing.index.byMatch.get(event.matchId)?.competitionName ??
                            ''
                        return (
                            <Box
                                key={event.matchId}
                                onClick={() => onSelectMatch(event.matchId)}
                                sx={{
                                    p: 1.5,
                                    borderRadius: 1,
                                    border: `1px solid ${colors.now}`,
                                    bgcolor: `${colors.now}1f`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                    cursor: 'pointer',
                                }}>
                                <Box sx={{flex: 1, minWidth: 0}}>
                                    <Typography
                                        variant={'body2'}
                                        fontWeight={'bold'}
                                        sx={{color: colors.now}}>
                                        ⚠ {t('speaker.timing.falseStart')}
                                    </Typography>
                                    {label && (
                                        <Typography variant={'caption'} sx={{color: colors.text}}>
                                            {label}
                                        </Typography>
                                    )}
                                </Box>
                                <IconButton
                                    size={'small'}
                                    onClick={clickEvent => {
                                        clickEvent.stopPropagation()
                                        timing.dismissFalseStart(event.matchId)
                                    }}
                                    sx={{color: colors.now}}>
                                    <CloseIcon fontSize={'small'} />
                                </IconButton>
                            </Box>
                        )
                    })}
                    <Box>
                        <Typography
                            variant={'caption'}
                            fontWeight={'bold'}
                            sx={{color: colors.textSecondary, textTransform: 'uppercase'}}>
                            {t('speaker.timing.sequences')}
                        </Typography>
                        {activeSequences.length === 0 ? (
                            <Typography variant={'body2'} sx={{color: colors.textSecondary, mt: 0.5}}>
                                {t('speaker.timing.noSequence')}
                            </Typography>
                        ) : (
                            activeSequences.map(({station, sequence}) => {
                                const split = splitRunningEntries(sequence)
                                const startedCount = sequence.entries.filter(
                                    entry => entry.status === 'STARTED',
                                ).length
                                const countedTotal = sequence.entries.filter(
                                    entry => entry.status !== 'SKIPPED',
                                ).length
                                const nextRef =
                                    split.next !== undefined
                                        ? timing.index.byTeam.get(split.next.competitionMatchTeam)
                                        : undefined
                                const matchId = nextRef?.match.competitionSetupMatch
                                return (
                                    <Box
                                        key={station.id}
                                        onClick={() => matchId && onSelectMatch(matchId)}
                                        sx={{
                                            mt: 0.5,
                                            p: 1.5,
                                            borderRadius: 1,
                                            border: `1px solid ${
                                                sequence.state === 'PAUSED'
                                                    ? colors.border
                                                    : colors.running
                                            }`,
                                            bgcolor:
                                                sequence.state === 'PAUSED'
                                                    ? 'transparent'
                                                    : `${colors.running}14`,
                                            cursor: matchId ? 'pointer' : 'default',
                                        }}>
                                        <Stack
                                            direction={'row'}
                                            alignItems={'baseline'}
                                            spacing={1}
                                            flexWrap={'wrap'}
                                            useFlexGap>
                                            <Typography variant={'body2'} fontWeight={'bold'}>
                                                {station.name}
                                            </Typography>
                                            <Typography
                                                variant={'caption'}
                                                fontWeight={'bold'}
                                                sx={{
                                                    color:
                                                        sequence.state === 'PAUSED'
                                                            ? colors.textSecondary
                                                            : colors.running,
                                                }}>
                                                {sequence.state === 'ARMED'
                                                    ? t('speaker.timing.sequenceArmed')
                                                    : sequence.state === 'PAUSED'
                                                      ? t('speaker.timing.sequencePaused')
                                                      : t('speaker.timing.sequenceRunning')}
                                            </Typography>
                                            <Typography
                                                variant={'caption'}
                                                sx={{color: colors.textSecondary, ml: 'auto'}}>
                                                {t('speaker.timing.sequenceProgress', {
                                                    started: startedCount,
                                                    total: countedTotal,
                                                })}
                                            </Typography>
                                        </Stack>
                                        {nextRef && (
                                            <Typography
                                                variant={'body2'}
                                                sx={{color: colors.text, mt: 0.5}}>
                                                {t('speaker.timing.nextStart')}:{' '}
                                                {teamLabel(nextRef, '')}
                                                {nextRef.match.competitionName
                                                    ? ` · ${nextRef.match.competitionName}`
                                                    : ''}
                                            </Typography>
                                        )}
                                        {sequence.state === 'RUNNING' &&
                                            split.targetMillis !== undefined && (
                                                <SequenceCountdown
                                                    targetMillis={split.targetMillis}
                                                    now={timing.serverNow}
                                                    overdueLabel={t('speaker.timing.startNow')}
                                                    tonePlan={[]}
                                                    sx={{
                                                        fontSize: '1.6rem',
                                                        color: colors.running,
                                                        '&[data-overdue="true"]': {
                                                            fontSize: '1.6rem',
                                                        },
                                                    }}
                                                />
                                            )}
                                    </Box>
                                )
                            })
                        )}
                    </Box>
                    <Box>
                        <Typography
                            variant={'caption'}
                            fontWeight={'bold'}
                            sx={{color: colors.textSecondary, textTransform: 'uppercase'}}>
                            {t('speaker.timing.finishTicker')}
                        </Typography>
                        {timing.finishTicker.length === 0 ? (
                            <Typography variant={'body2'} sx={{color: colors.textSecondary, mt: 0.5}}>
                                {t('speaker.timing.noFinishes')}
                            </Typography>
                        ) : (
                            timing.finishTicker.map(entry => (
                                <Stack
                                    key={entry.markId}
                                    direction={'row'}
                                    spacing={1}
                                    alignItems={'baseline'}
                                    onClick={() =>
                                        entry.ref &&
                                        onSelectMatch(entry.ref.match.competitionSetupMatch)
                                    }
                                    sx={{
                                        py: 0.4,
                                        px: 0.5,
                                        borderRadius: 1,
                                        cursor: entry.ref ? 'pointer' : 'default',
                                        '&:hover': entry.ref ? {bgcolor: colors.panelHover} : {},
                                    }}>
                                    <Typography
                                        variant={'body2'}
                                        sx={{
                                            fontVariantNumeric: 'tabular-nums',
                                            color: colors.text,
                                            fontFamily: 'monospace',
                                        }}>
                                        {formatTimeOfDay(entry.timestampMillis)}
                                    </Typography>
                                    <Typography
                                        variant={'body2'}
                                        noWrap
                                        sx={{
                                            flex: 1,
                                            minWidth: 0,
                                            color: entry.ref ? colors.text : colors.textSecondary,
                                        }}>
                                        {entry.ref
                                            ? `${teamLabel(entry.ref, '')}${
                                                  entry.ref.match.competitionShortName ??
                                                  entry.ref.match.competitionName
                                                      ? ` · ${entry.ref.match.competitionShortName ?? entry.ref.match.competitionName}`
                                                      : ''
                                              }`
                                            : t('speaker.timing.unassignedFinish')}
                                    </Typography>
                                </Stack>
                            ))
                        )}
                    </Box>
                </Box>
            )}
        </SpeakerPanel>
    )
}

export default SpeakerTimingPanel
