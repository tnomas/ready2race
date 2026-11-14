import {useState} from 'react'
import {Box, Button, Chip, Divider, ListItemButton, Paper, Stack, Typography} from '@mui/material'
import {format} from 'date-fns'
import AddIcon from '@mui/icons-material/Add'
import BuildOutlined from '@mui/icons-material/BuildOutlined'
import PhotoCameraOutlined from '@mui/icons-material/PhotoCameraOutlined'
import {useTranslation} from 'react-i18next'
import {getMaterialDamages, getMaterialDamagesCsv} from '@api/sdk.gen.ts'
import {
    MaterialDamageDto,
    MaterialDamageSeverity,
    MaterialOverviewDto,
    MaterialOverviewItemDto,
} from '@api/types.gen.ts'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import {runDownload} from '@utils/download.ts'
import {isRequestNetworkError} from '@utils/request.ts'
import {EmptyState, ErrorState, LoadingState} from '@components/ui'
import {
    DAMAGE_FILTERS,
    damageFilterCounts,
    DamageFilter,
    DEFAULT_DAMAGE_FILTER,
    itemLabel,
    matchesDamageFilter,
    sortDamagesForWork,
} from '@components/material/materialWorkplace.ts'
import MaterialDamageDialog, {SavedDamageInfo} from '@components/material/MaterialDamageDialog.tsx'
import MaterialOutageImpactDialog from '@components/material/MaterialOutageImpactDialog.tsx'
import ExecutionMoreMenu from '@components/event/competition/excecution/ExecutionMoreMenu.tsx'
import {needsOutageImpact} from '@components/material/damageLogic.ts'

type Props = {
    eventId: string
    providerId: string
    overview: MaterialOverviewDto
    /** Lädt die Übersicht gerade? Die Ersatzwahl wartet nach jeder Übernahme auf den neuen Stand. */
    pending: boolean
    /** Ohne Schreibrecht: keine Meldung, keine Bearbeitung, nur Liste und Export. */
    canWrite: boolean
    reloadOverview: () => void
}

/**
 * Schwere als Etikett: Totalschaden ist ein Alarm (rot), schwerer Schaden eine Warnung, alles
 * andere ruhig grau – ein bloßer Ausfall oder Kratzer ist am Steg Alltag.
 */
const SEVERITY_CHIP_COLOR: Record<MaterialDamageSeverity, 'default' | 'warning' | 'error'> = {
    MINOR: 'default',
    MAJOR: 'warning',
    TOTAL: 'error',
    OUTAGE_ONLY: 'default',
}

const FILTER_LABEL_KEYS = {
    OPEN: 'material.damage.filter.OPEN',
    REPAIRED: 'material.damage.filter.REPAIRED',
    ALL: 'material.damage.filter.ALL',
} as const satisfies Record<DamageFilter, string>

const causerOf = (damage: MaterialDamageDto): string | null =>
    damage.causedByRegistration == null
        ? null
        : [damage.causedByTeam, damage.causedByClub, damage.causedByCompetition]
              .filter(Boolean)
              .join(' · ')

/**
 * Reiter „Schäden": „Schaden melden" als Primäraktion oben, offene Schäden vorbelegt, je Schaden
 * eine antippbare Zeile (öffnet Bearbeiten), CSV-Export im ⋮-Menü. Mit Ausfallfenster folgt nach
 * dem Speichern die Ersatzwahl je betroffenem Lauf.
 */
const MaterialDamagesPanel = ({
    eventId,
    providerId,
    overview,
    pending: overviewPending,
    canWrite,
    reloadOverview,
}: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const {
        data: damages,
        pending,
        error,
        reload: reloadDamages,
    } = useFetch(
        signal => getMaterialDamages({signal, path: {providerId}, query: {eventId, limit: 200}}),
        {deps: [eventId, providerId]},
    )

    const reload = () => {
        reloadDamages()
        reloadOverview()
    }

    const [filter, setFilter] = useState<DamageFilter>(DEFAULT_DAMAGE_FILTER)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editDamage, setEditDamage] = useState<MaterialDamageDto | null>(null)
    const [impact, setImpact] = useState<{
        item: MaterialOverviewItemDto
        from: string
        until?: string
    } | null>(null)
    const [csvBusy, setCsvBusy] = useState(false)

    const all = damages?.data ?? []
    const counts = damageFilterCounts(all)
    const rows = sortDamagesForWork(all.filter(d => matchesDamageFilter(d, filter)))

    const openCreate = () => {
        setEditDamage(null)
        setDialogOpen(true)
    }

    const openEdit = (damage: MaterialDamageDto) => {
        setEditDamage(damage)
        setDialogOpen(true)
    }

    const handleSaved = (info: SavedDamageInfo) => {
        const {itemId, outOfServiceFrom, outOfServiceUntil} = info
        if (!needsOutageImpact(info) || outOfServiceFrom == null) {
            return
        }
        const item = overview.items.find(i => i.id === itemId)
        if (item != null) {
            setImpact({item, from: outOfServiceFrom, until: outOfServiceUntil})
        }
    }

    const handleDownloadCsv = async () => {
        if (csvBusy) return
        const {downloaded, error} = await runDownload(
            setCsvBusy,
            () => getMaterialDamagesCsv({path: {eventId, providerId}}),
            `Schaeden-${eventId}.csv`,
        )
        if (isRequestNetworkError(error)) {
            feedback.error(t('common.error.network'))
        } else if (error || !downloaded) {
            feedback.error(t('common.error.unexpected'))
        }
    }

    return (
        <Stack spacing={2}>
            <Stack direction={'row'} gap={1} alignItems={'center'} flexWrap={'wrap'}>
                {canWrite && (
                    <Button
                        variant={'contained'}
                        startIcon={<AddIcon />}
                        onClick={openCreate}
                        sx={{cursor: 'pointer'}}>
                        {t('material.damage.report')}
                    </Button>
                )}
                <Box sx={{flexGrow: 1}} />
                <ExecutionMoreMenu
                    label={t('material.damage.moreActions')}
                    disabled={csvBusy}
                    items={[
                        {
                            id: 'csv',
                            label: t('material.damage.csv'),
                            onSelect: () => void handleDownloadCsv(),
                        },
                    ]}
                />
            </Stack>
            <Stack direction={'row'} gap={1} flexWrap={'wrap'}>
                {DAMAGE_FILTERS.map(f => (
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
            </Stack>

            <Typography variant={'body2'} color={'text.secondary'}>
                {t('material.damage.scopeHint')}
            </Typography>
            {error && !damages ? (
                <ErrorState
                    message={t('common.load.error.multiple.short', {
                        entity: t('material.damage.damages'),
                    })}
                    onRetry={reloadDamages}
                />
            ) : pending && !damages ? (
                <LoadingState variant={'section'} />
            ) : rows.length === 0 ? (
                <EmptyState
                    dense
                    icon={<BuildOutlined />}
                    title={
                        filter === 'OPEN'
                            ? t('material.damage.noneOpen')
                            : t('material.damage.none')
                    }
                />
            ) : (
                <Paper variant={'outlined'}>
                    <Stack divider={<Divider flexItem />}>
                        {rows.map(damage => {
                            const causer = causerOf(damage)
                            return (
                                <ListItemButton
                                    key={damage.id}
                                    onClick={canWrite ? () => openEdit(damage) : undefined}
                                    disableRipple={!canWrite}
                                    aria-label={
                                        canWrite
                                            ? t('material.damage.editItem', {
                                                  item: itemLabel({
                                                      label: damage.itemLabel,
                                                      number: damage.itemNumber,
                                                  }),
                                              })
                                            : undefined
                                    }
                                    sx={{
                                        cursor: canWrite ? 'pointer' : 'default',
                                        px: {xs: 1, sm: 2},
                                        py: 1.25,
                                        display: 'block',
                                    }}>
                                    <Typography
                                        variant={'body1'}
                                        fontWeight={600}
                                        sx={{overflowWrap: 'anywhere'}}>
                                        {itemLabel({
                                            label: damage.itemLabel,
                                            number: damage.itemNumber,
                                        })}
                                        <Typography component={'span'} color={'text.secondary'}>
                                            {' · '}
                                            {damage.materialTypeName}
                                        </Typography>
                                    </Typography>
                                    <Typography
                                        variant={'body2'}
                                        color={'text.secondary'}
                                        sx={{overflowWrap: 'anywhere'}}>
                                        {format(new Date(damage.reportedAt), t('format.datetime'))}
                                        {' · '}
                                        {damage.description}
                                    </Typography>
                                    <Stack
                                        direction={'row'}
                                        gap={0.5}
                                        flexWrap={'wrap'}
                                        alignItems={'center'}
                                        sx={{mt: 0.5}}>
                                        <Chip
                                            size={'small'}
                                            color={SEVERITY_CHIP_COLOR[damage.severity]}
                                            label={t(`material.severity.${damage.severity}`)}
                                        />
                                        <Chip
                                            size={'small'}
                                            variant={'outlined'}
                                            color={
                                                damage.status === 'REPAIRED' ? 'success' : 'default'
                                            }
                                            label={t(`material.damageStatus.${damage.status}`)}
                                        />
                                        {damage.outOfServiceFrom &&
                                            damage.status !== 'REPAIRED' && (
                                                <Chip
                                                    size={'small'}
                                                    variant={'outlined'}
                                                    label={
                                                        damage.outOfServiceUntil
                                                            ? t(
                                                                  'material.damage.outOfServiceRange',
                                                                  {
                                                                      from: format(
                                                                          new Date(
                                                                              damage.outOfServiceFrom,
                                                                          ),
                                                                          t('format.datetime'),
                                                                      ),
                                                                      until: format(
                                                                          new Date(
                                                                              damage.outOfServiceUntil,
                                                                          ),
                                                                          t('format.datetime'),
                                                                      ),
                                                                  },
                                                              )
                                                            : t(
                                                                  'material.damage.outOfServiceOpen',
                                                                  {
                                                                      from: format(
                                                                          new Date(
                                                                              damage.outOfServiceFrom,
                                                                          ),
                                                                          t('format.datetime'),
                                                                      ),
                                                                  },
                                                              )
                                                    }
                                                />
                                            )}
                                        {damage.photos.length > 0 && (
                                            <Chip
                                                size={'small'}
                                                variant={'outlined'}
                                                icon={<PhotoCameraOutlined />}
                                                label={damage.photos.length}
                                            />
                                        )}
                                        {causer && (
                                            <Typography
                                                variant={'caption'}
                                                color={'text.secondary'}>
                                                {t('material.damage.causedBy')}: {causer}
                                            </Typography>
                                        )}
                                    </Stack>
                                </ListItemButton>
                            )
                        })}
                    </Stack>
                </Paper>
            )}

            <MaterialDamageDialog
                open={dialogOpen}
                providerId={providerId}
                damage={editDamage}
                overview={overview}
                onClose={() => setDialogOpen(false)}
                onSaved={handleSaved}
                reload={reload}
            />
            <MaterialOutageImpactDialog
                open={impact != null}
                eventId={eventId}
                providerId={providerId}
                item={impact?.item ?? null}
                from={impact?.from ?? null}
                until={impact?.until}
                overview={overview}
                pending={overviewPending}
                onClose={() => setImpact(null)}
                reload={reload}
            />
        </Stack>
    )
}

export default MaterialDamagesPanel
