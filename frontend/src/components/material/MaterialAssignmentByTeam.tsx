import {useState} from 'react'
import {Autocomplete, Box, Chip, Divider, Paper, Stack, TextField, Typography} from '@mui/material'
import TaskAltOutlined from '@mui/icons-material/TaskAltOutlined'
import CancelIcon from '@mui/icons-material/Cancel'
import {useTranslation} from 'react-i18next'
import {
    MaterialOverviewItemDto,
    MaterialOverviewMatchDto,
    MaterialOverviewRequestDto,
} from '@api/types.gen.ts'
import {setMaterialAssignments} from '@api/sdk.gen.ts'
import {useFeedback} from '@utils/hooks.ts'
import {isRequestNetworkError, runRequest} from '@utils/request.ts'
import {materialErrorKey} from '@components/material/materialErrors.ts'
import {EmptyState} from '@components/ui'
import {
    MaterialConflict,
    severityOf,
    windowOf,
    windowsIntersect,
} from '@components/material/conflicts.ts'
import {
    assignmentRowsForWork,
    assignmentState,
    baseItemIdsOf,
    exceptionCountOf,
    itemLabel,
} from '@components/material/materialWorkplace.ts'
import MaterialExceptionDialog from '@components/material/MaterialExceptionDialog.tsx'
import {statusTextColor} from '../../theme/themeColors.ts'
import ExecutionMoreMenu from '@components/event/competition/excecution/ExecutionMoreMenu.tsx'
import {AssignmentChange, assignmentEntriesAfter} from '@components/material/assignmentEntries.ts'
import {useReloadGate} from '@components/material/reloadGate.ts'
import {teamNumberOf} from '@components/material/materialNumbers.ts'

type Props = {
    eventId: string
    providerId: string
    requests: MaterialOverviewRequestDto[]
    items: MaterialOverviewItemDto[]
    matches: MaterialOverviewMatchDto[]
    conflicts: MaterialConflict[]
    /** Lädt die Übersicht gerade? Hält die Sperre bis zum frischen Stand (siehe reloadGate). */
    pending: boolean
    /** Anfragen, deren Meldungsnummer kein Stück der eigenen aktiven Flotte trägt. */
    withoutNumberMatch: ReadonlySet<string>
    /** Ohne Schreibrecht: keine Auswahl, kein Entfernen, kein ⋮-Menü. */
    canWrite: boolean
    onChanged: () => void
}

/**
 * Zuteilung nach Team als Arbeitsliste: je bestätigter Anfrage eine Zeile, Teams ohne Stück
 * zuerst, dann solche mit Konflikt. Primäraktion ist „Stück zuteilen", solange Stücke fehlen;
 * „Weiteres Stück" und „Ausnahme je Lauf" liegen im ⋮-Menü. Bestehende Ausnahmen stehen als
 * anklickbarer Chip da, damit sie ohne Menü erreichbar bleiben.
 */
const MaterialAssignmentByTeam = ({
    eventId,
    providerId,
    requests,
    items,
    matches,
    conflicts,
    pending,
    withoutNumberMatch,
    canWrite,
    onChanged,
}: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [exceptionRequestId, setExceptionRequestId] = useState<string | null>(null)
    const [busyId, setBusyId] = useState<string | null>(null)
    // Zeilen, in denen „Weiteres Stück" aufgeklappt wurde, obwohl die Menge schon erfüllt ist.
    const [addOpen, setAddOpen] = useState<Set<string>>(new Set())

    // Nach einem Erfolg bleibt alles gesperrt, bis die Übersicht neu da ist: Jede Zuteilung
    // schickt die Komplettliste, ein zweiter Klick auf altem Stand überschriebe den ersten.
    const gate = useReloadGate(requests, pending)
    const locked = busyId != null || gate.locked

    const itemsById = new Map(items.map(i => [i.id, i]))
    const rows = assignmentRowsForWork(requests, conflicts)

    const submit = async (request: MaterialOverviewRequestDto, change: AssignmentChange) => {
        if (locked) return
        const {error} = await runRequest(
            busy => setBusyId(busy ? request.id : null),
            () =>
                setMaterialAssignments({
                    path: {eventId, providerId, requestId: request.id},
                    body: {assignments: assignmentEntriesAfter(request.assignments, change)},
                }),
        )
        if (isRequestNetworkError(error)) {
            feedback.error(t('common.error.network'))
        } else if (error) {
            const key = materialErrorKey(error)
            feedback.error(t(key ?? 'material.assignment.error'))
            // Ein fachlicher Konflikt heißt: der Stand hier ist veraltet (Entscheidung oder Runde
            // inzwischen geändert) - die Übersicht neu laden, damit die Liste wieder stimmt.
            if (key) onChanged()
        } else {
            feedback.success(t('material.assignment.success'))
            setAddOpen(prev => {
                const next = new Set(prev)
                next.delete(request.id)
                return next
            })
            gate.arm()
            onChanged()
        }
    }

    const applyBaseItems = (request: MaterialOverviewRequestDto, baseItemIds: string[]) =>
        void submit(request, {kind: 'setBase', itemIds: baseItemIds})

    const removeException = (request: MaterialOverviewRequestDto, assignmentId: string) =>
        void submit(request, {kind: 'remove', assignmentId})

    /**
     * Ausnahmen, deren Lauf ohne die Ausnahme keinen Ausfall-Konflikt für die Grundzuteilung
     * mehr hätte – der Ausfall, der die Ausnahme nötig machte, ist vorbei oder repariert. Ohne
     * Grundzuteilung gibt es nichts, worauf man zurückfallen könnte.
     */
    const restorableExceptions = (request: MaterialOverviewRequestDto) => {
        const baseItemIds = baseItemIdsOf(request)
        if (baseItemIds.length === 0) {
            return []
        }
        return request.assignments.filter(exception => {
            if (exception.competitionMatch == null) {
                return false
            }
            const match = matches.find(m => m.id === exception.competitionMatch)
            const window = match ? windowOf(match) : null
            if (window == null) {
                return false
            }
            return baseItemIds.every(id => {
                const baseItem = itemsById.get(id)
                if (!baseItem) {
                    return true
                }
                return !baseItem.outages.some(outage =>
                    windowsIntersect(
                        {
                            start: new Date(outage.from).getTime(),
                            end: outage.until != null ? new Date(outage.until).getTime() : Infinity,
                        },
                        window,
                    ),
                )
            })
        })
    }

    if (rows.length === 0) {
        return (
            <EmptyState
                dense
                icon={<TaskAltOutlined />}
                title={t('material.assignment.noRequests')}
                description={t('material.assignment.noRequestsHint')}
            />
        )
    }

    const exceptionRequest = rows.find(r => r.id === exceptionRequestId) ?? null

    return (
        <>
            <Paper variant={'outlined'}>
                <Stack divider={<Divider flexItem />}>
                    {rows.map(request => {
                        const baseItemIds = baseItemIdsOf(request)
                        const exceptionCount = exceptionCountOf(request)
                        const state = assignmentState(request, items)
                        const missing = baseItemIds.length < request.count
                        const showAdd = canWrite && (missing || addOpen.has(request.id))
                        const availableItems = items
                            .filter(
                                i =>
                                    i.materialType === request.materialType &&
                                    !baseItemIds.includes(i.id),
                            )
                            .sort((a, b) =>
                                a.status === b.status ? 0 : a.status === 'ACTIVE' ? -1 : 1,
                            )
                        const conflictKinds = Array.from(
                            new Set(
                                conflicts
                                    .filter(c => c.requestIds.includes(request.id))
                                    .map(c => c.kind),
                            ),
                        )
                        const busy = locked
                        const teamNumber = teamNumberOf(request)
                        const team = request.teamName ? ` · ${request.teamName}` : ''

                        return (
                            <Stack
                                key={request.id}
                                direction={'row'}
                                gap={1}
                                alignItems={'flex-start'}
                                sx={{px: {xs: 1, sm: 2}, py: 1.25}}>
                                <Box sx={{flex: 1, minWidth: 0}}>
                                    <Typography
                                        variant={'body1'}
                                        fontWeight={600}
                                        sx={{overflowWrap: 'anywhere'}}>
                                        {request.clubName}
                                        {team}
                                    </Typography>
                                    {teamNumber != null && (
                                        <Typography variant={'body2'} color={'text.secondary'}>
                                            {t('material.number.team', {number: teamNumber})}
                                        </Typography>
                                    )}
                                    <Typography
                                        variant={'body2'}
                                        color={'text.secondary'}
                                        sx={{overflowWrap: 'anywhere'}}>
                                        {request.competitionIdentifier} {request.competitionName} ·{' '}
                                        {request.count > 1 ? `${request.count} × ` : ''}
                                        {request.materialTypeName}
                                    </Typography>
                                    <Stack
                                        direction={'row'}
                                        gap={0.5}
                                        flexWrap={'wrap'}
                                        sx={{mt: 0.75}}>
                                        {baseItemIds.map(id => {
                                            const item = itemsById.get(id)
                                            const label = item ? itemLabel(item) : id
                                            return (
                                                <Chip
                                                    key={id}
                                                    size={'small'}
                                                    label={label}
                                                    disabled={busy}
                                                    onDelete={
                                                        canWrite
                                                            ? () =>
                                                                  applyBaseItems(
                                                                      request,
                                                                      baseItemIds.filter(
                                                                          i => i !== id,
                                                                      ),
                                                                  )
                                                            : undefined
                                                    }
                                                    deleteIcon={
                                                        <CancelIcon
                                                            titleAccess={t(
                                                                'material.assignment.removeItem',
                                                                {item: label},
                                                            )}
                                                        />
                                                    }
                                                />
                                            )
                                        })}
                                        {withoutNumberMatch.has(request.id) && (
                                            <Chip
                                                size={'small'}
                                                variant={'outlined'}
                                                label={t('material.assignment.withoutNumberMatch')}
                                                title={t(
                                                    'material.assignment.withoutNumberMatchHint',
                                                )}
                                            />
                                        )}
                                        {state === 'deviates' &&
                                            !withoutNumberMatch.has(request.id) && (
                                                <Chip
                                                    size={'small'}
                                                    color={'warning'}
                                                    variant={'outlined'}
                                                    label={t('material.assignment.deviates')}
                                                    // Lesbarer Text statt des hellen Warnorange.
                                                    sx={{
                                                        color: theme =>
                                                            statusTextColor(theme, 'warning'),
                                                    }}
                                                />
                                            )}
                                        {conflictKinds.map(kind => (
                                            <Chip
                                                key={kind}
                                                size={'small'}
                                                color={severityOf(kind)}
                                                label={t(`material.conflict.${kind}`)}
                                            />
                                        ))}
                                        {exceptionCount > 0 && (
                                            <Chip
                                                size={'small'}
                                                variant={'outlined'}
                                                label={t('material.assignment.exceptionCount', {
                                                    count: exceptionCount,
                                                })}
                                                onClick={
                                                    canWrite
                                                        ? () => setExceptionRequestId(request.id)
                                                        : undefined
                                                }
                                                sx={canWrite ? {cursor: 'pointer'} : undefined}
                                            />
                                        )}
                                        {canWrite &&
                                            restorableExceptions(request).map(exception => (
                                                <Chip
                                                    key={exception.id}
                                                    size={'small'}
                                                    color={'success'}
                                                    variant={'outlined'}
                                                    label={t('material.damage.baseAgainRemove')}
                                                    title={t('material.damage.baseAgain')}
                                                    disabled={busy}
                                                    onDelete={() =>
                                                        removeException(request, exception.id)
                                                    }
                                                />
                                            ))}
                                    </Stack>
                                    {showAdd && (
                                        <Autocomplete
                                            options={availableItems.map(i => ({
                                                id: i.id,
                                                label: itemLabel(i),
                                            }))}
                                            value={null}
                                            disabled={busy}
                                            onChange={(_, v) => {
                                                if (v != null) {
                                                    applyBaseItems(request, [...baseItemIds, v.id])
                                                }
                                            }}
                                            getOptionLabel={o => o.label}
                                            isOptionEqualToValue={(o, v) => o.id === v.id}
                                            noOptionsText={t('material.assignment.noFreeItem')}
                                            renderInput={params => (
                                                <TextField
                                                    {...params}
                                                    label={
                                                        missing
                                                            ? t('material.assignment.assignItem')
                                                            : t('material.assignment.addItem')
                                                    }
                                                    size={'small'}
                                                />
                                            )}
                                            sx={{mt: 1, width: '100%', maxWidth: 360}}
                                        />
                                    )}
                                </Box>
                                {canWrite && (
                                    <ExecutionMoreMenu
                                        label={t('material.assignment.moreActions')}
                                        disabled={busy}
                                        items={[
                                            ...(!showAdd
                                                ? [
                                                      {
                                                          id: 'add',
                                                          label: t('material.assignment.addItem'),
                                                          onSelect: () =>
                                                              setAddOpen(prev =>
                                                                  new Set(prev).add(request.id),
                                                              ),
                                                      },
                                                  ]
                                                : []),
                                            {
                                                id: 'exception',
                                                label: t('material.assignment.exception'),
                                                onSelect: () => setExceptionRequestId(request.id),
                                            },
                                        ]}
                                    />
                                )}
                            </Stack>
                        )
                    })}
                </Stack>
            </Paper>
            <MaterialExceptionDialog
                open={exceptionRequestId != null}
                eventId={eventId}
                providerId={providerId}
                request={exceptionRequest}
                matches={matches}
                items={items}
                pending={pending}
                onClose={() => setExceptionRequestId(null)}
                onChanged={onChanged}
            />
        </>
    )
}

export default MaterialAssignmentByTeam
