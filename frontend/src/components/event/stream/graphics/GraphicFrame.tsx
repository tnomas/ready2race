import {ReactNode, useEffect, useRef, useState} from 'react'
import {Box} from '@mui/material'
import {allowsNewlyVisible} from '../streamStale.ts'
import {useStreamStale} from '../StreamStaleContext.ts'
import {expiredWhileStale, GRAPHIC_TRANSITION_MS, visibilityPhase} from './graphicVisibility.ts'

interface GraphicFrameProps {
    visible: boolean
    /**
     * Zeitpunkt/-fenster des Servers für diese Einblendung — Teil des DTO-Vertrags
     * (`StreamGraphicViewDto.visibleSince`/`visibleUntil`). Im Normalbetrieb NICHT ausgewertet:
     * Der Server pusht einen neuen Rahmen mit `visible=false`, sobald `visibleUntil` erreicht
     * ist (siehe `StreamSceneResolver.nextEvaluationAt`). Nur in einer Störung (Bühne veraltet)
     * zählt die Hülle anhand von `visibleUntil` selbst mit — siehe `expiredWhileStale`.
     */
    visibleSince?: string | null
    visibleUntil?: string | null
    /**
     * Client-Server-Zeitversatz (`clientNow − serverTime`, siehe `StreamScenePage`), um
     * `visibleUntil` in die Geräteuhr umzurechnen. Fehlt er, gilt die Serveruhr als Geräteuhr.
     */
    clockOffsetMs?: number
    /**
     * Wird gerufen, sobald die Hülle die Phase `hidden` erreicht — also NACH der
     * Ausblendanimation nichts mehr rendert. `StreamGraphic` lässt daran seinen zurückgehaltenen
     * Inhalt fallen (siehe `retainGraphicContent`): ab hier gibt es nichts mehr, das die
     * Animation noch bräuchte.
     */
    onHidden?: () => void
    children: ReactNode
}

/** Versatz des Hinein-/Herausgleitens in px — dezent, die Bandgrafiken selbst sind flach. */
const SLIDE_OFFSET_PX = 24

/**
 * Gemeinsame Hülle jeder Bandgrafik: übernimmt vom Szenenstand `visible` und blendet den
 * Inhalt animiert (Slide+Fade, ~300 ms) ein bzw. aus. Anders als beim alten Chroma-Key-Overlay
 * ist Alpha hier erlaubt — die Bühne (Task 9) ist eine echte transparente Fläche, kein Keying.
 *
 * Zwei Zustände treiben das Aussehen:
 * - `phase` (reine Funktion `visibilityPhase`, siehe dort) sagt, ob der Inhalt überhaupt noch
 *   gemountet bleiben soll — `hidden` ist der einzige Fall, in dem NICHTS gerendert wird. So
 *   bleibt der Inhalt während der Ausblenddauer sichtbar und fährt seine Animation zu Ende,
 *   statt hart zu verschwinden.
 * - `settled` ist der eigentliche CSS-Trigger: Eine neu gemountete Grafik rendert ihren ERSTEN
 *   Frame noch im Aus-Zustand (sonst hätte der Browser keinen Vorzustand, von dem er
 *   übergehen könnte) und wird erst einen Frame später auf „an" umgeschaltet — das klassische
 *   Enter-Transition-Muster. Beim Ausblenden reicht der direkte Wechsel, der „an"-Zustand war
 *   ja schon gerendert.
 *
 * Veraltet-Sperre (`allowsNewlyVisible`): Eine bislang unsichtbare Grafik darf nur NEU
 * sichtbar werden, solange die Bühne frisch ist (`useStreamStale`, von `StreamScenePage`
 * gesetzt) — sonst wäre das eine Einblendung, die der Server nie bestätigt hat. Eine bereits
 * laufende Einblendung bleibt davon unberührt.
 *
 * Kein `backdropFilter` auf den Grafiken selbst (siehe die einzelnen Kacheln): Die Bühne ist
 * eine transparente Fläche, hinter den Kästen liegt nichts, was sich verwischen ließe — das
 * Kamerabild liegt außerhalb des Dokuments, erst im Mischer. Der Filter bewirkt also nichts,
 * zwingt den Browser aber, ihn bei jedem Animationsbild dieser Ein-/Ausblendung neu zu
 * berechnen, was hier genau die ruckelige Bewegung verursacht hat, die diese Hülle eigentlich
 * glätten soll. `willChange` gibt dem Browser stattdessen vorab einen echten Compositing-Hinweis
 * für die tatsächlich animierten Eigenschaften.
 */
const GraphicFrame = ({
    visible,
    visibleUntil,
    clockOffsetMs = 0,
    onHidden,
    children,
}: GraphicFrameProps) => {
    const stale = useStreamStale()
    // Immer die neueste Fassung rufen, ohne dass eine neue Funktions-Identität den Effekt unten
    // erneut auslöst — er soll genau einmal je Erreichen von `hidden` feuern.
    const onHiddenRef = useRef(onHidden)
    onHiddenRef.current = onHidden

    const [now, setNow] = useState(() => Date.now())

    // Ablauf bei Verbindungsverlust (siehe `expiredWhileStale`): In der Störung kommt der
    // Ausblende-Push nicht — die Hülle stellt sich deshalb selbst einen Wecker auf das
    // Fensterende und rechnet `now` dann einmal neu. Ohne Störung oder ohne Fenster kein Wecker.
    useEffect(() => {
        if (!stale || visibleUntil == null) return
        const untilMs = Date.parse(visibleUntil)
        if (Number.isNaN(untilMs)) return
        setNow(Date.now())
        const remaining = untilMs + clockOffsetMs - Date.now()
        if (remaining <= 0) return
        const id = window.setTimeout(() => setNow(Date.now()), remaining + 16)
        return () => window.clearTimeout(id)
    }, [stale, visibleUntil, clockOffsetMs])
    const expired = expiredWhileStale(stale, visibleUntil, clockOffsetMs, now)

    const [wasVisible, setWasVisible] = useState(false)
    const effectiveVisible = visible && !expired && allowsNewlyVisible(stale, wasVisible)
    useEffect(() => {
        setWasVisible(effectiveVisible)
    }, [effectiveVisible])

    // Zeitpunkt, seit dem `effectiveVisible` in seiner jetzigen Fassung gilt — Grundlage von
    // `visibilityPhase`. Angepasst während des Renderns (das React-Muster „Zustand aus einer
    // Prop-Änderung ableiten"), damit kein zusätzlicher Render-Umweg über einen Effekt nötig ist.
    //
    // War die Grafik beim allerersten Rendern schon unsichtbar (Inhalt existiert, ist aber
    // gerade nicht auf Sendung — z. B. eine vorbereitete Startliste vor ihrem Anzeigefenster),
    // liegt der Startwert bewusst schon eine Animationsdauer in der Vergangenheit: Sie soll
    // sofort `hidden` sein, nicht für 300 ms unsichtbar als `leaving` mitgerendert werden, als
    // hätte sie gerade erst aufgehört zu zeigen, was sie nie gezeigt hat.
    const [changedAt, setChangedAt] = useState(() =>
        effectiveVisible ? Date.now() : Date.now() - GRAPHIC_TRANSITION_MS,
    )
    const [lastEffectiveVisible, setLastEffectiveVisible] = useState(effectiveVisible)
    if (lastEffectiveVisible !== effectiveVisible) {
        setLastEffectiveVisible(effectiveVisible)
        setChangedAt(Date.now())
    }

    const phase = visibilityPhase(effectiveVisible, changedAt, now)

    // Treibt den Phasenübergang voran, ohne dass eine neue Nachricht vom Server nötig wäre —
    // genau ein Timeout, das sich selbst beendet, sobald `phase` nicht mehr in der Animation
    // steckt (kein Sekundentakt, kein Intervall, das im Hintergrund weiterliefe).
    useEffect(() => {
        if (phase !== 'entering' && phase !== 'leaving') return
        const remaining = GRAPHIC_TRANSITION_MS - (Date.now() - changedAt) + 16
        const id = window.setTimeout(() => setNow(Date.now()), Math.max(remaining, 0))
        return () => window.clearTimeout(id)
    }, [phase, changedAt])

    const [settled, setSettled] = useState(false)
    useEffect(() => {
        if (!effectiveVisible) {
            setSettled(false)
            return
        }
        // In einem VERDECKTEN Dokument sofort in den Endzustand: Browser setzen dort
        // `requestAnimationFrame` aus, und genau diesen Zustand kann eine Wirecast/CEF-
        // Aufnahmequelle dauerhaft melden, obwohl sie aktiv aufnimmt (dasselbe Muster wie
        // der 250-ms-Fallback der Laufuhr, siehe `StreamClock`) — jede neu eingeblendete
        // Grafik bliebe für immer bei Opacity 0. Eine Enter-Animation sieht dort ohnehin
        // niemand, der korrekte Endzustand schlägt sie. Sichtbar bleibt der saubere
        // rAF-Übergang, mit einem Timeout als zweitem Netz (wer zuerst feuert, gewinnt —
        // `setSettled(true)` ist idempotent).
        if (document.visibilityState === 'hidden') {
            setSettled(true)
            return
        }
        const frameId = requestAnimationFrame(() => setSettled(true))
        const timerId = window.setTimeout(() => setSettled(true), 50)
        return () => {
            cancelAnimationFrame(frameId)
            window.clearTimeout(timerId)
        }
    }, [effectiveVisible])

    useEffect(() => {
        if (phase === 'hidden') onHiddenRef.current?.()
    }, [phase])

    if (phase === 'hidden') return null

    return (
        <Box
            sx={{
                transition: `opacity ${GRAPHIC_TRANSITION_MS}ms ease, transform ${GRAPHIC_TRANSITION_MS}ms ease`,
                opacity: settled ? 1 : 0,
                transform: settled ? 'translateY(0)' : `translateY(${SLIDE_OFFSET_PX}px)`,
                willChange: 'transform, opacity',
            }}>
            {children}
        </Box>
    )
}

export default GraphicFrame
