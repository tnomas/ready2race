import {Box, Typography} from '@mui/material'
import {crewLines, StreamTeam} from '../../../board/streamOverlay/streamDisplay.ts'
import RankBadge from './RankBadge.tsx'
import {boatStatus, StreamRowMode, StreamStatusTone} from './streamLayout.ts'
import {STREAM_DISPLAY_FONT, STREAM_PLATE} from './streamTheme.ts'

interface StreamBoatLineProps {
    team: StreamTeam
    mode: StreamRowMode
    /** Links steht die Startnummer (Aufstellung) oder die Platzmarke samt kleiner Startnummer (Ergebnis). */
    leading: 'start' | 'place'
    /** Rückstand zum Sieger — nur im Ergebnis; die Spalte bleibt auch beim Sieger reserviert. */
    gap?: string | null
    /** Ob die Rückstand-Spalte überhaupt gerendert wird (Ergebnis ja, Aufstellung nein). */
    withGap?: boolean
    useShortClubNames: boolean
    failedFallback: string
    deregisteredFallback: string
    striped: boolean
}

const TONE_COLOR: Record<StreamStatusTone, string> = {
    normal: STREAM_PLATE.text,
    warning: STREAM_PLATE.warning,
    muted: STREAM_PLATE.muted,
}

/**
 * Eine Bootszeile der Bänder und Tafeln. Zwei Modi (`StreamRowMode`): zweizeilig mit Besatzung
 * unter dem Verein, oder eine Zeile mit der Besatzung hinter dem Verein — die Feldgröße
 * entscheidet (`bandRowMode`/`boardLayout`), nie ein Schrumpfen der Zeile.
 *
 * Linke Zelle: Startnummer groß in der Schaubühnen-Schrift (Aufstellung) oder Platzmarke plus
 * kleine Startnummer (Ergebnis). Rechte Zelle: Zeit mit Tabellenziffern, daneben der Rückstand
 * — oder an Stelle der Zeit ein Status (DNF, Abgemeldet) in seiner Tönung.
 */
const StreamBoatLine = ({
    team,
    mode,
    leading,
    gap,
    withGap = false,
    useShortClubNames,
    failedFallback,
    deregisteredFallback,
    striped,
}: StreamBoatLineProps) => {
    const {primary, secondary} = crewLines(team, 'CLUBS_FIRST', useShortClubNames)
    const status = boatStatus(team, {failed: failedFallback, deregistered: deregisteredFallback})
    const penalty =
        team.penaltySeconds != null || team.penaltyNote
            ? [team.penaltySeconds != null ? `+${team.penaltySeconds} s` : null, team.penaltyNote]
                  .filter(Boolean)
                  .join(' · ')
            : null
    const stacked = mode === 'stacked'

    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: '1em',
                px: '1.1em',
                py: stacked ? '0.5em' : '0.32em',
                minHeight: stacked ? '4.6em' : '3.1em',
                backgroundColor: striped ? STREAM_PLATE.stripe : 'transparent',
            }}>
            {/* Linke Zelle mit Haarlinie — die Nummernspalte liest sich als eigene Leiste. */}
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6em',
                    flexShrink: 0,
                    minWidth: leading === 'place' ? '5.4em' : '3.2em',
                    pr: '0.8em',
                    borderRight: `1px solid ${STREAM_PLATE.divider}`,
                    alignSelf: 'stretch',
                }}>
                {leading === 'place' ? (
                    <>
                        <RankBadge place={team.place} />
                        <Typography
                            component="span"
                            sx={{
                                fontFamily: STREAM_DISPLAY_FONT,
                                fontWeight: 600,
                                fontSize: '1.15em',
                                lineHeight: 1,
                                color: STREAM_PLATE.faint,
                                fontVariantNumeric: 'tabular-nums',
                                minWidth: '1.4em',
                                textAlign: 'right',
                            }}>
                            {team.startNumber}
                        </Typography>
                    </>
                ) : (
                    <Typography
                        component="span"
                        sx={{
                            fontFamily: STREAM_DISPLAY_FONT,
                            fontWeight: 700,
                            fontSize: '2em',
                            lineHeight: 1,
                            fontVariantNumeric: 'tabular-nums',
                            width: '100%',
                            textAlign: 'center',
                        }}>
                        {team.startNumber}
                    </Typography>
                )}
            </Box>

            {/* Namen: zweizeilig oder in einer Zeile, immer ellipsiert statt umbrochen — eine
                Zeile pro Boot ist die Zusage dieser Grafik an die Höhe. */}
            <Box
                sx={{
                    minWidth: 0,
                    flex: 1,
                    display: 'flex',
                    flexDirection: stacked ? 'column' : 'row',
                    alignItems: stacked ? 'stretch' : 'baseline',
                    gap: stacked ? '0.1em' : '0.7em',
                }}>
                <Typography
                    component="div"
                    noWrap
                    sx={{
                        fontWeight: 700,
                        fontSize: stacked ? '1.4em' : '1.3em',
                        lineHeight: 1.2,
                        minWidth: 0,
                        flexShrink: stacked ? 1 : 0,
                        maxWidth: stacked ? undefined : '62%',
                    }}>
                    {primary}
                </Typography>
                {(secondary || penalty) && (
                    <Typography
                        component="div"
                        noWrap
                        sx={{
                            fontSize: stacked ? '1.05em' : '1.05em',
                            lineHeight: 1.2,
                            color: STREAM_PLATE.muted,
                            minWidth: 0,
                            flexShrink: 1,
                        }}>
                        {penalty && (
                            <Box
                                component="span"
                                sx={{
                                    color: STREAM_PLATE.warning,
                                    fontFamily: STREAM_DISPLAY_FONT,
                                    fontWeight: 600,
                                    letterSpacing: '0.03em',
                                    mr: secondary ? '0.7em' : 0,
                                }}>
                                {penalty}
                            </Box>
                        )}
                        {secondary}
                    </Typography>
                )}
            </Box>

            {/* Rechte Zelle: Zeit + Rückstand, oder Status. */}
            {(status || withGap) && (
                <Box sx={{display: 'flex', alignItems: 'baseline', gap: '0.9em', flexShrink: 0}}>
                    {status && (
                        <Typography
                            component="span"
                            sx={{
                                fontWeight: 700,
                                fontSize: status.tone === 'normal' ? '1.55em' : '1.15em',
                                lineHeight: 1,
                                fontVariantNumeric: 'tabular-nums',
                                color: TONE_COLOR[status.tone],
                                ...(status.tone !== 'normal' && {
                                    fontFamily: STREAM_DISPLAY_FONT,
                                    letterSpacing: '0.04em',
                                    textTransform: 'uppercase',
                                }),
                            }}>
                            {status.text}
                        </Typography>
                    )}
                    {withGap && (
                        <Typography
                            component="span"
                            sx={{
                                fontSize: '1.05em',
                                lineHeight: 1,
                                fontVariantNumeric: 'tabular-nums',
                                color: STREAM_PLATE.muted,
                                minWidth: '5.2em',
                                textAlign: 'right',
                            }}>
                            {gap ?? ''}
                        </Typography>
                    )}
                </Box>
            )}
        </Box>
    )
}

export default StreamBoatLine
