import {describe, expect, it} from 'vitest'
import {OfficialTimeDto} from '@api/types.gen.ts'
import {
    boatReason,
    computedReason,
    effectiveReason,
    markReason,
} from './officialTimeReason.ts'

// Warum eine offizielle Zeit fehlt: die Zeilen-Ebene erklärt den leeren Wert („kein Start",
// „kein Ziel", „Start nach Ziel"), statt den Bediener rätseln zu lassen. Die Ableitung spiegelt
// die Backend-Klassifikation (OfficialTimeSkipReason) aus den Marken-Werten des DTO.

/** Ein DTO mit sinnvollen Defaults — jeder Test überschreibt nur, was er braucht. */
function dto(overrides: Partial<OfficialTimeDto>): OfficialTimeDto {
    return {
        competitionMatchTeam: 'team-1',
        event: 'event-1',
        penaltyMillis: 0,
        resultStatus: 'NONE',
        dirty: false,
        ...overrides,
    }
}

describe('markReason', () => {
    it('ohne DTO gibt es nichts zu erklären', () => {
        expect(markReason(undefined)).toBeNull()
    })

    it('nur Ziel ohne Start → NO_START_MARK', () => {
        expect(markReason(dto({finishMillis: 1_000}))).toBe('NO_START_MARK')
    })

    it('nur Start ohne Ziel → NO_FINISH_MARK', () => {
        expect(markReason(dto({startMillis: 1_000}))).toBe('NO_FINISH_MARK')
    })

    it('Ziel vor Start → NEGATIVE_DURATION', () => {
        expect(markReason(dto({startMillis: 2_000, finishMillis: 1_000}))).toBe(
            'NEGATIVE_DURATION',
        )
    })

    it('gar keine Marken → NO_MARKS', () => {
        expect(markReason(dto({}))).toBe('NO_MARKS')
    })

    it('vollständige, plausible Marken erklären nichts', () => {
        expect(markReason(dto({startMillis: 1_000, finishMillis: 2_000}))).toBeNull()
    })

    it('Ziel exakt gleich Start ist keine negative Dauer', () => {
        // Grenzfall wie im Backend: finish < start ist der Fehler, finish == start nicht.
        expect(markReason(dto({startMillis: 1_000, finishMillis: 1_000}))).toBeNull()
    })
})

describe('computedReason (Berechnet-Spalte des Leitstands)', () => {
    it('erklärt die leere Spalte aus den Marken', () => {
        expect(computedReason(dto({finishMillis: 1_000}))).toBe('NO_START_MARK')
    })

    it('schweigt, sobald ein berechneter Wert dasteht', () => {
        expect(
            computedReason(dto({startMillis: 1_000, finishMillis: 2_000, computedMillis: 1_000})),
        ).toBeNull()
    })

    it('erklärt die leere Spalte auch, wenn ein Override die Zeit liefert', () => {
        // Der Grund gehört zur BERECHNUNG: ein Hand-Override füllt die Offiziell-Spalte,
        // aber die Berechnet-Spalte bleibt leer — und darf weiter sagen, warum.
        expect(
            computedReason(dto({overrideMillis: 90_000, effectiveMillis: 90_000})),
        ).toBe('NO_MARKS')
    })
})

describe('effectiveReason (Offiziell-Spalte / Übersicht)', () => {
    it('erklärt eine leere offizielle Zeit', () => {
        expect(effectiveReason(dto({finishMillis: 1_000}))).toBe('NO_START_MARK')
    })

    it('schweigt bei vorhandener offizieller Zeit', () => {
        expect(
            effectiveReason(
                dto({startMillis: 1_000, finishMillis: 2_000, computedMillis: 1_000, effectiveMillis: 1_000}),
            ),
        ).toBeNull()
    })

    it('schweigt bei DNS/DNF/DSQ — der Status-Chip erklärt die Zeile bereits', () => {
        expect(effectiveReason(dto({finishMillis: 1_000, resultStatus: 'DNF'}))).toBeNull()
    })

    it('schweigt ganz ohne DTO', () => {
        expect(effectiveReason(undefined)).toBeNull()
    })
})

describe('boatReason (Zeit am Boot im Ziel-Board)', () => {
    it('zeigt „kein Start" am Boot', () => {
        expect(boatReason(dto({finishMillis: 1_000}))).toBe('NO_START_MARK')
    })

    it('zeigt „Start nach Ziel" am Boot', () => {
        expect(boatReason(dto({startMillis: 2_000, finishMillis: 1_000}))).toBe(
            'NEGATIVE_DURATION',
        )
    })

    it('unterdrückt „kein Ziel" — vor dem Zieleinlauf hätte es sonst jedes Boot', () => {
        expect(boatReason(dto({startMillis: 1_000}))).toBeNull()
    })

    it('unterdrückt „keine Zeitmarken" — Boote vor ihrem Rennen sind kein Fehlerfall', () => {
        expect(boatReason(dto({}))).toBeNull()
    })
})
