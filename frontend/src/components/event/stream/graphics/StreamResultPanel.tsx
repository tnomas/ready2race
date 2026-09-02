import {Box} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {AthleteBoardResult, AthleteBoardResultTeam, StreamGraphicSize, StreamPlacement} from '@api/types.gen'
import FlipList from '../../board/FlipList.tsx'
import FitToHeight from '../../board/streamOverlay/FitToHeight.tsx'
import {byNullsLast, competitionLabel, roundMatchLabel} from '../../board/streamOverlay/streamDisplay.ts'
import StreamBoatLine from './design/StreamBoatLine.tsx'
import StreamHeader from './design/StreamHeader.tsx'
import StreamPlate from './design/StreamPlate.tsx'
import StreamTag from './design/StreamTag.tsx'
import {bandRowMode, boardLayout, formForPlacement, splitColumns} from './design/streamLayout.ts'
import {winnerGap} from './resultGap.ts'

interface StreamResultPanelProps {
    result: AthleteBoardResult
    /** Lauf steht auf Klärung — das Ergebnis geht trotzdem raus, nur als vorläufig markiert. */
    provisional?: boolean | null
    size: StreamGraphicSize
    placement: StreamPlacement
}

/**
 * RESULT: Platz, Startnummer, Boot, Zeit und Rückstand zum Sieger — als Band (unten) oder
 * als Vollbild-Tafel (`FULL_CENTER`). Der Rückstand wird aus den fertig formatierten
 * Ergebniszeiten gerechnet (`winnerGap`); lässt sich eine Zeile nicht parsen, bleibt die Stelle
 * leer statt eine Zahl zu erfinden. Bei laufender Klärung trägt der Kopf ein „Vorläufig".
 */
const StreamResultPanel = ({result, provisional, size, placement}: StreamResultPanelProps) => {
    const {t} = useTranslation()
    const form = formForPlacement(placement) === 'board' ? 'board' : 'band'
    const teams = [...result.teams].sort(byNullsLast(team => team.place))
    const winner = teams.find(team => team.place === 1) ?? null
    const decimalPoint = t('decimal.point')
    const layout = form === 'board' ? boardLayout(teams.length) : {columns: 1 as const, mode: bandRowMode(teams.length)}
    const columns = splitColumns(teams, layout.columns)

    const gapFor = (team: AthleteBoardResultTeam): string | null =>
        team.place != null && team.place !== 1
            ? winnerGap(team.timeString, winner?.timeString, decimalPoint)
            : null

    return (
        <StreamPlate form={form} size={size}>
            <StreamHeader
                form={form}
                tag={<StreamTag label={t('event.stream.result')} />}
                title={competitionLabel(result.competitionName, result.competitionShortName, true)}
                subtitle={roundMatchLabel(result.roundName, result.matchName)}
                trailing={
                    provisional ? <StreamTag tone="warning" label={t('event.match.status.provisional')} /> : undefined
                }
            />
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
                                        leading="place"
                                        gap={gapFor(team)}
                                        withGap
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

export default StreamResultPanel
