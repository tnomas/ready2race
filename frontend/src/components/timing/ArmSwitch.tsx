import {Box, ButtonBase, CircularProgress, Stack, Typography} from '@mui/material'
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew'
import {useCallback, useEffect, useRef, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {setTimingStationArmed} from '@api/sdk.gen.ts'
import {useFeedback} from '@utils/hooks.ts'

/** So lange muss gehalten werden, bevor umgeschaltet wird. */
const HOLD_MILLIS = 1000
/** Takt des Rings: flüssig genug fürs Auge, ohne bei jedem Frame neu zu rendern. */
const TICK_MILLIS = 40

export type ArmSwitchProps = {
    eventId: string
    stationId: string
    /**
     * Der Zustand, den der Bildschirm gerade für gültig hält (Server-Stand bzw. eigener
     * Schaltvorgang).
     */
    armed: boolean
    /** Der Server hat den Schaltvorgang bestätigt — der Bildschirm übernimmt ihn sofort. */
    onSwitched: (armed: boolean) => void
}

/**
 * Der Scharfschalter des Postens: **halten statt tippen**. Erst nach einer Sekunde gedrückt halten
 * kippt der Zustand, mit sichtbar mitlaufendem Ring; Loslassen (oder ein abrutschender Finger)
 * bricht ab und setzt den Ring zurück.
 *
 * Warum halten: Ein Tippen passiert in der Tasche, ein einsekündiges Halten nicht. Beide
 * Richtungen brauchen dieselbe bewusste Geste — auch das Entschärfen darf nicht versehentlich
 * gehen, sonst steht der Posten beim nächsten Zieleinlauf unbemerkt tot da.
 *
 * Der Schalter erscheint nur bei `captureMode = ARMED`; im Onetouch-Betrieb gibt es nichts zu
 * schalten. Er läuft mit Sitzung wie mit Geräte-Token — der Zeitnehmer am geteilten Tablet hat
 * nur das Token und muss trotzdem schalten können.
 */
const ArmSwitch = ({eventId, stationId, armed, onSwitched}: ArmSwitchProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [progress, setProgress] = useState(0)
    const [busy, setBusy] = useState(false)
    const timerRef = useRef<number | null>(null)
    // Im Ref, weil der Intervall-Rückruf einmal registriert wird und den Zustand zum Zeitpunkt des
    // Drucks sonst einfriert — geschaltet wird immer gegen den Stand beim Ablauf des Haltens.
    const armedRef = useRef(armed)
    armedRef.current = armed

    const clearTimer = useCallback(() => {
        if (timerRef.current !== null) {
            window.clearInterval(timerRef.current)
            timerRef.current = null
        }
    }, [])

    // Ein Board wird am Renntag oft gewechselt: Ein Zeitgeber, der den Abbau überlebt, schaltet
    // später ins Leere.
    useEffect(() => () => clearTimer(), [clearTimer])

    const submit = useCallback(
        (next: boolean) => {
            setBusy(true)
            void (async () => {
                try {
                    const {error} = await setTimingStationArmed({
                        path: {eventId, stationId},
                        body: {armed: next},
                    })
                    if (error !== undefined) {
                        feedback.error(t('timing.board.armed.error'))
                        return
                    }
                    // Der Server schickt zwar `stationsChanged`, aber auf dieses Echo darf der
                    // Bediener nicht warten: Scharf geschaltet heißt sofort erfassen können.
                    onSwitched(next)
                } catch {
                    feedback.error(t('timing.board.armed.error'))
                } finally {
                    setBusy(false)
                }
            })()
        },
        [eventId, stationId, feedback, t, onSwitched],
    )

    const startHold = useCallback(() => {
        if (busy || timerRef.current !== null) return
        const startedAt = Date.now()
        setProgress(0)
        timerRef.current = window.setInterval(() => {
            const value = Math.min(100, ((Date.now() - startedAt) / HOLD_MILLIS) * 100)
            setProgress(value)
            if (value >= 100) {
                clearTimer()
                setProgress(0)
                submit(!armedRef.current)
            }
        }, TICK_MILLIS)
    }, [busy, clearTimer, submit])

    /** Loslassen, Abrutschen oder ein abgebrochener Druck: halb gehalten ist nicht geschaltet. */
    const cancelHold = useCallback(() => {
        if (timerRef.current === null) return
        clearTimer()
        setProgress(0)
    }, [clearTimer])

    return (
        <Stack
            direction="row"
            spacing={1.5}
            alignItems="center"
            sx={{
                flexShrink: 0,
                borderRadius: 2,
                px: 1.5,
                py: 1,
                border: 3,
                borderColor: armed ? 'success.main' : 'warning.main',
            }}>
            <Stack sx={{flexGrow: 1, minWidth: 0}}>
                <Typography
                    variant="h5"
                    sx={{fontWeight: 800, lineHeight: 1.2}}
                    color={armed ? 'success.main' : 'warning.main'}>
                    {armed
                        ? t('timing.board.armed.stateArmed')
                        : t('timing.board.armed.stateDisarmed')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    {t('timing.board.armed.holdHint')}
                </Typography>
            </Stack>
            <ButtonBase
                className="cursor-pointer"
                // Halten heißt Zeigergesten: `onPointerUp` allein reicht nicht, der Finger rutscht
                // vom Knopf (leave) oder das System nimmt den Druck weg (cancel).
                onPointerDown={startHold}
                onPointerUp={cancelHold}
                onPointerLeave={cancelHold}
                onPointerCancel={cancelHold}
                // Ein langer Druck öffnet auf dem Tablet sonst das Kontextmenü mitten in der
                // Geste.
                onContextMenu={event => event.preventDefault()}
                disabled={busy}
                focusRipple
                sx={{
                    borderRadius: 2,
                    px: 2,
                    py: 1,
                    minHeight: 72,
                    border: 2,
                    borderColor: 'divider',
                    userSelect: 'none',
                    touchAction: 'manipulation',
                }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                    <Box sx={{position: 'relative', display: 'inline-flex'}}>
                        <CircularProgress
                            variant="determinate"
                            value={busy ? 100 : progress}
                            size={52}
                            thickness={5}
                            sx={{color: armed ? 'warning.main' : 'success.main'}}
                        />
                        <Box
                            sx={{
                                position: 'absolute',
                                inset: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}>
                            <PowerSettingsNewIcon />
                        </Box>
                    </Box>
                    <Typography variant="h6" sx={{fontWeight: 700}}>
                        {armed ? t('timing.board.armed.disarm') : t('timing.board.armed.arm')}
                    </Typography>
                </Stack>
            </ButtonBase>
        </Stack>
    )
}

export default ArmSwitch
