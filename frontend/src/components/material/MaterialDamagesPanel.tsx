import {useRef, useState} from 'react'
import {
    Box,
    Button,
    Card,
    Chip,
    FormControl,
    IconButton,
    InputLabel,
    Link,
    MenuItem,
    Select,
    Stack,
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
import RefreshIcon from '@mui/icons-material/Refresh'
import DownloadIcon from '@mui/icons-material/Download'
import AddIcon from '@mui/icons-material/Add'
import {useTranslation} from 'react-i18next'
import {getMaterialDamages, getMaterialDamagesCsv} from '@api/sdk.gen.ts'
import {MaterialDamageDto, MaterialDamageStatus} from '@api/types.gen.ts'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import {getFilename} from '@utils/helpers.ts'
import {useMaterialOverview} from '@components/material/useMaterialOverview.ts'
import MaterialDamageDialog, {SavedDamageInfo} from '@components/material/MaterialDamageDialog.tsx'
import MaterialOutageImpactDialog from '@components/material/MaterialOutageImpactDialog.tsx'
import Throbber from '@components/Throbber.tsx'

type Props = {
    eventId: string
    providerId: string
}

const STATUS_OPTIONS: MaterialDamageStatus[] = ['REPORTED', 'REPAIRED']

const SEVERITY_CHIP_COLOR: Record<string, 'default' | 'warning' | 'error'> = {
    MINOR: 'default',
    MAJOR: 'warning',
    TOTAL: 'error',
    OUTAGE_ONLY: 'warning',
}

const causerOf = (damage: MaterialDamageDto): string =>
    damage.causedByRegistration == null
        ? '–'
        : [damage.causedByTeam, damage.causedByClub, damage.causedByCompetition].filter(Boolean).join(' · ')

/**
 * Reiter "Schäden": Schadensakte der Veranstaltung, Melden per Dialog, CSV-Export. Lädt zwei
 * Dinge unabhängig - die Schadensliste selbst (limit 200, dieselbe Veranstaltung reicht
 * praktisch immer) und die Anbieter-Übersicht (Angebote/Anfragen/Läufe), die der Dialog für
 * den Verursacher-Vorschlag und der Ausfall-Dialog für die Ersatzwahl braucht.
 */
const MaterialDamagesPanel = ({eventId, providerId}: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const {overview, reload: reloadOverview} = useMaterialOverview({eventId, providerId})

    const {
        data: damages,
        pending,
        reload: reloadDamages,
    } = useFetch(
        signal => getMaterialDamages({signal, path: {providerId}, query: {eventId, limit: 200}}),
        {
            onResponse: ({error}) => {
                if (error) {
                    feedback.error(
                        t('common.load.error.multiple.short', {entity: t('material.damage.damages')}),
                    )
                }
            },
            deps: [eventId, providerId],
        },
    )

    const reload = () => {
        reloadDamages()
        reloadOverview()
    }

    const [statusFilter, setStatusFilter] = useState<MaterialDamageStatus | 'ALL'>('ALL')
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editDamage, setEditDamage] = useState<MaterialDamageDto | null>(null)
    const [impact, setImpact] = useState<{
        item: NonNullable<typeof overview>['items'][number]
        from: string
        until?: string
    } | null>(null)
    const [csvLoading, setCsvLoading] = useState(false)
    const downloadRef = useRef<HTMLAnchorElement>(null)

    const rows = (damages?.data ?? []).filter(d => statusFilter === 'ALL' || d.status === statusFilter)

    const openCreate = () => {
        setEditDamage(null)
        setDialogOpen(true)
    }

    const openEdit = (damage: MaterialDamageDto) => {
        setEditDamage(damage)
        setDialogOpen(true)
    }

    const handleSaved = ({itemId, outOfServiceFrom, outOfServiceUntil}: SavedDamageInfo) => {
        if (outOfServiceFrom == null) {
            return
        }
        const item = overview?.items.find(i => i.id === itemId)
        if (item != null) {
            setImpact({item, from: outOfServiceFrom, until: outOfServiceUntil})
        }
    }

    const handleDownloadCsv = async () => {
        setCsvLoading(true)
        const {data, error, response} = await getMaterialDamagesCsv({path: {eventId, providerId}})
        setCsvLoading(false)
        const anchor = downloadRef.current
        if (error) {
            feedback.error(t('common.error.unexpected'))
        } else if (data !== undefined && anchor) {
            anchor.href = URL.createObjectURL(data)
            anchor.download = getFilename(response) ?? `Schaeden-${eventId}.csv`
            anchor.click()
            anchor.href = ''
            anchor.download = ''
        }
    }

    return (
        <Stack spacing={2}>
            <Link ref={downloadRef} display={'none'}></Link>
            <Stack direction={'row'} spacing={2} alignItems={'center'} flexWrap={'wrap'} useFlexGap>
                <FormControl size={'small'} sx={{minWidth: 160}}>
                    <InputLabel id={'material-damage-status-filter'}>
                        {t('material.requests.filterStatus')}
                    </InputLabel>
                    <Select
                        labelId={'material-damage-status-filter'}
                        label={t('material.requests.filterStatus')}
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value as MaterialDamageStatus | 'ALL')}>
                        <MenuItem value={'ALL'}>{t('material.requests.filterAll')}</MenuItem>
                        {STATUS_OPTIONS.map(status => (
                            <MenuItem key={status} value={status}>
                                {t(`material.damageStatus.${status}`)}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
                <Box sx={{flexGrow: 1}} />
                <Tooltip title={t('material.requests.reload')}>
                    <IconButton onClick={reload} disabled={pending}>
                        <RefreshIcon />
                    </IconButton>
                </Tooltip>
                <Button
                    variant={'outlined'}
                    startIcon={<DownloadIcon />}
                    disabled={csvLoading}
                    onClick={() => void handleDownloadCsv()}>
                    {t('material.damage.csv')}
                </Button>
                <Button variant={'contained'} startIcon={<AddIcon />} onClick={openCreate}>
                    {t('material.damage.report')}
                </Button>
            </Stack>

            {pending && !damages ? (
                <Throbber />
            ) : rows.length === 0 ? (
                <Typography color={'text.secondary'}>{t('material.damage.none')}</Typography>
            ) : (
                <TableContainer component={Card}>
                    <Table size={'small'}>
                        <TableHead>
                            <TableRow>
                                <TableCell>{t('material.damage.columns.item')}</TableCell>
                                <TableCell>{t('material.damage.columns.type')}</TableCell>
                                <TableCell>{t('material.damage.columns.reportedAt')}</TableCell>
                                <TableCell>{t('material.damage.columns.severity')}</TableCell>
                                <TableCell>{t('material.damage.columns.status')}</TableCell>
                                <TableCell>{t('material.damage.columns.causedBy')}</TableCell>
                                <TableCell align={'right'}>{t('material.damage.columns.photos')}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {rows.map(damage => (
                                <TableRow
                                    key={damage.id}
                                    hover
                                    onClick={() => openEdit(damage)}
                                    sx={{cursor: 'pointer'}}>
                                    <TableCell>
                                        {damage.itemNumber != null
                                            ? `${damage.itemLabel} #${damage.itemNumber}`
                                            : damage.itemLabel}
                                    </TableCell>
                                    <TableCell>{damage.materialTypeName}</TableCell>
                                    <TableCell>
                                        {format(new Date(damage.reportedAt), 'dd.MM.yyyy HH:mm')}
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            size={'small'}
                                            color={SEVERITY_CHIP_COLOR[damage.severity]}
                                            label={t(`material.severity.${damage.severity}`)}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            size={'small'}
                                            color={damage.status === 'REPAIRED' ? 'success' : 'default'}
                                            label={t(`material.damageStatus.${damage.status}`)}
                                        />
                                    </TableCell>
                                    <TableCell>{causerOf(damage)}</TableCell>
                                    <TableCell align={'right'}>{damage.photos.length}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            <MaterialDamageDialog
                open={dialogOpen}
                providerId={providerId}
                damage={editDamage}
                overview={overview ?? undefined}
                onClose={() => setDialogOpen(false)}
                onSaved={handleSaved}
                reload={reload}
            />
            {overview && (
                <MaterialOutageImpactDialog
                    open={impact != null}
                    eventId={eventId}
                    providerId={providerId}
                    item={impact?.item ?? null}
                    from={impact?.from ?? null}
                    until={impact?.until}
                    overview={overview}
                    onClose={() => setImpact(null)}
                    reload={reload}
                />
            )}
        </Stack>
    )
}

export default MaterialDamagesPanel
