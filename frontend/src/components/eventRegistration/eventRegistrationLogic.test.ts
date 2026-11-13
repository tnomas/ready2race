import {describe, expect, it} from 'vitest'
import type {EventRegistrationCompetitionDto} from '@api/types.gen.ts'
import type {
    CompetitionRegistrationFormData,
    EventRegistrationParticipantFormData,
} from '../../pages/eventRegistration/EventRegistrationCreatePage.tsx'
import {
    buildRegistrationSummary,
    competitionEntryAmount,
    competitionMapOf,
    describeFieldError,
    flattenFieldErrors,
    hasAnyFees,
    participantMatchesQuery,
    registrationFees,
    registrationPhaseNotice,
    stepForErrorPath,
    stepValidationKeys,
    submitErrorKey,
    visibleRegistrationSteps,
} from './eventRegistrationLogic.ts'

const competition = (
    id: string,
    name: string,
    overrides: Partial<EventRegistrationCompetitionDto> = {},
): EventRegistrationCompetitionDto => ({
    id,
    identifier: id.toUpperCase(),
    name,
    days: [],
    lateRegistrationAllowed: true,
    ratingCategoryRequired: false,
    fees: [
        {id: 'base', label: 'Meldegeld', required: true, amount: '25.00', lateAmount: '35.00'},
        {id: 'boat', label: 'Leihboot', required: false, amount: '10.00'},
    ],
    ...overrides,
})

const single = competition('c1', 'Einer')
const team = competition('c2', 'Doppelzweier')
const info = {competitionsSingle: [single], competitionsTeam: [team]}

const person = (
    id: string,
    firstname: string,
    lastname: string,
    extra: Partial<EventRegistrationParticipantFormData> = {},
): EventRegistrationParticipantFormData => ({
    id,
    firstname,
    lastname,
    gender: 'F',
    year: 2000,
    ...extra,
})

describe('visibleRegistrationSteps', () => {
    it('lässt Schritte ohne Wettkämpfe weg', () => {
        expect(visibleRegistrationSteps({singleCompetitions: 0, teamCompetitions: 2})).toEqual([
            'participants',
            'team',
            'summary',
        ])
        expect(visibleRegistrationSteps({singleCompetitions: 1, teamCompetitions: 0})).toEqual([
            'participants',
            'single',
            'summary',
        ])
    })

    it('kennt ohne Zusammenfassung das Bearbeiten durch die Veranstaltung', () => {
        expect(
            visibleRegistrationSteps({singleCompetitions: 1, teamCompetitions: 1, adminEdit: true}),
        ).toEqual(['participants', 'single', 'team'])
    })

    it('prüft je Schritt die passenden Felder', () => {
        expect(stepValidationKeys('single')).toEqual(['participants'])
        expect(stepValidationKeys('team')).toEqual(['competitionRegistrations'])
        expect(stepValidationKeys('summary')).toEqual([])
    })
})

describe('Gebühren', () => {
    it('rechnet Pflicht- und gewählte Zusatzgebühren, nachgemeldet mit Nachmeldebetrag', () => {
        expect(competitionEntryAmount(single, [], false)).toBe(25)
        expect(competitionEntryAmount(single, ['boat'], false)).toBe(35)
        // Ohne eigenen Nachmeldebetrag gilt der reguläre.
        expect(competitionEntryAmount(single, ['boat'], true)).toBe(45)
    })

    it('trennt regulär und nachgemeldet und lässt gesperrte Einträge weg', () => {
        const participants = [
            person('p1', 'Anna', 'A', {
                competitionsSingle: [
                    {competitionId: 'c1', optionalFees: ['boat'], locked: false, isLate: false},
                ],
            }),
            person('p2', 'Berta', 'B', {
                competitionsSingle: [
                    {competitionId: 'c1', optionalFees: [], locked: false, isLate: true},
                ],
            }),
            person('p3', 'Clara', 'C', {
                competitionsSingle: [
                    {competitionId: 'c1', optionalFees: [], locked: true, isLate: false},
                ],
            }),
        ]
        const teams: CompetitionRegistrationFormData[] = [
            {
                competitionId: 'c2',
                teams: [{id: 't1', optionalFees: [], locked: false, isLate: false}],
            },
        ]
        expect(registrationFees(participants, teams, competitionMapOf(info))).toEqual({
            regular: 60,
            late: 35,
        })
    })

    it('erkennt Veranstaltungen ganz ohne Gebühren', () => {
        expect(hasAnyFees(competitionMapOf(info))).toBe(true)
        expect(
            hasAnyFees(
                competitionMapOf({
                    competitionsSingle: [competition('x', 'X', {fees: []})],
                    competitionsTeam: [],
                }),
            ),
        ).toBe(false)
    })
})

describe('buildRegistrationSummary', () => {
    it('listet je Wettkampf, wer gemeldet ist, samt Summen und neuen Personen', () => {
        const summary = buildRegistrationSummary(
            {
                participants: [
                    person('p1', 'Anna', 'Alt', {
                        competitionsSingle: [
                            {
                                competitionId: 'c1',
                                optionalFees: ['boat'],
                                locked: false,
                                isLate: false,
                            },
                        ],
                    }),
                    person('p2', 'Ben', 'Neu', {isNew: true}),
                    person('p3', 'Cem', 'Geändert', {hasChanged: true}),
                ],
                competitionRegistrations: [
                    {
                        competitionId: 'c2',
                        teams: [
                            {
                                id: 't1',
                                optionalFees: [],
                                locked: true,
                                isLate: false,
                                namedParticipants: [
                                    {namedParticipantId: 'n', participantIds: ['p1', 'p2']},
                                ],
                            },
                        ],
                    },
                ],
            },
            info,
        )

        expect(summary.competitions.map(c => [c.competition.name, c.kind])).toEqual([
            ['Einer', 'single'],
            ['Doppelzweier', 'team'],
        ])
        expect(summary.competitions[0].entries[0]).toMatchObject({
            names: ['Anna Alt'],
            amount: 35,
            optionalFeeLabels: ['Leihboot'],
        })
        expect(summary.competitions[1].entries[0]).toMatchObject({
            names: ['Anna Alt', 'Ben Neu'],
            locked: true,
        })
        expect(summary.openEntries).toBe(1)
        expect(summary.lockedEntries).toBe(1)
        expect(summary.newParticipants).toEqual(['Ben Neu'])
        expect(summary.changedParticipants).toEqual(['Cem Geändert'])
        expect(summary.fees).toEqual({regular: 35, late: 0})
    })

    it('ist leer, solange niemand gemeldet ist', () => {
        const summary = buildRegistrationSummary(
            {participants: [person('p1', 'A', 'B')], competitionRegistrations: []},
            info,
        )
        expect(summary.competitions).toEqual([])
        expect(summary.openEntries).toBe(0)
    })
})

describe('participantMatchesQuery', () => {
    const p = person('p1', 'Søren', 'Müller', {year: 1994, externalClubName: 'Kieler RV'})

    it('findet über Vor-, Nachname, Jahrgang und Verein, ohne Groß/Klein und Akzente', () => {
        expect(participantMatchesQuery(p, '')).toBe(true)
        expect(participantMatchesQuery(p, 'muller')).toBe(true)
        expect(participantMatchesQuery(p, 'SØREN 1994')).toBe(true)
        expect(participantMatchesQuery(p, 'kieler')).toBe(true)
        expect(participantMatchesQuery(p, 'anna')).toBe(false)
    })
})

describe('Fehlerübersicht', () => {
    const errors = {
        participants: [
            undefined,
            {
                year: {type: 'required', message: 'Pflichtfeld', ref: {nodeName: 'INPUT'}},
                competitionsSingle: [{ratingCategory: {type: 'required', message: ''}}],
            },
        ],
        competitionRegistrations: [
            {teams: [{namedParticipants: [{type: 'required', message: 'Pflichtfeld'}]}]},
        ],
        'doc-uuid': {type: 'required', message: 'Pflichtfeld'},
    }

    it('macht verschachtelte Fehler flach und betritt ref nicht', () => {
        expect(flattenFieldErrors(errors).map(e => e.path)).toEqual([
            'participants.1.year',
            'participants.1.competitionsSingle.0.ratingCategory',
            'competitionRegistrations.0.teams.0.namedParticipants.0',
            'doc-uuid',
        ])
        expect(flattenFieldErrors(errors)[1].message).toBeUndefined()
    })

    it('ordnet Fehler dem Schritt zu', () => {
        expect(stepForErrorPath('participants.0.firstname')).toBe('participants')
        expect(stepForErrorPath('participants.0.competitionsSingle.1.ratingCategory')).toBe(
            'single',
        )
        expect(stepForErrorPath('competitionRegistrations.0.teams.0.ratingCategory')).toBe('team')
        expect(stepForErrorPath('8c1d-uuid')).toBe('summary')
    })

    it('nennt Person, Wettkampf und Feld', () => {
        const data = {
            participants: [
                person('p0', 'Anna', 'A'),
                person('p1', 'Ben', 'B', {
                    competitionsSingle: [{competitionId: 'c1', locked: false, isLate: false}],
                }),
            ],
            competitionRegistrations: [{competitionId: 'c2', teams: []}],
        }
        const described = flattenFieldErrors(errors).map(e => describeFieldError(e, data, info))
        expect(described.map(d => [d.step, d.subject, d.fieldLabelKey])).toEqual([
            ['participants', 'Ben B', 'club.participant.year'],
            ['single', 'Ben B · Einer', 'event.competition.registration.ratingCategory'],
            ['team', 'Doppelzweier · Team 1', 'event.registration.errorSummary.teamMembers'],
            ['summary', undefined, 'event.registration.errorSummary.confirmation'],
        ])
    })
})

describe('submitErrorKey', () => {
    it('übersetzt Netz-, Rechte- und Fachfehler', () => {
        expect(submitErrorKey(undefined)).toBeNull()
        expect(submitErrorKey({kind: 'network'})).toBe('common.error.network')
        expect(submitErrorKey({status: {value: 404}})).toBe('common.error.notFound')
        expect(submitErrorKey({status: {value: 403}})).toBe('common.error.unauthorized')
        expect(submitErrorKey({status: {value: 400}, errorCode: 'EVENT_REGISTRATION_CLOSED'})).toBe(
            'event.registration.error.closed',
        )
        expect(submitErrorKey({status: {value: 400}, errorCode: 'UNBEKANNT'})).toBe(
            'common.error.unexpected',
        )
    })
})

describe('registrationPhaseNotice', () => {
    it('meldet Nachmeldephase und Meldeschluss', () => {
        expect(registrationPhaseNotice('REGULAR')).toBeNull()
        expect(registrationPhaseNotice('LATE')).toBe('late')
        expect(registrationPhaseNotice('CLOSED')).toBe('closed')
        expect(registrationPhaseNotice(undefined)).toBeNull()
    })
})
