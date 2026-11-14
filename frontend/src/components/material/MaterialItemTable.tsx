import {useCallback, useMemo} from 'react'
import {GridActionsCellItem, GridPaginationModel, GridSortModel} from '@mui/x-data-grid'
import ReportProblemIcon from '@mui/icons-material/ReportProblem'
import {PaginationParameters} from '@utils/ApiUtils.ts'
import {deleteMaterialItem, getMaterialItems} from '@api/sdk.gen.ts'
import {MaterialItemDto} from '@api/types.gen.ts'
import {BaseEntityTableProps, EntityAction} from '@utils/types.ts'
import {useTranslation} from 'react-i18next'
import {useMaterialDeleteError} from './useMaterialDeleteError.ts'
import EntityTable, {ExtendedGridColDef} from '@components/EntityTable.tsx'

const initialPagination: GridPaginationModel = {
    page: 0,
    pageSize: 10,
}
const pageSizeOptions: (number | {value: number; label: string})[] = [10]
const initialSort: GridSortModel = [{field: 'label', sort: 'asc'}]

type Props = BaseEntityTableProps<MaterialItemDto> & {
    providerId: string
    /** Öffnet den Schadens-Dialog ohne Veranstaltungsbezug (siehe MaterialFleetPage). */
    onReportDamage: (item: MaterialItemDto) => void
}

const MaterialItemTable = ({providerId, onReportDamage, ...props}: Props) => {
    const {t} = useTranslation()
    // Noch zugeteilt nicht löschbar: sagen, warum und was stattdessen geht.
    const onDeleteError = useMaterialDeleteError(t('material.item.item'))

    // Stabil halten, sonst lädt die Tabelle bei jedem Rendern neu (ADR-0105).
    const customEntityActions = useCallback(
        (item: MaterialItemDto): EntityAction[] => [
            <GridActionsCellItem
                key={'report-damage'}
                icon={<ReportProblemIcon />}
                label={t('material.damage.report')}
                onClick={() => onReportDamage(item)}
                showInMenu
            />,
        ],
        [t, onReportDamage],
    )

    const dataRequest = (signal: AbortSignal, paginationParameters: PaginationParameters) =>
        getMaterialItems({
            signal,
            path: {providerId},
            query: {...paginationParameters},
        })

    const deleteRequest = (dto: MaterialItemDto) =>
        deleteMaterialItem({path: {providerId, itemId: dto.id}})

    const columns: ExtendedGridColDef<MaterialItemDto>[] = useMemo(
        () => [
            {
                field: 'number',
                headerName: t('material.item.number'),
                width: 100,
            },
            {
                field: 'label',
                headerName: t('material.item.label'),
                mobile: 'title',
                minWidth: 150,
                flex: 1,
            },
            {
                field: 'materialTypeName',
                headerName: t('material.item.type'),
                minWidth: 150,
                flex: 1,
            },
            {
                field: 'status',
                headerName: t('material.item.status'),
                minWidth: 120,
                valueGetter: (v: MaterialItemDto['status']) => t(`material.itemStatus.${v}`),
            },
            {
                field: 'openDamages',
                headerName: t('material.item.openDamages'),
                width: 140,
            },
        ],
        [t],
    )

    return (
        <EntityTable
            {...props}
            // Wie bei MaterialProviderTable/MaterialTypeTable: MATERIAL hat kein eigenes
            // CREATE/DELETE-Recht, nur READ/UPDATE — parentResource statt resource.
            parentResource={'MATERIAL'}
            initialPagination={initialPagination}
            pageSizeOptions={pageSizeOptions}
            initialSort={initialSort}
            columns={columns}
            dataRequest={dataRequest}
            entityName={t('material.item.item')}
            deleteRequest={deleteRequest}
            onDeleteError={onDeleteError}
            customEntityActions={customEntityActions}
        />
    )
}

export default MaterialItemTable
