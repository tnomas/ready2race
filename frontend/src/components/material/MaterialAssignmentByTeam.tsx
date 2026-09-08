import {useState} from 'react'
import {
    Autocomplete,
    Button,
    Card,
    Chip,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {
    MaterialAssignmentEntry,
    MaterialOverviewItemDto,
    MaterialOverviewMatchDto,
    MaterialOverviewRequestDto,
} from '@api/types.gen.ts'
import {setMaterialAssignments} from '@api/sdk.gen.ts'
import {useFeedback} from '@utils/hooks.ts'
import {deviatesFromStartNumber} from '@components/material/assignByStartNumber.ts'
import {MaterialConflict, severityOf, windowOf, windowsIntersect} from '@components/material/conflicts.ts'
import MaterialExceptionDialog from '@components/material/MaterialExceptionDialog.tsx'

type Props = {
    eventId: string
    providerId: string
    requests: MaterialOverviewRequestDto[]
    items: MaterialOverviewItemDto[]
    matches: MaterialOverviewMatchDto[]
    conflicts: MaterialConflict[]
    onChanged: () => void
}

const itemLabel = (item: {label: string; number?: number}): string =>
    item.number != null ? `${item.label} #${item.number}` : item.label

/**
 * Zuteilung nach Team: je bestätigter Anfrage die Grundzuteilung als Chips (gelb bei
 * Abweichung von der Startnummer), eine Autocomplete zum Ergänzen und ein Knopf für die
 * Ausnahme je Lauf. Anfragen ohne Grundzuteilung stehen zuerst - sie brauchen als Erstes
 * Aufmerksamkeit.
 */
const MaterialAssignmentByTeam = ({
    eventId,
    providerId,
    requests,
    items,
    matches,
    conflicts,
    onChanged,
}: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [exceptionRequestId, setExceptionRequestId] = useState<string | null>(null)
    const [submittingId, setSubmittingId] = useState<string | null>(null)

    const itemsById = new Map(items.map(i => [i.id, i]))

    const confirmed = requests
        .filter(r => r.status === 'CONFIRMED')
        .sort((a, b) => {
            const aBase = a.assignments.some(x => x.competitionMatch == null)
            const bBase = b.assignments.some(x => x.competitionMatch == null)
            if (aBase !== bBase) {
                return aBase ? 1 : -1
            }
            return a.competitionIdentifier.localeCompare(b.competitionIdentifier)
        })

    const applyBaseItems = async (request: MaterialOverviewRequestDto, baseItemIds: string[]) => {
        const exceptionEntries: MaterialAssignmentEntry[] = request.assignments
            .filter(a => a.competitionMatch != null)
            .map(a => ({materialItem: a.materialItem, competitionMatch: a.competitionMatch}))
        const baseEntries: MaterialAssignmentEntry[] = baseItemIds.map(id => ({materialItem: id}))

        setSubmittingId(request.id)
        const {error} = await setMaterialAssignments({
            path: {eventId, providerId, requestId: request.id},
            body: {assignments: [...baseEntries, ...exceptionEntries]},
        })
        setSubmittingId(null)
        if (error) {
            feedback.error(t('material.assignment.error'))
        } else {
            feedback.success(t('material.assignment.success'))
            onChanged()
        }
    }

    const removeException = async (request: MaterialOverviewRequestDto, assignmentId: string) => {
        const entries: MaterialAssignmentEntry[] = request.assignments
            .filter(a => a.id !== assignmentId)
            .map(a => ({materialItem: a.materialItem, competitionMatch: a.competitionMatch}))

        setSubmittingId(request.id)
        const {error} = await setMaterialAssignments({
            path: {eventId, providerId, requestId: request.id},
            body: {assignments: entries},
        })
        setSubmittingId(null)
        if (error) {
            feedback.error(t('material.assignment.error'))
        } else {
            feedback.success(t('material.assignment.success'))
            onChanged()
        }
    }

    /**
     * Ausnahmen, deren Lauf ohne die Ausnahme keinen OUTAGE-Konflikt für die Grundzuteilung
     * mehr hätte - der Ausfall, der die Ausnahme nötig machte, ist vorbei oder repariert.
     * Ohne Grundzuteilung (baseItemIds leer) gibt es nichts, worauf man zurückfallen könnte.
     */
    const restorableExceptions = (request: MaterialOverviewRequestDto) => {
        const baseItemIds = request.assignments
            .filter(a => a.competitionMatch == null)
            .map(a => a.materialItem)
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
                return !baseItem.outages.some(outage => {
                    const outageWindow = {
                        start: new Date(outage.from).getTime(),
                        end: outage.until != null ? new Date(outage.until).getTime() : Infinity,
                    }
                    return windowsIntersect(outageWindow, window)
                })
            })
        })
    }

    if (confirmed.length === 0) {
        return (
            <Typography color={'text.secondary'}>{t('material.assignment.noRequests')}</Typography>
        )
    }

    const exceptionRequest = confirmed.find(r => r.id === exceptionRequestId) ?? null

    return (
        <>
            <TableContainer component={Card}>
                <Table size={'small'}>
                    <TableHead>
                        <TableRow>
                            <TableCell>{t('material.requests.columns.competition')}</TableCell>
                            <TableCell>{t('material.requests.columns.team')}</TableCell>
                            <TableCell>{t('material.requests.columns.club')}</TableCell>
                            <TableCell align={'right'}>
                                {t('material.assignment.teamNumber')}
                            </TableCell>
                            <TableCell>{t('material.requests.columns.type')}</TableCell>
                            <TableCell>{t('material.assignment.baseAssignment')}</TableCell>
                            <TableCell>{t('material.assignment.exception')}</TableCell>
                            <TableCell>{t('material.assignment.conflicts')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {confirmed.map(request => {
                            const baseItemIds = request.assignments
                                .filter(a => a.competitionMatch == null)
                                .map(a => a.materialItem)
                            const exceptionCount = request.assignments.filter(
                                a => a.competitionMatch != null,
                            ).length
                            const deviates = deviatesFromStartNumber(request, items)
                            const availableItems = items
                                .filter(
                                    i =>
                                        i.materialType === request.materialType &&
                                        !baseItemIds.includes(i.id),
                                )
                                .sort((a, b) =>
                                    a.status === b.status ? 0 : a.status === 'ACTIVE' ? -1 : 1,
                                )
                            const rowConflicts = conflicts.filter(c =>
                                c.requestIds.includes(request.id),
                            )
                            const conflictKinds = Array.from(new Set(rowConflicts.map(c => c.kind)))

                            return (
                                <TableRow key={request.id}>
                                    <TableCell>
                                        {request.competitionIdentifier} {request.competitionName}
                                    </TableCell>
                                    <TableCell>{request.teamName ?? '–'}</TableCell>
                                    <TableCell>{request.clubName}</TableCell>
                                    <TableCell align={'right'}>
                                        {request.teamNumber ?? '–'}
                                    </TableCell>
                                    <TableCell>{request.materialTypeName}</TableCell>
                                    <TableCell>
                                        <Stack spacing={1}>
                                            <Stack
                                                direction={'row'}
                                                spacing={0.5}
                                                flexWrap={'wrap'}
                                                useFlexGap>
                                                {baseItemIds.map(id => {
                                                    const item = itemsById.get(id)
                                                    return (
                                                        <Chip
                                                            key={id}
                                                            size={'small'}
                                                            color={deviates ? 'warning' : 'default'}
                                                            label={item ? itemLabel(item) : id}
                                                            onDelete={() =>
                                                                void applyBaseItems(
                                                                    request,
                                                                    baseItemIds.filter(
                                                                        i => i !== id,
                                                                    ),
                                                                )
                                                            }
                                                        />
                                                    )
                                                })}
                                                {deviates && (
                                                    <Chip
                                                        size={'small'}
                                                        color={'warning'}
                                                        variant={'outlined'}
                                                        label={t('material.assignment.deviates')}
                                                    />
                                                )}
                                            </Stack>
                                            <Autocomplete
                                                options={availableItems.map(i => ({
                                                    id: i.id,
                                                    label: itemLabel(i),
                                                }))}
                                                value={null}
                                                disabled={submittingId === request.id}
                                                onChange={(_, v) => {
                                                    if (v != null) {
                                                        void applyBaseItems(request, [
                                                            ...baseItemIds,
                                                            v.id,
                                                        ])
                                                    }
                                                }}
                                                getOptionLabel={o => o.label}
                                                isOptionEqualToValue={(o, v) => o.id === v.id}
                                                renderInput={params => (
                                                    <TextField
                                                        {...params}
                                                        label={t('material.assignment.addItem')}
                                                        size={'small'}
                                                    />
                                                )}
                                                sx={{minWidth: 200}}
                                            />
                                        </Stack>
                                    </TableCell>
                                    <TableCell>
                                        <Stack spacing={0.5}>
                                            <Button
                                                size={'small'}
                                                onClick={() => setExceptionRequestId(request.id)}>
                                                {t('material.assignment.exception')}
                                                {exceptionCount > 0 ? ` (${exceptionCount})` : ''}
                                            </Button>
                                            {restorableExceptions(request).map(exception => (
                                                <Tooltip
                                                    key={exception.id}
                                                    title={t('material.damage.baseAgain')}>
                                                    <Chip
                                                        size={'small'}
                                                        color={'success'}
                                                        variant={'outlined'}
                                                        label={t('material.damage.baseAgainRemove')}
                                                        onDelete={() =>
                                                            void removeException(request, exception.id)
                                                        }
                                                    />
                                                </Tooltip>
                                            ))}
                                        </Stack>
                                    </TableCell>
                                    <TableCell>
                                        <Stack
                                            direction={'row'}
                                            spacing={0.5}
                                            flexWrap={'wrap'}
                                            useFlexGap>
                                            {conflictKinds.map(kind => (
                                                <Chip
                                                    key={kind}
                                                    size={'small'}
                                                    color={severityOf(kind)}
                                                    label={t(`material.conflict.${kind}`)}
                                                />
                                            ))}
                                        </Stack>
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            </TableContainer>
            <MaterialExceptionDialog
                open={exceptionRequestId != null}
                eventId={eventId}
                providerId={providerId}
                request={exceptionRequest}
                matches={matches}
                items={items}
                onClose={() => setExceptionRequestId(null)}
                onChanged={onChanged}
            />
        </>
    )
}

export default MaterialAssignmentByTeam
