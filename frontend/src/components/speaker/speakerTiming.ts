import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {
    TimeMarkDto,
    TimingMatchDto,
    TimingMatchTeamDto,
    TimingSequenceDto,
    TimingStationDto,
} from '@api/types.gen.ts'
import {useTimingBoardState} from '@components/timing/useTimingBoardState.ts'
import {useStationSequences} from '@components/timing/leitstand/useStationSequences.ts'
import {useTimingMatches} from '@utils/timing/useTimingMatches.ts'
import {useServerClock} from '@utils/timing/useServerClock.ts'
import {TimingWsStatus} from '@utils/timing/useTimingWebSocket.ts'

/**
 * Zeitnahme-Sicht des Sprecher-Boards: dieselben Quellen wie der Leitstand (Marken + Stationen über
 * `useTimingBoardState` im stationslosen Modus, Sequenzen je START-Posten, Partienliste), aber rein
 * lesend und auf das reduziert, was eine Sprecherin braucht — wer startet gerade (Countdown), wer
 * kommt ins Ziel (Ticker), und gab es einen Fehlstart. Alle Ableitungen sind reine Funktionen,
 * damit sie ohne React-Umgebung testbar sind.
 */

export type TimingTeamRef = {
    team: TimingMatchTeamDto
    match: TimingMatchDto
}

export type TimingIndex = {
    /** competitionMatchTeam → Team samt Partie. */
    byTeam: Map<string, TimingTeamRef>
    /** competitionSetupMatch → Partie (gleiche Id wie `SpeakerMatch.matchId`). */
    byMatch: Map<string, TimingMatchDto>
}

export const buildTimingIndex = (matches: TimingMatchDto[]): TimingIndex => {
    const byTeam = new Map<string, TimingTeamRef>()
    const byMatch = new Map<string, TimingMatchDto>()
    matches.forEach(match => {
        byMatch.set(match.competitionSetupMatch, match)
        match.teams.forEach(team => byTeam.set(team.competitionMatchTeam, {team, match}))
    })
    return {byTeam, byMatch}
}

export type TeamLiveProgress = {
    started: boolean
    finished: boolean
}

/**
 * Live-Fortschritt je Boot aus den Marken selbst (zugeordnete ACTIVE-Marken auf START- bzw.
 * FINISH-Posten) — dieselbe Definition wie `TimingMatchTeamDto.started/finished`, aber aus dem
 * Websocket-Stand gerechnet statt aus der träger nachgeladenen Partienliste.
 */
export const deriveTeamProgress = (
    marks: readonly TimeMarkDto[],
    stations: readonly TimingStationDto[],
): Map<string, TeamLiveProgress> => {
    const stationType = new Map(stations.map(station => [station.id, station.type]))
    const progress = new Map<string, TeamLiveProgress>()
    for (const mark of marks) {
        if (mark.status !== 'ACTIVE' || mark.assignedTeam === undefined) continue
        const type = stationType.get(mark.station)
        if (type !== 'START' && type !== 'FINISH') continue
        const entry = progress.get(mark.assignedTeam) ?? {started: false, finished: false}
        if (type === 'START') entry.started = true
        else entry.finished = true
        progress.set(mark.assignedTeam, entry)
    }
    return progress
}

export type FinishTickerEntry = {
    markId: string
    timestampMillis: number
    /** Zugeordnetes Boot samt Partie; undefined bei einer noch nicht zugeordneten Marke. */
    ref?: TimingTeamRef
}

/**
 * Der Zieleinlauf-Ticker: die jüngsten aktiven Marken der FINISH-Posten, jüngste zuerst. Auch
 * Marken ohne Zuordnung erscheinen ("Zieleinlauf erfasst") — genau in dem Moment ruft die
 * Sprecherin den Einlauf aus, die Zuordnung folgt oft erst Sekunden später.
 */
export const deriveFinishTicker = (
    marks: readonly TimeMarkDto[],
    stations: readonly TimingStationDto[],
    index: TimingIndex,
    limit: number,
): FinishTickerEntry[] => {
    const finishStations = new Set(
        stations.filter(station => station.type === 'FINISH').map(station => station.id),
    )
    return marks
        .filter(mark => mark.status === 'ACTIVE' && finishStations.has(mark.station))
        .sort((a, b) => b.timestampMillis - a.timestampMillis)
        .slice(0, limit)
        .map(mark => ({
            markId: mark.id,
            timestampMillis: mark.timestampMillis,
            ref: mark.assignedTeam !== undefined ? index.byTeam.get(mark.assignedTeam) : undefined,
        }))
}

export type FalseStartEvent = {
    /** competitionSetupMatch der zurückgerufenen Partie (= `SpeakerMatch.matchId`). */
    matchId: string
    /** Client-Zeitpunkt des Eingangs — nur für das Altern der Anzeige, nie fachlich. */
    receivedAtMillis: number
}

/** Wie lange ein Fehlstart-Banner stehen bleibt, wenn niemand es wegklickt. */
export const FALSE_START_TTL_MILLIS = 3 * 60 * 1000

export const expireFalseStarts = (
    events: readonly FalseStartEvent[],
    nowMillis: number,
): FalseStartEvent[] =>
    events.filter(event => nowMillis - event.receivedAtMillis < FALSE_START_TTL_MILLIS)

/**
 * Die Startsequenz, in der eine Partie gerade steckt (scharfgestellt, laufend oder pausiert) —
 * für die Live-Zeile des Detail-Panels. DONE/ABORTED zählen nicht: eine erledigte Sequenz sagt
 * über den Lauf nichts mehr, was die Ergebnisliste nicht besser wüsste.
 */
export const sequenceOfMatch = (
    sequences: ReadonlyMap<string, TimingSequenceDto>,
    index: TimingIndex,
    matchId: string,
): TimingSequenceDto | undefined => {
    for (const sequence of sequences.values()) {
        if (sequence.state !== 'ARMED' && sequence.state !== 'RUNNING' && sequence.state !== 'PAUSED')
            continue
        const belongs = sequence.entries.some(
            entry => index.byTeam.get(entry.competitionMatchTeam)?.match.competitionSetupMatch === matchId,
        )
        if (belongs) return sequence
    }
    return undefined
}

export type SpeakerTiming = {
    /** Verbindungsstand des Zeitnahme-Kanals — UNAUTHORIZED heißt: Sitzung ohne Leserecht. */
    wsStatus: TimingWsStatus
    stations: TimingStationDto[]
    /** Jüngste bekannte Sequenz je START-Posten. */
    sequences: ReadonlyMap<string, TimingSequenceDto>
    index: TimingIndex
    teamProgress: Map<string, TeamLiveProgress>
    finishTicker: FinishTickerEntry[]
    falseStarts: FalseStartEvent[]
    dismissFalseStart: (matchId: string) => void
    /** Server-Uhr für Countdowns; null solange nicht synchronisiert. */
    serverNow: () => number | null
    /** True, sobald irgendein Zeitnahme-Inhalt da ist — steuert, ob das Panel überhaupt erscheint. */
    hasTimingData: boolean
}

export function useSpeakerTiming(eventId: string, tickerLimit: number): SpeakerTiming {
    const clock = useServerClock()
    const [falseStarts, setFalseStarts] = useState<FalseStartEvent[]>([])

    const {matches: timingMatches, bump} = useTimingMatches(eventId)

    // Henne-Ei wie im Leitstand: useStationSequences braucht die Stationen aus useTimingBoardState,
    // das seinerseits den Sequenz-Callback entgegennimmt — der Ref-Umweg löst das auf.
    const sequenceChangedRef = useRef<(sequence: TimingSequenceDto) => void>(() => {})
    const onFalseStart = useCallback((info: {competitionSetupMatch: string}) => {
        setFalseStarts(previous => [
            // Ein erneuter Rückruf derselben Partie ersetzt den alten Eintrag statt zu stapeln.
            ...previous.filter(event => event.matchId !== info.competitionSetupMatch),
            {matchId: info.competitionSetupMatch, receivedAtMillis: Date.now()},
        ])
    }, [])

    const {marks, stations, wsStatus} = useTimingBoardState(
        eventId,
        null,
        sequence => sequenceChangedRef.current(sequence),
        undefined,
        undefined,
        undefined,
        bump,
        onFalseStart,
    )
    const {sequences, applyChanged} = useStationSequences(eventId, stations)
    useEffect(() => {
        sequenceChangedRef.current = applyChanged
    }, [applyChanged])

    // Abgelaufene Fehlstart-Banner regelmäßig ausfegen (die Anzeige altert clientseitig).
    useEffect(() => {
        if (falseStarts.length === 0) return
        const timer = setInterval(
            () => setFalseStarts(previous => expireFalseStarts(previous, Date.now())),
            10_000,
        )
        return () => clearInterval(timer)
    }, [falseStarts.length])

    useEffect(() => {
        setFalseStarts([])
    }, [eventId])

    const dismissFalseStart = useCallback(
        (matchId: string) =>
            setFalseStarts(previous => previous.filter(event => event.matchId !== matchId)),
        [],
    )

    const index = useMemo(() => buildTimingIndex(timingMatches), [timingMatches])
    const teamProgress = useMemo(() => deriveTeamProgress(marks, stations), [marks, stations])
    const finishTicker = useMemo(
        () => deriveFinishTicker(marks, stations, index, tickerLimit),
        [marks, stations, index, tickerLimit],
    )

    return {
        wsStatus,
        stations,
        sequences,
        index,
        teamProgress,
        finishTicker,
        falseStarts,
        dismissFalseStart,
        serverNow: clock.now,
        hasTimingData: stations.length > 0 || timingMatches.length > 0,
    }
}
