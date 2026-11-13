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
import {runRequest} from '@utils/request.ts'
import {useConfirmation} from '@contexts/confirmation/ConfirmationContext.ts'
import {shouldConfirmDiscard} from '@utils/entityDialog.ts'
import {
    buildRegistrationSummary,
    formatAmount,
    RegistrationSummary,
    submitErrorKey,
} from '@components/eventRegistration/eventRegistrationLogic.ts'

export type CompetitionRegistrationSingleFormData = CompetitionRegistrationSingleUpsertDto & {
    locked: boolean
    isLate: boolean
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

const formDataToRequest = (formData: EventRegistrationFormData): EventRegistrationUpsertDto => ({
    participants: formData.participants.map(p => ({
        ...p,
        competitionsSingle: p.competitionsSingle
            ?.filter(s => !s.locked)
            .map(s => {
                const single: CompetitionRegistrationSingleUpsertDto = {
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
        submittingRef.current = false
        const key = submitErrorKey(error)
        if (key !== null) {
            // Eingaben bleiben stehen: Fehler beheben und erneut absenden.
            const message =
                key === 'common.error.notFound' ? t(key, {entity: t('event.event')}) : t(key)
            feedback.error(message)
            setSubmitError(message)
        } else {
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

    // Ungespeicherte Eingaben: Verlassen (Link, Zurück, Neuladen) fragt nach, wie in den Dialogen.
    const isDirty = formContext.formState.isDirty
    const blockLeaving = shouldConfirmDiscard({
        enabled: !registrationWasSuccessful,
        dirty: isDirty,
        submitting,
    })
    useBlocker({
        shouldBlockFn: () =>
            blockLeaving
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
                            // Zwei Wege statt einer Sackgasse. „Ansehen und bearbeiten" führt zurück in
                            // dieses Formular, frisch vom Server geladen: Es ist der Ort, an dem ein
                            // Verein seine Meldung sieht und ändert (die Meldungsliste der
                            // Veranstaltung ist der Veranstaltung vorbehalten).
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
                                        setRegistrationWasSuccessful(false)
                                    }}>
                                    {t('event.registration.success.editRegistration')}
                                </Button>
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
                        />
                    </Stack>
                )}
            </Box>
        </EventRegistrationProvider>
    )
}

export default EventRegistrationCreatePage
