import {useMemo, useState} from 'react'
import {
    Box,
    Button,
    Checkbox,
    Chip,
    Divider,
    FormControl,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    Typography,
} from '@mui/material'
import {format} from 'date-fns'
import CheckIcon from '@mui/icons-material/Check'
import InboxOutlined from '@mui/icons-material/InboxOutlined'
import {useTranslation} from 'react-i18next'
import {
    MaterialOverviewDto,
    MaterialOverviewRequestDto,
    MaterialRequestStatus,
} from '@api/types.gen.ts'
import {decideMaterialRequest} from '@api/sdk.gen.ts'
import {useFeedback} from '@utils/hooks.ts'
import {isRequestNetworkError, runRequest} from '@utils/request.ts'
import {EmptyState} from '@components/ui'
import {offerSummaries} from '@components/material/offerSummary.ts'
import {
    DEFAULT_REQUEST_FILTER,
    matchesRequestFilter,
    REQUEST_FILTERS,
    RequestDecision,
    RequestFilter,
    requestActionPlan,
    requestFilterCounts,
    sortRequestsForWork,
} from '@components/material/materialWorkplace.ts'
import MaterialDecisionDialog from '@components/material/MaterialDecisionDialog.tsx'
import ExecutionMoreMenu from '@components/event/competition/excecution/ExecutionMoreMenu.tsx'

type Props = {
    eventId: string
    providerId: string
    overview: MaterialOverviewDto
    reload: () => void
}

type ChipLook = {
    color: 'default' | 'primary' | 'success'
    variant: 'filled' | 'outlined'
}

/**
 * Status als ruhiges Etikett: nur „bestätigt" ist farbig (erledigt, gut), „angefragt" ist
 * hervorgehoben (Arbeit), alles andere grau. Warteliste und Ablehnung sind normale
 * Entscheidungen, keine Alarme.
 */
const REQUEST_STATUS_CHIP: Record<MaterialRequestStatus, ChipLook> = {
    REQUESTED: {color: 'primary', variant: 'outlined'},
    WAITLISTED: {color: 'default', variant: 'outlined'},
    CONFIRMED: {color: 'success', variant: 'filled'},
    DECLINED: {color: 'default', variant: 'outlined'},
    WITHDRAWN: {color: 'default', variant: 'outlined'},
}

const FILTER_LABEL_KEYS = {
    OPEN: 'material.requests.filter.OPEN',
    CONFIRMED: 'material.requests.filter.CONFIRMED',
    DECLINED: 'material.requests.filter.DECLINED',
    WITHDRAWN: 'material.requests.filter.WITHDRAWN',
    ALL: 'material.requests.filter.ALL',
} as const satisfies Record<RequestFilter, string>

/**
 * Reiter „Anfragen" als Arbeitsliste: offene Anfragen stehen vorbelegt oben, je Zeile EINE
 * Primäraktion (Bestätigen) und ein flaches ⋮-Menü (Warteliste, Ablehnen – beide mit Notiz).
 * Eine Liste statt Tabelle, damit das Telefon am Steg (390 px) ohne seitliches Scrollen
 * auskommt.
 */
const MaterialRequestsPanel = ({eventId, providerId, overview, reload}: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [filter, setFilter] = useState<RequestFilter>(DEFAULT_REQUEST_FILTER)
    const [typeFilter, setTypeFilter] = useState<string>('ALL')
    const [deselected, setDeselected] = useState<Set<string>>(new Set())
    const [bulkBusy, setBulkBusy] = useState(false)
    const [rowBusy, setRowBusy] = useState<string | null>(null)
    const [dialogRequest, setDialogRequest] = useState<{
        id: string
        status: 'WAITLISTED' | 'DECLINED'
    } | null>(null)

    const requests = overview.requests
    const offers = overview.offers

    const typeOptions = useMemo(
        () => Array.from(new Map(offers.map(o => [o.materialType, o.materialTypeName])).entries()),
        [offers],
    )
    const ofType = requests.filter(r => typeFilter === 'ALL' || r.materialType === typeFilter)
    const counts = requestFilterCounts(ofType)
    const visible = sortRequestsForWork(ofType.filter(r => matchesRequestFilter(r.status, filter)))

    // Die Sammelbestätigung trifft alle sichtbaren angefragten Zeilen außer den abgewählten.
    const selectableIds = visible.filter(r => r.status === 'REQUESTED').map(r => r.id)
    const selectedIds = selectableIds.filter(id => !deselected.has(id))

    const summaries = offerSummaries(offers, requests)
    const highlighted = new Set(
        summaries.map(s => s.highlightRequestId).filter((id): id is string => id != null),
    )

    const toggleOne = (id: string) =>
        setDeselected(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })

    const decide = (requestId: string, status: RequestDecision) =>
        decideMaterialRequest({path: {eventId, providerId, requestId}, body: {status}})

    const handleConfirm = async (requestId: string) => {
        if (rowBusy) return
        const {error} = await runRequest(
            busy => setRowBusy(busy ? requestId : null),
            () => decide(requestId, 'CONFIRMED'),
        )
        if (isRequestNetworkError(error)) {
            feedback.error(t('common.error.network'))
        } else if (error) {
            feedback.error(t('material.decision.error'))
        } else {
            feedback.success(t('material.decision.success'))
            reload()
        }
    }

    const handleConfirmSelected = async () => {
        if (selectedIds.length === 0 || bulkBusy) return
        setBulkBusy(true)
        let failures = 0
        let network = false
        for (const requestId of selectedIds) {
            const {error} = await runRequest(undefined, () => decide(requestId, 'CONFIRMED'))
            if (error) failures++
            if (isRequestNetworkError(error)) network = true
        }
        setBulkBusy(false)
        if (network) {
            feedback.error(t('common.error.network'))
        } else if (failures > 0) {
            feedback.error(t('material.requests.confirmAllError', {count: failures}))
        } else {
            feedback.success(t('material.requests.confirmAllSuccess', {count: selectedIds.length}))
        }
        setDeselected(new Set())
        reload()
    }

    const onDecision = (request: MaterialOverviewRequestDto, decision: RequestDecision) => {
        if (decision === 'CONFIRMED') void handleConfirm(request.id)
        else setDialogRequest({id: request.id, status: decision})
    }

    return (
        <Stack spacing={2}>
            <Stack direction={'row'} gap={1} flexWrap={'wrap'} alignItems={'center'}>
                {REQUEST_FILTERS.map(f => (
                    <Chip
                        key={f}
                        label={`${t(FILTER_LABEL_KEYS[f])} (${counts[f]})`}
                        color={filter === f ? 'primary' : 'default'}
                        variant={filter === f ? 'filled' : 'outlined'}
                        onClick={() => setFilter(f)}
                        aria-pressed={filter === f}
                        sx={{cursor: 'pointer'}}
                    />
                ))}
                {typeOptions.length > 1 && (
                    <FormControl size={'small'} sx={{minWidth: 160}}>
                        <InputLabel id={'material-requests-type-filter'}>
                            {t('material.requests.filterType')}
                        </InputLabel>
                        <Select
                            labelId={'material-requests-type-filter'}
                            label={t('material.requests.filterType')}
                            value={typeFilter}
                            onChange={e => setTypeFilter(e.target.value)}>
                            <MenuItem value={'ALL'}>{t('material.requests.filterAll')}</MenuItem>
                            {typeOptions.map(([id, name]) => (
                                <MenuItem key={id} value={id}>
                                    {name}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                )}
            </Stack>

            {selectableIds.length > 1 && (
                <Box>
                    <Button
                        variant={'contained'}
                        startIcon={<CheckIcon />}
                        disabled={selectedIds.length === 0 || bulkBusy}
                        onClick={() => void handleConfirmSelected()}
                        sx={{cursor: 'pointer'}}>
                        {t('material.requests.confirmSelected', {count: selectedIds.length})}
                    </Button>
                </Box>
            )}

            {visible.length === 0 ? (
                <EmptyState
                    dense
                    icon={<InboxOutlined />}
                    title={
                        filter === 'OPEN'
                            ? t('material.requests.noneOpen')
                            : t('material.requests.none')
                    }
                />
            ) : (
                <Paper variant={'outlined'}>
                    <Stack divider={<Divider flexItem />}>
                        {visible.map(request => (
                            <RequestRow
                                key={request.id}
                                request={request}
                                highlighted={highlighted.has(request.id)}
                                selectable={
                                    selectableIds.length > 1 && request.status === 'REQUESTED'
                                }
                                selected={!deselected.has(request.id)}
                                onToggleSelected={() => toggleOne(request.id)}
                                busy={rowBusy === request.id || bulkBusy}
                                onDecision={decision => onDecision(request, decision)}
                            />
                        ))}
                    </Stack>
                </Paper>
            )}

            <Box>
                <Typography variant={'subtitle2'} component={'h2'} sx={{mb: 0.5}}>
                    {t('material.requests.capacityTitle')}
                </Typography>
                {summaries.length === 0 ? (
                    <Typography variant={'body2'} color={'text.secondary'}>
                        {t('material.requests.noOffers')}
                    </Typography>
                ) : (
                    <Paper variant={'outlined'}>
                        <Stack divider={<Divider flexItem />}>
                            {summaries.map(summary => (
                                <Stack
                                    key={summary.offerId}
                                    direction={'row'}
                                    gap={1}
                                    flexWrap={'wrap'}
                                    sx={{px: {xs: 1, sm: 2}, py: 0.75}}>
                                    <Typography
                                        variant={'body2'}
                                        fontWeight={600}
                                        sx={{minWidth: 80}}>
                                        {summary.materialTypeName}
                                    </Typography>
                                    <Typography variant={'body2'} color={'text.secondary'}>
                                        {t('material.requests.summaryShort', {
                                            confirmed: summary.confirmedCount,
                                            planned: summary.plannedCount,
                                            requested: summary.requestedCount,
                                            waitlisted: summary.waitlistedCount,
                                        })}
                                    </Typography>
                                </Stack>
                            ))}
                        </Stack>
                    </Paper>
                )}
            </Box>

            <MaterialDecisionDialog
                open={dialogRequest != null}
                eventId={eventId}
                providerId={providerId}
                requestId={dialogRequest?.id ?? null}
                status={dialogRequest?.status ?? 'DECLINED'}
                onClose={() => setDialogRequest(null)}
                onDecided={() => {
                    setDialogRequest(null)
                    reload()
                }}
            />
        </Stack>
    )
}

type RowProps = {
    request: MaterialOverviewRequestDto
    highlighted: boolean
    selectable: boolean
    selected: boolean
    onToggleSelected: () => void
    busy: boolean
    onDecision: (decision: RequestDecision) => void
}

const DECISION_LABEL_KEYS = {
    CONFIRMED: 'material.requests.actions.confirm',
    WAITLISTED: 'material.requests.actions.waitlist',
    DECLINED: 'material.requests.actions.decline',
} as const satisfies Record<RequestDecision, string>

const RequestRow = ({
    request,
    highlighted,
    selectable,
    selected,
    onToggleSelected,
    busy,
    onDecision,
}: RowProps) => {
    const {t} = useTranslation()
    const plan = requestActionPlan(request.status)
    const primary = plan.primary
    const look = REQUEST_STATUS_CHIP[request.status]
    const team = [request.teamNumber != null ? `#${request.teamNumber}` : null, request.teamName]
        .filter(Boolean)
        .join(' ')

    return (
        <Stack
            direction={'row'}
            alignItems={'flex-start'}
            gap={1}
            sx={{px: {xs: 1, sm: 2}, py: 1.25}}>
            {selectable && (
                <Checkbox
                    checked={selected}
                    onChange={onToggleSelected}
                    sx={{mt: -0.5, ml: -0.5}}
                    inputProps={{
                        'aria-label': t('material.requests.selectForBulk', {
                            club: request.clubName,
                        }),
                    }}
                />
            )}
            <Box sx={{flex: 1, minWidth: 0}}>
                <Typography variant={'body1'} fontWeight={600} sx={{overflowWrap: 'anywhere'}}>
                    {request.clubName}
                    {team && (
                        <Typography component={'span'} color={'text.secondary'}>
                            {' · '}
                            {team}
                        </Typography>
                    )}
                </Typography>
                <Typography
                    variant={'body2'}
                    color={'text.secondary'}
                    sx={{overflowWrap: 'anywhere'}}>
                    {request.competitionIdentifier} {request.competitionName} ·{' '}
                    {request.count > 1 ? `${request.count} × ` : ''}
                    {request.materialTypeName} ·{' '}
                    {format(new Date(request.requestedAt), t('format.datetime'))}
                </Typography>
                {request.decisionNote && (
                    <Typography variant={'body2'} sx={{fontStyle: 'italic', mt: 0.25}}>
                        {request.decisionNote}
                    </Typography>
                )}
                <Stack direction={'row'} gap={0.5} flexWrap={'wrap'} sx={{mt: 0.5}}>
                    <Chip
                        size={'small'}
                        color={look.color}
                        variant={look.variant}
                        label={t(`material.requestStatus.${request.status}`)}
                    />
                    {highlighted && (
                        <Chip
                            size={'small'}
                            variant={'outlined'}
                            color={'primary'}
                            label={t('material.requests.nextInLine')}
                        />
                    )}
                </Stack>
            </Box>
            <Stack direction={'row'} alignItems={'center'} gap={0.5} sx={{flexShrink: 0}}>
                {primary && (
                    <Button
                        variant={'contained'}
                        size={'small'}
                        disabled={busy}
                        onClick={() => onDecision(primary)}
                        sx={{cursor: 'pointer', minHeight: 36}}>
                        {t(DECISION_LABEL_KEYS[primary])}
                    </Button>
                )}
                <ExecutionMoreMenu
                    label={t('material.requests.moreActions')}
                    disabled={busy}
                    items={plan.more.map(decision => ({
                        id: decision,
                        label: t(DECISION_LABEL_KEYS[decision]),
                        onSelect: () => onDecision(decision),
                        destructive: decision === 'DECLINED',
                    }))}
                />
            </Stack>
        </Stack>
    )
}

export default MaterialRequestsPanel
