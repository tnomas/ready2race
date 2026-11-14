import {useCallback, useEffect, useState} from 'react'

/**
 * Sperre bis zum frischen Stand. Jede Zuteilung schickt die komplette Liste aus dem gerade
 * bekannten Stand; wer nach einem Erfolg sofort weiter zuteilt, bevor die Übersicht neu geladen
 * ist, überschriebe die eigene Änderung. Die Sperre wird nach einem Erfolg gesetzt und fällt erst,
 * wenn ein neuer Stand da ist (andere Datenreferenz) oder der Nachladeversuch vorbei ist
 * (`pending` war wahr und ist wieder falsch – auch nach einem Fehlschlag, damit nichts hängt).
 */
export type ReloadGate = {armedOn: unknown; sawPending: boolean} | null

export const armReloadGate = (data: unknown): ReloadGate => ({armedOn: data, sawPending: false})

export const nextReloadGate = (gate: ReloadGate, data: unknown, pending: boolean): ReloadGate => {
    if (gate == null) return null
    if (data !== gate.armedOn) return null
    if (pending) return gate.sawPending ? gate : {...gate, sawPending: true}
    return gate.sawPending ? null : gate
}

/**
 * `locked` ist wahr, solange nach einem Erfolg der neue Stand fehlt; `arm()` vor dem Nachladen
 * aufrufen. `data` ist die Referenz, die beim Nachladen ersetzt wird (z. B. `overview.requests`).
 */
export const useReloadGate = (data: unknown, pending: boolean) => {
    const [gate, setGate] = useState<ReloadGate>(null)
    useEffect(() => {
        setGate(prev => nextReloadGate(prev, data, pending))
    }, [data, pending])
    const arm = useCallback(() => setGate(armReloadGate(data)), [data])
    return {locked: gate != null, arm}
}
