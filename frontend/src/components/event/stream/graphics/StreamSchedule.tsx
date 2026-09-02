import {Box, Typography} from '@mui/material'
import {format} from 'date-fns'
import {useTranslation} from 'react-i18next'
import {AthleteBoardMatch, StreamGraphicSize} from '@api/types.gen'
import FlipList from '../../board/FlipList.tsx'
import FitToHeight from '../../board/streamOverlay/FitToHeight.tsx'
import {competitionLabel, roundMatchLabel} from '../../board/streamOverlay/streamDisplay.ts'
import StreamHeader from './design/StreamHeader.tsx'
import StreamPlate from './design/StreamPlate.tsx'
import StreamTag from './design/StreamTag.tsx'
import {scheduleColumns, splitColumns} from './design/streamLayout.ts'
import {STREAM_DISPLAY_FONT, STREAM_PLATE, useStreamAccent} from './design/streamTheme.ts'
import {scheduleRows} from './streamSchedule.ts'

interface StreamScheduleProps {
    schedule: AthleteBoardMatch[]
    size: StreamGraphicSize
}

/**
 * SCHEDULE: Vollbild-Tafel mit den nächsten anstehenden Läufen — Zeit, Wettkampf, Runde/Lauf,
 * der erste hervorgehoben. Bewusst KEINE Besatzungen: Das ist das Tagesprogramm, keine
 * Aufstellung, und eine Zeile je Lauf muss kompakt bleiben. Ab elf Zeilen zwei Spalten
 * (`scheduleColumns`) statt einer geschrumpften Liste. Ausgefallene Läufe und Pausen
 * (`cancelled`, `name`) bleiben an ihrer Stelle und sind als solche gekennzeichnet.
 */
const StreamSchedule = ({schedule, size}: StreamScheduleProps) => {
    const {t} = useTranslation()
    const accent = useStreamAccent()
    const rows = scheduleRows(schedule)

    // Leer bleibt die Karte unsichtbar statt einer leeren Hülle.
    if (rows.length === 0) return null

    const columnCount = scheduleColumns(rows.length)
    const columns = splitColumns(rows, columnCount)

    return (
        <StreamPlate form="board" size={size} sx={{width: columnCount === 1 ? '76em' : '104em'}}>
            <StreamHeader
                form="board"
                tag={<StreamTag label={t('event.stream.schedule')} />}
                title={t('event.stream.scheduleTitle')}
            />
            <FitToHeight smooth>
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                        columnGap: '1.5em',
                        py: '0.5em',
                    }}>
                    {columns.map((column, columnIndex) => (
                        <Box key={columnIndex}>
                            <FlipList
                                items={column}
                                keyOf={match => match.matchId}
                                render={(match, index) => {
                                    // Der allererste Eintrag ist der nächste Lauf — hervorgehoben.
                                    const next = columnIndex === 0 && index === 0
                                    const isBreak = match.name != null
                                    const title = isBreak
                                        ? match.name
                                        : competitionLabel(match.competitionName, match.competitionShortName, true)
                                    const subtitle = isBreak ? null : roundMatchLabel(match.roundName, match.matchName)
                                    return (
                                        <Box
                                            sx={{
                                                display: 'flex',
                                                alignItems: 'baseline',
                                                gap: '1em',
                                                px: '1.35em',
                                                py: '0.55em',
                                                minHeight: '3.4em',
                                                backgroundColor: index % 2 === 1 ? STREAM_PLATE.stripe : 'transparent',
                                                opacity: match.cancelled ? 0.6 : 1,
                                            }}>
                                            <Typography
                                                component="span"
                                                sx={{
                                                    fontFamily: STREAM_DISPLAY_FONT,
                                                    fontWeight: 700,
                                                    fontSize: '1.9em',
                                                    lineHeight: 1,
                                                    fontVariantNumeric: 'tabular-nums',
                                                    minWidth: '3em',
                                                    flexShrink: 0,
                                                    color: next ? accent.main : STREAM_PLATE.text,
                                                }}>
                                                {match.startTime ? format(new Date(match.startTime), t('format.time')) : '–'}
                                            </Typography>
                                            <Typography
                                                component="span"
                                                noWrap
                                                sx={{
                                                    fontWeight: next ? 700 : 600,
                                                    fontSize: '1.45em',
                                                    lineHeight: 1.2,
                                                    minWidth: 0,
                                                    flexShrink: 0,
                                                    maxWidth: '60%',
                                                    fontStyle: isBreak ? 'italic' : 'normal',
                                                    color: isBreak ? STREAM_PLATE.muted : STREAM_PLATE.text,
                                                    textDecoration: match.cancelled ? 'line-through' : 'none',
                                                }}>
                                                {title}
                                            </Typography>
                                            {subtitle && (
                                                <Typography
                                                    component="span"
                                                    noWrap
                                                    sx={{
                                                        fontFamily: STREAM_DISPLAY_FONT,
                                                        fontWeight: 600,
                                                        fontSize: '1.2em',
                                                        lineHeight: 1.2,
                                                        letterSpacing: '0.02em',
                                                        color: STREAM_PLATE.muted,
                                                        minWidth: 0,
                                                        flex: 1,
                                                    }}>
                                                    {subtitle}
                                                </Typography>
                                            )}
                                            {match.cancelled && (
                                                <Box sx={{ml: 'auto', fontSize: '0.85em', flexShrink: 0}}>
                                                    <StreamTag tone="warning" label={t('event.stream.cancelled')} />
                                                </Box>
                                            )}
                                        </Box>
                                    )
                                }}
                            />
                        </Box>
                    ))}
                </Box>
            </FitToHeight>
        </StreamPlate>
    )
}

export default StreamSchedule
