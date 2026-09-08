import {GridColDef, GridPaginationModel, GridSortModel} from '@mui/x-data-grid'
import {PaginationParameters} from '@utils/ApiUtils.ts'
import {deleteMaterialProvider, getMaterialProviders} from '@api/sdk.gen.ts'
import {MaterialProviderDto} from '@api/types.gen.ts'
import {BaseEntityTableProps} from '@utils/types.ts'
import {useTranslation} from 'react-i18next'
import EntityTable from '@components/EntityTable.tsx'

const initialPagination: GridPaginationModel = {
    page: 0,
    pageSize: 10,
}
const pageSizeOptions: (number | {value: number; label: string})[] = [10]
const initialSort: GridSortModel = [{field: 'name', sort: 'asc'}]

const dataRequest = (signal: AbortSignal, paginationParameters: PaginationParameters) =>
    getMaterialProviders({signal, query: {...paginationParameters}})

const deleteRequest = (dto: MaterialProviderDto) =>
    deleteMaterialProvider({path: {providerId: dto.id}})

const MaterialProviderTable = (props: BaseEntityTableProps<MaterialProviderDto>) => {
    const {t} = useTranslation()

    const columns: GridColDef<MaterialProviderDto>[] = [
        {
            field: 'name',
            headerName: t('material.provider.name'),
            minWidth: 150,
            flex: 1,
        },
        {
            field: 'contactName',
            headerName: t('material.provider.contactName'),
            minWidth: 150,
            flex: 1,
        },
        {
            field: 'contactEmail',
            headerName: t('material.provider.contactEmail'),
            minWidth: 150,
            flex: 1,
        },
    ]

    return (
        <EntityTable
            {...props}
            // MATERIAL kennt nur READ/UPDATE (keine eigenen CREATE/DELETE-Rechte, siehe
            // Privilege.kt) — wie bei Rollen (RoleTable, parentResource 'USER') hängt Anlegen/
            // Bearbeiten/Löschen deshalb am UPDATE-Recht der Ressource selbst.
            parentResource={'MATERIAL'}
            initialPagination={initialPagination}
            pageSizeOptions={pageSizeOptions}
            initialSort={initialSort}
            columns={columns}
            dataRequest={dataRequest}
            entityName={t('material.provider.provider')}
            deleteRequest={deleteRequest}
        />
    )
}

export default MaterialProviderTable
