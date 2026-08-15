import {
    Alert,
    Button,
    DialogActions,
    DialogContent,
    MenuItem,
    Stack,
    TextField,
    Typography,
} from '@mui/material'
import {Trans, useTranslation} from 'react-i18next'
import {
    CheckedParticipantRequirement,
    ParticipantMatchScopeDto,
    ParticipantRequirementForEventDto,
} from '@api/types.gen.ts'
import {Block, Check, EditNote} from '@mui/icons-material'
import {useEffect, useMemo, useState} from 'react'
import BaseDialog from '@components/BaseDialog.tsx'
import {FormInputText} from '@components/form/input/FormInputText.tsx'
import {FormContainer, useForm} from 'react-hook-form-mui'
import {SubmitButton} from '@components/form/SubmitButton.tsx'
import {useConfirmation} from '@contexts/confirmation/ConfirmationContext.ts'
import {
    isCheckedForMatch,
    matchScopeLabel,
    needsMatchSelection,
    preselectedMatch,
    requirementWindow,
} from '@components/qrApp/requirementCheckWindow.ts'

interface RequirementsChecklistProps {
    requirements: ParticipantRequirementForEventDto[]
    checkedRequirements: CheckedParticipantRequirement[]
    /** Die Läufe der Person - Grundlage für Vorbelegung und Prüffenster. */
    matches: ParticipantMatchScopeDto[]
    pending: boolean
    onRequirementChange: (
        requirementId: string,
        checked: boolean,
        match: ParticipantMatchScopeDto | null,
        note?: string,
    ) => void
}

type NoteForm = {
    note: string
}

const defaultNoteValues: NoteForm = {
    note: '',
}

const uhrzeit = (d: Date | null) =>
    d?.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) ?? ''

/**
 * Eine Bedingung in der Liste am Steg.
 *
 * Eigene Komponente, weil jede Bedingung ihren eigenen gewählten Lauf hat: Die Waage kann für das
 * 14-Uhr-Rennen abgehakt sein, während die Bootsabnahme schon fürs 16-Uhr-Rennen gilt. Ein
 * gemeinsamer Zustand für die ganze Liste würde die beiden aneinanderkoppeln.
 */
const RequirementRow = ({
    requirement,
    checkedRequirements,
    matches,
    pending,
    onRequirementChange,
    onOpenNoteDialog,
}: {
    requirement: ParticipantRequirementForEventDto
    checkedRequirements: CheckedParticipantRequirement[]
    matches: ParticipantMatchScopeDto[]
    pending: boolean
    onRequirementChange: RequirementsChecklistProps['onRequirementChange']
    onOpenNoteDialog: (req: ParticipantRequirementForEventDto, match: ParticipantMatchScopeDto | null) => void
}) => {
    const {t} = useTranslation()
    const {confirmAction} = useConfirmation()

    const braucehtAuswahl = needsMatchSelection(requirement)

    // Vorbelegung: der nächste anstehende Lauf. Am Steg ist das fast immer der richtige - die
    // Auswahl soll ein Bestätigen sein, kein Suchen.
    const vorbelegt = useMemo(() => preselectedMatch(matches, new Date()), [matches])
    const [gewaehlteId, setGewaehlteId] = useState<string | null>(null)

    useEffect(() => {
        // Erst wenn die Läufe geladen sind, steht die Vorbelegung fest.
        if (gewaehlteId === null && vorbelegt) {
            setGewaehlteId(vorbelegt.competitionId)
        }
    }, [vorbelegt, gewaehlteId])

    const gewaehlt = braucehtAuswahl
        ? (matches.find(m => m.competitionId === gewaehlteId) ?? vorbelegt ?? null)
        : null

    const checked = isCheckedForMatch(requirement, checkedRequirements, gewaehlt)

    // Das Fenster hängt am gewählten Lauf. Ohne Auswahl (Bedingung ohne Schalter) bleibt der
    // vorbelegte Lauf der Bezugspunkt - besser ein Hinweis am nächsten Start als gar keiner.
    const bezugslauf = gewaehlt ?? vorbelegt
    const fenster = requirementWindow(requirement, bezugslauf, new Date())

    // Ohne einen einzigen Lauf lässt sich nichts vorbelegen. Der Haken bleibt trotzdem möglich -
    // gesperrt wird hier nichts.
    const keineLaeufe = braucehtAuswahl && matches.length === 0

    return (
        <Stack spacing={1} width={'100%'}>
            <Stack direction={'row'} alignItems={'center'} spacing={3}>
                <Stack direction={'row'} spacing={2}>
                    {checked ? (
                        <>
                            <Button variant={'outlined'} sx={{visibility: 'hidden'}}>
                                <EditNote />
                            </Button>
                            <Button
                                variant={'outlined'}
                                className={'cursor-pointer'}
                                disabled={pending}
                                onClick={() =>
                                    confirmAction(
                                        () => onRequirementChange(requirement.id, false, gewaehlt),
                                        {
                                            content: t(
                                                'event.participantRequirement.confirmDelete.content',
                                            ),
                                            okText: t('event.participantRequirement.confirmDelete.ok'),
                                            cancelText: t(
                                                'event.participantRequirement.confirmDelete.cancel',
                                            ),
                                            buttonsSX: {minWidth: 80},
                                        },
                                    )
                                }>
                                <Block color={'error'} />
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button
                                variant={'outlined'}
                                className={'cursor-pointer'}
                                onClick={() => onOpenNoteDialog(requirement, gewaehlt)}>
                                <EditNote />
                            </Button>
                            <Button
                                variant={'outlined'}
                                className={'cursor-pointer'}
                                sx={{color: 'green'}}
                                disabled={pending}
                                onClick={() => onRequirementChange(requirement.id, true, gewaehlt)}>
                                <Check />
                            </Button>
                        </>
                    )}
                </Stack>
                <Stack direction={'row'}>
                    <Typography>{requirement.name}</Typography>
                </Stack>
            </Stack>

            {braucehtAuswahl && (
                <Stack spacing={1} sx={{pl: 1}}>
                    {keineLaeufe ? (
                        <Alert severity={'info'}>
                            {t('qrParticipant.requirement.noMatches') as string}
                        </Alert>
                    ) : (
                        <TextField
                            select
                            size={'small'}
                            fullWidth
                            label={t('qrParticipant.requirement.forMatch')}
                            value={gewaehlt?.competitionId ?? ''}
                            onChange={e => setGewaehlteId(e.target.value)}>
                            {matches.map(m => (
                                <MenuItem key={m.competitionId} value={m.competitionId}>
                                    {matchScopeLabel(m)}
                                    {m.startTime
                                        ? ` · ${new Date(m.startTime).toLocaleString([], {
                                              weekday: 'short',
                                              hour: '2-digit',
                                              minute: '2-digit',
                                          })}`
                                        : ''}
                                </MenuItem>
                            ))}
                        </TextField>
                    )}
                </Stack>
            )}

            {/*
                Der Fensterhinweis ist eine Warnung, kein Riegel: Am Regattatag muss eine Prüfung
                notfalls auch außerhalb des Fensters eingetragen werden können. Der Haken bleibt
                deshalb in jedem Zustand bedienbar.
            */}
            {fenster.status !== 'NO_WINDOW' && !checked && (
                <Alert
                    severity={fenster.status === 'IN_WINDOW' ? 'success' : 'warning'}
                    sx={{pl: 1, py: 0}}>
                    {fenster.status === 'TOO_EARLY' &&
                        (t('qrParticipant.requirement.window.tooEarly', {
                            from: uhrzeit(fenster.from),
                        }) as string)}
                    {fenster.status === 'IN_WINDOW' &&
                        (fenster.until
                            ? (t('qrParticipant.requirement.window.inWindowUntil', {
                                  until: uhrzeit(fenster.until),
                              }) as string)
                            : (t('qrParticipant.requirement.window.inWindow') as string))}
                    {fenster.status === 'TOO_LATE' &&
                        (t('qrParticipant.requirement.window.tooLate', {
                            until: uhrzeit(fenster.until),
                        }) as string)}
                </Alert>
            )}
        </Stack>
    )
}

export const RequirementsChecklist = ({
    requirements,
    checkedRequirements,
    matches,
    pending,
    onRequirementChange,
}: RequirementsChecklistProps) => {
    const {t} = useTranslation()

    const [noteTarget, setNoteTarget] = useState<{
        req: ParticipantRequirementForEventDto
        match: ParticipantMatchScopeDto | null
    } | null>(null)
    const showNoteDialog = noteTarget !== null
    const closeNoteDialog = () => setNoteTarget(null)

    const formContext = useForm<NoteForm>()

    useEffect(() => {
        if (noteTarget !== null) {
            formContext.reset(defaultNoteValues)
        }
    }, [noteTarget])

    return (
        <Stack spacing={2} width={'100%'}>
            <Typography variant="h6">
                {t('participantRequirement.participantRequirements')}
            </Typography>

            {pending && <Typography>{t('qrParticipant.loading') as string}</Typography>}

            {requirements.length === 0 && !pending && (
                <Typography>{t('qrParticipant.noRequirements') as string}</Typography>
            )}

            {requirements.map(req => (
                <RequirementRow
                    key={req.id}
                    requirement={req}
                    checkedRequirements={checkedRequirements}
                    matches={matches}
                    pending={pending}
                    onRequirementChange={onRequirementChange}
                    onOpenNoteDialog={(r, m) => setNoteTarget({req: r, match: m})}
                />
            ))}

            <BaseDialog open={showNoteDialog} onClose={closeNoteDialog}>
                <FormContainer
                    formContext={formContext}
                    onSuccess={formData => {
                        const target = noteTarget!
                        closeNoteDialog()
                        onRequirementChange(target.req.id, true, target.match, formData.note)
                    }}>
                    <DialogContent>
                        <FormInputText
                            name={'note'}
                            label={t('event.participantRequirement.checkedNote')}
                        />
                    </DialogContent>
                    <DialogActions>
                        <Button className={'cursor-pointer'} onClick={closeNoteDialog}>
                            <Trans i18nKey={'common.cancel'} />
                        </Button>
                        <SubmitButton submitting={false}>
                            <Trans i18nKey={'event.participantRequirement.approve'} />
                        </SubmitButton>
                    </DialogActions>
                </FormContainer>
            </BaseDialog>
        </Stack>
    )
}
