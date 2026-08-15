import {ParticipantMatchScopeDto, ParticipantRequirementForEventDto} from '@api/types.gen.ts'

/**
 * Das Erledigungsfenster einer Bedingung, aus Sicht der App am Steg.
 *
 * Warum das hier und nicht im Backend gerechnet wird, obwohl dort mit
 * `RequirementScopeLogic.windowStatus` dieselbe Regel steht: Am Steg zählt die Uhrzeit von jetzt,
 * und "jetzt" wandert. Käme der Zustand fertig vom Server, stünde nach zehn Minuten Wartezeit auf
 * dem Telefon immer noch "zu früh", obwohl das Fenster längst offen ist. Deshalb liefert das
 * Backend nur die Grenzen (Minuten vor dem Start) und die Startzeit des Laufs; gerechnet wird bei
 * jedem Rendern neu.
 *
 * Die Duplikation ist bewusst und eng gehalten: Beide Fassungen zählen von der Startzeit rückwärts
 * und behandeln die Grenzen als drinnen. Wer eine ändert, muss die andere mitändern - die
 * Backend-Fassung ist die maßgebliche, hier steht ihre Anzeige-Entsprechung.
 */
export type RequirementWindowStatus = 'TOO_EARLY' | 'IN_WINDOW' | 'TOO_LATE' | 'NO_WINDOW'

export type RequirementWindow = {
    status: RequirementWindowStatus
    /** Wann das Fenster öffnet - null, wenn keine frühe Grenze gepflegt ist. */
    from: Date | null
    /** Wann es schließt - null, wenn keine späte Grenze gepflegt ist. */
    until: Date | null
}

/** Eine Grenze: so viele Minuten vor dem Bezugszeitpunkt. */
const bound = (reference: Date | null, minutesBefore: number | null | undefined): Date | null =>
    reference !== null && minutesBefore !== null && minutesBefore !== undefined
        ? new Date(reference.getTime() - minutesBefore * 60_000)
        : null

/**
 * Der Bezugspunkt ist ausdrücklich der Start **des gewählten Laufs** und nicht der nächste Start
 * der Person: Wer an einem Tag in zwei Wettkämpfen startet, bekäme sonst die Grenzen des falschen
 * Rennens angezeigt. Dieselbe Entscheidung wie in `RequirementScopeLogic.referencePoint`.
 */
export const requirementWindow = (
    requirement: Pick<
        ParticipantRequirementForEventDto,
        'checkEarliestMinutesBefore' | 'checkLatestMinutesBefore'
    >,
    match: Pick<ParticipantMatchScopeDto, 'startTime'> | null,
    now: Date,
): RequirementWindow => {
    const reference = match?.startTime ? new Date(match.startTime) : null
    const from = bound(reference, requirement.checkEarliestMinutesBefore)
    const until = bound(reference, requirement.checkLatestMinutesBefore)

    // Ohne beide Grenzen gibt es nichts zu sagen - ausdrücklich nicht "in Ordnung": wo nichts
    // eingestellt ist, hat niemand etwas bestätigt.
    if (from === null && until === null) {
        return {status: 'NO_WINDOW', from, until}
    }
    if (from !== null && now.getTime() < from.getTime()) {
        return {status: 'TOO_EARLY', from, until}
    }
    if (until !== null && now.getTime() > until.getTime()) {
        return {status: 'TOO_LATE', from, until}
    }
    return {status: 'IN_WINDOW', from, until}
}

/**
 * Der Lauf, der beim Abhaken vorbelegt wird: der nächste, der noch bevorsteht. Am Steg ist das
 * fast immer der richtige - die Auswahl soll ein Bestätigen sein, kein Suchen.
 *
 * Läuft gerade keiner mehr in der Zukunft, gewinnt der letzte vergangene: Wer nach dem Start
 * nachträgt, meint diesen und nicht den von übermorgen. Läufe ohne Startzeit stehen ganz hinten -
 * sie sind terminlich offen und taugen nicht als Vorbelegung, solange es terminierte gibt.
 */
export const preselectedMatch = (
    matches: ParticipantMatchScopeDto[],
    now: Date,
): ParticipantMatchScopeDto | null => {
    if (matches.length === 0) return null

    const terminiert = matches.filter(m => m.startTime)
    const kuenftig = terminiert
        .filter(m => new Date(m.startTime!).getTime() >= now.getTime())
        .sort((a, b) => new Date(a.startTime!).getTime() - new Date(b.startTime!).getTime())
    if (kuenftig.length > 0) return kuenftig[0]

    const vergangen = terminiert.sort(
        (a, b) => new Date(b.startTime!).getTime() - new Date(a.startTime!).getTime(),
    )
    if (vergangen.length > 0) return vergangen[0]

    return matches[0]
}

/**
 * Wie ein Lauf in der Auswahl heißt. Die Rennnummer trägt am Steg am meisten - sie steht auf dem
 * Zettel in der Hand -, deshalb steht sie vorn; der Name folgt für die, die ohne Zettel arbeiten.
 */
export const matchScopeLabel = (match: ParticipantMatchScopeDto): string =>
    [match.competitionIdentifier, match.competitionShortName ?? match.competitionName]
        .filter(Boolean)
        .join(' ')
