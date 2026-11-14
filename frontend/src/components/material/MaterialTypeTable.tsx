import {useMemo} from 'react'
import {GridColDef, GridPaginationModel, GridSortModel} from '@mui/x-data-grid'
import {PaginationParameters} from '@utils/ApiUtils.ts'
import {deleteMaterialType, getMaterialTypes} from '@api/sdk.gen.ts'
import {MaterialTypeDto} from '@api/types.gen.ts'
import {BaseEntityTableProps} from '@utils/types.ts'
import {useTranslation} from 'react-i18next'
import EntityTable from '@components/EntityTable.tsx'
import {useUser} from '@contexts/user/UserContext.ts'
import {updateMaterialGlobal} from '@authorization/privileges.ts'
import {useMaterialDeleteError} from './useMaterialDeleteError.ts'

const initialPagination: GridPaginationModel = {
    page: 0,
    pageSize: 10,
}
const pageSizeOptions: (number | {value: number; label: string})[] = [10]
const initialSort: GridSortModel = [{field: 'name', sort: 'asc'}]

const dataRequest = (signal: AbortSignal, paginationParameters: PaginationParameters) =>
    getMaterialTypes({signal, query: {...paginationParameters}})

const deleteRequest = (dto: MaterialTypeDto) => deleteMaterialType({path: {typeId: dto.id}})

const MaterialTypeTable = (props: BaseEntityTableProps<MaterialTypeDto>) => {
    const {t} = useTranslation()
    // Stammdaten verlangt das Backend mit UPDATE MATERIAL GLOBAL; EntityTable prüft nur OWN.
    const mayEdit = useUser().checkPrivilege(updateMaterialGlobal)
    // In Verwendung (Stücke, Bedarf, Angebote) nicht löschbar: sagen, warum.
    const onDeleteError = useMaterialDeleteError(t('material.type.type'))

    const columns: GridColDef<MaterialTypeDto>[] = useMemo(
        () => [
            {
                field: 'name',
                headerName: t('material.type.name'),
                minWidth: 150,
                flex: 1,
            },
            {
                field: 'category',
                headerName: t('material.type.category'),
                minWidth: 150,
                valueGetter: (v: MaterialTypeDto['category']) => t(`material.category.${v}`),
            },
            {
                field: 'description',
                headerName: t('material.type.description'),
                minWidth: 150,
                flex: 1,
                sortable: false,
            },
        ],
        [t],
    )

    return (
        <EntityTable
            {...props}
            parentResource={'MATERIAL'}
            initialPagination={initialPagination}
            pageSizeOptions={pageSizeOptions}
            initialSort={initialSort}
            columns={columns}
            dataRequest={dataRequest}
            entityName={t('material.type.type')}
            deleteRequest={deleteRequest}
            onDeleteError={onDeleteError}
            creatable={mayEdit}
            hideEntityActions={!mayEdit}
        />
    )
}

export default MaterialTypeTable
