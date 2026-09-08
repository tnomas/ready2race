import {useEffect, useMemo, useState} from 'react'
import {useForm} from 'react-hook-form-mui'
import {
    addEventRegistration,
    CompetitionRegistrationSingleUpsertDto,
    CompetitionRegistrationTeamUpsertDto,
    CompetitionRegistrationUpsertDto,
    EventRegistrationParticipantUpsertDto,
    EventRegistrationUpsertDto,
    getEventRegistrationTemplate,
    MaterialRequestDto,
    setMaterialRequests,
} from '../../api'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import {useTranslation} from 'react-i18next'
import {eventRegisterRoute} from '@routes'
import {Result} from '@components/Result.tsx'
import EventRegistrationForm from '../../components/eventRegistration/EventRegistrationForm.tsx'
import EventRegistrationProvider from '@contexts/eventRegistration/EventRegistrationProvider.tsx'
import {useNavigate} from '@tanstack/react-router'

export type CompetitionRegistrationSingleFormData = CompetitionRegistrationSingleUpsertDto & {
    locked: boolean
    isLate: boolean
    materialOfferIds: string[]
}

export type EventRegistrationParticipantFormData = Omit<
    EventRegistrationParticipantUpsertDto,
    'competitionsSingle'
> & {
    competitionsSingle?: CompetitionRegistrationSingleFormData[]
}

export type CompetitionRegistrationTeamFormData = CompetitionRegistrationTeamUpsertDto & {
    locked: boolean
    isLate: boolean
    materialOfferIds: string[]
}

export type CompetitionRegistrationFormData = Omit<CompetitionRegistrationUpsertDto, 'teams'> & {
    teams: CompetitionRegistrationTeamFormData[]
}

export type EventRegistrationFormData = {
    participants: EventRegistrationParticipantFormData[]
    competitionRegistrations: CompetitionRegistrationFormData[]
    message?: string
}

// TODO: validate/sanitize basepath (also in routes.tsx)
const basepath = document.getElementById('ready2race-root')!.dataset.basepath

/**
 * Aus den Materialanfragen einer Meldung (Template) die Angebots-IDs der noch aktiven Anfragen -
 * zurückgezogene oder abgelehnte zählen nicht mehr. Sowohl für den Formular-Reset als auch für
 * den Vergleich beim Speichern verwendet (unverändert -> kein `setMaterialRequests`-Aufruf).
 */
const activeMaterialOfferIds = (materialRequests?: MaterialRequestDto[]): string[] =>
    (materialRequests ?? [])
        .filter(r => r.status !== 'WITHDRAWN' && r.status !== 'DECLINED')
        .map(r => r.materialOffer)

/**
 * Vergleicht zwei Listen von Angebots-IDs ohne Rücksicht auf die Reihenfolge.
 */
const sameOfferIds = (a: string[], b: string[]): boolean => {
    if (a.length !== b.length) return false
    const sortedA = [...a].sort()
    const sortedB = [...b].sort()
    return sortedA.every((id, index) => id === sortedB[index])
}

const formDataToRequest = (formData: EventRegistrationFormData): EventRegistrationUpsertDto => ({
    participants: formData.participants.map(p => ({
        ...p,
        competitionsSingle: p.competitionsSingle
            ?.filter(s => !s.locked)
            .map(s => {
                const single: CompetitionRegistrationSingleUpsertDto = {
                    id: s.id,
                    competitionId: s.competitionId,
                    optionalFees: s.optionalFees,
                    ratingCategory: s.ratingCategory !== 'none' ? s.ratingCategory : undefined,
                }
                return single
            }),
    })),
    competitionRegistrations: formData.competitionRegistrations.map(r => ({
        ...r,
        teams: r.teams
            .filter(t => !t.locked)
            .map(t => {
                const team: CompetitionRegistrationTeamUpsertDto = {
                    id: t.id,
                    clubId: t.clubId,
                    optionalFees: t.optionalFees,
                    namedParticipants: t.namedParticipants,
                    ratingCategory: t.ratingCategory !== 'none' ? t.ratingCategory : undefined,
                }
                return team
            }),
    })),
    message: formData.message,
    callbackUrl: location.origin + (basepath ? `/${basepath}` : '') + '/challenge/',
})

const EventRegistrationCreatePage = () => {
    const {t} = useTranslation()
    const navigate = useNavigate()
    // const user = useUser() // TODO use later for explicit clubId
    const feedback = useFeedback()
    const [registrationWasSuccessful, setRegistrationWasSuccessful] = useState<boolean>(false)
    const {eventId} = eventRegisterRoute.useParams()

    const {data} = useFetch(
        signal => getEventRegistrationTemplate({signal, path: {eventId: eventId}}),
        {
            onResponse: ({error}) => {
                if (error) {
                    feedback.error(t('common.load.error.single', {entity: t('event.event')}))
                    void navigate({to: '/dashboard'})
                }
            },
            deps: [eventId],
        },
    )

    const onSubmit = () => {
        const formData = formContext.getValues()
        addEventRegistration({
            path: {eventId: eventId},
            body: formDataToRequest(formData),
        }).then(async ({error}) => {
            if (error) {
                if (error.status.value === 404)
                    feedback.error(t('common.error.notFound', {entity: t('event.event')}))
                else if (error.status.value === 403) feedback.error(t('common.error.unauthorized'))
                else if (error.errorCode === 'EVENT_REGISTRATION_CLOSED')
                    feedback.error(t('event.registration.error.closed'))
                else if (error.errorCode === 'EVENT_REGISTRATION_UPSERT_PARTICIPANT_NOT_FOUND')
                    feedback.error(t('event.registration.error.participantUpsertNotFound'))
                else if (error.errorCode === 'EVENT_REGISTRATION_TEAM_PARTICIPANT_NOT_FOUND')
                    feedback.error(t('event.registration.error.teamParticipantNotFound'))
                else if (error.errorCode === 'EVENT_REGISTRATION_COMPETITION_NOT_FOUND')
                    feedback.error(t('event.registration.error.competitionNotFound'))
                else if (error.errorCode === 'EVENT_REGISTRATION_NAMED_PARTICIPANT_NOT_FOUND')
                    feedback.error(t('event.registration.error.namedParticipantNotFound'))
                else if (error.errorCode === 'EVENT_REGISTRATION_FEE_NOT_FOUND')
                    feedback.error(t('event.registration.error.feeNotFound'))
                else if (error.errorCode === 'EVENT_REGISTRATION_RATING_CATEGORY_NOT_FOUND')
                    feedback.error(t('event.registration.error.ratingCategoryNotFound'))
                else if (error.errorCode === 'EVENT_REGISTRATION_RATING_CATEGORY_MISSING')
                    feedback.error(t('event.registration.error.ratingCategoryMissing'))
                else if (error.errorCode === 'EVENT_REGISTRATION_AGE_REQUIREMENT_NOT_MET')
                    feedback.error(t('event.registration.error.ageRequirementNotMet'))
                else if (
                    error.errorCode === 'EVENT_REGISTRATION_PARTICIPANT_DUPLICATE_IN_COMPETITION'
                )
                    feedback.error(t('event.registration.error.participantDuplicateInCompetition'))
                else feedback.error(t('common.error.unexpected'))
            } else {
                await syncMaterialRequests(formData)
                setRegistrationWasSuccessful(true)
            }
        })
    }

    const registrationInfo = useMemo(() => data?.info ?? null, [data?.info])

    const formContext = useForm<EventRegistrationFormData>({
        defaultValues: {
            participants: [],
            competitionRegistrations: [],
        },
    })

    /**
     * Angebots-IDs je Meldung im Template (Ausgangszustand vor dieser Bearbeitung) - Grundlage
     * dafür, ob `setMaterialRequests` beim Speichern überhaupt nötig ist.
     */
    const templateMaterialOfferIds = useMemo(() => {
        const map = new Map<string, string[]>()
        data?.upsertableRegistration.competitionRegistrations.forEach(r => {
            r.teams?.forEach(t => {
                map.set(t.id, activeMaterialOfferIds(t.materialRequests))
            })
        })
        data?.upsertableRegistration.participants.forEach(p => {
            p.competitionsSingle?.forEach(s => {
                if (s.id) map.set(s.id, activeMaterialOfferIds(s.materialRequests))
            })
        })
        return map
    }, [data])

    /**
     * Schreibt je Meldung die gewählten Material-Angebote fest, wenn sie sich gegenüber dem
     * Template geändert haben. Ein Fehlschlag bei einer Meldung meldet sich einzeln mit
     * Wettkampfname und unterbricht die anderen nicht - die Anmeldung selbst ist zu diesem
     * Zeitpunkt schon gespeichert.
     */
    const syncMaterialRequests = async (formData: EventRegistrationFormData) => {
        const requests: {registrationId: string; competitionName: string; offerIds: string[]}[] = []

        formData.competitionRegistrations.forEach(r => {
            const competitionName =
                registrationInfo?.competitionsTeam.find(c => c.id === r.competitionId)?.name ?? ''
            r.teams
                .filter(t => !t.locked)
                .forEach(t => {
                    requests.push({
                        registrationId: t.id,
                        competitionName,
                        offerIds: t.materialOfferIds ?? [],
                    })
                })
        })

        formData.participants.forEach(p => {
            p.competitionsSingle
                ?.filter(s => !s.locked && s.id)
                .forEach(s => {
                    const competitionName =
                        registrationInfo?.competitionsSingle.find(c => c.id === s.competitionId)
                            ?.name ?? ''
                    requests.push({
                        registrationId: s.id!,
                        competitionName,
                        offerIds: s.materialOfferIds ?? [],
                    })
                })
        })

        await Promise.all(
            requests
                .filter(
                    r =>
                        !sameOfferIds(
                            templateMaterialOfferIds.get(r.registrationId) ?? [],
                            r.offerIds,
                        ),
                )
                .map(async r => {
                    const {error} = await setMaterialRequests({
                        path: {eventId: eventId, competitionRegistrationId: r.registrationId},
                        body: {offerIds: r.offerIds},
                    })
                    if (error) {
                        feedback.error(
                            t('material.registration.error', {competition: r.competitionName}),
                        )
                    }
                }),
        )
    }

    useEffect(() => {
        if (data) {
            const formData: EventRegistrationFormData = {
                participants: data.upsertableRegistration.participants.map(p => ({
                    ...p,
                    competitionsSingle: [
                        ...(p.competitionsSingle?.map(s => ({
                            ...s,
                            locked: false,
                            isLate: registrationInfo?.state === 'LATE',
                            materialOfferIds: activeMaterialOfferIds(s.materialRequests),
                            ratingCategory:
                                s.ratingCategory ??
                                (registrationInfo?.competitionsSingle.find(
                                    foo => foo.id === s.competitionId,
                                )?.ratingCategoryRequired
                                    ? ''
                                    : 'none'),
                        })) ?? []),
                        ...(data.lockedRegistration.participants
                            .find(lp => lp.id === p.id)
                            ?.competitionsSingle.map(s => ({
                                ...s,
                                locked: true,
                                // Gesperrte Meldungen laufen nicht in den Upsert mit ein, die
                                // Auswahl wird nur der Vollständigkeit halber gesetzt.
                                materialOfferIds: [],
                                ratingCategory:
                                    s.ratingCategory ??
                                    (registrationInfo?.competitionsSingle.find(
                                        foo => foo.id === s.competitionId,
                                    )?.ratingCategoryRequired
                                        ? ''
                                        : 'none'),
                            })) ?? []),
                    ],
                })),
                competitionRegistrations: data.upsertableRegistration.competitionRegistrations.map(
                    r => ({
                        ...r,
                        teams: [
                            ...(r.teams?.map(t => ({
                                ...t,
                                locked: false,
                                isLate: registrationInfo?.state === 'LATE',
                                materialOfferIds: activeMaterialOfferIds(t.materialRequests),
                                ratingCategory:
                                    t.ratingCategory ??
                                    (registrationInfo?.competitionsSingle.find(
                                        foo => foo.id === r.competitionId,
                                    )?.ratingCategoryRequired
                                        ? ''
                                        : 'none'),
                            })) ?? []),
                            ...(data.lockedRegistration.competitionRegistrations
                                .find(cr => cr.competitionId === r.competitionId)
                                ?.teams.map(t => ({
                                    ...t,
                                    locked: true,
                                    // Gesperrte Meldungen laufen nicht in den Upsert mit ein, die
                                    // Auswahl wird nur der Vollständigkeit halber gesetzt.
                                    materialOfferIds: [],
                                    ratingCategory:
                                        t.ratingCategory ??
                                        (registrationInfo?.competitionsSingle.find(
                                            foo => foo.id === r.competitionId,
                                        )?.ratingCategoryRequired
                                            ? ''
                                            : 'none'),
                                })) ?? []),
                        ],
                    }),
                ),
                message: data.upsertableRegistration.message,
            }
            formContext.reset(formData)
        }
    }, [data])

    return (
        <EventRegistrationProvider info={registrationInfo}>
            {registrationWasSuccessful ? (
                <Result
                    status={'SUCCESS'}
                    title={t('event.registration.success.title')}
                    subtitle={t('event.registration.success.subtitle')}
                />
            ) : (
                <EventRegistrationForm onSubmit={onSubmit} formContext={formContext} />
            )}
        </EventRegistrationProvider>
    )
}

export default EventRegistrationCreatePage
