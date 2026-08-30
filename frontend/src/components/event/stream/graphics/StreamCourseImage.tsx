import {useEffect, useState} from 'react'
import {Box, useTheme} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {StreamGraphicSize} from '@api/types.gen'

interface StreamCourseImageProps {
    imageUrl: string
    size: StreamGraphicSize
}

/**
 * COURSE_IMAGE-Füllgrafik: das hinterlegte Streckenbild, eingepasst (`object-fit: contain`)
 * in einen dezenten Rahmen. FULL_CENTER kümmert sich um die Platzierung (siehe
 * `streamPlacement.ts`), diese Karte begrenzt nur ihre eigene maximale Ausdehnung.
 *
 * BEKANNTE EINSCHRÄNKUNG: `imageUrl` zeigt auf einen Endpunkt, der eine Sitzung mit
 * READ EVENT voraussetzt — eine token-only-Bühne kann das Bild aktuell NICHT laden. Das ist
 * hier bewusst nicht gelöst (Backend-Folgeaufgabe ist vermerkt); diese Komponente rendert nur,
 * was die URL tatsächlich liefert, und behandelt einen Ladefehler genauso wie ein fehlendes
 * Bild — es erscheint nichts, statt eines kaputten Bild-Icons.
 */
const StreamCourseImage = ({imageUrl, size}: StreamCourseImageProps) => {
    const {t} = useTranslation()
    const theme = useTheme()
    const compact = size === 'COMPACT'

    // Ladefehler je URL merken statt global — ein neuer Push mit einer anderen `imageUrl`
    // (anderes Streckenbild) soll wieder einen Ladeversuch bekommen, keinen eingefrorenen
    // Fehlerzustand vom vorigen Bild.
    const [failedUrl, setFailedUrl] = useState<string | null>(null)
    useEffect(() => {
        setFailedUrl(current => (current === imageUrl ? current : null))
    }, [imageUrl])

    if (failedUrl === imageUrl) return null

    return (
        <Box
            sx={{
                // Bühnenfeste rem statt vw/vh: siehe `StreamBandShell` — Fenstermaße ließen
                // den Rahmen in der Regie-Vorschau anders ausfallen als in der OBS-Quelle.
                // (84/98rem ≙ 70/82 % der 120rem breiten Bühne, 40/52rem ≙ 60/78 % der Höhe.)
                maxWidth: compact ? '84rem' : '98rem',
                maxHeight: compact ? '40rem' : '52rem',
                p: compact ? 1 : 1.5,
                borderRadius: 2,
                boxShadow: '0 24px 56px rgba(0, 0, 0, 0.45)',
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                border: `1px solid ${theme.palette.common.white}22`,
                display: 'flex',
            }}>
            <img
                src={imageUrl}
                alt={t('event.stream.courseImage')}
                onError={() => setFailedUrl(imageUrl)}
                style={{
                    display: 'block',
                    maxWidth: '100%',
                    maxHeight: compact ? '39rem' : '51rem',
                    objectFit: 'contain',
                    borderRadius: 4,
                }}
            />
        </Box>
    )
}

export default StreamCourseImage
