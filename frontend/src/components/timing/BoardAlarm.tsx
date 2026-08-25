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
/**
 * Die Alarmfarben stehen hier FEST und kommen bewusst nicht aus dem Theme (`warning.main` /
 * `error.main`). Zwei Gründe, beide am laufenden Bildschirm aufgefallen:
 *
 * - Das Theme einer Veranstaltung ist Gestaltung: Vereinsfarben, Sponsorentöne, oft pastellig.
 *   Der Vorgabe-Warnton lief als heller Sandton (rgb(245,217,176)) durch — auf einem Bildschirm
 *   am Steg ist das aus zehn Metern kein Alarm mehr, sondern eine Verfärbung.
 * - Ein Alarm muss auf JEDER Veranstaltung gleich aussehen. Wer das Theme umstellt, darf nicht
 *   versehentlich die Bedeutung von „angehalten" und „Fehlstart" verwässern.
 *
 * Deshalb: kräftiges Bernstein für „angehalten", kräftiges Rot für „Fehlstart", beide dunkel
 * genug für weiße Schrift.
 */
const ALARM_COLORS: Record<BoardAlarmTone, string> = {
    warning: '#e65100',
    error: '#c62828',
}

const BoardAlarm = ({tone, children, sx}: BoardAlarmProps) => {
    if (tone === undefined) return <>{children}</>
    const color = ALARM_COLORS[tone]
    return (
        <Box
            sx={[
                {
                    position: 'relative',
                    borderRadius: 2,
                    overflow: 'hidden',
                    // DECKENDE Fläche statt eines Schleiers über dem Seitenhintergrund: Ein
                    // pulsierender Schleier war in der Spitze halbdurchsichtig und damit blass.
                    // Die Farbe steht jetzt fest, geblinkt wird über die Aufhellung darüber.
                    bgcolor: color,
                    // Alles darin erbt Weiß — auf beiden Alarmfarben der kontrastreichste Wert.
                    // Einzelne `color`-Angaben der Kinder (z.B. `text.secondary`) müssen deshalb
                    // vermieden werden; die Aufrufer setzen stattdessen `opacity`.
                    color: '#fff',
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
                    // Weiße Aufhellung, die auf- und abschwillt: Die Fläche bleibt dabei immer
                    // satt farbig (der Alarm ist nie „halb weg"), das Pulsieren sieht man
                    // trotzdem quer über den Steg.
                    bgcolor: '#fff',
                    opacity: 0,
                    '@keyframes boardAlarmPulse': {
                        '0%': {opacity: 0},
                        '50%': {opacity: 0.3},
                        '100%': {opacity: 0},
                    },
                    animation: 'boardAlarmPulse 1s ease-in-out infinite',
                    '@media (prefers-reduced-motion: reduce)': {
                        // Blinken ist für manche Menschen ein echtes Gesundheitsrisiko. Ohne
                        // Bewegung bleibt die volle Farbfläche stehen — unübersehbar genug.
                        animation: 'none',
                        opacity: 0,
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
