import {useEffect, useState} from 'react'
import {
    Box,
    Button,
    Card,
    Checkbox,
    Chip,
    FormControl,
    FormControlLabel,
    IconButton,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tooltip,
    Typography,
} from '@mui/material'
import {format} from 'date-fns'
import CheckIcon from '@mui/icons-material/Check'
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty'
import CloseIcon from '@mui/icons-material/Close'
import RefreshIcon from '@mui/icons-material/Refresh'
import {useTranslation} from 'react-i18next'
import {MaterialOverviewRequestDto, MaterialRequestStatus} from '@api/types.gen.ts'
import {decideMaterialRequest} from '@api/sdk.gen.ts'
import {useFeedback} from '@utils/hooks.ts'
import {useMaterialOverview} from '@components/material/useMaterialOverview.ts'
import {offerSummaries} from '@components/material/offerSummary.ts'
import MaterialDecisionDialog from '@components/material/MaterialDecisionDialog.tsx'
import Throbber from '@components/Throbber.tsx'

type Props = {
    eventId: string
    providerId: string
}

const STATUS_OPTIONS: MaterialRequestStatus[] = [
    'REQUESTED',
    'CONFIRMED',
    'WAITLISTED',
    'DECLINED',
    'WITHDRAWN',
]

const STATUS_CHIP_COLOR: Record<
    MaterialRequestStatus,
    'default' | 'success' | 'warning' | 'error'
> = {
    REQUESTED: 'default',
    CONFIRMED: 'success',
    WAITLISTED: 'warning',
    DECLINED: 'error',
    WITHDRAWN: 'default',
}

/**
 * Reiter "Anfragen": Angebots-Kopfzeile mit Ampel-Summen, Filter über Status/Materialart, eine
 * Tabelle mit Einzel- und Mehrfachbestätigung. Warteliste/Ablehnung laufen über einen kleinen
 * Notiz-Dialog, Bestätigen direkt - eine Begründung ist dort nicht vorgesehen.
 */
const MaterialRequestsPanel = ({eventId, providerId}: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const {overview, pending, reload} = useMaterialOverview({eventId, providerId})

    const [showWithdrawn, setShowWithdrawn] = useState(false)
    const [statusFilter, setStatusFilter] = useState<MaterialRequestStatus | 'ALL'>('ALL')
    const [typeFilter, setTypeFilter] = useState<string>('ALL')
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [confirming, setConfirming] = useState(false)
    const [rowSubmitting, setRowSubmitting] = useState<string | null>(null)
    const [dialogRequest, setDialogRequest] = useState<{
        id: string
        status: 'WAITLISTED' | 'DECLINED'
    } | null>(null)

    const requests = overview?.requests ?? []
    const offers = overview?.offers ?? []

    const visible = requests
        .filter(r => showWithdrawn || r.status !== 'WITHDRAWN')
        .filter(r => statusFilter === 'ALL' || r.status === statusFilter)
        .filter(r => typeFilter === 'ALL' || r.materialType === typeFilter)
        .sort((a, b) => new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime())

    const openIds = visible.filter(r => r.status === 'REQUESTED').map(r => r.id)

    // Die Auswahl folgt standardmäßig allen sichtbaren offenen Anfragen - "alle offenen
    // bestätigen" trifft damit ohne Zutun genau die aktuell angezeigten REQUESTED-Zeilen,
    // einzelne lassen sich vor dem Klick abwählen.
    useEffect(() => {
        setSelected(new Set(openIds))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openIds.join(',')])

    const typeOptions = Array.from(
        new Map(offers.map(o => [o.materialType, o.materialTypeName])).entries(),
    )

    const summaries = offerSummaries(offers, requests)
    const highlightedRequestIds = new Set(
        summaries.map(s => s.highlightRequestId).filter((id): id is string => id != null),
    )

    const allSelected = openIds.length > 0 && openIds.every(id => selected.has(id))
    const someSelected = openIds.some(id => selected.has(id))

    const toggleAll = () => {
        setSelected(allSelected ? new Set() : new Set(openIds))
    }

    const toggleOne = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }

    const handleConfirm = async (requestId: string) => {
        setRowSubmitting(requestId)
        const {error} = await decideMaterialRequest({
            path: {eventId, providerId, requestId},
            body: {status: 'CONFIRMED'},
        })
        setRowSubmitting(null)
        if (error) {
            feedback.error(t('material.decision.error'))
        } else {
            feedback.success(t('material.decision.success'))
            reload()
        }
    }

    const handleConfirmAllOpen = async () => {
        const ids = openIds.filter(id => selected.has(id))
        if (ids.length === 0) {
            return
        }
        setConfirming(true)
        let failures = 0
        for (const requestId of ids) {
            const {error} = await decideMaterialRequest({
                path: {eventId, providerId, requestId},
                body: {status: 'CONFIRMED'},
            })
            if (error) {
                failures++
            }
        }
        setConfirming(false)
        if (failures > 0) {
            feedback.error(t('material.requests.confirmAllError', {count: failures}))
        } else {
            feedback.success(t('material.requests.confirmAllSuccess', {count: ids.length}))
        }
        reload()
    }

    return (
        <Stack spacing={2}>
            <Card sx={{p: 2}}>
                {summaries.length === 0 ? (
                    <Typography color={'text.secondary'}>
                        {t('material.requests.noOffers')}
                    </Typography>
                ) : (
                    <Stack spacing={0.5}>
                        {summaries.map(summary => (
                            <Typography key={summary.offerId} variant={'body2'}>
                                {t('material.requests.summaryLine', {
                                    type: summary.materialTypeName,
                                    confirmed: summary.confirmedCount,
                                    requested: summary.requestedCount,
                                    waitlisted: summary.waitlistedCount,
                                    planned: summary.plannedCount,
                                })}
                            </Typography>
                        ))}
                    </Stack>
                )}
            </Card>

            <Stack direction={'row'} spacing={2} alignItems={'center'} flexWrap={'wrap'} useFlexGap>
                <FormControl size={'small'} sx={{minWidth: 180}}>
                    <InputLabel id={'material-requests-status-filter'}>
                        {t('material.requests.filterStatus')}
                    </InputLabel>
                    <Select
                        labelId={'material-requests-status-filter'}
                        label={t('material.requests.filterStatus')}
                        value={statusFilter}
                        onChange={e =>
                            setStatusFilter(e.target.value as MaterialRequestStatus | 'ALL')
                        }>
                        <MenuItem value={'ALL'}>{t('material.requests.filterAll')}</MenuItem>
                        {STATUS_OPTIONS.map(status => (
                            <MenuItem key={status} value={status}>
                                {t(`material.requestStatus.${status}`)}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
                <FormControl size={'small'} sx={{minWidth: 180}}>
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
                <FormControlLabel
                    control={
                        <Switch checked={showWithdrawn} onChange={(_, v) => setShowWithdrawn(v)} />
                    }
                    label={t('material.requests.showWithdrawn')}
                />
                <Box sx={{flexGrow: 1}} />
                <Tooltip title={t('material.requests.reload')}>
                    <IconButton onClick={reload} disabled={pending}>
                        <RefreshIcon />
                    </IconButton>
                </Tooltip>
                <Button
                    variant={'contained'}
                    disabled={!someSelected || confirming}
                    onClick={() => void handleConfirmAllOpen()}>
                    {t('material.requests.confirmAllOpen')}
                </Button>
            </Stack>

            {pending && !overview ? (
                <Throbber />
            ) : visible.length === 0 ? (
                <Typography color={'text.secondary'}>{t('material.requests.none')}</Typography>
            ) : (
                <TableContainer component={Card}>
                    <Table size={'small'}>
                        <TableHead>
                            <TableRow>
                                <TableCell padding={'checkbox'}>
                                    <Checkbox
                                        indeterminate={someSelected && !allSelected}
                                        checked={allSelected}
                                        disabled={openIds.length === 0}
                                        onChange={toggleAll}
                                    />
                                </TableCell>
                                <TableCell>{t('material.requests.columns.competition')}</TableCell>
                                <TableCell>{t('material.requests.columns.team')}</TableCell>
                                <TableCell>{t('material.requests.columns.club')}</TableCell>
                                <TableCell>{t('material.requests.columns.type')}</TableCell>
                                <TableCell align={'right'}>
                                    {t('material.requests.columns.count')}
                                </TableCell>
                                <TableCell>{t('material.requests.columns.status')}</TableCell>
                                <TableCell>{t('material.requests.columns.requestedAt')}</TableCell>
                                <TableCell align={'right'}>
                                    {t('material.requests.columns.actions')}
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {visible.map(request => (
                                <RequestRow
                                    key={request.id}
                                    request={request}
                                    highlighted={highlightedRequestIds.has(request.id)}
                                    selected={selected.has(request.id)}
                                    onToggleSelected={() => toggleOne(request.id)}
                                    submitting={rowSubmitting === request.id}
                                    onConfirm={() => void handleConfirm(request.id)}
                                    onWaitlist={() =>
                                        setDialogRequest({id: request.id, status: 'WAITLISTED'})
                                    }
                                    onDecline={() =>
                                        setDialogRequest({id: request.id, status: 'DECLINED'})
                                    }
                                />
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

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
    selected: boolean
    onToggleSelected: () => void
    submitting: boolean
    onConfirm: () => void
    onWaitlist: () => void
    onDecline: () => void
}

const RequestRow = ({
    request,
    highlighted,
    selected,
    onToggleSelected,
    submitting,
    onConfirm,
    onWaitlist,
    onDecline,
}: RowProps) => {
    const {t} = useTranslation()

    return (
        <TableRow sx={highlighted ? {backgroundColor: 'warning.light'} : undefined}>
            <TableCell padding={'checkbox'}>
                {request.status === 'REQUESTED' && (
                    <Checkbox checked={selected} onChange={onToggleSelected} />
                )}
            </TableCell>
            <TableCell>
                {request.competitionIdentifier} {request.competitionName}
            </TableCell>
            <TableCell>{request.teamName ?? '–'}</TableCell>
            <TableCell>{request.clubName}</TableCell>
            <TableCell>{request.materialTypeName}</TableCell>
            <TableCell align={'right'}>{request.count}</TableCell>
            <TableCell>
                <Chip
                    size={'small'}
                    color={STATUS_CHIP_COLOR[request.status]}
                    label={t(`material.requestStatus.${request.status}`)}
                />
            </TableCell>
            <TableCell>{format(new Date(request.requestedAt), t('format.datetime'))}</TableCell>
            <TableCell align={'right'}>
                {request.status !== 'WITHDRAWN' && (
                    <Stack direction={'row'} spacing={0.5} justifyContent={'flex-end'}>
                        <Tooltip title={t('material.requests.actions.confirm')}>
                            <span>
                                <IconButton
                                    size={'small'}
                                    color={'success'}
                                    disabled={submitting || request.status === 'CONFIRMED'}
                                    onClick={onConfirm}>
                                    <CheckIcon fontSize={'small'} />
                                </IconButton>
                            </span>
                        </Tooltip>
                        <Tooltip title={t('material.requests.actions.waitlist')}>
                            <span>
                                <IconButton
                                    size={'small'}
                                    color={'warning'}
                                    disabled={submitting || request.status === 'WAITLISTED'}
                                    onClick={onWaitlist}>
                                    <HourglassEmptyIcon fontSize={'small'} />
                                </IconButton>
                            </span>
                        </Tooltip>
                        <Tooltip title={t('material.requests.actions.decline')}>
                            <span>
                                <IconButton
                                    size={'small'}
                                    color={'error'}
                                    disabled={submitting || request.status === 'DECLINED'}
                                    onClick={onDecline}>
                                    <CloseIcon fontSize={'small'} />
                                </IconButton>
                            </span>
                        </Tooltip>
                    </Stack>
                )}
            </TableCell>
        </TableRow>
    )
}

export default MaterialRequestsPanel
