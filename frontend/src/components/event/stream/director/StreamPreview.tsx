import {useLayoutEffect, useRef, useState} from 'react'
import {Box} from '@mui/material'
import {StreamPlacement, StreamSceneViewDto} from '@api/types.gen'
import StreamStage from '../StreamStage.tsx'
import {STREAM_STAGE_HEIGHT, STREAM_STAGE_WIDTH} from '../stageScale.ts'
import {DIRECTOR_COLORS} from './directorTheme.ts'

interface StreamPreviewProps {
    view: StreamSceneViewDto
    clockOffsetMs: number
    /** Kantenlänge des Schachbretts in px — grob für die große Programmvorschau, fein für Miniaturen. */
    checkerSize?: number
    /**
     * Platz, auf den die Miniatur heranzoomt: Eine Uhr oben rechts wäre in einer ganzen
     * 16:9-Bühne auf Kartenbreite nur ein Fleck. Der Ausschnitt bleibt an der Bühnenkante
     * verankert, damit die Regie weiterhin sieht, WO die Grafik sitzt.
     */
    focus?: StreamPlacement
}

/** Vergrößerung und Ankerpunkt je Platz — Vollbild-Grafiken bleiben ungezoomt. */
const FOCUS: Record<StreamPlacement, {zoom: number; origin: string}> = {
    BOTTOM_CENTER: {zoom: 1.6, origin: '50% 100%'},
    BOTTOM_LEFT: {zoom: 1.8, origin: '0% 100%'},
    BOTTOM_RIGHT: {zoom: 1.8, origin: '100% 100%'},
    TOP_LEFT: {zoom: 2.2, origin: '0% 0%'},
    TOP_RIGHT: {zoom: 2.2, origin: '100% 0%'},
    SIDE_LEFT: {zoom: 1.8, origin: '0% 35%'},
    SIDE_RIGHT: {zoom: 1.8, origin: '100% 35%'},
    FULL_CENTER: {zoom: 1, origin: '50% 50%'},
}

/**
 * Eine 16:9-Vorschau der Bühne im verfügbaren Platz: misst ihren Kasten und lässt `StreamStage`
 * hineinpassen — dieselbe Bühne, dieselben Grafiken, nur kleiner. Hinter der transparenten
 * Szene liegt ein Schachbrett, damit die Regie sieht, was im Mischer durchsichtig ist. Nie
 * klickbar: Sie liegt dekorativ über den Bedienelementen.
 */
const StreamPreview = ({view, clockOffsetMs, checkerSize = 24, focus}: StreamPreviewProps) => {
    const boxRef = useRef<HTMLDivElement>(null)
    const [size, setSize] = useState({width: 0, height: 0})

    useLayoutEffect(() => {
        const box = boxRef.current
        if (!box) return
        const measure = () => setSize({width: box.clientWidth, height: box.clientHeight})
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(box)
        return () => observer.disconnect()
    }, [])

    const pageBackground = view.background === 'CHROMA' ? (view.chromaColor ?? '#00FF00') : undefined

    return (
        <Box
            ref={boxRef}
            aria-hidden
            sx={{
                position: 'relative',
                width: '100%',
                aspectRatio: `${STREAM_STAGE_WIDTH} / ${STREAM_STAGE_HEIGHT}`,
                overflow: 'hidden',
                borderRadius: 1,
                pointerEvents: 'none',
                backgroundColor: pageBackground ?? '#0d1420',
                ...(pageBackground
                    ? {}
                    : {
                          backgroundImage: DIRECTOR_COLORS.checker,
                          backgroundSize: `${checkerSize}px ${checkerSize}px`,
                          backgroundPosition: `0 0, 0 ${checkerSize / 2}px, ${checkerSize / 2}px -${checkerSize / 2}px, -${checkerSize / 2}px 0`,
                      }),
            }}>
            {size.width > 0 && (
                <Box
                    sx={{
                        position: 'absolute',
                        inset: 0,
                        transform: focus ? `scale(${FOCUS[focus].zoom})` : undefined,
                        transformOrigin: focus ? FOCUS[focus].origin : undefined,
                    }}>
                    <StreamStage view={view} clockOffsetMs={clockOffsetMs} stale={false} size={size} />
                </Box>
            )}
        </Box>
    )
}

export default StreamPreview
