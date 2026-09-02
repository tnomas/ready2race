import {Box} from '@mui/material'
import {STREAM_DISPLAY_FONT, STREAM_PLATE, useStreamAccent} from './streamTheme.ts'

interface RankBadgeProps {
    place: number | null | undefined
}

/**
 * Platzmarke: der Sieger in der Akzentfarbe, die Plätze zwei und drei hell unterlegt, alle
 * weiteren nur umrandet — ein Blick auf die Tafel zeigt das Podium, ohne Medaillenfarben,
 * die sich mit dem Veranstaltungs-Theme beißen könnten. Ohne Platz (DNF, Abmeldung) bleibt
 * die Marke leer, damit die Zeilen bündig bleiben.
 */
const RankBadge = ({place}: RankBadgeProps) => {
    const accent = useStreamAccent()
    const look =
        place === 1
            ? {backgroundColor: accent.main, color: accent.contrastText, borderColor: accent.main}
            : place === 2 || place === 3
              ? {backgroundColor: 'rgba(255, 255, 255, 0.18)', color: STREAM_PLATE.text, borderColor: 'transparent'}
              : {backgroundColor: 'transparent', color: STREAM_PLATE.muted, borderColor: STREAM_PLATE.divider}

    return (
        <Box
            sx={{
                width: '2.1em',
                height: '2.1em',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '0.2em',
                border: '1px solid',
                fontFamily: STREAM_DISPLAY_FONT,
                fontWeight: 700,
                fontSize: '1em',
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
                ...look,
            }}>
            {place ?? ''}
        </Box>
    )
}

export default RankBadge
