import {useEffect, useState} from 'react'
import {Box} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {StreamGraphicSize} from '@api/types.gen'
import StreamPlate from './design/StreamPlate.tsx'
import StreamTag from './design/StreamTag.tsx'
import {STREAM_PLATE} from './design/streamTheme.ts'

interface StreamCourseImageProps {
    imageUrl: string
    size: StreamGraphicSize
}

/**
 * COURSE_IMAGE: das hinterlegte Streckenbild, eingepasst (`object-fit: contain`) auf einer
 * Tafel mit dem Kennzeichen „Strecke" in der Ecke. FULL_CENTER kümmert sich um die Platzierung,
 * diese Grafik begrenzt nur ihre eigene Ausdehnung.
 *
 * BEKANNTE EINSCHRÄNKUNG: `imageUrl` zeigt auf einen Endpunkt, der eine Sitzung mit READ EVENT
 * voraussetzt — eine token-only-Bühne kann das Bild aktuell NICHT laden (Backend-Folgeaufgabe).
 * Ein Ladefehler zählt wie ein fehlendes Bild: es erscheint nichts, statt eines kaputten Icons.
 */
const StreamCourseImage = ({imageUrl, size}: StreamCourseImageProps) => {
    const {t} = useTranslation()

    // Ladefehler je URL merken statt global — ein neuer Push mit einer anderen `imageUrl`
    // soll wieder einen Ladeversuch bekommen, keinen eingefrorenen Fehlerzustand.
    const [failedUrl, setFailedUrl] = useState<string | null>(null)
    useEffect(() => {
        setFailedUrl(current => (current === imageUrl ? current : null))
    }, [imageUrl])

    if (failedUrl === imageUrl) return null

    return (
        <StreamPlate
            form="board"
            size={size}
            // Feste Breite statt „so breit wie das Bild": Ein SVG ohne Eigenmaß (nur viewBox) hat
            // keine intrinsische Größe und kollabierte auf einer inhaltsbreiten Fläche zu einem
            // Punkt. Mit fester Breite skaliert jedes Bild in die Fläche hinein.
            sx={{width: '100em', maxHeight: '56em', position: 'relative', p: '0.6em'}}>
            <Box sx={{position: 'absolute', top: '1.2em', left: '1.2em', fontSize: '1.05em', zIndex: 1}}>
                <StreamTag label={t('event.stream.courseImage')} />
            </Box>
            <img
                src={imageUrl}
                alt={t('event.stream.courseImage')}
                onError={() => setFailedUrl(imageUrl)}
                style={{
                    display: 'block',
                    width: '100%',
                    height: 'auto',
                    maxHeight: '54.8em',
                    objectFit: 'contain',
                    borderRadius: STREAM_PLATE.radius,
                }}
            />
        </StreamPlate>
    )
}

export default StreamCourseImage
