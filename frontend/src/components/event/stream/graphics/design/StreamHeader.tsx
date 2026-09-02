import {ReactNode} from 'react'
import {Box, Typography} from '@mui/material'
import {STREAM_DISPLAY_FONT, STREAM_PLATE} from './streamTheme.ts'
import {StreamForm} from './streamLayout.ts'

interface StreamHeaderProps {
    form: StreamForm
    /** Das Kennzeichen (`StreamTag`), oder mehrere. */
    tag: ReactNode
    title?: string | null
    subtitle?: string | null
    trailing?: ReactNode
}

/** Titelgrößen je Form — die Tafel trägt den größten Kopf, die Seitenleiste den kleinsten. */
const TITLE_SIZE: Record<StreamForm, string> = {
    band: '2.3em',
    board: '3.1em',
    side: '1.45em',
    plate: '1.6em',
}

const SUBTITLE_SIZE: Record<StreamForm, string> = {
    band: '1.35em',
    board: '1.65em',
    side: '1.05em',
    plate: '1.1em',
}

const TAG_SIZE: Record<StreamForm, string> = {
    band: '1.05em',
    board: '1.25em',
    side: '0.9em',
    plate: '0.9em',
}

/**
 * Kopfzeile einer Grafik: Kennzeichen, Wettkampf (groß, schmale Schaubühnen-Schrift), Runde/Lauf
 * daneben in gedämpfter Tönung, rechts ein optionaler Anhang (Uhrzeit, „Vorläufig"). Eine
 * Haarlinie trennt den Kopf von den Zeilen.
 */
const StreamHeader = ({form, tag, title, subtitle, trailing}: StreamHeaderProps) => (
    <Box
        sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '1em',
            flexShrink: 0,
            px: form === 'side' ? '1em' : '1.35em',
            py: form === 'board' ? '1em' : '0.7em',
            borderBottom: `1px solid ${STREAM_PLATE.divider}`,
        }}>
        <Box sx={{display: 'flex', alignItems: 'center', gap: '0.5em', flexShrink: 0, fontSize: TAG_SIZE[form]}}>
            {tag}
        </Box>
        {(title || subtitle) && (
            <Box sx={{display: 'flex', alignItems: 'baseline', gap: '0.7em', minWidth: 0, flex: 1}}>
                {title && (
                    <Typography
                        component="div"
                        noWrap
                        sx={{
                            fontFamily: STREAM_DISPLAY_FONT,
                            fontWeight: 700,
                            fontSize: TITLE_SIZE[form],
                            lineHeight: 1.1,
                            letterSpacing: '0.01em',
                            minWidth: 0,
                            flexShrink: 1,
                        }}>
                        {title}
                    </Typography>
                )}
                {subtitle && (
                    <Typography
                        component="div"
                        noWrap
                        sx={{
                            fontFamily: STREAM_DISPLAY_FONT,
                            fontWeight: 600,
                            fontSize: SUBTITLE_SIZE[form],
                            lineHeight: 1.1,
                            letterSpacing: '0.02em',
                            color: STREAM_PLATE.muted,
                            minWidth: 0,
                            flexShrink: 3,
                        }}>
                        {subtitle}
                    </Typography>
                )}
            </Box>
        )}
        {trailing && (
            <Box sx={{display: 'flex', alignItems: 'center', gap: '0.75em', flexShrink: 0, ml: 'auto'}}>
                {trailing}
            </Box>
        )}
    </Box>
)

export default StreamHeader
