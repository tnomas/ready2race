import {useEffect, useMemo, useRef, useState} from 'react'
import {useForm} from 'react-hook-form-mui'
import {
    addEventRegistration,
    CompetitionRegistrationSingleUpsertDto,
    CompetitionRegistrationTeamUpsertDto,
    CompetitionRegistrationUpsertDto,
    EventRegistrationParticipantUpsertDto,
    EventRegistrationUpsertDto,
    getEventRegistrationTemplate,
    setMaterialRequests,
} from '../../api'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import {useTranslation} from 'react-i18next'
import {eventRegisterRoute} from '@routes'
import {Result} from '@components/Result.tsx'
import {ButtonLink, PageHeader} from '@components/ui'
import {buildEventTrail} from '@utils/navigation/breadcrumbs.ts'
import EventRegistrationForm from '../../components/eventRegistration/EventRegistrationForm.tsx'
import EventRegistrationProvider from '@contexts/eventRegistration/EventRegistrationProvider.tsx'
import {useBlocker, useNavigate} from '@tanstack/react-router'
import {Alert, Box, Button, Stack} from '@mui/material'
import {isRequestNetworkError, runRequest} from '@utils/request.ts'
import {MaterialErrorKey, materialErrorKey} from '@components/material/materialErrors.ts'
import {useConfirmation} from '@contexts/confirmation/ConfirmationContext.ts'
import {shouldConfirmDiscard, shouldConfirmLeaving} from '@utils/entityDialog.ts'
import {readSessionToken} from '@contexts/user/sessionToken.ts'
import {
    buildRegistrationSummary,
    formatAmount,
    RegistrationSummary,
    submitErrorKey,
} from '@components/eventRegistration/eventRegistrationLogic.ts'
import {
    activeMaterialOfferIds,
    closedOfferIdsOf,
    initialMaterialEntries,
    materialRequestUpdates,
    removedMaterialRequests,
} from '@components/eventRegistration/materialRegistrationLogic.ts'

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

type MaterialSyncFailure = {
    competitionName: string
    /** „Team 2" bzw. Name der Person – zwei Boote desselben Wettkampfs auseinanderhalten. */
    entryLabel: string
    network: boolean
    /** Fachlicher Grund mit eigenem Text (Vergabe geschlossen, Art nicht im Bedarf, …). */
    reasonKey: MaterialErrorKey | null
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
    const [submitting, setSubmitting] = useState(false)
    const submittingRef = useRef(false)
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [submittedSummary, setSubmittedSummary] = useState<RegistrationSummary | null>(null)
    // Wettkämpfe, deren Materialwahl nach dem Speichern der Meldung nicht übernommen wurde.
    const [materialFailures, setMaterialFailures] = useState<MaterialSyncFailure[]>([])
    const confirmation = useConfirmation()
    const {eventId} = eventRegisterRoute.useParams()

    const {data, reload} = useFetch(
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

    const onSubmit = async () => {
        // Sperre gegen Doppelklick, bevor der nächste Render den Knopf deaktiviert.
        if (submittingRef.current) return
        submittingRef.current = true
        setSubmitError(null)
        const values = formContext.getValues()
        const {error} = await runRequest(setSubmitting, () =>
            addEventRegistration({
                path: {eventId: eventId},
                body: formDataToRequest(values),
            }),
        )
        const key = submitErrorKey(error)
        if (key !== null) {
            submittingRef.current = false
            // Eingaben bleiben stehen: Fehler beheben und erneut absenden.
            // Entferntes Team mit Materialanfrage bei geschlossener Vergabe: sagen, welches.
            const blockedRemovals = removedMaterialRequests(
                initialMaterial,
                values,
                closedOfferIdsOf(data?.info ?? null),
            ).filter(r => r.blocked)
            const message =
                key === 'common.error.notFound'
                    ? t(key, {entity: t('event.event')})
                    : key === 'event.registration.error.callbackUrlNotAllowed'
                      ? t(key, {origin: window.location.origin})
                      : key === 'material.error.removalRequestsClosed'
                        ? t(key, {
                              entries:
                                  blockedRemovals
                                      .map(
                                          r =>
                                              `${r.competitionName} · ${r.entryLabel} (${r.providerName})`,
                                      )
                                      .join(', ') || '–',
                          })
                        : t(key)
            feedback.error(message)
            setSubmitError(message)
        } else {
            // Die Anmeldung ist gespeichert; die Material-Anfragen hängen an ihren Meldungs-IDs
            // und werden erst danach geschrieben (Fehler melden sich je Meldung einzeln).
            let failures: MaterialSyncFailure[] = []
            try {
                failures = await syncMaterialRequests(values)
            } finally {
                submittingRef.current = false
            }
            setMaterialFailures(failures)
            if (failures.length > 0) {
                feedback.error(
                    failures.some(f => f.network)
                        ? t('common.error.network')
                        : t('material.registration.errorSummary', {count: failures.length}),
                )
            }
            setSubmittedSummary(buildRegistrationSummary(values, data?.info ?? null))
            setRegistrationWasSuccessful(true)
        }
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

    /** Meldungen des Ausgangsstands mit aktiver Materialanfrage (entfernt = Rückzug). */
    const initialMaterial = useMemo(
        () =>
            data
                ? initialMaterialEntries(data.upsertableRegistration, data.info, n =>
                      t('event.registration.teamNumber', {number: n}),
                  )
                : [],
        [data, t],
    )

    /**
     * Schreibt je Meldung die gewählten Material-Angebote fest, wenn sie sich gegenüber dem
     * Template geändert haben. Fehlschläge unterbrechen die anderen Meldungen nicht und kommen
     * gesammelt zurück (Wettkampf, Netzfehler ja/nein); die Erfolgsseite listet sie, weil die
     * Anmeldung selbst zu diesem Zeitpunkt schon gespeichert ist.
     */
    const syncMaterialRequests = async (
        formData: EventRegistrationFormData,
    ): Promise<MaterialSyncFailure[]> => {
        const changed = materialRequestUpdates(
            formData,
            templateMaterialOfferIds,
            registrationInfo,
            n => t('event.registration.teamNumber', {number: n}),
        )
        if (changed.length === 0) return []

        // Die Sperre hält, bis alle Anfragen geschrieben sind; Netzfehler kommen als Ergebnis
        // zurück (runRequest), nicht als Ausnahme, und brechen die übrigen Meldungen nicht ab.
        const results = await runRequest(setSubmitting, () =>
            Promise.all(
                changed.map(async r => {
                    const {error} = await runRequest(undefined, () =>
                        setMaterialRequests({
                            path: {eventId: eventId, competitionRegistrationId: r.registrationId},
                            body: {offerIds: r.offerIds},
                        }),
                    )
                    return {r, error}
                }),
            ).then(data => ({data})),
        )
        return (results.data ?? [])
            .filter(({error}) => error !== undefined)
            .map(({r, error}) => ({
                competitionName: r.competitionName,
                entryLabel: r.entryLabel,
                network: isRequestNetworkError(error),
                reasonKey: materialErrorKey(error),
            }))
    }

    // Ungespeicherte Eingaben: Verlassen (Link, Zurück, Neuladen) fragt nach, wie in den Dialogen.
    const isDirty = formContext.formState.isDirty
    const blockLeaving = shouldConfirmDiscard({
        enabled: !registrationWasSuccessful,
        dirty: isDirty,
        submitting,
    })
    useBlocker({
        // Die Sitzung wird beim Navigieren gelesen, nicht beim Rendern: Das Abmelden löscht sie
        // unmittelbar vor seiner Navigation, ein Render dazwischen ist nicht garantiert.
        shouldBlockFn: () =>
            shouldConfirmLeaving({
                unsavedChanges: blockLeaving,
                signedIn: readSessionToken(false, Date.now(), undefined, {migrate: false}) !== null,
            })
                ? new Promise<boolean>(resolve =>
                      confirmation.confirmAction(() => resolve(false), {
                          title: t('entity.discard.title'),
                          content: t('event.registration.leave.content'),
                          okText: t('event.registration.leave.ok'),
                          cancelText: t('entity.discard.keep'),
                          destructive: true,
                          cancelAction: () => resolve(true),
                      }),
                  )
                : false,
        enableBeforeUnload: () => blockLeaving,
    })

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
            {/* Ein Wurzelelement: das Layout verteilt seine Kinder sonst über die volle Höhe. */}
            <Box>
                <PageHeader
                    title={t('event.registration.page.title')}
                    subtitle={registrationInfo?.name}
                    breadcrumbs={buildEventTrail({
                        eventsLabel: t('navigation.titles.events'),
                        eventId,
                        eventName: registrationInfo?.name,
                        trail: [{label: t('event.registration.page.title')}],
                    })}
                />
                {registrationWasSuccessful ? (
                    <Result
                        status={'SUCCESS'}
                        title={t('event.registration.success.title')}
                        subtitle={[
                            submittedSummary &&
                                t('event.registration.success.entries', {
                                    count:
                                        submittedSummary.openEntries +
                                        submittedSummary.lockedEntries,
                                }),
                            submittedSummary &&
                                submittedSummary.fees.regular + submittedSummary.fees.late > 0 &&
                                t('event.registration.success.amount', {
                                    amount: formatAmount(
                                        submittedSummary.fees.regular + submittedSummary.fees.late,
                                    ),
                                }),
                            t('event.registration.success.subtitle'),
                        ]
                            .filter(Boolean)
                            .join(' ')}
                        extra={
                            <Stack spacing={2} alignItems={'center'}>
                                {materialFailures.length > 0 && (
                                    <Alert severity={'warning'} sx={{textAlign: 'left'}}>
                                        {t('material.registration.errorAfterSave', {
                                            competitions: materialFailures
                                                .map(f => `${f.competitionName} · ${f.entryLabel}`)
                                                .join(', '),
                                        })}
                                        {/* Fachliche Gründe je Wettkampf: „erneut absenden“
                                            hilft bei geschlossener Vergabe nicht, das muss dastehen. */}
                                        {materialFailures.some(f => f.reasonKey !== null) && (
                                            <Box component={'ul'} sx={{m: 0, mt: 1, pl: 2.5}}>
                                                {materialFailures
                                                    .filter(f => f.reasonKey !== null)
                                                    .map((f, index) => (
                                                        <li key={index}>
                                                            {`${f.competitionName} · ${f.entryLabel}: ${t(f.reasonKey!)}`}
                                                        </li>
                                                    ))}
                                            </Box>
                                        )}
                                    </Alert>
                                )}
                                {/* Zwei Wege statt einer Sackgasse. „Ansehen und bearbeiten" führt zurück in
                                dieses Formular, frisch vom Server geladen: Es ist der Ort, an dem ein
                                Verein seine Meldung sieht und ändert (die Meldungsliste der
                                Veranstaltung ist der Veranstaltung vorbehalten). */}
                                <Stack
                                    direction={{xs: 'column', sm: 'row'}}
                                    spacing={1}
                                    sx={{mt: 1}}
                                    justifyContent={'center'}>
                                    <ButtonLink
                                        to={'/event/$eventId'}
                                        params={{eventId}}
                                        variant={'contained'}>
                                        {t('event.registration.success.toEvent')}
                                    </ButtonLink>
                                    <Button
                                        variant={'outlined'}
                                        sx={{cursor: 'pointer'}}
                                        onClick={() => {
                                            reload()
                                            setSubmittedSummary(null)
                                            setMaterialFailures([])
                                            setRegistrationWasSuccessful(false)
                                        }}>
                                        {t('event.registration.success.editRegistration')}
                                    </Button>
                                </Stack>
                            </Stack>
                        }
                    />
                ) : (
                    <Stack spacing={2}>
                        {submitError && (
                            <Alert severity={'error'} onClose={() => setSubmitError(null)}>
                                {submitError}
                            </Alert>
                        )}
                        <EventRegistrationForm
                            onSubmit={onSubmit}
                            formContext={formContext}
                            submitting={submitting}
                            initialMaterial={initialMaterial}
                        />
                    </Stack>
                )}
            </Box>
        </EventRegistrationProvider>
    )
}

export default EventRegistrationCreatePage
