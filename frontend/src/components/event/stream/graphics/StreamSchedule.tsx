import {alpha, Box, Stack, Typography, useTheme} from '@mui/material'
import {format} from 'date-fns'
import {useTranslation} from 'react-i18next'
import {AthleteBoardMatch, StreamGraphicSize} from '@api/types.gen'
import FlipList from '../../board/FlipList.tsx'
import FitToHeight from '../../board/streamOverlay/FitToHeight.tsx'
import {competitionLabel, roundMatchLabel} from '../../board/streamOverlay/streamDisplay.ts'
import {scheduleRows} from './streamSchedule.ts'

interface StreamScheduleProps {
    schedule: AthleteBoardMatch[]
    size: StreamGraphicSize
}

/**
 * SCHEDULE-Füllgrafik: halbtransparente FULL_CENTER-Karte mit den nächsten anstehenden
 * Läufen (Zeit + Wettkampf/Runde), der erste hervorgehoben. Anders als die Startliste zeigt
 * diese Karte bewusst KEINE Besatzungen — sie ist das Tagesprogramm, keine Aufstellung, und
 * eine Zeile je Lauf muss kompakt bleiben, um mehrere Läufe gleichzeitig zu zeigen.
 *
 * Die Deckelung selbst steckt in `scheduleRows` (siehe dort) — der Server schneidet `schedule`
 * bereits auf `listLength` zu, diese Karte verlässt sich darauf aber nicht blind.
 */
const StreamSchedule = ({schedule, size}: StreamScheduleProps) => {
    const {t} = useTranslation()
    const theme = useTheme()
    const compact = size === 'COMPACT'
    const rows = scheduleRows(schedule)

    // Leer bleibt die Karte unsichtbar statt einer leeren Hülle — GraphicFrame blendet zwar
    // ohnehin per `visible` aus, aber ein Push ohne Läufe (z. B. Tagesende) soll auch dann
    // nichts zeigen, wenn `visible` aus irgendeinem Grund noch `true` wäre.
    if (rows.length === 0) return null

    return (
        <Box
            sx={{
                width: compact ? 'min(46rem, 60vw)' : 'min(58rem, 66vw)',
                maxHeight: compact ? '60vh' : '72vh',
                overflow: 'hidden',
                borderRadius: 3,
                boxShadow: '0 24px 56px rgba(0, 0, 0, 0.5)',
                backgroundColor: alpha(theme.palette.common.black, 0.72),
                backdropFilter: 'blur(6px)',
                color: theme.palette.common.white,
                display: 'flex',
                flexDirection: 'column',
            }}>
            {/* Akzentbalken oben — dieselbe Geste wie `StreamBandShell`. */}
            <Box
                sx={{
                    height: compact ? '0.35rem' : '0.5rem',
                    flexShrink: 0,
                    backgroundColor: theme.palette.primary.main,
                }}
            />
            <Stack
                sx={{
                    p: compact ? 2.5 : 3.5,
                    gap: compact ? 1.5 : 2,
                    overflow: 'hidden',
                    minHeight: 0,
                }}>
                <Typography
                    variant={compact ? 'h5' : 'h4'}
                    sx={{fontWeight: 700, flexShrink: 0}}>
                    {t('event.stream.schedule')}
                </Typography>
                {/* Keine Bildlaufleiste auf einer TV-Grafik — passt die Liste nicht in die
                    Kartenhöhe, verkleinert FitToHeight sie, statt die letzte Zeile abzuschneiden. */}
                <FitToHeight>
                    <Stack sx={{gap: compact ? 1 : 1.5}}>
                        <FlipList
                            items={rows}
                            keyOf={match => match.matchId}
                            render={(match, index) => {
                                // Der erste Eintrag ist der nächste Lauf — hervorgehoben wie
                                // der Punkt/die fette Zeit im NEXT_UP-Bauchband.
                                const next = index === 0
                                const label = [
                                    competitionLabel(match.competitionName, match.competitionShortName, true),
                                    roundMatchLabel(match.roundName, match.matchName),
                                ]
                                    .filter(Boolean)
                                    .join(' · ')
                                return (
                                    <Stack
                                        direction="row"
                                        alignItems="baseline"
                                        gap={2}
                                        sx={{width: 1, opacity: next ? 1 : 0.78}}>
                                        <Typography
                                            variant={compact ? 'body1' : 'h6'}
                                            sx={{
                                                fontWeight: next ? 700 : 600,
                                                fontVariantNumeric: 'tabular-nums',
                                                minWidth: '4em',
                                                flexShrink: 0,
                                                color: next ? theme.palette.primary.light : 'inherit',
                                            }}>
                                            {match.startTime
                                                ? format(new Date(match.startTime), t('format.time'))
                                                : '–'}
                                        </Typography>
                                        <Typography
                                            variant={compact ? 'body1' : 'h6'}
                                            noWrap
                                            sx={{fontWeight: next ? 700 : 500, minWidth: 0, flex: 1}}>
                                            {label}
                                        </Typography>
                                    </Stack>
                                )
                            }}
                        />
                    </Stack>
                </FitToHeight>
            </Stack>
        </Box>
    )
}

export default StreamSchedule
