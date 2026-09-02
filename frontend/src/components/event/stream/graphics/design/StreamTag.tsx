import {Box} from '@mui/material'
import {STREAM_DISPLAY_FONT, STREAM_PLATE, useStreamAccent} from './streamTheme.ts'

export type StreamTagTone = 'accent' | 'warning' | 'neutral'

interface StreamTagProps {
    label: string
    tone?: StreamTagTone
    /** Ein Punkt vor dem Text — „on air", nur für Zustände, die gerade laufen. */
    indicator?: boolean
}

/**
 * Das Kennzeichen jeder Grafik („ERGEBNIS", „EINLAUF", „VORLÄUFIG"): ein nach vorn geneigtes
 * Farbfeld mit Versalien — die eine wiederkehrende Geste der Bildsprache, deshalb sonst nirgends
 * eine Schräge. Der Text wird zurückgeneigt, damit nur das Feld kippt, nicht die Schrift.
 */
const StreamTag = ({label, tone = 'accent', indicator = false}: StreamTagProps) => {
    const accent = useStreamAccent()
    const colors = {
        accent: {background: accent.main, color: accent.contrastText},
        warning: {background: STREAM_PLATE.warning, color: STREAM_PLATE.warningText},
        neutral: {background: 'rgba(255, 255, 255, 0.16)', color: STREAM_PLATE.text},
    }[tone]

    return (
        <Box
            sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5em',
                flexShrink: 0,
                px: '0.75em',
                py: '0.22em',
                borderRadius: '0.18em',
                transform: 'skewX(-12deg)',
                ...colors,
            }}>
            <Box
                component="span"
                sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45em',
                    transform: 'skewX(12deg)',
                    fontFamily: STREAM_DISPLAY_FONT,
                    fontWeight: 700,
                    fontSize: '1em',
                    lineHeight: 1.2,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                }}>
                {indicator && (
                    <Box
                        component="span"
                        sx={{
                            width: '0.5em',
                            height: '0.5em',
                            borderRadius: '50%',
                            backgroundColor: 'currentColor',
                        }}
                    />
                )}
                {label}
            </Box>
        </Box>
    )
}

export default StreamTag
