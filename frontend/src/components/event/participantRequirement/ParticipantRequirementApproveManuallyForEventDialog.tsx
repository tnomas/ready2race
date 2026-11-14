import EntityDialog from '@components/EntityDialog.tsx'
import {ParticipantForEventDto, ParticipantScanCompetitionDto} from '@api/types.gen.ts'
import {Alert, MenuItem, Stack, TextField} from '@mui/material'
import {
    approveParticipantRequirementsForEvent,
    getEventScanScope,
    getParticipantsForEventInApp,
} from '@api/sdk.gen.ts'
import {useForm} from 'react-hook-form-mui'
import {useCallback, useEffect, useMemo, useState} from 'react'
import {competitionLabel, covers} from '@components/qrApp/requirementScope.ts'
import {eventRoute} from '@routes'
import FormInputTransferList from '@components/form/input/FormInputTransferList.tsx'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import {useTranslation} from 'react-i18next'
import Throbber from '@components/Throbber.tsx'
import {
    RequirementCheckTarget,
    requirementCheckTargetLabel,
    resolveSelectedTarget,
} from './requirementCheckTargets.ts'

export type ParticipantRequirementApproveManuallyForEventForm = {
    requirementId: string
    requirementName: string
    isGlobal: boolean
    namedParticipantId?: string
    namedParticipantName?: string
    /**
     * Die Geltung der Bedingung (V202608141900). Der Abgleich ersetzt den vollständigen Zustand
     * und muss deshalb wissen, WOFÜR - ohne Wettkampf löschte er bei einer wettkampfbezogenen
     * Bedingung die Bestätigungen aller anderen Wettkämpfe mit.
     */
    perEventDay?: boolean
    perCompetition?: boolean
    approvedParticipants: Array<ParticipantForEventDto & {note?: string}>
}

type Props = {
    entityName: string
    dialogIsOpen: boolean
    closeDialog: () => void
    reloadData: () => void
    /**
     * Die wählbaren Bedingungen (bei Rollenbindung je Rolle), siehe `requirementCheckTargets`.
     * Die Bedingung wird im Dialog als erstes Feld gewählt; gibt es nur eine, ist sie gesetzt.
     */
    targets: RequirementCheckTarget[]
}

const ParticipantRequirementApproveManuallyForEventDialog = ({targets, ...props}: Props) => {
    const {eventId} = eventRoute.useParams()
    const feedback = useFeedback()
    const {t} = useTranslation()
    const [selectedKey, setSelectedKey] = useState<string | null>(null)
    const [competitionId, setCompetitionId] = useState<string | null>(null)
    const [competitions, setCompetitions] = useState<ParticipantScanCompetitionDto[]>([])
    const [todayEventDayId, setTodayEventDayId] = useState<string | null>(null)

    // Jedes Öffnen beginnt ohne Wahl: Bedingung und Wettkampf vom letzten Mal wären eine stille
    // Vorbelegung, die beim Abgleich niemand mehr bemerkt.
    useEffect(() => {
        if (props.dialogIsOpen) {
            setSelectedKey(null)
            setCompetitionId(null)
        }
    }, [props.dialogIsOpen])

    const target = resolveSelectedTarget(targets, selectedKey)

    // Der Datensatz des Dialogs ist das gewählte Ziel. Stabil je Ziel, damit der Dialog das
    // Formular nur bei einem Wechsel neu befüllt.
    const entity: ParticipantRequirementApproveManuallyForEventForm | undefined = useMemo(
        () => (target ? {...target, approvedParticipants: []} : undefined),
        [target],
    )

    const perCompetition = entity?.perCompetition === true
    const perEventDay = entity?.perEventDay === true

    // Der Rahmen kommt vom Server: den heutigen Wettkampftag bestimmt dieselbe Regel, die ihn
    // beim Speichern einträgt - eine zweite Quelle für "heute" wäre eine zu viel.
    useFetch(signal => getEventScanScope({signal, path: {eventId}}), {
        onResponse: ({data, error}) => {
            if (error || !data) {
                feedback.error(
                    t('common.load.error.multiple.short', {
                        entity: t('event.competition.competitions'),
                    }),
                )
                return
            }
            setCompetitions(data.competitions)
            setTodayEventDayId(data.todayEventDayId ?? null)
        },
        preCondition: () => props.dialogIsOpen,
        deps: [eventId, props.dialogIsOpen],
    })

    const editAction = (formData: ParticipantRequirementApproveManuallyForEventForm) => {
        return approveParticipantRequirementsForEvent({
            path: {eventId},
            body: {
                requirementId: formData.requirementId,
                approvedParticipants: formData.approvedParticipants.map(p => ({
                    id: p.id,
                    note: p.note,
                })),
                namedParticipantId: formData.namedParticipantId,
                competitionId: perCompetition ? (competitionId ?? undefined) : undefined,
            },
        })
    }

    const {data: participantsData, pending: participantsPending} = useFetch(
        signal =>
            getParticipantsForEventInApp({
                signal,
                path: {eventId},
                query: {
                    sort: JSON.stringify([
                        {field: 'FIRSTNAME', direction: 'ASC'},
                        {field: 'LASTNAME', direction: 'ASC'},
                    ]),
                },
            }),
        {
            preCondition: () => props.dialogIsOpen,
            onResponse: ({error}) => {
                if (error) {
                    feedback.error(
                        t('common.load.error.multiple.short', {
                            entity: t('club.participant.title'),
                        }),
                    )
                }
            },
            deps: [eventId, props.dialogIsOpen],
        },
    )

    // Filter participants based on requirement type
    const filteredParticipants = useMemo(() => {
        if (!participantsData?.data) return []

        return participantsData.data.filter(p => {
            // If it's a named participant requirement, only show participants with matching namedParticipantId
            if (!entity?.isGlobal && entity?.namedParticipantId) {
                return p.namedParticipantIds?.includes(entity.namedParticipantId) ?? false
            }
            // For global requirements, show all participants
            return true
        })
    }, [participantsData?.data, entity?.isGlobal, entity?.namedParticipantId])

    const formContext = useForm<ParticipantRequirementApproveManuallyForEventForm>()

    const options = useMemo(
        () =>
            filteredParticipants.map(p => ({
                ...p,
                note: p.participantRequirementsChecked?.find(r => r.id === entity?.requirementId)
                    ?.note,
            })),
        [filteredParticipants, entity?.requirementId],
    )

    // Angehakt ist, wessen Bestätigung DIESEN Rahmen abdeckt - dieselbe Regel wie an der Waage
    // und vor dem Start. Ohne sie stünde jemand, der für einen anderen Wettkampf gewogen wurde,
    // hier als erledigt, und das Speichern schriebe seine Bestätigung nie für den gewählten.
    const isApproved = useCallback(
        (p: ParticipantForEventDto) =>
            (p.participantRequirementsChecked ?? []).some(
                r =>
                    r.id === entity?.requirementId &&
                    covers({perEventDay, perCompetition}, r, {todayEventDayId, competitionId}),
            ),
        [entity?.requirementId, perEventDay, perCompetition, todayEventDayId, competitionId],
    )

    const onOpen = useCallback(() => {
        formContext.reset(
            entity
                ? {
                      ...entity,
                      approvedParticipants: options.filter(isApproved),
                  }
                : {},
        )
    }, [entity, options, isApproved, formContext])

    // Ein Wettkampfwechsel ist ein anderer Zustand: die Liste muss neu vorbelegt werden, sonst
    // trüge der Abgleich die Häkchen des vorigen Wettkampfs in den neuen.
    const onCompetitionChange = (id: string) => {
        setCompetitionId(id)
        formContext.setValue(
            'approvedParticipants',
            options.filter(p =>
                (p.participantRequirementsChecked ?? []).some(
                    r =>
                        r.id === entity?.requirementId &&
                        covers({perEventDay, perCompetition}, r, {
                            todayEventDayId,
                            competitionId: id,
                        }),
                ),
            ),
        )
    }

    // Eine andere Bedingung hat einen anderen Rahmen: der Wettkampf wird neu gewählt.
    const onTargetChange = (key: string) => {
        setSelectedKey(key)
        setCompetitionId(null)
    }

    return (
        <EntityDialog
            {...props}
            entity={entity}
            formContext={formContext}
            onOpen={onOpen}
            editAction={editAction}
            disableSave={entity === undefined || (perCompetition && competitionId === null)}
            maxWidth={'xl'}
            fullWidth={true}
            title={t('event.participantRequirement.checkManuallyDialog.title')}>
            <Stack spacing={2}>
                {targets.length === 0 ? (
                    <Alert severity="info">
                        {t('event.participantRequirement.checkManuallyDialog.noRequirements')}
                    </Alert>
                ) : (
                    <TextField
                        select
                        fullWidth
                        required
                        label={t('event.participantRequirement.checkManuallyDialog.requirement')}
                        helperText={
                            entity === undefined
                                ? t('event.participantRequirement.checkManuallyDialog.chooseFirst')
                                : undefined
                        }
                        value={target?.key ?? ''}
                        onChange={e => onTargetChange(e.target.value)}>
                        {targets.map(option => (
                            <MenuItem key={option.key} value={option.key}>
                                {requirementCheckTargetLabel(option)}
                            </MenuItem>
                        ))}
                    </TextField>
                )}

                {perCompetition && (
                    <TextField
                        select
                        fullWidth
                        label={t('qrParticipant.competitionLabel')}
                        helperText={t('event.participantRequirement.scope.competitionHelp')}
                        value={competitionId ?? ''}
                        onChange={e => onCompetitionChange(e.target.value)}>
                        {competitions.map(competition => (
                            <MenuItem key={competition.id} value={competition.id}>
                                {competitionLabel(competition)}
                            </MenuItem>
                        ))}
                    </TextField>
                )}

                {perCompetition && competitionId === null && (
                    <Alert severity="info">
                        {t('event.participantRequirement.scope.chooseCompetition')}
                    </Alert>
                )}

                {perEventDay && (
                    <Alert severity={todayEventDayId === null ? 'warning' : 'info'}>
                        {todayEventDayId === null
                            ? t('qrParticipant.noEventDayToday')
                            : t('event.participantRequirement.scope.todayOnly')}
                    </Alert>
                )}

                {entity === undefined ? null : participantsPending ? (
                    <Throbber />
                ) : perCompetition && competitionId === null ? null : (
                    <FormInputTransferList
                        name={'approvedParticipants'}
                        options={options}
                        labelLeft={t('event.participantRequirement.participantsOpen')}
                        labelRight={t('event.participantRequirement.participantsApproved')}
                        renderValue={v => ({
                            primary: `${v.firstname} ${v.lastname}`,
                            secondary: `${v.gender} - ${v.year} - ${v.external ? `${v.externalClubName} (${v.clubName})` : v.clubName}`,
                        })}
                    />
                )}
            </Stack>
        </EntityDialog>
    )
}
export default ParticipantRequirementApproveManuallyForEventDialog
