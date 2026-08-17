import {Stack, Typography, useTheme} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {AthleteBoardResult, BoardElement} from '@api/types.gen.ts'
import FitToHeight from './FitToHeight.tsx'
import FlipList from '../FlipList.tsx'
import StreamBoatRow from './StreamBoatRow.tsx'
import StreamPanelShell from './StreamPanelShell.tsx'
import {
    byNullsLast,
    competitionLabel,
    roundMatchLabel,
    solidOr,
    streamNameForms,
} from './streamDisplay.ts'

interface ResultPanelProps {
    result: AthleteBoardResult
    element: BoardElement
}

/**
 * „Ergebnis": zentriertes TV-Grafik-Panel, Boote nach Platz sortiert. Ein Ergebnis
 * kommt final an, eine Umsortierung ist nicht mehr zu erwarten — FlipList bleibt
 * trotzdem aktiv, sie ist im Ruhezustand kostenlos und fängt so auch eine nachträgliche
 * Korrektur (Schiedsrichter-Wertungsänderung) sauber ab.
 */
const ResultPanel = ({result, element}: ResultPanelProps) => {
    const {t} = useTranslation()
    const theme = useTheme()
    const names = streamNameForms(element)
    const streamCrew = element.streamCrew ?? 'CLUBS_FIRST'
    const teams = [...result.teams].sort(byNullsLast(team => team.place))

    return (
        <StreamPanelShell
            panelKey={result.matchId}
            stateLabel={t('event.boards.stream.result')}
            title={competitionLabel(
                result.competitionName,
                result.competitionShortName,
                names.competitions,
            )}
            roundLine={roundMatchLabel(result.roundName, result.matchName)}
            headerTrailing={
                // Ein Ergebnis aus einem Lauf in Klärung geht bewusst nach der bestehenden
                // Sichtbarkeitsregel raus (Task 8) — auf der Key-Fläche keine MUI-Chip- oder
                // Halbtransparenz-Farbe (die würde beim Keying Farbsäume ziehen, siehe
                // solidOr), sondern nur Text in Warnfarbe wie schon bei der Zeitstrafe
                // (StreamBoatRow).
                result.clarification ? (
                    <Typography
                        variant="h5"
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
            {/* Keine Bildlaufleiste auf einer TV-Grafik — eine Kachel scrollt nie; passt das
                Feld nicht in die Panelhöhe, verkleinert FitToHeight es, statt die letzte
                Bootszeile abzuschneiden. */}
            <FitToHeight>
                <Stack sx={{gap: 1.5}}>
                    <FlipList
                        items={teams}
                        keyOf={team => String(team.startNumber)}
                        render={team => (
                            <StreamBoatRow
                                team={team}
                                crewMode={streamCrew}
                                useShortClubNames={names.clubs}
                                failedFallback={t('event.info.athleteBoard.failed')}
                                deregisteredFallback={t('event.info.athleteBoard.deregistered')}
                                size="large"
                            />
                        )}
                    />
                </Stack>
            </FitToHeight>
        </StreamPanelShell>
    )
}

export default ResultPanel
