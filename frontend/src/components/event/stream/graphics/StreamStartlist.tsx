import {Box} from '@mui/material'
import {format} from 'date-fns'
import {useTranslation} from 'react-i18next'
import {AthleteBoardMatch, StreamGraphicSize, StreamPlacement} from '@api/types.gen'
import FlipList from '../../board/FlipList.tsx'
import FitToHeight from '../../board/streamOverlay/FitToHeight.tsx'
import {byNullsLast, competitionLabel, roundMatchLabel} from '../../board/streamOverlay/streamDisplay.ts'
import StreamBoatLine from './design/StreamBoatLine.tsx'
import StreamHeader from './design/StreamHeader.tsx'
import StreamPlate from './design/StreamPlate.tsx'
import StreamTag from './design/StreamTag.tsx'
import {bandRowMode, boardLayout, formForPlacement, splitColumns} from './design/streamLayout.ts'
import {STREAM_DISPLAY_FONT, STREAM_PLATE} from './design/streamTheme.ts'

interface StreamStartlistProps {
    match: AthleteBoardMatch
    size: StreamGraphicSize
    placement: StreamPlacement
}

/**
 * STARTLIST: die Aufstellung vor dem Start — als Band (unten) oder als Vollbild-Tafel
 * (`FULL_CENTER`). Zeilenlayout nach Feldgröße (`bandRowMode`/`boardLayout`), Vereine in
 * Kurzform (eine Bandgrafik hat keinen Platz für ausgeschriebene Vereinsketten), rechts die
 * geplante Startzeit, sofern eine vorliegt.
 */
const StreamStartlist = ({match, size, placement}: StreamStartlistProps) => {
    const {t} = useTranslation()
    const form = formForPlacement(placement) === 'board' ? 'board' : 'band'
    // Aufstellung trägt nie Teilergebnisse — Startnummern-Reihenfolge ist deterministisch und
    // entspricht der Bahnaufteilung.
    const teams = [...match.teams].sort(byNullsLast(team => team.startNumber))
    const layout = form === 'board' ? boardLayout(teams.length) : {columns: 1 as const, mode: bandRowMode(teams.length)}
    const columns = splitColumns(teams, layout.columns)

    return (
        <StreamPlate form={form} size={size}>
            <StreamHeader
                form={form}
                tag={<StreamTag label={t('event.stream.startlist')} />}
                title={competitionLabel(match.competitionName, match.competitionShortName, true)}
                subtitle={roundMatchLabel(match.roundName, match.matchName)}
                trailing={
                    match.startTime ? (
                        <Box
                            sx={{
                                fontFamily: STREAM_DISPLAY_FONT,
                                fontWeight: 600,
                                fontSize: form === 'board' ? '1.9em' : '1.5em',
                                lineHeight: 1,
                                color: STREAM_PLATE.muted,
                                fontVariantNumeric: 'tabular-nums',
                            }}>
                            {format(new Date(match.startTime), t('format.time'))}
                        </Box>
                    ) : undefined
                }
            />
            {/* Keine Bildlaufleiste auf einer Sendegrafik — passt ein Feld trotz Zeilenmodus
                nicht, verkleinert FitToHeight es, statt die letzte Zeile abzuschneiden. */}
            <FitToHeight smooth>
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
                        columnGap: '1.5em',
                        py: '0.4em',
                    }}>
                    {columns.map((column, columnIndex) => (
                        <Box key={columnIndex}>
                            <FlipList
                                items={column}
                                keyOf={team => String(team.startNumber)}
                                render={(team, index) => (
                                    <StreamBoatLine
                                        team={team}
                                        mode={layout.mode}
                                        columns={layout.columns}
                                        leading="start"
                                        useShortClubNames
                                        failedFallback={t('event.info.athleteBoard.failed')}
                                        deregisteredFallback={t('event.info.athleteBoard.deregistered')}
                                        striped={index % 2 === 1}
                                    />
                                )}
                            />
                        </Box>
                    ))}
                </Box>
            </FitToHeight>
        </StreamPlate>
    )
}

export default StreamStartlist
