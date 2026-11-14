import {
    EventRegistrationCompetitionDto,
    EventRegistrationInfoDto,
    EventRegistrationUpsertDto,
    MaterialRequestDto,
    MaterialRequestStatus,
} from '@api/types.gen.ts'
import type {EventRegistrationFormData} from '../../pages/eventRegistration/EventRegistrationCreatePage.tsx'
import {ACTIVE_REQUEST_STATUSES} from './materialChoice.ts'

/**
 * Regeln des Meldeformulars rund um Materialanfragen, die über eine einzelne Materialzeile
 * hinausgehen: was beim Speichern einen PUT `setMaterialRequests` braucht, wie eine Meldung in
 * Fehlerlisten heißt, und was mit den Anfragen von Meldungen passiert, die das Formular entfernt.
 */

/**
 * Angebots-IDs der noch aktiven Anfragen (angefragt, bestätigt, Warteliste) – zurückgezogene oder
 * abgelehnte zählen nicht. Ausgangswert des Formulars und Vergleichsbasis beim Speichern.
 */
export const activeMaterialOfferIds = (
    materialRequests?: readonly MaterialRequestDto[],
): string[] =>
    (materialRequests ?? [])
        .filter(r => ACTIVE_REQUEST_STATUSES.includes(r.status))
        .map(r => r.materialOffer)

/** Zwei Listen von Angebots-IDs ohne Rücksicht auf die Reihenfolge vergleichen. */
export const sameOfferIds = (a: readonly string[], b: readonly string[]): boolean => {
    if (a.length !== b.length) return false
    const sortedA = [...a].sort()
    const sortedB = [...b].sort()
    return sortedA.every((id, index) => id === sortedB[index])
}

type Info = Pick<EventRegistrationInfoDto, 'competitionsSingle' | 'competitionsTeam'> | null

const competitionName = (
    list: readonly EventRegistrationCompetitionDto[] | undefined,
    competitionId: string,
) => list?.find(c => c.id === competitionId)?.name ?? ''

const personName = (p: {firstname?: string; lastname?: string}) =>
    `${p.firstname ?? ''} ${p.lastname ?? ''}`.trim()

/** Eine Meldung, deren Materialwahl gespeichert werden muss, mit lesbarem Namen. */
export type MaterialRequestUpdate = {
    registrationId: string
    competitionName: string
    /** „Team 2" bzw. der Name der Person – unterscheidet zwei Boote desselben Wettkampfs. */
    entryLabel: string
    offerIds: string[]
}

/**
 * Welche Meldungen beim Speichern einen PUT `setMaterialRequests` brauchen: alle offenen
 * (nicht gesperrten) Meldungen, deren gewählte Angebote sich gegenüber dem Ausgangsstand geändert
 * haben. `teamLabel` beschriftet Teams wie die Formularüberschrift („Team n").
 */
export const materialRequestUpdates = (
    data: Pick<EventRegistrationFormData, 'participants' | 'competitionRegistrations'>,
    initialOfferIds: ReadonlyMap<string, readonly string[]>,
    info: Info,
    teamLabel: (number: number) => string,
): MaterialRequestUpdate[] => {
    const all: MaterialRequestUpdate[] = []
    for (const registration of data.competitionRegistrations ?? []) {
        const name = competitionName(info?.competitionsTeam, registration.competitionId)
        registration.teams.forEach((team, index) => {
            if (team.locked) return
            all.push({
                registrationId: team.id,
                competitionName: name,
                entryLabel: teamLabel(index + 1),
                offerIds: team.materialOfferIds ?? [],
            })
        })
    }
    for (const participant of data.participants ?? []) {
        for (const single of participant.competitionsSingle ?? []) {
            if (single.locked || !single.id) continue
            all.push({
                registrationId: single.id,
                competitionName: competitionName(info?.competitionsSingle, single.competitionId),
                entryLabel: personName(participant),
                offerIds: single.materialOfferIds ?? [],
            })
        }
    }
    return all.filter(u => !sameOfferIds(initialOfferIds.get(u.registrationId) ?? [], u.offerIds))
}

/** Eine Meldung im Ausgangsstand mit ihren aktiven Materialanfragen. */
export type InitialMaterialEntry = {
    registrationId: string
    competitionName: string
    entryLabel: string
    requests: MaterialRequestDto[]
}

/** Die Meldungen des Ausgangsstands, an denen eine aktive Materialanfrage hängt. */
export const initialMaterialEntries = (
    upsertable: Pick<EventRegistrationUpsertDto, 'participants' | 'competitionRegistrations'>,
    info: Info,
    teamLabel: (number: number) => string,
): InitialMaterialEntry[] => {
    const entries: InitialMaterialEntry[] = []
    const active = (requests?: MaterialRequestDto[]) =>
        (requests ?? []).filter(r => ACTIVE_REQUEST_STATUSES.includes(r.status))
    for (const registration of upsertable.competitionRegistrations) {
        const name = competitionName(info?.competitionsTeam, registration.competitionId)
        registration.teams?.forEach((team, index) => {
            const requests = active(team.materialRequests)
            if (requests.length === 0) return
            entries.push({
                registrationId: team.id,
                competitionName: name,
                entryLabel: teamLabel(index + 1),
                requests,
            })
        })
    }
    for (const participant of upsertable.participants) {
        for (const single of participant.competitionsSingle ?? []) {
            const requests = active(single.materialRequests)
            if (!single.id || requests.length === 0) continue
            entries.push({
                registrationId: single.id,
                competitionName: competitionName(info?.competitionsSingle, single.competitionId),
                entryLabel: personName(participant),
                requests,
            })
        }
    }
    return entries
}

/** Was das Absenden mit der Anfrage einer entfernten Meldung tut. */
export type RemovedMaterialRequest = {
    registrationId: string
    competitionName: string
    entryLabel: string
    providerName: string
    typeName: string
    status: MaterialRequestStatus
    /**
     * Der Anbieter hat die Vergabe geschlossen: Das Backend weist das Speichern dann ab
     * (409 MATERIAL_REMOVAL_REQUESTS_CLOSED) – das Team muss bleiben oder der Anbieter hilft.
     */
    blocked: boolean
}

/**
 * Anfragen an Meldungen, die das Formular nicht mehr enthält (Team entfernt, Wettkampf abgewählt).
 * Das Backend behandelt das wie einen Rückzug: bestätigte Anfragen lösen eine Nachricht an den
 * Anbieter aus, bei geschlossener Vergabe wird das Speichern abgewiesen.
 */
export const removedMaterialRequests = (
    initial: readonly InitialMaterialEntry[],
    data: Pick<EventRegistrationFormData, 'participants' | 'competitionRegistrations'>,
    closedOfferIds: ReadonlySet<string>,
): RemovedMaterialRequest[] => {
    const present = new Set<string>()
    for (const registration of data.competitionRegistrations ?? []) {
        for (const team of registration.teams) present.add(team.id)
    }
    for (const participant of data.participants ?? []) {
        for (const single of participant.competitionsSingle ?? []) {
            if (single.id) present.add(single.id)
        }
    }
    return initial
        .filter(entry => !present.has(entry.registrationId))
        .flatMap(entry =>
            entry.requests.map(request => ({
                registrationId: entry.registrationId,
                competitionName: entry.competitionName,
                entryLabel: entry.entryLabel,
                providerName: request.providerName,
                typeName: request.materialTypeName,
                status: request.status,
                blocked: closedOfferIds.has(request.materialOffer),
            })),
        )
}

/** Angebote mit geschlossener Vergabe, aus den Bedarfen aller Wettkämpfe. */
export const closedOfferIdsOf = (info: Info): Set<string> =>
    new Set(
        [...(info?.competitionsSingle ?? []), ...(info?.competitionsTeam ?? [])].flatMap(c =>
            (c.materialDemands ?? []).flatMap(d =>
                d.offers.filter(o => o.requestsClosed).map(o => o.offerId),
            ),
        ),
    )
