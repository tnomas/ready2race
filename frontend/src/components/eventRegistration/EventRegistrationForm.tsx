import * as React from 'react'
import {
    Alert,
    AlertTitle,
    Box,
    Button,
    LinearProgress,
    Link,
    Stack,
    Step,
    StepButton,
    StepLabel,
    Stepper,
    Typography,
} from '@mui/material'
import {
    FormContainer,
    useFieldArray,
    UseFormReturn,
    useFormState,
    useWatch,
} from 'react-hook-form-mui'
import {ArrowBack, ArrowForward, PersonAdd, Send} from '@mui/icons-material'
import {EventRegistrationParticipantForm} from './EventRegistrationParticipantForm.tsx'
import {useTranslation} from 'react-i18next'
import {v4 as uuid} from 'uuid'
import {formatISO} from 'date-fns'
import {FormInputText} from '../form/input/FormInputText.tsx'
import {EventRegistrationSingleCompetitionForm} from './EventRegistrationSingleCompetitionForm.tsx'
import EventRegistrationTeamCompetitionForm from './EventRegistrationTeamCompetitionForm.tsx'
import {EventRegistrationFeeDisplay} from '@components/eventRegistration/EventRegistrationFeeDisplay.tsx'
import {EventRegistrationConfirmDocumentsForm} from '@components/eventRegistration/EventRegistrationConfirmDocumentsForm.tsx'
import {EventRegistrationSummary} from '@components/eventRegistration/EventRegistrationSummary.tsx'
import {RegistrationParticipantSearch} from '@components/eventRegistration/RegistrationParticipantSearch.tsx'
import {
    EventRegistrationFormData,
    EventRegistrationParticipantFormData,
} from '../../pages/eventRegistration/EventRegistrationCreatePage.tsx'
import {useEventRegistration} from '@contexts/eventRegistration/EventRegistrationContext.ts'
import {eventRegisterIndexRoute} from '@routes'
import {SubmitButton} from '@components/form/SubmitButton.tsx'
import {
    buildRegistrationSummary,
    competitionMapOf,
    describeFieldError,
    flattenFieldErrors,
    hasAnyFees,
    participantMatchesQuery,
    registrationPhaseNotice,
    RegistrationStepKey,
    stepValidationKeys,
    visibleRegistrationSteps,
} from './eventRegistrationLogic.ts'

export type EventRegistrationStep = {
    label: string
    validateKeys: Array<keyof EventRegistrationFormData>
    content: React.ReactNode
    /** Gesetzt für die Schritte des Meldeformulars selbst; zusätzliche Schritte (`stepsBefore`) haben keinen. */
    key?: RegistrationStepKey
    hint?: string
}

function RegistrationEventDayInfo(props: {
    name: string | undefined | null
    date: string
    description: string | undefined | null
}) {
    return (
        <Stack direction={'row'} spacing={1}>
            <Typography variant="body2">
                {formatISO(props.date, {representation: 'date'})} {props.name}
            </Typography>
            <Typography variant="body2">{props.description}</Typography>
        </Stack>
    )
}

const EventRegistrationForm = ({
    stepsBefore,
    onSubmit,
    formContext,
    adminEdit,
    submitting = false,
}: {
    stepsBefore?: EventRegistrationStep[]
    onSubmit: (data: Partial<EventRegistrationFormData>) => void
    formContext: UseFormReturn<EventRegistrationFormData>
    adminEdit?: boolean
    submitting?: boolean
}) => {
    const {t} = useTranslation()
    const [activeStep, setActiveStep] = React.useState(0)
    const [furthestStep, setFurthestStep] = React.useState(0)
    const [showErrors, setShowErrors] = React.useState(false)
    const [participantQuery, setParticipantQuery] = React.useState('')
    const {info} = useEventRegistration()
    const {eventId} = eventRegisterIndexRoute.useParams()
    const topRef = React.useRef<HTMLDivElement>(null)

    const {errors} = useFormState({control: formContext.control})
    const watchedParticipants: EventRegistrationParticipantFormData[] | undefined = useWatch({
        control: formContext.control,
        name: 'participants',
    })
    const participants = React.useMemo(() => watchedParticipants ?? [], [watchedParticipants])
    const competitionRegistrations = useWatch({
        control: formContext.control,
        name: 'competitionRegistrations',
    })

    const {
        fields: participantFields,
        append: appendParticipant,
        remove: removeParticipant,
    } = useFieldArray({
        control: formContext.control,
        name: 'participants',
        keyName: 'fieldId',
    })

    const phase = registrationPhaseNotice(info?.state)
    const competitionMap = React.useMemo(() => competitionMapOf(info), [info])
    const showFees = hasAnyFees(competitionMap)

    const summary = React.useMemo(
        () => buildRegistrationSummary({participants, competitionRegistrations}, info),
        [participants, competitionRegistrations, info],
    )

    const addParticipant = () => {
        setParticipantQuery('')
        appendParticipant({
            id: uuid(),
            firstname: '',
            lastname: '',
            // Kein vorbelegter Jahrgang: ein falscher Wert fiele erst bei der Altersprüfung auf.
            year: undefined,
            gender: 'F',
            isNew: true,
        })
    }

    const participantMatches = participants.map(p => participantMatchesQuery(p, participantQuery))
    const shownParticipants = participantMatches.filter(Boolean).length

    const stepContent: Record<RegistrationStepKey, React.ReactNode> = {
        participants: (
            <Stack spacing={2}>
                <Stack
                    direction={{xs: 'column', sm: 'row'}}
                    spacing={1}
                    justifyContent={'space-between'}
                    alignItems={{xs: 'stretch', sm: 'center'}}>
                    <RegistrationParticipantSearch
                        query={participantQuery}
                        onQueryChange={setParticipantQuery}
                        shown={shownParticipants}
                        total={participants.length}
                    />
                    <Button
                        variant={'outlined'}
                        startIcon={<PersonAdd />}
                        onClick={addParticipant}
                        sx={{cursor: 'pointer', minHeight: 44, flexShrink: 0}}>
                        {t('event.registration.addParticipant')}
                    </Button>
                </Stack>
                {participants.length === 0 && (
                    <Alert severity={'info'}>
                        {t('event.registration.steps.participants.empty')}
                    </Alert>
                )}
                {participants.length > 0 && shownParticipants === 0 && (
                    <Alert severity={'info'}>{t('event.registration.search.noMatch')}</Alert>
                )}
                {participantFields.map((field, index) => (
                    // Ausgeblendete Personen bleiben im Formular und werden weiter geprüft.
                    <Box
                        key={'remove' + field.fieldId}
                        hidden={participantMatches[index] === false}>
                        <EventRegistrationParticipantForm
                            index={index}
                            removeParticipant={() => {
                                removeParticipant(index)
                            }}
                        />
                    </Box>
                ))}
                {participants.length > 3 && (
                    <Button
                        onClick={addParticipant}
                        startIcon={<PersonAdd />}
                        sx={{cursor: 'pointer', minHeight: 44, alignSelf: 'flex-start'}}>
                        {t('event.registration.addParticipant')}
                    </Button>
                )}
            </Stack>
        ),
        single: <EventRegistrationSingleCompetitionForm />,
        team: <EventRegistrationTeamCompetitionForm />,
        summary: (
            <Stack spacing={2}>
                <EventRegistrationSummary
                    summary={summary}
                    showFees={showFees}
                    showLateFees={info?.state !== 'REGULAR'}
                />
                {(info?.days?.length ?? 0) > 0 && (
                    <Alert severity={'info'}>
                        <AlertTitle>{t('event.registration.schedule')}</AlertTitle>
                        <Stack spacing={1}>
                            {info?.days.map(day => (
                                <RegistrationEventDayInfo
                                    key={day.id}
                                    name={day.name}
                                    description={day.description}
                                    date={day.date}
                                />
                            ))}
                        </Stack>
                    </Alert>
                )}
                {(info?.documentTypes?.length ?? 0) > 0 && info?.documentTypes && (
                    <EventRegistrationConfirmDocumentsForm
                        eventId={eventId}
                        documentTypes={info?.documentTypes}
                    />
                )}
                <FormInputText
                    fullWidth
                    multiline={true}
                    rows={4}
                    name={'message'}
                    label={t('event.registration.message')}
                    helperText={t('event.registration.messageHint')}
                />
            </Stack>
        ),
    }

    const stepLabels: Record<RegistrationStepKey, string> = {
        participants: t('event.registration.steps.participants.label'),
        single: t('event.registration.steps.single.label'),
        team: t('event.registration.steps.team.label'),
        summary: t('event.registration.steps.summary.label'),
    }

    const stepHints: Record<RegistrationStepKey, string> = {
        participants: t('event.registration.steps.participants.hint'),
        single: t('event.registration.steps.single.hint'),
        team: t('event.registration.steps.team.hint'),
        summary: t('event.registration.steps.summary.hint'),
    }

    const stepKeys = visibleRegistrationSteps({
        singleCompetitions: info?.competitionsSingle.length ?? 0,
        teamCompetitions: info?.competitionsTeam.length ?? 0,
        adminEdit,
    })

    const steps: EventRegistrationStep[] = [
        ...(stepsBefore || []),
        ...stepKeys.map(key => ({
            key,
            label: stepLabels[key],
            hint: stepHints[key],
            validateKeys: stepValidationKeys(key),
            content: stepContent[key],
        })),
    ]

    const current = steps[Math.min(activeStep, steps.length - 1)]
    const isLast = activeStep >= steps.length - 1

    const goTo = (index: number) => {
        setActiveStep(index)
        setFurthestStep(prev => Math.max(prev, index))
        topRef.current?.scrollIntoView({block: 'start'})
    }

    const handleNext = () => {
        formContext.trigger(current?.validateKeys, {shouldFocus: true}).then(valid => {
            if (valid) {
                setShowErrors(false)
                goTo(activeStep + 1)
            } else {
                setShowErrors(true)
            }
        })
    }

    const handleBack = () => goTo(Math.max(0, activeStep - 1))

    // Bei jedem Render neu: `errors` ist ein Objekt, das react-hook-form an Ort und Stelle ändert.
    const describedErrors = flattenFieldErrors(errors).map(e =>
        describeFieldError(e, {participants, competitionRegistrations}, info),
    )

    const stepIndexOf = (key: RegistrationStepKey) => steps.findIndex(s => s.key === key)

    const onInvalid = () => {
        setShowErrors(true)
        const first = flattenFieldErrors(formContext.formState.errors).map(e =>
            describeFieldError(e, {participants, competitionRegistrations}, info),
        )[0]
        if (first) {
            const index = stepIndexOf(first.step)
            if (index >= 0 && index !== activeStep) goTo(index)
        }
        topRef.current?.scrollIntoView({block: 'start'})
    }

    const errorList = showErrors ? describedErrors : []

    const navButtonSx = {
        minHeight: '44px',
        width: {xs: '100%', sm: 'auto'},
        cursor: 'pointer',
    }

    return (
        <Box
            ref={topRef}
            sx={{
                p: {xs: 1, sm: 2},
                bgcolor: 'background.paper',
                minWidth: 0,
                borderRadius: {xs: 0, sm: 2},
                border: {xs: 0, sm: 1},
                borderColor: {sm: 'divider'},
                scrollMarginTop: 72,
            }}>
            <FormContainer formContext={formContext} onSuccess={onSubmit} onError={onInvalid}>
                <Stack spacing={2}>
                    <Stack
                        direction={{xs: 'column', md: 'row'}}
                        justifyContent={'space-between'}
                        alignItems={{xs: 'stretch', md: 'flex-start'}}
                        spacing={2}>
                        <Box sx={{flex: 1, minWidth: 0}}>
                            {/* Ab sm die volle Schrittleiste, darunter eine kompakte Zeile mit Fortschritt. */}
                            <Stepper
                                nonLinear
                                activeStep={activeStep}
                                sx={{
                                    display: {xs: 'none', sm: 'flex'},
                                    flexWrap: 'wrap',
                                    rowGap: 1,
                                }}>
                                {steps.map(({label}, index) => (
                                    <Step key={label} completed={index < activeStep}>
                                        {index <= furthestStep && index !== activeStep ? (
                                            <StepButton
                                                onClick={() => goTo(index)}
                                                sx={{cursor: 'pointer'}}>
                                                {label}
                                            </StepButton>
                                        ) : (
                                            <StepLabel>{label}</StepLabel>
                                        )}
                                    </Step>
                                ))}
                            </Stepper>
                            <Box sx={{display: {xs: 'block', sm: 'none'}}}>
                                <Typography variant={'subtitle1'} fontWeight={600}>
                                    {t('event.registration.steps.progress', {
                                        current: activeStep + 1,
                                        total: steps.length,
                                        label: current?.label,
                                    })}
                                </Typography>
                                <LinearProgress
                                    variant={'determinate'}
                                    value={((activeStep + 1) / steps.length) * 100}
                                    sx={{mt: 0.5}}
                                    aria-hidden
                                />
                            </Box>
                        </Box>
                        <EventRegistrationFeeDisplay />
                    </Stack>

                    {phase === 'late' && (
                        <Alert severity={'warning'}>{t('event.registration.phase.late')}</Alert>
                    )}
                    {phase === 'closed' && (
                        <Alert severity={'error'}>{t('event.registration.phase.closed')}</Alert>
                    )}

                    {errorList.length > 0 && (
                        <Alert severity={'error'} role={'alert'}>
                            <AlertTitle>
                                {t('event.registration.errorSummary.title', {
                                    count: errorList.length,
                                })}
                            </AlertTitle>
                            <Box component={'ul'} sx={{m: 0, pl: 2.5}}>
                                {errorList.slice(0, 8).map(e => {
                                    const index = stepIndexOf(e.step)
                                    const text = [
                                        e.subject,
                                        e.fieldLabelKey ? t(e.fieldLabelKey) : undefined,
                                    ]
                                        .filter(Boolean)
                                        .join(' – ')
                                    return (
                                        <li key={e.path}>
                                            {text || t('event.registration.errorSummary.unknown')}
                                            {e.message ? `: ${e.message}` : ''}
                                            {index >= 0 && index !== activeStep && (
                                                <>
                                                    {' '}
                                                    <Link
                                                        component={'button'}
                                                        type={'button'}
                                                        sx={{
                                                            cursor: 'pointer',
                                                            verticalAlign: 'baseline',
                                                        }}
                                                        onClick={() => goTo(index)}>
                                                        {t('event.registration.errorSummary.goTo', {
                                                            step: steps[index].label,
                                                        })}
                                                    </Link>
                                                </>
                                            )}
                                        </li>
                                    )
                                })}
                            </Box>
                            {errorList.length > 8 && (
                                <Typography variant={'body2'}>
                                    {t('event.registration.errorSummary.more', {
                                        count: errorList.length - 8,
                                    })}
                                </Typography>
                            )}
                        </Alert>
                    )}

                    <Box>
                        <Typography variant={'h2'} sx={{fontSize: {xs: '1.25rem', sm: '1.5rem'}}}>
                            {current?.label}
                        </Typography>
                        {current?.hint && (
                            <Typography variant={'body2'} color={'text.secondary'} sx={{mt: 0.5}}>
                                {current.hint}
                            </Typography>
                        )}
                    </Box>

                    <Box>{current?.content}</Box>

                    <Box
                        sx={{
                            display: 'flex',
                            flexDirection: {xs: 'column', sm: 'row'},
                            gap: 1,
                            pt: 1,
                            borderTop: 1,
                            borderColor: 'divider',
                        }}>
                        <Button
                            color="inherit"
                            disabled={activeStep === 0 || submitting}
                            onClick={handleBack}
                            startIcon={<ArrowBack />}
                            sx={{...navButtonSx, order: {xs: 2, sm: 1}}}>
                            {t('common.back')}
                        </Button>
                        <Box sx={{flex: '1 1 auto', display: {xs: 'none', sm: 'block'}}} />
                        {isLast ? (
                            <SubmitButton
                                key={'submit-form'}
                                submitting={submitting}
                                disabled={phase === 'closed'}
                                startIcon={adminEdit ? undefined : <Send />}
                                sx={{...navButtonSx, order: {xs: 1, sm: 2}}}>
                                {adminEdit ? t('common.save') : t('event.registration.finish')}
                            </SubmitButton>
                        ) : (
                            <Button
                                variant={'contained'}
                                onClick={() => handleNext()}
                                endIcon={<ArrowForward />}
                                sx={{...navButtonSx, order: {xs: 1, sm: 2}}}>
                                {t('event.registration.steps.next', {
                                    step: steps[activeStep + 1]?.label,
                                })}
                            </Button>
                        )}
                    </Box>
                </Stack>
            </FormContainer>
        </Box>
    )
}

export default EventRegistrationForm
