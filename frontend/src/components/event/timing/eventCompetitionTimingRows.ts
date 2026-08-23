import {TimingModeAssignmentDto, TimingSystem} from '@api/types.gen.ts'
import {EventTimingFormSystem} from './eventTimingConfigForm.ts'

/**
 * Reine Logik der Wettkampf-Tabelle in den Zeitnahme-Einstellungen der Veranstaltung: was je Zeile
 * effektiv gilt und was die Zuordnungsliste der Zeitnahmetypen über einen Wettkampf sagt. Ohne
 * Netz und Komponenten testbar — die Tabelle selbst (EventCompetitionTimingSection) rendert nur.
 */

/**
 * Das effektiv geltende System einer Zeile: der eigene Wert des Wettkampfs vor der Voreinstellung
 * der Veranstaltung — dieselbe coalesce-Regel wie das Backend und effectiveTimingSystem im
 * Zeitnahme-Tab des Wettkampfs.
 */
export const effectiveRowSystem = (
    own: TimingSystem | null | undefined,
    eventSystem: EventTimingFormSystem,
): EventTimingFormSystem => own ?? eventSystem

/**
 * Die Wettkampf-weite Zeitnahmetyp-Zuordnung (der Eintrag OHNE Runde) — '' wenn keine, weil ein
 * Select einen Wert braucht und null nicht auswählbar ist. Runden-Einträge zählen bewusst nicht:
 * sie überschreiben nur ihre eine Runde und werden auf der Wettkampf-Seite gepflegt.
 */
export const competitionWideMode = (
    assignments: TimingModeAssignmentDto[],
    competitionId: string,
): string =>
    assignments.find(
        assignment =>
            assignment.competition === competitionId && assignment.competitionSetupRound == null,
    )?.timingMode ?? ''

/**
 * Wie viele Runden dieses Wettkampfs vom Wettkampf-weiten Zeitnahmetyp abweichen. Die Tabelle
 * zeigt daraus nur einen Hinweis („+ N Runden-Abweichungen") — bearbeitet werden sie im
 * Zeitnahme-Tab des Wettkampfs, damit es genau EINEN Ort für die Runden-Pflege gibt.
 */
export const roundDeviationCount = (
    assignments: TimingModeAssignmentDto[],
    competitionId: string,
): number =>
    assignments.filter(
        assignment =>
            assignment.competition === competitionId && assignment.competitionSetupRound != null,
    ).length
