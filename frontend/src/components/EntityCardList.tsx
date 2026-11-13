import {Box, Card, CardContent, LinearProgress, Skeleton, Stack, TablePagination} from '@mui/material'
import {GridPaginationModel, GridValidRowModel, GridActionsCellItemProps} from '@mui/x-data-grid'
import EntityCard, {EntityCardColumn} from './EntityCard'
import React, {ReactElement, ReactNode} from 'react'
import {useTranslation} from 'react-i18next'
import {EntityAction} from '@utils/types.ts'
import {EmptyState} from '@components/ui'

type EntityCardListProps<Entity extends GridValidRowModel> = {
    data: Entity[]
    columns: EntityCardColumn<Entity>[]
    getActions: (entity: Entity) => EntityAction[]
    onRowClick?: (entity: Entity) => void
    loading?: boolean
    rowCount: number
    paginationModel: GridPaginationModel
    onPaginationModelChange: (model: GridPaginationModel) => void
    pageSizeOptions: (number | {value: number; label: string})[]
    /** Einfacher Leertext; `emptyState` hat Vorrang. */
    emptyMessage?: string
    /** Vollständiger Leerzustand (Satz plus Aktion), z. B. aus `EntityTable`. */
    emptyState?: ReactNode
}

const SKELETON_CARDS = 3

const CardSkeleton = () => (
    <Card aria-hidden>
        <CardContent>
            <Skeleton variant={'text'} width={'55%'} height={28} />
            <Box sx={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mt: 1}}>
                {[0, 1, 2, 3].map(i => (
                    <Box key={i}>
                        <Skeleton variant={'text'} width={'40%'} height={16} />
                        <Skeleton variant={'text'} width={'75%'} />
                    </Box>
                ))}
            </Box>
        </CardContent>
    </Card>
)

const EntityCardList = <Entity extends GridValidRowModel>({
    data,
    columns,
    getActions,
    onRowClick,
    loading = false,
    rowCount,
    paginationModel,
    onPaginationModelChange,
    pageSizeOptions,
    emptyMessage,
    emptyState,
}: EntityCardListProps<Entity>) => {
    const {t} = useTranslation()

    const handlePageChange = (_: unknown, newPage: number) => {
        onPaginationModelChange({
            ...paginationModel,
            page: newPage,
        })
    }

    const handlePageSizeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        onPaginationModelChange({
            page: 0,
            pageSize: parseInt(event.target.value, 10),
        })
    }

    const hasData = data && data.length > 0

    // Beim Nachladen bleiben Karten und Blätterleiste stehen (abgeblendet), damit die Seite nicht
    // springt und ein zweiter Klick auf „weiter" nicht ins Leere geht. Nur der erste Abruf zeigt
    // Platzhalterkarten.
    let body: ReactNode
    if (!hasData && loading) {
        body = (
            <Stack spacing={2}>
                {Array.from({length: SKELETON_CARDS}, (_, i) => (
                    <CardSkeleton key={i} />
                ))}
            </Stack>
        )
    } else if (!hasData) {
        body = emptyState ?? <EmptyState dense title={emptyMessage ?? t('common.noResults')} />
    } else {
        body = (
            <Stack
                spacing={2}
                sx={{opacity: loading ? 0.5 : 1, transition: 'opacity 150ms'}}
                aria-busy={loading}>
                {data.map(entity => {
                    const actions = getActions(entity).filter(
                        (action): action is ReactElement<GridActionsCellItemProps> => !!action,
                    )
                    return (
                        <EntityCard
                            key={entity.id}
                            entity={entity}
                            columns={columns}
                            actions={actions}
                            onRowClick={onRowClick ? () => onRowClick(entity) : undefined}
                        />
                    )
                })}
            </Stack>
        )
    }

    return (
        <Box>
            <Box sx={{height: 4, mb: 1}}>{loading && hasData && <LinearProgress />}</Box>
            {body}
            {(hasData || rowCount > 0) && (
                <TablePagination
                    component="div"
                    count={rowCount}
                    page={paginationModel.page}
                    onPageChange={handlePageChange}
                    rowsPerPage={paginationModel.pageSize}
                    onRowsPerPageChange={handlePageSizeChange}
                    rowsPerPageOptions={pageSizeOptions.map(option =>
                        typeof option === 'number' ? option : option.value,
                    )}
                    sx={{mt: 2}}
                />
            )}
        </Box>
    )
}

export default EntityCardList
