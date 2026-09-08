import {Box, Typography} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {StreamFinishEntry, StreamGraphicSize} from '@api/types.gen'
import {materialLabel} from '@components/material/materialLabel.ts'
import FlipList from '../../board/FlipList.tsx'
import {byNullsLast} from '../../board/streamOverlay/streamDisplay.ts'
import RankBadge from './design/RankBadge.tsx'
import StreamHeader from './design/StreamHeader.tsx'
import StreamPlate from './design/StreamPlate.tsx'
import StreamTag from './design/StreamTag.tsx'
import {
    collapseClubChain,
    CREW_NAME_SEPARATOR,
    fitCrewNames,
    TICKER_CHAIN_MAX_LINKS,
    TICKER_CREW_BUDGET,
} from './design/streamText.ts'
import {STREAM_DISPLAY_FONT, STREAM_PLATE} from './design/streamTheme.ts'

interface StreamFinishTickerProps {
    entries: StreamFinishEntry[]
    size: StreamGraphicSize
    /** Spiegel von `StreamGraphicSettings.showMaterial` — siehe `materialLabel` (Materialvermietung). */
    showMaterial: boolean
}

/** Startversatz eines neu eintreffenden Einlaufs — positiv: die neue Zeile schiebt sich von
 *  unten in die wachsende Liste herein (siehe `FlipList`-KDoc, Fall „neuer Schlüssel"). */
const ENTRY_ENTER_OFFSET = 32

/**
 * FINISH_TICKER: die Seitenleiste des Einlaufs — wächst mit jedem Zieleinlauf (Einschub-
 * Animation über `FlipList`), kein eigenes Auto-Out: `GraphicFrame` blendet nur aus, wenn der
 * Server selbst `visible=false` pusht (Ergebnis erscheint, Klärung, Szenenwechsel).
 *
 * Anders als Band und Tafel steckt hier KEIN `FitToHeight` dahinter: Die Liste soll sichtbar
 * WACHSEN, nicht in eine vorgegebene Höhe hineinschrumpfen. Sortiert defensiv nach `rank`
 * (`byNullsLast`), damit die Positionsanimation über mehrere Pushes hinweg stabil bleibt.
 *
 * Schmale Form: Vereinsketten ab drei Gliedern werden zusammengezogen („A / B +1"), die
 * Besatzung fällt über ihrem Budget auf Initialen zurück (Kürzungsleiter in `streamText.ts`).
 */
const StreamFinishTicker = ({entries, size, showMaterial}: StreamFinishTickerProps) => {
    const {t} = useTranslation()
    const sorted = [...entries].sort(byNullsLast(entry => entry.rank))

    // Kein erfundener Einlauf: ohne Eintrag zeigt der Ticker nichts.
    if (sorted.length === 0) return null

    return (
        <StreamPlate form="side" size={size}>
            <StreamHeader
                form="side"
                tag={<StreamTag label={t('event.stream.finishTicker')} indicator />}
                trailing={
                    <Typography
                        component="span"
                        sx={{
                            fontFamily: STREAM_DISPLAY_FONT,
                            fontWeight: 600,
                            fontSize: '1.1em',
                            color: STREAM_PLATE.muted,
                            letterSpacing: '0.04em',
                            fontVariantNumeric: 'tabular-nums',
                        }}>
                        {sorted.length}
                    </Typography>
                }
            />
            <Box sx={{py: '0.35em'}}>
                <FlipList
                    items={sorted}
                    keyOf={entry => String(entry.startNumber)}
                    enterOffset={ENTRY_ENTER_OFFSET}
                    render={(entry, index) => {
                        const crew = fitCrewNames(entry.participants ?? [], TICKER_CREW_BUDGET)
                        const m = materialLabel(entry.material, showMaterial ? 'always' : 'deviationsOnly')
                        const materialText = m === 'own' ? t('event.stream.material.own') : m?.text
                        const materialDeviates = typeof m === 'object' && m !== null && m.deviates
                        return (
                            <Box
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.7em',
                                    px: '1em',
                                    py: '0.45em',
                                    backgroundColor: index % 2 === 1 ? STREAM_PLATE.stripe : 'transparent',
                                }}>
                                <RankBadge place={entry.rank} />
                                <Typography
                                    component="span"
                                    sx={{
                                        fontFamily: STREAM_DISPLAY_FONT,
                                        fontWeight: 600,
                                        fontSize: '1.1em',
                                        lineHeight: 1,
                                        color: STREAM_PLATE.faint,
                                        fontVariantNumeric: 'tabular-nums',
                                        minWidth: '1.3em',
                                        textAlign: 'right',
                                        flexShrink: 0,
                                    }}>
                                    {entry.startNumber}
                                </Typography>
                                <Box sx={{flex: 1, minWidth: 0}}>
                                    <Typography
                                        component="div"
                                        noWrap
                                        sx={{fontWeight: 700, fontSize: '1.2em', lineHeight: 1.2}}>
                                        {collapseClubChain(entry.clubsShort ?? entry.clubsFull, TICKER_CHAIN_MAX_LINKS)}
                                    </Typography>
                                    {/* Besatzung als Zweitzeile — dieselbe Punkt-Kette wie in
                                        Startliste und Ergebnis, damit der Einlauf nicht das
                                        einzige Band ohne Namen bleibt. Darf auf zwei Zeilen
                                        umbrechen: Die Leiste wächst ohnehin je Einlauf, und ein
                                        Vierer passt in 34em auch mit Initialen nicht in eine. */}
                                    {crew.length > 0 && (
                                        <Typography
                                            component="div"
                                            sx={{
                                                fontSize: '0.95em',
                                                lineHeight: 1.2,
                                                color: STREAM_PLATE.muted,
                                                display: '-webkit-box',
                                                WebkitBoxOrient: 'vertical',
                                                WebkitLineClamp: 2,
                                                overflow: 'hidden',
                                            }}>
                                            {/* Jeder Name eine unumbrechbare Einheit: Der Umbruch
                                                fällt nur zwischen ganze Namen, nie in „St. B. Kristensen“
                                                hinein. Das Trennzeichen bleibt umbrechbar. */}
                                            {crew.map((name, nameIndex) => (
                                                <span key={nameIndex}>
                                                    <span style={{whiteSpace: 'nowrap'}}>{name}</span>
                                                    {nameIndex < crew.length - 1 && CREW_NAME_SEPARATOR}
                                                </span>
                                            ))}
                                        </Typography>
                                    )}
                                    {/* Materialhinweis: kleines Anhängsel unter der Besatzung, in
                                        Warnfarbe nur bei einer echten Abweichung von der
                                        Startnummer — dieselbe Zurückhaltung wie bei Startliste
                                        und Ergebnis (StreamBoatLine). */}
                                    {materialText && (
                                        <Typography
                                            component="div"
                                            noWrap
                                            sx={{
                                                fontSize: '0.95em',
                                                lineHeight: 1.2,
                                                color: materialDeviates ? STREAM_PLATE.warning : STREAM_PLATE.muted,
                                            }}>
                                            {materialText}
                                        </Typography>
                                    )}
                                </Box>
                                <Typography
                                    component="span"
                                    sx={{
                                        fontWeight: 700,
                                        fontSize: '1.3em',
                                        lineHeight: 1,
                                        fontVariantNumeric: 'tabular-nums',
                                        flexShrink: 0,
                                    }}>
                                    {entry.timeString}
                                </Typography>
                            </Box>
                        )
                    }}
                />
            </Box>
        </StreamPlate>
    )
}

export default StreamFinishTicker
