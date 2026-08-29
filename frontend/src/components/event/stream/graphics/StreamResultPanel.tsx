import {Box, Stack, Typography, useTheme} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {AthleteBoardResult, AthleteBoardResultTeam, StreamGraphicSize} from '@api/types.gen'
import FlipList from '../../board/FlipList.tsx'
import FitToHeight from '../../board/streamOverlay/FitToHeight.tsx'
import StreamBoatRow from '../../board/streamOverlay/StreamBoatRow.tsx'
import {byNullsLast, competitionLabel, roundMatchLabel, solidOr} from '../../board/streamOverlay/streamDisplay.ts'
import StreamBandShell from './StreamBandShell.tsx'
import {winnerGap} from './resultGap.ts'

interface StreamResultPanelProps {
    result: AthleteBoardResult
    /** Lauf steht auf Klärung — das Ergebnis geht trotzdem raus, nur als vorläufig markiert. */
    provisional?: boolean | null
    size: StreamGraphicSize
}

/**
 * RESULT-Bandgrafik: Ränge, Zeiten (über `StreamBoatRow`) und je Boot der Rückstand zum
 * Sieger, dazu ein „Vorläufig"-Kennzeichen bei laufender Klärung. Der Rückstand wird aus den
 * bereits formatierten Ergebniszeiten gerechnet (`winnerGap`) — der Server liefert dem
 * Endergebnis keine rohen Millisekunden wie den Zwischenzeiten; lässt sich eine Zeile nicht
 * parsen, bleibt die Stelle leer statt eine Zahl zu erfinden.
 *
 * Die Rückstand-Zeile bekommt JEDE Zeile reserviert, auch die des Siegers ohne eigenen
 * Rückstand — sonst hätten nur die Zeilen dahinter eine zweite Zeile und die Vereinsnamen
 * säßen zeilenweise unterschiedlich hoch. Der Sieger bekommt trotzdem nie eine erfundene
 * „+0,00" zu sehen: seine Zeile bleibt per `visibility: hidden` leer, nimmt aber denselben
 * Platz ein wie die Rückstände der übrigen Boote.
 */
const StreamResultPanel = ({result, provisional, size}: StreamResultPanelProps) => {
    const {t} = useTranslation()
    const theme = useTheme()
    const streamCrew = 'CLUBS_FIRST' as const
    const teams = [...result.teams].sort(byNullsLast(team => team.place))
    const winner = teams.find(team => team.place === 1) ?? null
    const decimalPoint = t('decimal.point')

    const gapFor = (team: AthleteBoardResultTeam): string | null =>
        team.place != null && team.place !== 1
            ? winnerGap(team.timeString, winner?.timeString, decimalPoint)
            : null

    return (
        <StreamBandShell
            size={size}
            stateLabel={t('event.stream.result')}
            title={competitionLabel(result.competitionName, result.competitionShortName, true)}
            roundLine={roundMatchLabel(result.roundName, result.matchName)}
            headerTrailing={
                provisional ? (
                    <Typography
                        variant={size === 'COMPACT' ? 'body1' : 'h6'}
                        noWrap
                        sx={{
                            fontWeight: 700,
                            flexShrink: 0,
                            color: solidOr(theme.palette.warning.light, '#ffb74d'),
                        }}>
                        {t('event.match.status.provisional')}
                    </Typography>
                ) : undefined
            }>
            {/* Keine Bildlaufleiste auf einer Bandgrafik — passt das Feld nicht in die
                Bandhöhe, verkleinert FitToHeight es, statt die letzte Zeile abzuschneiden. */}
            <FitToHeight smooth>
                <Stack sx={{gap: 1.5}}>
                    <FlipList
                        items={teams}
                        keyOf={team => String(team.startNumber)}
                        render={team => {
                            const gap = gapFor(team)
                            return (
                                <Box>
                                    <StreamBoatRow
                                        team={team}
                                        crewMode={streamCrew}
                                        useShortClubNames
                                        failedFallback={t('event.info.athleteBoard.failed')}
                                        deregisteredFallback={t('event.info.athleteBoard.deregistered')}
                                        size={size === 'COMPACT' ? 'compact' : 'large'}
                                        showLaps={false}
                                    />
                                    <Typography
                                        variant="body2"
                                        align="right"
                                        aria-hidden={gap ? undefined : true}
                                        sx={{
                                            opacity: 0.8,
                                            fontVariantNumeric: 'tabular-nums',
                                            visibility: gap ? 'visible' : 'hidden',
                                        }}>
                                        {gap ?? ' '}
                                    </Typography>
                                </Box>
                            )
                        }}
                    />
                </Stack>
            </FitToHeight>
        </StreamBandShell>
    )
}

export default StreamResultPanel
