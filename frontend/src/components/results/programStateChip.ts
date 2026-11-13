import {BoardProgramState} from '@api/types.gen.ts'

export type ProgramStateChip = {
    labelKey:
        | 'results.program.running'
        | 'results.program.finished'
        | 'results.program.upcoming'
        | 'event.match.status.preparing'
        | 'event.match.status.clarification'
        | 'event.match.status.awaitingFinish'
    color: 'default' | 'info' | 'primary' | 'warning'
    variant: 'filled' | 'outlined'
}

/**
 * Der Zustands-Chip einer Zeile im öffentlichen Zeitplan-Reiter. Der Zustand kommt aus derselben
 * Ableitung wie der Live-Reiter (`BoardLogic.programState` im Backend); die Wörter für die Zustände,
 * die der Live-Reiter auch kennt, kommen deshalb aus demselben Schlüsselbereich
 * (`event.match.status.*`), damit beide Reiter für denselben Lauf dasselbe sagen.
 *
 * Programmpunkte (Pausen) tragen keinen Laufzustand - ein „Anstehend" an der Mittagspause wäre
 * nur Rauschen; dafür liefert die Funktion null.
 */
export const programStateChip = (
    state: BoardProgramState,
    isScheduleItem: boolean,
): ProgramStateChip | null => {
    if (isScheduleItem && state === 'UPCOMING') return null
    switch (state) {
        case 'RUNNING':
            return {labelKey: 'results.program.running', color: 'info', variant: 'filled'}
        case 'PREPARING':
            return {labelKey: 'event.match.status.preparing', color: 'info', variant: 'outlined'}
        case 'CLARIFICATION':
            return {
                labelKey: 'event.match.status.clarification',
                color: 'warning',
                variant: 'filled',
            }
        case 'AWAITING_FINISH':
            return {
                labelKey: 'event.match.status.awaitingFinish',
                color: 'warning',
                variant: 'outlined',
            }
        case 'FINISHED':
            return {labelKey: 'results.program.finished', color: 'default', variant: 'filled'}
        case 'UPCOMING':
            return {labelKey: 'results.program.upcoming', color: 'default', variant: 'outlined'}
    }
}
