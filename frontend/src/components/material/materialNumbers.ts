import {
    MaterialOverviewItemDto,
    MaterialOverviewMatchDto,
    MaterialOverviewRequestDto,
} from '@api/types.gen.ts'

/**
 * Die zwei Nummern eines Teams und was das Anbieter-Dashboard mit ihnen rechnet.
 *
 * - **Meldungsnummer** (`teamNumber`): je Wettkampf eindeutig und fest, vergeben bei der
 *   Fixierung (wahlweise nach den Bootsnummern). Gegen sie rechnet die **Grundzuteilung**: Boot n
 *   gehört zur Meldungsnummer n. Sie kennzeichnet und sortiert die Teams in den Listen.
 * - **Startnummer im Lauf** (`startNumber` je Lauf-Team): beginnt je Lauf bei 1, in Folgerunden
 *   der Rang. Sie steht auf allen Anzeigen neben dem Boot, und gegen sie markieren die Anzeigen
 *   „abweichend". Alles, was je Lauf entscheidet (Ausnahme, Ersatz nach Ausfall), rechnet mit ihr.
 *
 * Die beiden Zahlen werden nie stillschweigend gegeneinander ausgetauscht: Wo eine fehlt, gibt
 * es keine Zahl, keinen Rückfall auf die andere.
 */

/** Meldungsnummer der Anfrage; `undefined`, solange der Veranstalter nicht fixiert hat. */
export const teamNumberOf = (
    request: Pick<MaterialOverviewRequestDto, 'teamNumber'>,
): number | undefined => request.teamNumber ?? undefined

/** Ein Team in einem Lauf mit seiner Startnummer dort. */
export type MatchTeamNumber = {competitionRegistration: string; startNumber: number}

/** Startnummer einer Meldung in genau diesem Lauf; `undefined`, wenn sie dort nicht startet. */
export const startNumberInMatch = (
    match: {id: string; teams?: readonly MatchTeamNumber[]} | undefined,
    competitionRegistration: string,
): number | undefined =>
    match?.teams?.find(t => t.competitionRegistration === competitionRegistration)?.startNumber

export type ProposedAssignment = {
    requestId: string
    entries: {materialItem: string; competitionMatch: null}[]
}

const baseItemIds = (request: Pick<MaterialOverviewRequestDto, 'assignments'>): string[] =>
    request.assignments.filter(a => a.competitionMatch == null).map(a => a.materialItem)

/**
 * „Nach Meldungsnummer zuteilen": schlägt für bestätigte Anfragen ohne Grundzuteilung das aktive
 * Stück der passenden Art vor, dessen Nummer die Meldungsnummer des Teams trägt.
 *
 * Ein Stück wird je Wettkampf höchstens einmal vergeben – weder doppelt vorgeschlagen noch einem
 * zweiten Team gegeben, das es im selben Wettkampf schon als Grundzuteilung hat. Die
 * Meldungsnummer ist je Wettkampf eindeutig; die Sperre fängt trotzdem doppelte Nummern ab
 * (Altbestand, Handarbeit), statt still eine Überschneidung zu bauen – dann bekommt die ältere
 * Anfrage das Stück. Über Wettkämpfe hinweg darf dasselbe Boot mehrfach auftauchen: dieselbe
 * Nummer in verschiedenen Rennen ist gewollt, Überschneidungen meldet die Konfliktrechnung.
 */
export const assignByTeamNumber = (
    requests: readonly MaterialOverviewRequestDto[],
    items: readonly MaterialOverviewItemDto[],
): ProposedAssignment[] => {
    const usedKey = (competition: string, itemId: string) => `${competition}|${itemId}`
    const used = new Set<string>()
    for (const request of requests) {
        if (request.status !== 'CONFIRMED') continue
        for (const id of baseItemIds(request)) used.add(usedKey(request.competition, id))
    }

    const ordered = [...requests].sort(
        (a, b) => new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime(),
    )

    const result: ProposedAssignment[] = []
    for (const request of ordered) {
        if (request.status !== 'CONFIRMED' || baseItemIds(request).length > 0) continue
        const number = teamNumberOf(request)
        if (number == null) continue

        const candidate = items.find(
            item =>
                item.status === 'ACTIVE' &&
                item.materialType === request.materialType &&
                item.number === number &&
                !used.has(usedKey(request.competition, item.id)),
        )
        if (candidate == null) continue

        used.add(usedKey(request.competition, candidate.id))
        result.push({
            requestId: request.id,
            entries: [{materialItem: candidate.id, competitionMatch: null}],
        })
    }
    return result
}

/**
 * Die Grundzuteilung weicht von der Meldungsnummer ab, wenn es eine gibt, aber keines ihrer
 * Stücke die Meldungsnummer trägt. Ohne Grundzuteilung oder ohne Meldungsnummer gibt es nichts,
 * wovon abzuweichen wäre.
 */
export const deviatesFromTeamNumber = (
    request: MaterialOverviewRequestDto,
    items: readonly MaterialOverviewItemDto[],
): boolean => {
    const ids = baseItemIds(request)
    const number = teamNumberOf(request)
    if (ids.length === 0 || number == null) return false
    const itemsById = new Map(items.map(i => [i.id, i]))
    return !ids.some(id => itemsById.get(id)?.number === number)
}

/**
 * Wirksame Stücke weichen in einem Lauf ab, wenn keines die Startnummer des Teams in diesem
 * Lauf trägt – dieselbe Regel, nach der Boards, Schiedsrichter-Dashboard und Lauf-Karte
 * „abweichend" zeigen. Ohne Startnummer im Lauf oder ohne Stück: keine Abweichung.
 */
export const deviatesInMatch = (
    itemIds: readonly string[],
    startNumber: number | undefined,
    items: readonly MaterialOverviewItemDto[],
): boolean => {
    if (itemIds.length === 0 || startNumber == null) return false
    const itemsById = new Map(items.map(i => [i.id, i]))
    return !itemIds.some(id => itemsById.get(id)?.number === startNumber)
}

/**
 * Bestätigte Anfragen „ohne Nummerngleichheit": Das Team hat eine Meldungsnummer, aber die
 * eigene aktive Flotte hat kein Stück dieser Art mit dieser Nummer. Das sind die überzähligen
 * Mietteams, die bei der Fixierung Nummern oberhalb des Bestands bekamen; sie brauchen ein Stück
 * mit anderer Nummer, und jede Anzeige wird sie als „abweichend" führen.
 */
export const withoutNumberMatch = (
    requests: readonly MaterialOverviewRequestDto[],
    items: readonly MaterialOverviewItemDto[],
): Set<string> => {
    const numbersByType = new Map<string, Set<number>>()
    for (const item of items) {
        if (item.status !== 'ACTIVE' || item.number == null) continue
        const set = numbersByType.get(item.materialType) ?? new Set<number>()
        set.add(item.number)
        numbersByType.set(item.materialType, set)
    }
    const result = new Set<string>()
    for (const request of requests) {
        const number = teamNumberOf(request)
        if (request.status !== 'CONFIRMED' || number == null) continue
        if (!numbersByType.get(request.materialType)?.has(number)) result.add(request.id)
    }
    return result
}

/**
 * In wie vielen Läufen das wirksame Stück einer Anfrage nicht die Startnummer des Teams in diesem
 * Lauf trägt – also wie oft Boards, Schiedsrichter-Dashboard und Lauf-Karte „abweichend" zeigen.
 * Ausnahmen je Lauf schlagen die Grundzuteilung, wie in `effectiveAssignments`.
 */
export const deviatingMatchCount = (
    request: Pick<MaterialOverviewRequestDto, 'competitionRegistration' | 'assignments'>,
    matches: readonly MaterialOverviewMatchDto[],
    items: readonly MaterialOverviewItemDto[],
): number => {
    const base = baseItemIds(request)
    let count = 0
    for (const match of matches) {
        if (!match.registrationIds.includes(request.competitionRegistration)) continue
        const exceptions = request.assignments
            .filter(a => a.competitionMatch === match.id)
            .map(a => a.materialItem)
        const effective = exceptions.length > 0 ? exceptions : base
        const startNumber = startNumberInMatch(match, request.competitionRegistration)
        if (deviatesInMatch(effective, startNumber, items)) count++
    }
    return count
}
