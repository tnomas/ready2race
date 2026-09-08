import {GridColDef, GridPaginationModel, GridSortModel} from '@mui/x-data-grid'
import {PaginationParameters} from '@utils/ApiUtils.ts'
import {deleteMaterialItem, getMaterialItems} from '@api/sdk.gen.ts'
import {MaterialItemDto} from '@api/types.gen.ts'
import {BaseEntityTableProps} from '@utils/types.ts'
import {useTranslation} from 'react-i18next'
import EntityTable from '@components/EntityTable.tsx'

const initialPagination: GridPaginationModel = {
    page: 0,
    pageSize: 10,
}
const pageSizeOptions: (number | {value: number; label: string})[] = [10]
const initialSort: GridSortModel = [{field: 'label', sort: 'asc'}]

type Props = BaseEntityTableProps<MaterialItemDto> & {
    providerId: string
}

const MaterialItemTable = ({providerId, ...props}: Props) => {
    const {t} = useTranslation()

    const dataRequest = (signal: AbortSignal, paginationParameters: PaginationParameters) =>
        getMaterialItems({
            signal,
            path: {providerId},
            query: {...paginationParameters},
        })

    const deleteRequest = (dto: MaterialItemDto) =>
        deleteMaterialItem({path: {providerId, itemId: dto.id}})

    const columns: GridColDef<MaterialItemDto>[] = [
        {
            field: 'number',
            headerName: t('material.item.number'),
            width: 100,
        },
        {
            field: 'label',
            headerName: t('material.item.label'),
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
    ]

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
        />
    )
}

export default MaterialItemTable
