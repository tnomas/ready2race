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
     * Entprelltes Neuladen für WebSocket-Trigger, in zwei Rollen:
     *
     * - `matchesChanged` meldet, dass die Partienmenge selbst eine andere ist (ein Lauf ist
     *   dazugekommen, weggefallen oder verschoben, oder sein Zeitnahmetyp löst sich anders auf).
     * - `timeMarkCreated`/`assignmentChanged`/`sequenceChanged` melden das nicht, verschieben aber
     *   `progress` und die Team-Häkchen der Partien.
     *
     * Beide kommen in Schüben (eine Welle startet acht Boote in acht Nachrichten, eine
     * Rundenerzeugung fällt mit dem Zeitplan-Schreiben zusammen). Statt je Nachricht eine Anfrage
     * zu feuern, sammelt `bump` 800 ms und lädt dann einmal.
     */
    bump: () => void
}

/**
 * Die Startliste eines Posten-Boards: `GET /event/{eventId}/timing/matches`, lesbar mit Sitzung
 * oder Geräte-Token.
 *
 * Seit dem 24.08.2026 gibt es dafür eine eigene WebSocket-Nachricht: `matchesChanged`, ein reiner
 * Auslöser ohne Rumpf. Vorher trugen ausschließlich die übrigen Nachrichten die Auffrischung — und
 * die setzen alle voraus, dass es die Partie schon gibt (eine Marke, eine Zuordnung, eine Sequenz
 * hängen an einer bestehenden Partie). Ein frisch erzeugter Lauf, eine gelöschte Runde, eine
 * verschobene Zeitplan-Zeile oder ein nachträglich gesetzter Zeitnahmetyp erreichten die Boards
 * deshalb gar nicht; am Steg stand die Startliste dann still, bis jemand neu lud.
 *
 * Rumpflos ist die Nachricht mit Absicht: die Startliste ist eine gerechnete Sicht (Sortierung über
 * die Rundenkette, aufgelöster Typ, Fortschritt je Team). Sie mitzuschicken hieße, diese Rechnung
 * an jeder Schreibstelle des Backends anzustoßen; stattdessen holt sie sich der Hook selbst, über
 * dieselbe entprellte `bump`-Bahn wie die übrigen Trigger.
 */
export function useTimingMatches(eventId: string, stationId?: string): UseTimingMatchesResult {
    const [matches, setMatches] = useState<TimingMatchDto[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)

    /** Monotoner Zähler — nur die neueste laufende Anfrage darf ihre Antwort anwenden. */
    const epochRef = useRef(0)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const refetch = useCallback(() => {
        const epoch = ++epochRef.current
        // Der Posten schneidet seine Liste selbst zu: Ein Zwischenzeit-Posten sieht nur die
        // Wettkaempfe, auf deren Strecke er steht -- anderswo wuerde seine Marke gar keine
        // Zwischenzeit (der Server entscheidet das, siehe TimingMatchService.getMatches).
        void getTimingMatches({path: {eventId}, query: {station: stationId}})
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
    }, [eventId, stationId])

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
