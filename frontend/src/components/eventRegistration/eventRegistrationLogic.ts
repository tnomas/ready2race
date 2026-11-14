import type {
    EventRegistrationCompetitionDto,
    EventRegistrationInfoDto,
    OpenForRegistrationType,
} from '@api/types.gen.ts'
import type {
    CompetitionRegistrationFormData,
    EventRegistrationFormData,
    EventRegistrationParticipantFormData,
} from '../../pages/eventRegistration/EventRegistrationCreatePage.tsx'
import {materialSummaryLines, MaterialSummaryLine} from './materialChoice.ts'

/**
 * Reine Regeln des Meldeformulars (Verein meldet Teilnehmende zu Wettkämpfen): Schrittfolge,
 * Gebührensumme, Zusammenfassung vor dem Absenden, Suche, Fehlerübersicht und Fehlertexte des
 * Servers. Die Komponenten unter `components/eventRegistration/` rechnen nichts davon selbst.
 */

// ---------------------------------------------------------------------------------------------
// Schritte

export type RegistrationStepKey = 'participants' | 'single' | 'team' | 'summary'

/**
 * Sichtbare Schritte. Ein Schritt ohne Inhalt (keine Einzel- bzw. keine Teamwettkämpfe) entfällt,
 * statt eine leere Seite zu zeigen. Die Zusammenfassung fehlt nur im Bearbeiten durch die
 * Veranstaltung (`adminEdit`), dort wird direkt gespeichert.
 */
export const visibleRegistrationSteps = (opts: {
    singleCompetitions: number
    teamCompetitions: number
    adminEdit?: boolean
}): RegistrationStepKey[] => [
    'participants',
    ...(opts.singleCompetitions > 0 ? (['single'] as const) : []),
    ...(opts.teamCompetitions > 0 ? (['team'] as const) : []),
    ...(opts.adminEdit ? [] : (['summary'] as const)),
]

/** Felder, die beim Weiterklicken aus einem Schritt geprüft werden. */
export const stepValidationKeys = (
    step: RegistrationStepKey,
): Array<keyof EventRegistrationFormData> => {
    switch (step) {
        case 'participants':
        case 'single':
            return ['participants']
        case 'team':
            return ['competitionRegistrations']
        case 'summary':
            return []
    }
}

// ---------------------------------------------------------------------------------------------
// Gebühren

export const competitionEntryAmount = (
    competition: EventRegistrationCompetitionDto,
    optionalFees: string[],
    late: boolean,
): number =>
    competition.fees
        ?.filter(fee => fee.required || optionalFees.includes(fee.id))
        .reduce(
            (sum, fee) => sum + Number(late ? (fee.lateAmount ?? fee.amount) : fee.amount),
            0,
        ) ?? 0

export const competitionMapOf = (
    info: Pick<EventRegistrationInfoDto, 'competitionsSingle' | 'competitionsTeam'> | null,
): Map<string, EventRegistrationCompetitionDto> =>
    new Map(
        [...(info?.competitionsSingle ?? []), ...(info?.competitionsTeam ?? [])].map(c => [
            c.id,
            c,
        ]),
    )

export type RegistrationFees = {
    /** Summe der in dieser Meldung neu oder weiter änderbaren Einträge zum regulären Meldegeld. */
    regular: number
    /** Dasselbe für Einträge, die in der Nachmeldephase entstehen. */
    late: number
}

/**
 * Meldegeld der Einträge, die mit diesem Absenden übertragen werden. Gesperrte Einträge (nach
 * Meldeschluss nicht mehr änderbar) sind schon abgerechnet und zählen nicht mit.
 */
export const registrationFees = (
    participants: EventRegistrationParticipantFormData[] | undefined,
    competitionRegistrations: CompetitionRegistrationFormData[] | undefined,
    competitionMap: Map<string, EventRegistrationCompetitionDto>,
): RegistrationFees => {
    const fees: RegistrationFees = {regular: 0, late: 0}
    const add = (
        competitionId: string,
        optionalFees: string[] | undefined,
        isLate: unknown,
        locked: boolean,
    ) => {
        if (locked || typeof isLate !== 'boolean') return
        const competition = competitionMap.get(competitionId)
        if (!competition) return
        const amount = competitionEntryAmount(competition, optionalFees ?? [], isLate)
        if (isLate) fees.late += amount
        else fees.regular += amount
    }
    participants?.forEach(p =>
        p.competitionsSingle?.forEach(s =>
            add(s.competitionId, s.optionalFees, s.isLate, s.locked),
        ),
    )
    competitionRegistrations?.forEach(r =>
        r.teams.forEach(team => add(r.competitionId, team.optionalFees, team.isLate, team.locked)),
    )
    return fees
}

export const hasAnyFees = (competitionMap: Map<string, EventRegistrationCompetitionDto>): boolean =>
    [...competitionMap.values()].some(c => (c.fees?.length ?? 0) > 0)

export const formatAmount = (amount: number): string => `${amount.toFixed(2)} €`

// ---------------------------------------------------------------------------------------------
// Zusammenfassung

export type RegistrationSummaryEntry = {
    key: string
    names: string[]
    /** Eintrag der Nachmeldephase (Nachmeldegebühr). */
    late: boolean
    locked: boolean
    amount: number
    optionalFeeLabels: string[]
    /**
     * Material je Bedarf des Wettkampfs mit der Wirkung des Absendens (neu, behalten,
     * zurückziehen). Leer bei gesperrten Einträgen – die gehen nicht mit.
     */
    material: MaterialSummaryLine[]
}

export type RegistrationSummaryCompetition = {
    competition: EventRegistrationCompetitionDto
    kind: 'single' | 'team'
    entries: RegistrationSummaryEntry[]
}

export type RegistrationSummary = {
    competitions: RegistrationSummaryCompetition[]
    /** Einträge, die mit diesem Absenden übertragen werden (ohne gesperrte). */
    openEntries: number
    lockedEntries: number
    newParticipants: string[]
    changedParticipants: string[]
    fees: RegistrationFees
}

export const participantName = (
    p: Pick<EventRegistrationParticipantFormData, 'firstname' | 'lastname'>,
) => `${p.firstname ?? ''} ${p.lastname ?? ''}`.trim()

const optionalFeeLabels = (
    competition: EventRegistrationCompetitionDto,
    optionalFees: string[] | undefined,
) =>
    competition.fees
        ?.filter(f => !f.required && (optionalFees ?? []).includes(f.id))
        .map(f => f.label) ?? []

/**
 * Wer ist wo gemeldet, in der Reihenfolge der Ausschreibung (erst Einzel-, dann Teamwettkämpfe).
 * Wettkämpfe ohne Eintrag fehlen.
 */
export const buildRegistrationSummary = (
    data: Pick<EventRegistrationFormData, 'participants' | 'competitionRegistrations'>,
    info: Pick<EventRegistrationInfoDto, 'competitionsSingle' | 'competitionsTeam'> | null,
): RegistrationSummary => {
    const participants = data.participants ?? []
    const byId = new Map(participants.map(p => [p.id, p]))
    const competitions: RegistrationSummaryCompetition[] = []
    let openEntries = 0
    let lockedEntries = 0

    const count = (locked: boolean) => {
        if (locked) lockedEntries++
        else openEntries++
    }

    for (const competition of info?.competitionsSingle ?? []) {
        const entries: RegistrationSummaryEntry[] = []
        for (const p of participants) {
            const single = p.competitionsSingle?.find(s => s.competitionId === competition.id)
            if (!single) continue
            const late = single.isLate === true
            entries.push({
                key: `${p.id}-${competition.id}`,
                names: [participantName(p)],
                late,
                locked: single.locked,
                amount: competitionEntryAmount(competition, single.optionalFees ?? [], late),
                optionalFeeLabels: optionalFeeLabels(competition, single.optionalFees),
                material: single.locked
                    ? []
                    : materialSummaryLines(
                          competition.materialDemands ?? [],
                          single.materialOfferIds ?? [],
                          single.materialRequests,
                      ),
            })
            count(single.locked)
        }
        if (entries.length > 0) competitions.push({competition, kind: 'single', entries})
    }

    for (const competition of info?.competitionsTeam ?? []) {
        const registration = data.competitionRegistrations?.find(
            r => r.competitionId === competition.id,
        )
        const entries: RegistrationSummaryEntry[] = (registration?.teams ?? []).map(team => {
            const late = team.isLate === true
            count(team.locked)
            return {
                key: team.id,
                names: (team.namedParticipants ?? [])
                    .flatMap(np => np?.participantIds ?? [])
                    .map(id => byId.get(id))
                    .filter(p => p !== undefined)
                    .map(participantName),
                late,
                locked: team.locked,
                amount: competitionEntryAmount(competition, team.optionalFees ?? [], late),
                optionalFeeLabels: optionalFeeLabels(competition, team.optionalFees),
                material: team.locked
                    ? []
                    : materialSummaryLines(
                          competition.materialDemands ?? [],
                          team.materialOfferIds ?? [],
                          team.materialRequests,
                      ),
            }
        })
        if (entries.length > 0) competitions.push({competition, kind: 'team', entries})
    }

    return {
        competitions,
        openEntries,
        lockedEntries,
        newParticipants: participants.filter(p => p.isNew).map(participantName),
        changedParticipants: participants
            .filter(p => !p.isNew && p.hasChanged)
            .map(participantName),
        fees: registrationFees(participants, data.competitionRegistrations, competitionMapOf(info)),
    }
}

/** Anzahl der Wettkämpfe, für die eine Person einzeln gemeldet ist. */
export const singleEntryCount = (p: EventRegistrationParticipantFormData): number =>
    p.competitionsSingle?.length ?? 0

// ---------------------------------------------------------------------------------------------
// Suche

const normalize = (s: string) => s.toLocaleLowerCase('de').normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Jeder Suchbegriff muss in Vorname, Nachname, Jahrgang oder Verein vorkommen. */
export const participantMatchesQuery = (
    p: Pick<
        EventRegistrationParticipantFormData,
        'firstname' | 'lastname' | 'year' | 'externalClubName'
    >,
    query: string,
): boolean => {
    const terms = normalize(query).split(/\s+/).filter(Boolean)
    if (terms.length === 0) return true
    const haystack = normalize(
        [p.firstname, p.lastname, p.year ?? '', p.externalClubName ?? ''].join(' '),
    )
    return terms.every(term => haystack.includes(term))
}

// ---------------------------------------------------------------------------------------------
// Fehlerübersicht

export type FlatFieldError = {path: string; message?: string; type?: string}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/**
 * Macht aus dem verschachtelten `formState.errors` von react-hook-form eine flache Liste. `ref`
 * (DOM-Knoten) wird nicht betreten.
 */
export const flattenFieldErrors = (errors: unknown, prefix = ''): FlatFieldError[] => {
    if (!isRecord(errors)) return []
    if (typeof errors.type === 'string') {
        return [
            {
                path: prefix,
                type: errors.type,
                message:
                    typeof errors.message === 'string' && errors.message !== ''
                        ? errors.message
                        : undefined,
            },
        ]
    }
    return Object.entries(errors).flatMap(([key, value]) =>
        key === 'ref' ? [] : flattenFieldErrors(value, prefix ? `${prefix}.${key}` : key),
    )
}

export const stepForErrorPath = (path: string): RegistrationStepKey => {
    if (/^participants\.\d+\.competitionsSingle/.test(path)) return 'single'
    if (path.startsWith('participants')) return 'participants'
    if (path.startsWith('competitionRegistrations')) return 'team'
    return 'summary'
}

export type ErrorFieldLabelKey =
    | 'entity.firstname'
    | 'entity.lastname'
    | 'entity.gender'
    | 'club.participant.year'
    | 'user.email.email'
    | 'club.participant.externalClub'
    | 'event.competition.registration.ratingCategory'
    | 'event.registration.optionalFee'
    | 'event.registration.errorSummary.teamMembers'
    | 'event.registration.errorSummary.confirmation'

const FIELD_LABELS: Record<string, ErrorFieldLabelKey> = {
    firstname: 'entity.firstname',
    lastname: 'entity.lastname',
    gender: 'entity.gender',
    year: 'club.participant.year',
    email: 'user.email.email',
    externalClubName: 'club.participant.externalClub',
    ratingCategory: 'event.competition.registration.ratingCategory',
    optionalFees: 'event.registration.optionalFee',
    namedParticipants: 'event.registration.errorSummary.teamMembers',
}

export type DescribedFieldError = {
    path: string
    step: RegistrationStepKey
    /** Wen oder was der Fehler betrifft (Person, Wettkampf); fehlt, wenn unbekannt. */
    subject?: string
    fieldLabelKey?: ErrorFieldLabelKey
    message?: string
}

/**
 * Ordnet einen Fehler einer Person bzw. einem Wettkampf zu, damit die Übersicht oben sagen kann,
 * wo etwas fehlt („Anna Beispiel – Jahrgang"), statt nur einen Feldpfad zu nennen.
 */
export const describeFieldError = (
    error: FlatFieldError,
    data: Pick<EventRegistrationFormData, 'participants' | 'competitionRegistrations'>,
    info: Pick<EventRegistrationInfoDto, 'competitionsSingle' | 'competitionsTeam'> | null,
): DescribedFieldError => {
    const parts = error.path.split('.')
    const step = stepForErrorPath(error.path)
    const competitions = competitionMapOf(info)
    const fieldKey = [...parts].reverse().find(p => FIELD_LABELS[p] !== undefined)
    const fieldLabelKey = fieldKey ? FIELD_LABELS[fieldKey] : undefined
    let subject: string | undefined

    if (parts[0] === 'participants') {
        const p = data.participants?.[Number(parts[1])]
        const name = p ? participantName(p) : ''
        if (step === 'single') {
            const single = p?.competitionsSingle?.[Number(parts[3])]
            const competition = single ? competitions.get(single.competitionId) : undefined
            subject = [name, competition?.name].filter(Boolean).join(' · ') || undefined
        } else {
            subject = name || `#${Number(parts[1]) + 1}`
        }
    } else if (parts[0] === 'competitionRegistrations') {
        const registration = data.competitionRegistrations?.[Number(parts[1])]
        const competition = registration ? competitions.get(registration.competitionId) : undefined
        const teamIndex = parts[2] === 'teams' ? Number(parts[3]) : NaN
        subject =
            [competition?.name, Number.isNaN(teamIndex) ? undefined : `Team ${teamIndex + 1}`]
                .filter(Boolean)
                .join(' · ') || undefined
    }

    return {
        path: error.path,
        step,
        subject,
        fieldLabelKey:
            fieldLabelKey ??
            (step === 'summary' && parts[0] !== 'message'
                ? 'event.registration.errorSummary.confirmation'
                : undefined),
        message: error.message,
    }
}

// ---------------------------------------------------------------------------------------------
// Serverfehler beim Absenden

export type SubmitErrorKey =
    | 'common.error.network'
    | 'common.error.unauthorized'
    | 'common.error.unexpected'
    | 'common.error.notFound'
    | 'event.registration.error.closed'
    | 'event.registration.error.participantUpsertNotFound'
    | 'event.registration.error.teamParticipantNotFound'
    | 'event.registration.error.competitionNotFound'
    | 'event.registration.error.namedParticipantNotFound'
    | 'event.registration.error.feeNotFound'
    | 'event.registration.error.ratingCategoryNotFound'
    | 'event.registration.error.ratingCategoryMissing'
    | 'event.registration.error.ageRequirementNotMet'
    | 'event.registration.error.participantDuplicateInCompetition'
    | 'event.registration.error.callbackUrlNotAllowed'

const ERROR_CODE_KEYS: Record<string, SubmitErrorKey> = {
    EVENT_REGISTRATION_CLOSED: 'event.registration.error.closed',
    EVENT_REGISTRATION_UPSERT_PARTICIPANT_NOT_FOUND:
        'event.registration.error.participantUpsertNotFound',
    EVENT_REGISTRATION_TEAM_PARTICIPANT_NOT_FOUND:
        'event.registration.error.teamParticipantNotFound',
    EVENT_REGISTRATION_COMPETITION_NOT_FOUND: 'event.registration.error.competitionNotFound',
    EVENT_REGISTRATION_NAMED_PARTICIPANT_NOT_FOUND:
        'event.registration.error.namedParticipantNotFound',
    EVENT_REGISTRATION_FEE_NOT_FOUND: 'event.registration.error.feeNotFound',
    EVENT_REGISTRATION_RATING_CATEGORY_NOT_FOUND: 'event.registration.error.ratingCategoryNotFound',
    EVENT_REGISTRATION_RATING_CATEGORY_MISSING: 'event.registration.error.ratingCategoryMissing',
    EVENT_REGISTRATION_AGE_REQUIREMENT_NOT_MET: 'event.registration.error.ageRequirementNotMet',
    EVENT_REGISTRATION_PARTICIPANT_DUPLICATE_IN_COMPETITION:
        'event.registration.error.participantDuplicateInCompetition',
    // 422: Die Adresse, unter der die Seite aufgerufen wurde, steht nicht in FRONTEND_ORIGINS
    // (ADR-0106) - kein Fehler im Formular, sondern in der Aufrufadresse.
    CALLBACK_URL_NOT_ALLOWED: 'event.registration.error.callbackUrlNotAllowed',
}

/** Übersetzt die Antwort von `POST /event/{id}/register` in einen Fehlertext. */
export const submitErrorKey = (
    error: {kind: 'network'} | {status?: {value?: number}; errorCode?: string} | undefined,
): SubmitErrorKey | null => {
    if (error === undefined) return null
    if ('kind' in error) return 'common.error.network'
    if (error.status?.value === 404) return 'common.error.notFound'
    if (error.status?.value === 403) return 'common.error.unauthorized'
    if (error.errorCode && ERROR_CODE_KEYS[error.errorCode]) return ERROR_CODE_KEYS[error.errorCode]
    return 'common.error.unexpected'
}

// ---------------------------------------------------------------------------------------------
// Meldephase

export type RegistrationPhaseNotice = 'late' | 'closed' | null

export const registrationPhaseNotice = (
    state: OpenForRegistrationType | undefined,
): RegistrationPhaseNotice => (state === 'LATE' ? 'late' : state === 'CLOSED' ? 'closed' : null)
