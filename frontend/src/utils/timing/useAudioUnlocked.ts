import {useEffect, useState} from 'react'
import {isAudioUnlocked, subscribeAudioUnlocked} from '@utils/timing/feedback.ts'

/**
 * Ob WebAudio schon durch eine Nutzergeste entsperrt wurde — für sichtbare Hinweise („einmal
 * antippen"), vor allem auf iOS, wo eine reine Anzeige sonst stumm bliebe, ohne dass man es ihr
 * ansieht. Reagiert live auf das erste erfolgreiche Entsperren.
 */
export function useAudioUnlocked(): boolean {
    const [unlocked, setUnlocked] = useState(isAudioUnlocked)
    useEffect(() => {
        // Zwischen Erst-Render und Effekt kann das Entsperren bereits passiert sein — einmal
        // nachlesen, dann abonnieren.
        if (isAudioUnlocked()) {
            setUnlocked(true)
            return
        }
        return subscribeAudioUnlocked(() => setUnlocked(true))
    }, [])
    return unlocked
}
