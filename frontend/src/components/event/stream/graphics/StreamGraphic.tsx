import {ReactElement} from 'react'
import {StreamGraphicViewDto} from '@api/types.gen'
import GraphicFrame from './GraphicFrame.tsx'
import StreamLapsBand from './StreamLapsBand.tsx'
import StreamNextUp from './StreamNextUp.tsx'
import StreamResultPanel from './StreamResultPanel.tsx'
import StreamStartlist from './StreamStartlist.tsx'

interface StreamGraphicProps {
    graphic: StreamGraphicViewDto
}

/**
 * Grafik-Typ → Inhalt. Nur die vier hier gebauten Typen (STARTLIST/NEXT_UP/LAPS/RESULT) haben
 * schon eine Komponente; die übrigen (CLOCK, FINISH_TICKER, SCHEDULE, COURSE_IMAGE) kommen mit
 * späteren Aufgaben dazu — bis dahin liefert ein noch unbehandelter oder inhaltloser Typ
 * bewusst nichts, statt eine leere Grafik-Hülle ins Bild zu stellen.
 *
 * `match`/`result` stehen laut Resolver-Vertrag UNABHÄNGIG von `visible` — auch eine gerade
 * ausblendende Grafik trägt ihren Inhalt noch (siehe `StreamSceneResolver`), sonst könnte
 * `GraphicFrame` die Ausblendanimation nicht mit echtem Inhalt zu Ende fahren.
 */
const contentFor = (graphic: StreamGraphicViewDto): ReactElement | null => {
    switch (graphic.type) {
        case 'STARTLIST':
            return graphic.match ? <StreamStartlist match={graphic.match} size={graphic.size} /> : null
        case 'NEXT_UP':
            return graphic.match ? <StreamNextUp match={graphic.match} size={graphic.size} /> : null
        case 'LAPS':
            return graphic.match ? <StreamLapsBand match={graphic.match} size={graphic.size} /> : null
        case 'RESULT':
            return graphic.result ? (
                <StreamResultPanel
                    result={graphic.result}
                    provisional={graphic.provisional}
                    size={graphic.size}
                />
            ) : null
        default:
            return null
    }
}

/** Eine einzelne Grafik des Szenenstands, in ihre Ein-/Ausblende-Hülle (`GraphicFrame`) gefasst. */
const StreamGraphic = ({graphic}: StreamGraphicProps) => {
    const content = contentFor(graphic)
    if (content === null) return null
    return (
        <GraphicFrame
            visible={graphic.visible}
            visibleSince={graphic.visibleSince}
            visibleUntil={graphic.visibleUntil}>
            {content}
        </GraphicFrame>
    )
}

export default StreamGraphic
