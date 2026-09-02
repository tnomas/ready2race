import {ReactNode} from 'react'
import {Box, SxProps, Theme} from '@mui/material'
import {StreamGraphicSize} from '@api/types.gen'
import {STREAM_PLATE, streamDensity} from './streamTheme.ts'
import {StreamForm} from './streamLayout.ts'

interface StreamPlateProps {
    form: StreamForm
    size: StreamGraphicSize
    /** Feinjustierung je Grafik (z. B. schmalere Tafel fürs Tagesprogramm) — nach den Formmaßen angewendet. */
    sx?: SxProps<Theme>
    children: ReactNode
}

/**
 * Grundfläche jeder Stream-Grafik. Die Form legt Breite und Höhengrenze fest — alles in `em`
 * gegen die Wurzel-Schriftgröße (`streamDensity`), sodass COMPACT eine ganze Grafik samt
 * Fläche dichter setzt statt nur die Schrift zu verkleinern.
 *
 * Bühnenfeste Maße (die Bühne ist immer 1920×1080 = 120×67,5rem): ein Band füllt vier
 * Fünftel der Breite und bleibt unter der Hälfte der Höhe, eine Tafel gut sieben Achtel der
 * Breite; beides bewusst ohne `vw`/`vh`, damit Regie-Vorschau und Wirecast-Quelle dasselbe
 * Bild liefern.
 */
const FORM_SX: Record<StreamForm, SxProps<Theme>> = {
    band: {width: '96em', maxHeight: '32em'},
    board: {width: '104em', maxHeight: '58em'},
    side: {width: '34em'},
    plate: {width: 'auto'},
}

const StreamPlate = ({form, size, sx, children}: StreamPlateProps) => (
    <Box
        sx={[
            {
                fontSize: `${streamDensity(size)}rem`,
                maxWidth: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                borderRadius: STREAM_PLATE.radius,
                background: STREAM_PLATE.background,
                boxShadow: `${STREAM_PLATE.shadow}, inset 0 1px 0 ${STREAM_PLATE.hairline}`,
                color: STREAM_PLATE.text,
                // Kein `backdrop-filter`: auf der transparenten Bühne liegt hinter der Fläche
                // nichts, was sich verwischen ließe — er kostete nur je Bild Rechenzeit.
            },
            FORM_SX[form],
            ...(Array.isArray(sx) ? sx : [sx]),
        ]}>
        {children}
    </Box>
)

export default StreamPlate
