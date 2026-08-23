import {useCallback, useEffect, useRef, useState} from 'react'
import {getTimingMatches} from '@api/sdk.gen.ts'
import {TimingMatchDto} from '@api/types.gen.ts'

export type UseTimingMatchesResult = {
    /** Die Partien der intern gezeiteten Wettkämpfe in Startreihenfolge; leer, wenn kein
     *  Wettkampf der Veranstaltung INTERN zeitet. */
    matches: TimingMatchDto[]
    /** True nur bis zur ersten Antwort — die Boards zeigen danach still den letzten Stand. */
    loading: boolean
    error: boolean
    /** Sofort neu laden (Mount, Reconnect, Sichtbarkeit). */
    refetch: () => void
    /**
     * Entprelltes Neuladen für WebSocket-Trigger: `timeMarkCreated`/`assignmentChanged`/
     * `sequenceChanged` ändern `progress` und die Team-Häkchen der Partien, kommen aber in
     * Schüben (eine Welle startet acht Boote in acht Nachrichten). Statt je Nachricht eine
     * Anfrage zu feuern, sammelt `bump` 800 ms und lädt dann einmal.
     */
    bump: () => void
}

/**
 * Die Startliste eines Posten-Boards: `GET /event/{eventId}/timing/matches`, lesbar mit Sitzung
 * oder Geräte-Token. Es gibt keine eigene WebSocket-Nachricht für Partien — die vorhandenen
 * Nachrichten dienen als Auffrischungs-Trigger (siehe `bump`), dieselbe Entscheidung wie beim
 * Backend-Umbau dokumentiert.
 */
export function useTimingMatches(eventId: string): UseTimingMatchesResult {
    const [matches, setMatches] = useState<TimingMatchDto[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)

    /** Monotoner Zähler — nur die neueste laufende Anfrage darf ihre Antwort anwenden. */
    const epochRef = useRef(0)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const refetch = useCallback(() => {
        const epoch = ++epochRef.current
        void getTimingMatches({path: {eventId}})
            .then(({data, error: err}) => {
                if (epoch !== epochRef.current) return
                if (err !== undefined || data === undefined) {
                    setError(true)
                    return
                }
                setError(false)
                setMatches(data)
            })
            .catch(() => {
                if (epoch !== epochRef.current) return
                setError(true)
            })
            .finally(() => {
                if (epoch !== epochRef.current) return
                setLoading(false)
            })
    }, [eventId])

    useEffect(() => {
        setMatches([])
        setLoading(true)
        setError(false)
        refetch()
    }, [refetch])

    const bump = useCallback(() => {
        if (timerRef.current !== null) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => {
            timerRef.current = null
            refetch()
        }, 800)
    }, [refetch])

    useEffect(
        () => () => {
            if (timerRef.current !== null) clearTimeout(timerRef.current)
        },
        [],
    )

    return {matches, loading, error, refetch, bump}
}
