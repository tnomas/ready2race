import {Stack} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {AthleteBoardMatch, StreamGraphicSize} from '@api/types.gen'
import FlipList from '../../board/FlipList.tsx'
import FitToHeight from '../../board/streamOverlay/FitToHeight.tsx'
import StreamBoatRow from '../../board/streamOverlay/StreamBoatRow.tsx'
import {byNullsLast, competitionLabel, roundMatchLabel} from '../../board/streamOverlay/streamDisplay.ts'
import StreamBandShell from './StreamBandShell.tsx'

interface StreamStartlistProps {
    match: AthleteBoardMatch
    size: StreamGraphicSize
}

/**
 * STARTLIST-Bandgrafik: Bahnen/Startnummern und Vereine der Aufstellung, bevor der Lauf
 * startet. Kurz-/Langform der Vereinsnamen folgt bewusst fest der Kurzform — der neue
 * Grafik-Katalog kennt (anders als ein Board-Element mit `useShortNames`) noch keinen eigenen
 * Schalter dafür, und eine Bandgrafik hat ohnehin wenig Platz für ausgeschriebene Vereinsketten.
 */
const StreamStartlist = ({match, size}: StreamStartlistProps) => {
    const {t} = useTranslation()
    const streamCrew = 'CLUBS_FIRST' as const
    // Aufstellung trägt nie Teilergebnisse — Startnummern-Reihenfolge ist deterministisch und
    // entspricht der Bahnaufteilung.
    const teams = [...match.teams].sort(byNullsLast(team => team.startNumber))

    return (
        <StreamBandShell
            size={size}
            stateLabel={t('event.stream.startlist')}
            title={competitionLabel(match.competitionName, match.competitionShortName, true)}
            roundLine={roundMatchLabel(match.roundName, match.matchName)}>
            {/* Keine Bildlaufleiste auf einer Bandgrafik — passt das Feld nicht in die
                Bandhöhe, verkleinert FitToHeight es, statt die letzte Zeile abzuschneiden. */}
            <FitToHeight>
                <Stack sx={{gap: 1.5}}>
                    <FlipList
                        items={teams}
                        keyOf={team => String(team.startNumber)}
                        render={team => (
                            <StreamBoatRow
                                team={team}
                                crewMode={streamCrew}
                                useShortClubNames
                                failedFallback={t('event.info.athleteBoard.failed')}
                                deregisteredFallback={t('event.info.athleteBoard.deregistered')}
                                size={size === 'COMPACT' ? 'compact' : 'large'}
                                showLaps={false}
                            />
                        )}
                    />
                </Stack>
            </FitToHeight>
        </StreamBandShell>
    )
}

export default StreamStartlist
