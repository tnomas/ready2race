import {ReactNode} from 'react'
import {Box} from '@mui/material'
import {SxProps, Theme} from '@mui/material/styles'

/**
 * Der Farbton eines Alarms auf den Zeitnahme-Bildschirmen. Bewusst eine kleine, benannte Menge
 * statt einer freien Farbe: die Bedeutung soll aus einigen Metern Entfernung ablesbar sein, und
 * dafür darf es genau zwei Zustände geben — ORANGE „angehalten, es geht gleich weiter" und ROT
 * „Abbruch/Fehlstart". Eine dritte Farbe würde die beiden ersten entwerten.
 */
export type BoardAlarmTone = 'warning' | 'error'

export type BoardAlarmProps = {
    /** Ohne Ton (undefined) zeichnet die Hülle gar nichts — der Normalfall bleibt unberührt. */
    tone: BoardAlarmTone | undefined
    children: ReactNode
    sx?: SxProps<Theme>
}

/**
 * Blinkende Alarm-Hülle für die Zeitnahme-Anzeigen: legt einen pulsierenden Farbschleier plus
 * kräftigen Rahmen um ihren Inhalt, ohne dessen Layout anzufassen.
 *
 * Parametrisiert statt fest orange, weil zwei Alarme darauf laufen sollen: die angehaltene
 * Startsequenz (orange — „gleich geht es weiter") und, aus einem parallelen Paket, der Fehlstart
 * (rot). Beide brauchen exakt dieselbe Mechanik; zwei Sonderlocken nebeneinander würden
 * unweigerlich auseinanderdriften.
 *
 * Der Schleier ist eine EIGENE, absolut positionierte Ebene, deren `opacity` animiert wird — nicht
 * die Hintergrundfarbe der Hülle selbst. Grund ist ein handfester CSS-Fallstrick: `@keyframes`
 * tragen globale Namen, auch wenn sie in einem `sx` stehen. Zwei Hüllen mit verschiedenen Farben
 * würden sich also gegenseitig die Animation überschreiben, und je nach Einfügereihenfolge blinkte
 * der Fehlstart plötzlich orange. Eine rein auf `opacity` laufende Animation ist farblos und damit
 * für jeden Ton dieselbe.
 *
 * `prefers-reduced-motion`: Blinken ist für manche Menschen nicht nur unangenehm, sondern ein
 * echtes Gesundheitsrisiko. Dann steht die Fläche still — aber in der kräftigeren der beiden
 * Deckkraft-Stufen, damit der Alarm trotzdem unübersehbar bleibt. Ein Alarm, den man abschalten
 * kann, wäre kein Alarm.
 */
const BoardAlarm = ({tone, children, sx}: BoardAlarmProps) => {
    if (tone === undefined) return <>{children}</>
    return (
        <Box
            sx={[
                {
                    position: 'relative',
                    borderRadius: 2,
                    border: 8,
                    borderColor: `${tone}.main`,
                    overflow: 'hidden',
                },
                ...(Array.isArray(sx) ? sx : sx !== undefined ? [sx] : []),
            ]}>
            <Box
                aria-hidden
                sx={{
                    position: 'absolute',
                    inset: 0,
                    // Der Schleier darf nie Klicks oder Tipp-Gesten schlucken — auf dem
                    // Startbildschirm entsperrt genau eine Geste den Ton (siehe `unlockAudio`).
                    pointerEvents: 'none',
                    bgcolor: `${tone}.main`,
                    opacity: 0.5,
                    '@keyframes boardAlarmPulse': {
                        '0%': {opacity: 0.15},
                        '50%': {opacity: 0.5},
                        '100%': {opacity: 0.15},
                    },
                    animation: 'boardAlarmPulse 1s ease-in-out infinite',
                    '@media (prefers-reduced-motion: reduce)': {
                        animation: 'none',
                        opacity: 0.5,
                    },
                }}
            />
            {/* Über den Schleier heben, sonst läge der Text unter der Farbfläche. */}
            <Box sx={{position: 'relative', zIndex: 1, width: 1, height: 1, display: 'flex'}}>
                {children}
            </Box>
        </Box>
    )
}

export default BoardAlarm
