import {describe, expect, test} from 'vitest'
import {TimingMatchDto, TimingSequenceDto} from '@api/types.gen.ts'
import {
    DEFAULT_FALSE_START_TONE,
    DEFAULT_START_TONE_PLAN,
    PRESET_ONLY_START,
    PRESET_TEN_COUNTDOWN,
    PREVIEW_MAX_GAP_MILLIS,
    TONE_FRESHNESS_MILLIS,
    TONE_RELEASE_MAX_MILLIS,
    TONE_RELEASE_MIN_MILLIS,
    ToneStep,
    advanceTonePlan,
    equalsDefaultStartPlan,
    isValidToneRelease,
    isValidToneStep,
    previewSchedule,
    sortedTonePlan,
    toneTotalMillis,
    tonePlanForSequence,
} from './tonePlan.ts'

/** Spielt einen Plan über eine Tick-Folge ab und sammelt (Zeitpunkt, Ton) aller Auslösungen. */
const playThrough = (
    plan: readonly ToneStep[],
    targetMillis: number,
    ticks: number[],
): {atMillis: number; frequencyHz: number; durationMillis: number}[] => {
    const played: {atMillis: number; frequencyHz: number; durationMillis: number}[] = []
    let playedUpTo = -1
    for (const now of ticks) {
        const advance = advanceTonePlan(plan, targetMillis, now, playedUpTo)
        playedUpTo = advance.playedUpTo
        if (advance.play !== null) {
            played.push({
                atMillis: now,
                frequencyHz: advance.play.frequencyHz,
                durationMillis: advance.play.durationMillis,
            })
        }
    }
    return played
}

/** Ticks im festen Raster, Start inklusive, Ende inklusive. */
const range = (from: number, to: number, step: number): number[] => {
    const result: number[] = []
    for (let at = from; at <= to; at += step) result.push(at)
    return result
}

describe('advanceTonePlan', () => {
    const target = 1_000_000

    test('Standardplan: sechs Toene, T-5..T-1 kurz und tief, T-0 lang und hoch', () => {
        const played = playThrough(DEFAULT_START_TONE_PLAN, target, range(target - 8000, target + 500, 50))
        expect(played).toHaveLength(6)
        expect(played.slice(0, 5).every(tone => tone.frequencyHz === 600 && tone.durationMillis === 100)).toBe(true)
        expect(played[5]).toMatchObject({frequencyHz: 900, durationMillis: 400})
        // Ausloesezeitpunkte: exakt beim Raster-Tick des jeweiligen Sekundenpunkts.
        expect(played.map(tone => tone.atMillis)).toEqual([
            target - 5000,
            target - 4000,
            target - 3000,
            target - 2000,
            target - 1000,
            target,
        ])
    })

    /**
     * Regressionstest: Der Standardplan klingt exakt wie die bisherige Implementierung
     * (Countdown-Beep bei secondsRemaining = ceil(remaining/1000) in 5..1 kurz, bei 0 lang,
     * mit Wiederholungsschutz je Sekunde). Beide Verfahren laufen ueber dieselbe Tick-Folge.
     */
    test('Standardplan == destilliertes Ist-Verhalten (ceil-Regel)', () => {
        const ticks = range(target - 7300, target + 900, 37) // krummes Raster wie echtes rAF
        // Referenz: das bisherige Verfahren aus SequenceCountdown.
        const reference: {atMillis: number; final: boolean}[] = []
        let lastBeepedSecond = Number.NaN
        for (const now of ticks) {
            const secondsRemaining = Math.ceil((target - now) / 1000)
            if (secondsRemaining !== lastBeepedSecond) {
                lastBeepedSecond = secondsRemaining
                if (secondsRemaining >= 1 && secondsRemaining <= 5) {
                    reference.push({atMillis: now, final: false})
                } else if (secondsRemaining === 0) {
                    reference.push({atMillis: now, final: true})
                }
            }
        }
        const played = playThrough(DEFAULT_START_TONE_PLAN, target, ticks)
        expect(played.map(tone => tone.atMillis)).toEqual(reference.map(tone => tone.atMillis))
        expect(played.map(tone => tone.frequencyHz === 900)).toEqual(reference.map(tone => tone.final))
    })

    test('verdeckter Tab: verpasste Toene werden nie nachgeholt, nur der frische letzte spielt', () => {
        // Tab verschwindet vor T-5 und kommt bei T-1.4 zurueck: T-5..T-2 sind verpasst,
        // T-1 liegt erst 400 ms zurueck und spielt noch — exakt EIN Ton, keine Salve.
        const played = playThrough(DEFAULT_START_TONE_PLAN, target, [target - 6000, target - 600, target])
        expect(played).toHaveLength(2)
        expect(played[0]).toMatchObject({atMillis: target - 600, frequencyHz: 600})
        expect(played[1]).toMatchObject({atMillis: target, frequencyHz: 900})
    })

    test('alles Faellige aelter als die Frische-Grenze bleibt still', () => {
        const late = target + TONE_FRESHNESS_MILLIS + 1
        const played = playThrough(DEFAULT_START_TONE_PLAN, target, [late, late + 500])
        expect(played).toHaveLength(0)
    })

    test('der Zeiger rueckt auch ohne Abspielen vor — ein Verfallener kommt nie wieder', () => {
        const advance = advanceTonePlan(
            DEFAULT_START_TONE_PLAN,
            target,
            target + TONE_FRESHNESS_MILLIS + 1,
            -1,
        )
        expect(advance.play).toBeNull()
        expect(advance.playedUpTo).toBe(DEFAULT_START_TONE_PLAN.length - 1)
        // Spaetere Ticks (gleiche Zeit oder spaeter) spielen ebenfalls nichts mehr.
        const next = advanceTonePlan(
            DEFAULT_START_TONE_PLAN,
            target,
            target + TONE_FRESHNESS_MILLIS + 400,
            advance.playedUpTo,
        )
        expect(next.play).toBeNull()
    })

    test('Zielwechsel (INTERVAL): mit zurueckgesetztem Zeiger zaehlt der naechste Start neu', () => {
        const firstTarget = target
        const secondTarget = target + 30_000
        const beforeSwitch = playThrough(DEFAULT_START_TONE_PLAN, firstTarget, range(firstTarget - 5500, firstTarget, 100))
        expect(beforeSwitch).toHaveLength(6)
        // Neuer Durchlauf mit playedUpTo = -1 (wie der Komponenten-Reset bei targetMillis-Wechsel).
        const afterSwitch = playThrough(DEFAULT_START_TONE_PLAN, secondTarget, range(secondTarget - 5500, secondTarget, 100))
        expect(afterSwitch).toHaveLength(6)
    })

    test('Piep bei Sequenzstart: ein Plan mit grossem negativen Offset spielt beim Vorlaufbeginn', () => {
        const plan: ToneStep[] = [
            {offsetMillis: -60_000, frequencyHz: 700, durationMillis: 200},
            {offsetMillis: 0, frequencyHz: 900, durationMillis: 400},
        ]
        const played = playThrough(plan, target, [target - 60_000, target - 30_000, target])
        expect(played.map(tone => tone.frequencyHz)).toEqual([700, 900])
    })

    test('unsortierte Eingabe: sortedTonePlan stellt die Reihenfolge fuer die Ableitung her', () => {
        const plan = sortedTonePlan([
            {offsetMillis: 0, frequencyHz: 900, durationMillis: 400},
            {offsetMillis: -3000, frequencyHz: 600, durationMillis: 100},
        ])
        expect(plan[0].offsetMillis).toBe(-3000)
        const played = playThrough(plan, target, range(target - 4000, target, 100))
        expect(played.map(tone => tone.frequencyHz)).toEqual([600, 900])
    })
})

describe('Grenzen und Voreinstellungen', () => {
    test('isValidToneStep akzeptiert die Raender und verwirft Ausreisser', () => {
        expect(isValidToneStep({offsetMillis: 0, frequencyHz: 100, durationMillis: 20})).toBe(true)
        // Die Dauer-Obergrenze liegt seit dem Fehlstart-Ton bei 10 s (frueher 2 s).
        expect(isValidToneStep({offsetMillis: -600_000, frequencyHz: 4000, durationMillis: 10_000})).toBe(true)
        expect(isValidToneStep({offsetMillis: 0, frequencyHz: 600, durationMillis: 2001})).toBe(true)
        expect(isValidToneStep({offsetMillis: 1, frequencyHz: 600, durationMillis: 100})).toBe(false)
        expect(isValidToneStep({offsetMillis: -600_001, frequencyHz: 600, durationMillis: 100})).toBe(false)
        expect(isValidToneStep({offsetMillis: 0, frequencyHz: 99, durationMillis: 100})).toBe(false)
        expect(isValidToneStep({offsetMillis: 0, frequencyHz: 4001, durationMillis: 100})).toBe(false)
        expect(isValidToneStep({offsetMillis: 0, frequencyHz: 600, durationMillis: 19})).toBe(false)
        expect(isValidToneStep({offsetMillis: 0, frequencyHz: 600, durationMillis: 10_001})).toBe(false)
        expect(isValidToneStep({offsetMillis: -0.5, frequencyHz: 600, durationMillis: 100})).toBe(false)
    })

    test('Ausklingzeit: nicht gesetzt gueltig, 0–5000 ganze ms gueltig, alles andere nicht', () => {
        const step = (releaseMillis?: number) => ({
            offsetMillis: 0,
            frequencyHz: 600,
            durationMillis: 100,
            releaseMillis,
        })
        expect(isValidToneStep(step(undefined))).toBe(true)
        expect(isValidToneStep(step(TONE_RELEASE_MIN_MILLIS))).toBe(true)
        expect(isValidToneStep(step(TONE_RELEASE_MAX_MILLIS))).toBe(true)
        // Das Ausklingen darf ueber die Nenndauer hinausreichen: Haltezeit 100 ms + 5 s Abfall.
        expect(isValidToneStep(step(800))).toBe(true)
        expect(isValidToneStep(step(-1))).toBe(false)
        expect(isValidToneStep(step(TONE_RELEASE_MAX_MILLIS + 1))).toBe(false)
        expect(isValidToneStep(step(2.5))).toBe(false)
        expect(isValidToneRelease(undefined)).toBe(true)
        expect(isValidToneRelease(5000)).toBe(true)
        expect(isValidToneRelease(5001)).toBe(false)
    })

    test('toneTotalMillis: Nenndauer plus Ausklingen, ohne Ausklingen nur die Nenndauer', () => {
        expect(toneTotalMillis({durationMillis: 400})).toBe(400)
        expect(toneTotalMillis({durationMillis: 400, releaseMillis: 800})).toBe(1200)
        expect(toneTotalMillis({durationMillis: 400, releaseMillis: null})).toBe(400)
    })

    test('alle Voreinstellungen sind innerhalb der Grenzen', () => {
        for (const plan of [DEFAULT_START_TONE_PLAN, PRESET_ONLY_START, PRESET_TEN_COUNTDOWN]) {
            expect(plan.every(isValidToneStep)).toBe(true)
        }
        expect(
            isValidToneStep({offsetMillis: 0, ...DEFAULT_FALSE_START_TONE}),
        ).toBe(true)
    })

    test('equalsDefaultStartPlan erkennt den Standard auch unsortiert, aber keine Abweichung', () => {
        expect(equalsDefaultStartPlan(DEFAULT_START_TONE_PLAN)).toBe(true)
        expect(equalsDefaultStartPlan([...DEFAULT_START_TONE_PLAN].reverse())).toBe(true)
        expect(equalsDefaultStartPlan(PRESET_ONLY_START)).toBe(false)
        expect(
            equalsDefaultStartPlan(
                DEFAULT_START_TONE_PLAN.map((step, index) =>
                    index === 0 ? {...step, frequencyHz: 880} : step,
                ),
            ),
        ).toBe(false)
        // Explizites Ausklingen 0 ist dieselbe Huellkurve wie „nicht gesetzt" — weiterhin Standard.
        expect(
            equalsDefaultStartPlan(DEFAULT_START_TONE_PLAN.map(step => ({...step, releaseMillis: 0}))),
        ).toBe(true)
        // Ein echtes Ausklingen macht den Plan dagegen zum eigenen.
        expect(
            equalsDefaultStartPlan(
                DEFAULT_START_TONE_PLAN.map((step, index) =>
                    index === 0 ? {...step, releaseMillis: 500} : step,
                ),
            ),
        ).toBe(false)
    })
})

describe('tonePlanForSequence', () => {
    const team = (id: string) => ({
        competitionMatchTeam: id,
        startNumber: 1,
        teamName: null,
        clubName: null,
        started: false,
        finished: false,
    })
    const match = (id: string, teamIds: string[], tonePlan: ToneStep[] | null): TimingMatchDto =>
        ({
            competitionSetupMatch: id,
            matchName: null,
            competition: 'c1',
            competitionName: null,
            competitionIdentifier: null,
            competitionShortName: null,
            round: 'r1',
            roundName: null,
            startTime: null,
            startedAt: null,
            finishedAt: null,
            phase: 'OPEN',
            progress: 'OPEN',
            timingMode: {
                id: 'mode1',
                event: 'e1',
                name: 'Timetrial',
                withLaps: false,
                startGrouping: 'EINZEL',
                intervalSeconds: 30,
                leadInSeconds: 10,
                tonePlan,
            },
            teams: teamIds.map(team),
        }) as unknown as TimingMatchDto
    const sequence = (teamIds: string[]): TimingSequenceDto =>
        ({
            id: 'seq1',
            event: 'e1',
            station: 's1',
            mode: 'INTERVAL',
            leadInMillis: 10_000,
            state: 'RUNNING',
            entries: teamIds.map((id, position) => ({
                id: `entry-${id}`,
                competitionMatchTeam: id,
                position,
                status: 'PENDING',
            })),
        }) as unknown as TimingSequenceDto

    const customPlan: ToneStep[] = [{offsetMillis: 0, frequencyHz: 1200, durationMillis: 300}]

    test('findet die Partie ueber die Boote der Sequenz und nimmt deren Plan', () => {
        const matches = [match('m1', ['t1', 't2'], null), match('m2', ['t3'], customPlan)]
        expect(tonePlanForSequence(matches, sequence(['t3']))).toEqual(customPlan)
    })

    test('ohne konfigurierten Plan (null) gilt der eingebaute Standard', () => {
        const matches = [match('m1', ['t1'], null)]
        expect(tonePlanForSequence(matches, sequence(['t1']))).toEqual(DEFAULT_START_TONE_PLAN)
    })

    test('ohne Treffer in der Startliste gilt der eingebaute Standard', () => {
        expect(tonePlanForSequence([], sequence(['t9']))).toEqual(DEFAULT_START_TONE_PLAN)
        expect(tonePlanForSequence([match('m1', ['t1'], customPlan)], undefined)).toEqual(
            DEFAULT_START_TONE_PLAN,
        )
    })

    test('unsortierte konfigurierte Plaene kommen sortiert heraus', () => {
        const unsorted: ToneStep[] = [
            {offsetMillis: 0, frequencyHz: 900, durationMillis: 400},
            {offsetMillis: -2000, frequencyHz: 700, durationMillis: 100},
        ]
        const matches = [match('m1', ['t1'], unsorted)]
        expect(tonePlanForSequence(matches, sequence(['t1'])).map(step => step.offsetMillis)).toEqual([
            -2000, 0,
        ])
    })
})

describe('previewSchedule', () => {
    test('erster Ton sofort, echte Abstaende bleiben, lange Pausen werden gerafft', () => {
        const plan: ToneStep[] = [
            {offsetMillis: -60_000, frequencyHz: 700, durationMillis: 200},
            {offsetMillis: -5000, frequencyHz: 600, durationMillis: 100},
            {offsetMillis: -4000, frequencyHz: 600, durationMillis: 100},
            {offsetMillis: 0, frequencyHz: 900, durationMillis: 400},
        ]
        const schedule = previewSchedule(plan)
        expect(schedule.map(tone => tone.atMillis)).toEqual([
            0,
            PREVIEW_MAX_GAP_MILLIS, // 55 s Pause -> gerafft
            PREVIEW_MAX_GAP_MILLIS + 1000, // 1 s Abstand bleibt echt
            PREVIEW_MAX_GAP_MILLIS + 1000 + PREVIEW_MAX_GAP_MILLIS, // 4 s -> gerafft
        ])
        expect(schedule.map(tone => tone.step.frequencyHz)).toEqual([700, 600, 600, 900])
    })

    test('sortiert unsortierte Eingaben vor dem Abspielen', () => {
        const schedule = previewSchedule([
            {offsetMillis: 0, frequencyHz: 900, durationMillis: 400},
            {offsetMillis: -1000, frequencyHz: 600, durationMillis: 100},
        ])
        expect(schedule.map(tone => tone.step.offsetMillis)).toEqual([-1000, 0])
        expect(schedule.map(tone => tone.atMillis)).toEqual([0, 1000])
    })
})
