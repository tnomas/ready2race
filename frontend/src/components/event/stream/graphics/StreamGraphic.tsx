import {ReactElement, useRef} from 'react'
import {StreamGraphicViewDto} from '@api/types.gen'
import GraphicFrame from './GraphicFrame.tsx'
import StreamClock from './StreamClock.tsx'
import StreamCourseImage from './StreamCourseImage.tsx'
import StreamFinishTicker from './StreamFinishTicker.tsx'
import StreamLapsBand from './StreamLapsBand.tsx'
import StreamNextUp from './StreamNextUp.tsx'
import StreamResultPanel from './StreamResultPanel.tsx'
import StreamSchedule from './StreamSchedule.tsx'
import StreamStartlist from './StreamStartlist.tsx'
import {hasGraphicContent, retainGraphicContent} from './retainGraphicContent.ts'

interface StreamGraphicProps {
    graphic: StreamGraphicViewDto
    /** Client-Server-Zeitversatz (`clientNow - serverTime`) für CLOCK — siehe `StreamScenePage`. */
    clockOffsetMs: number
}

/**
 * Grafik-Typ → Inhalt. Ein inhaltloser Typ (z. B. SCHEDULE ohne anstehende Läufe oder
 * COURSE_IMAGE ohne hinterlegtes Bild) liefert bewusst nichts, statt eine leere Grafik-Hülle
 * ins Bild zu stellen.
 *
 * WICHTIG: `match`/`result`/`finishEntries` sind NICHT unabhängig von `visible` — sie leiten
 * sich aus demselben Renn-Zustand ab (`input.preparing`/`input.running`, siehe
 * `StreamSceneResolver.autoFor`). Endet der vorbereitete/laufende Lauf, können `visible` UND
 * der Inhalt im SELBEN Push wegfallen (z. B. Sequenzstart mitten im 15-s-Startlisten-Fenster,
 * oder ein Laufende mitten im 8-s-Rundenfenster). `contentFor` bekommt deshalb nie den rohen
 * Push, sondern den von `StreamGraphic` schon um `retainGraphicContent` ergänzten Stand.
 */
const contentFor = (graphic: StreamGraphicViewDto, clockOffsetMs: number): ReactElement | null => {
    switch (graphic.type) {
        case 'STARTLIST':
            return graphic.match ? (
                <StreamStartlist
                    match={graphic.match}
                    size={graphic.size}
                    placement={graphic.placement}
                    showMaterial={graphic.showMaterial}
                />
            ) : null
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
                    placement={graphic.placement}
                    showMaterial={graphic.showMaterial}
                />
            ) : null
        case 'CLOCK':
            return graphic.match ? (
                <StreamClock
                    match={graphic.match}
                    sequenceStartedAt={graphic.sequenceStartedAt}
                    sequenceFiresAt={graphic.sequenceFiresAt}
                    sequencePausedAt={graphic.sequencePausedAt}
                    clockOffsetMs={clockOffsetMs}
                    size={graphic.size}
                />
            ) : null
        case 'FINISH_TICKER':
            return graphic.finishEntries && graphic.finishEntries.length > 0 ? (
                <StreamFinishTicker
                    entries={graphic.finishEntries}
                    size={graphic.size}
                    showMaterial={graphic.showMaterial}
                />
            ) : null
        case 'SCHEDULE':
            return graphic.schedule && graphic.schedule.length > 0 ? (
                <StreamSchedule schedule={graphic.schedule} size={graphic.size} />
            ) : null
        case 'COURSE_IMAGE':
            return graphic.imageUrl ? (
                <StreamCourseImage imageUrl={graphic.imageUrl} size={graphic.size} />
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
const StreamGraphic = ({graphic, clockOffsetMs}: StreamGraphicProps) => {
    const lastWithContentRef = useRef<StreamGraphicViewDto | null>(null)
    const effective = retainGraphicContent(graphic, lastWithContentRef.current)
    if (hasGraphicContent(graphic)) lastWithContentRef.current = graphic

    const content = contentFor(effective, clockOffsetMs)
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
