import {useCallback, useEffect, useMemo, useState} from 'react'
import {getActiveTimingSequence} from '@api/sdk.gen.ts'
import {TimingSequenceDto, TimingStationDto} from '@api/types.gen.ts'

/**
 * Die Sequenzlage aller START-Posten für die Leitstand-Übersicht: einmal initial je Posten geladen
 * (der Endpunkt liefert auch eine gerade beendete Sequenz noch nach, siehe `ActiveSequenceDto`),
 * danach ausschließlich über die `sequenceChanged`-Websocket-Nachrichten aktuell gehalten -
 * [applyChanged] wird dafür als `onSequenceChanged` an `useTimingBoardState` gereicht.
 */
export function useStationSequences(
    eventId: string,
    stations: TimingStationDto[],
): {
    /** Jüngste bekannte Sequenz je START-Posten (Schlüssel: Posten-Id). */
    sequences: ReadonlyMap<string, TimingSequenceDto>
    applyChanged: (sequence: TimingSequenceDto) => void
} {
    const [sequences, setSequences] = useState<Map<string, TimingSequenceDto>>(new Map())

    const applyChanged = useCallback((sequence: TimingSequenceDto) => {
        setSequences(prev => new Map(prev).set(sequence.station, sequence))
    }, [])

    // Als sortierter Schlüssel-String, damit der Lade-Effekt nur läuft, wenn sich die MENGE der
    // Start-Posten ändert - nicht bei jeder neuen Array-Identität aus dem Stations-Refetch.
    const startStationKey = useMemo(
        () =>
            stations
                .filter(station => station.type === 'START')
                .map(station => station.id)
                .sort()
                .join(','),
        [stations],
    )

    useEffect(() => {
        setSequences(new Map())
        const ids = startStationKey.length === 0 ? [] : startStationKey.split(',')
        if (ids.length === 0) return
        let disposed = false
        void (async () => {
            for (const stationId of ids) {
                try {
                    const {data} = await getActiveTimingSequence({
                        path: {eventId},
                        query: {stationId},
                    })
                    if (disposed) return
                    const sequence = data?.sequence
                    if (sequence !== undefined && sequence !== null) {
                        applyChanged(sequence)
                    }
                } catch {
                    // Die Übersicht bleibt ohne Sequenzstand benutzbar; der nächste
                    // Websocket-Broadcast holt den Posten nach.
                }
            }
        })()
        return () => {
            disposed = true
        }
    }, [eventId, startStationKey, applyChanged])

    return {sequences, applyChanged}
}
