import {ReactNode, useEffect, useState} from 'react'
import {Box} from '@mui/material'
import {StreamSceneViewDto} from '@api/types.gen'
import StreamGraphic from './graphics/StreamGraphic.tsx'
import {stageScale, STREAM_STAGE_HEIGHT, STREAM_STAGE_WIDTH} from './stageScale.ts'
import {STREAM_PLACEMENTS, STREAM_SLOT_STYLE} from './streamPlacement.ts'
import {StreamStaleContext} from './StreamStaleContext.ts'

interface StreamStageProps {
    view: StreamSceneViewDto
    /** Client-Server-Zeitversatz (`clientNow - serverTime`) für CLOCK — siehe `StreamScenePage`. */
    clockOffsetMs: number
    /** Veraltet-Sperre der Bühne: keine NEUEN Einblendungen ohne Lebenszeichen (siehe `GraphicFrame`). */
    stale: boolean
    /**
     * Optionale Fläche HINTER den Grafiken, im selben 1920×1080-Raster — die Demo-Galerie legt
     * hier ein simuliertes Kamerabild hin; die echte Bühne lässt das leer (dort liegt das
     * Kamerabild außerhalb des Dokuments, erst im Mischer).
     */
    backdrop?: ReactNode
}

/**
 * Die feste 1920×1080-Entwurfsfläche, die eine Szene zeichnet: mittig in ihrem (positionierten)
 * Elternelement, als Ganzes auf dessen Fenster skaliert (`stageScale`), darin der
 * Sicherheitsbereich und die acht Grafikplätze. Gemeinsamer Kern von Bühne (`StreamScenePage`)
 * und Demo-Galerie, damit die Grafiken nie zwei verschiedene Bühnen sehen.
 */
const StreamStage = ({view, clockOffsetMs, stale, backdrop}: StreamStageProps) => {
    const [windowSize, setWindowSize] = useState(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
    }))
    useEffect(() => {
        const onResize = () => setWindowSize({width: window.innerWidth, height: window.innerHeight})
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
    }, [])
    const scale = stageScale(windowSize.width, windowSize.height)

    return (
        <Box
            data-stale={stale}
            sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: STREAM_STAGE_WIDTH,
                height: STREAM_STAGE_HEIGHT,
                transform: `translate(-50%, -50%) scale(${scale})`,
                transformOrigin: 'center center',
            }}>
            {backdrop && <Box sx={{position: 'absolute', inset: 0}}>{backdrop}</Box>}
            {/* Die Veraltet-Sperre reist als Kontext statt als Prop durch jede einzelne
                Grafik — GraphicFrame liest sie über `useStreamStale` (siehe dort). */}
            <StreamStaleContext.Provider value={stale}>
                <Box sx={{position: 'absolute', inset: `${view.safeAreaPercent}%`}}>
                    {STREAM_PLACEMENTS.map(placement => {
                        const graphicsAtPlacement = view.graphics.filter(graphic => graphic.placement === placement)
                        return (
                            // STREAM_SLOT_STYLE statt eines ad-hoc zusammengesetzten Stils:
                            // Grid-Stapelung UND Zentrierung gehören zusammen entschieden
                            // (siehe dessen KDoc).
                            <Box key={placement} data-placement={placement} sx={STREAM_SLOT_STYLE[placement]}>
                                {graphicsAtPlacement.map(graphic => (
                                    // `minWidth: 0` + `maxWidth: '100%'`: Ohne beides zöge eine
                                    // Grafik mit nicht umbrechbarem Inhalt die Grid-Spur über die
                                    // Platzbreite hinaus auf und ragte über die Bühne.
                                    <Box key={graphic.type} sx={{gridArea: '1 / 1', minWidth: 0, maxWidth: '100%'}}>
                                        <StreamGraphic graphic={graphic} clockOffsetMs={clockOffsetMs} />
                                    </Box>
                                ))}
                            </Box>
                        )
                    })}
                </Box>
            </StreamStaleContext.Provider>
        </Box>
    )
}

export default StreamStage
