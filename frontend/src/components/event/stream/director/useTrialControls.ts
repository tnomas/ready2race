import {useState} from 'react'
import {setStreamSceneTrialMode, setStreamSceneTrialPhase} from '@api/sdk.gen.ts'
import {StreamTrialPhase} from '@api/types.gen.ts'

export type TrialChange = 'trialMode' | 'phase'

interface UseTrialControlsOptions {
    eventId: string
    sceneId: string
    /**
     * Ein Regie-Eingriff ist auf dem Server angekommen. Der Aufrufer lädt daraufhin den
     * Szenenstand nach: Der Kanal pusht den neuen Stand zwar von selbst — aber nur, wenn er
     * steht. Ohne Kanal (oder mit einem, der gerade stirbt) bliebe das Board sonst auf dem
     * alten Stand stehen und behauptete das Gegenteil von dem, was gerade geschaltet wurde.
     */
    onChanged: (change: TrialChange) => void
    onError: (change: TrialChange) => void
}

/**
 * Die beiden Probemodus-Eingriffe des Regie-Boards (an/aus, Phase) mit gemeinsamem
 * Beschäftigt-Zustand. Herausgelöst aus der Seite, damit die Nachlade-Regel oben prüfbar ist.
 */
export const useTrialControls = ({eventId, sceneId, onChanged, onError}: UseTrialControlsOptions) => {
    const [busy, setBusy] = useState(false)

    const run = async (change: TrialChange, call: () => Promise<{error?: unknown}>) => {
        setBusy(true)
        try {
            const {error} = await call()
            if (error) onError(change)
            else onChanged(change)
        } finally {
            setBusy(false)
        }
    }

    return {
        busy,
        toggleTrialMode: (on: boolean) =>
            run('trialMode', () =>
                setStreamSceneTrialMode({path: {eventId, sceneId}, query: {trialMode: on}}),
            ),
        setTrialPhase: (phase: StreamTrialPhase) =>
            run('phase', () => setStreamSceneTrialPhase({path: {eventId, sceneId}, query: {phase}})),
    }
}
