import {ReactElement, useRef} from 'react'
import {StreamGraphicViewDto} from '@api/types.gen'
import GraphicFrame from './GraphicFrame.tsx'
import StreamLapsBand from './StreamLapsBand.tsx'
import StreamNextUp from './StreamNextUp.tsx'
import StreamResultPanel from './StreamResultPanel.tsx'
import StreamStartlist from './StreamStartlist.tsx'
import {hasGraphicContent, retainGraphicContent} from './retainGraphicContent.ts'

interface StreamGraphicProps {
    graphic: StreamGraphicViewDto
}

/**
 * Grafik-Typ → Inhalt. Nur die vier hier gebauten Typen (STARTLIST/NEXT_UP/LAPS/RESULT) haben
 * schon eine Komponente; die übrigen (CLOCK, FINISH_TICKER, SCHEDULE, COURSE_IMAGE) kommen mit
 * späteren Aufgaben dazu — bis dahin liefert ein noch unbehandelter oder inhaltloser Typ
 * bewusst nichts, statt eine leere Grafik-Hülle ins Bild zu stellen.
 *
 * WICHTIG: `match`/`result` sind NICHT unabhängig von `visible` — beide leiten sich aus
 * demselben Renn-Zustand ab (`input.preparing`/`input.running`, siehe
 * `StreamSceneResolver.autoFor`). Endet der vorbereitete/laufende Lauf, können `visible` UND
 * der Inhalt im SELBEN Push wegfallen (z. B. Sequenzstart mitten im 15-s-Startlisten-Fenster,
 * oder ein Laufende mitten im 8-s-Rundenfenster). `contentFor` bekommt deshalb nie den rohen
 * Push, sondern den von `StreamGraphic` schon um `retainGraphicContent` ergänzten Stand.
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

/**
 * Eine einzelne Grafik des Szenenstands, in ihre Ein-/Ausblende-Hülle (`GraphicFrame`) gefasst.
 *
 * Hält den zuletzt bekannten INHALTSTRAGENDEN Push in einem Ref fest und lässt
 * `retainGraphicContent` daraus den tatsächlich gerenderten Stand bilden: Löscht ein Push
 * `visible` und den Inhalt im selben Schritt (siehe `contentFor`-KDoc), zeigt die Grafik
 * trotzdem noch ihren letzten echten Inhalt, während `GraphicFrame` anhand von `visible`
 * ausblendet. Ist die Ausblendanimation fertig (`phase === 'hidden'`), rendert `GraphicFrame`
 * von sich aus nichts mehr — der Ref muss dafür nie eigens geleert werden.
 */
const StreamGraphic = ({graphic}: StreamGraphicProps) => {
    const lastWithContentRef = useRef<StreamGraphicViewDto | null>(null)
    const effective = retainGraphicContent(graphic, lastWithContentRef.current)
    if (hasGraphicContent(graphic)) lastWithContentRef.current = graphic

    const content = contentFor(effective)
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
