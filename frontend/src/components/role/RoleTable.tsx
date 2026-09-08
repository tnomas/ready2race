import EntityTable from '@components/EntityTable.tsx'
import {BaseEntityTableProps} from '@utils/types.ts'
import {GridColDef, GridPaginationModel, GridSortModel} from '@mui/x-data-grid'
import {PaginationParameters} from '@utils/ApiUtils.ts'
import {useTranslation} from 'react-i18next'
import {RoleDto} from '@api/types.gen.ts'
import {deleteRole, getRoles} from '@api/sdk.gen.ts'
import {Chip, Stack} from '@mui/material'
import {roleLabel} from '@authorization/roleLabels.ts'

const initialPagination: GridPaginationModel = {
    page: 0,
    pageSize: 10,
}
const pageSizeOptions: (number | {value: number; label: string})[] = [10]
const initialSort: GridSortModel = [{field: 'name', sort: 'asc'}]

const dataRequest = (signal: AbortSignal, paginationParameters: PaginationParameters) =>
    getRoles({
        signal,
        query: paginationParameters,
    })

const deleteRequest = (entity: RoleDto) => deleteRole({path: {roleId: entity.id}})

const RoleTable = (props: BaseEntityTableProps<RoleDto>) => {
    const {t} = useTranslation()

    const columns: GridColDef<RoleDto>[] = [
        {
            field: 'name',
            headerName: t('role.name'),
            minWidth: 200,
            flex: 1,
            renderCell: ({row}) => (
                <Stack direction={'row'} spacing={1} alignItems={'center'}>
                    <span>{roleLabel(row, t)}</span>
                    {row.static && <Chip size={'small'} label={t('role.static')} />}
                </Stack>
            ),
        },
        {
            field: 'job',
            headerName: t('role.copyOf'),
            minWidth: 160,
            flex: 1,
            valueGetter: (_, row) => (row.job ? t(`job.${row.job}.name` as never) : '–'),
        },
        {
            field: 'level',
            headerName: t('role.level.label'),
            minWidth: 140,
            flex: 1,
            valueGetter: (_, row) => t(`role.level.${row.level}`),
        },
        {
            field: 'description',
            headerName: t('role.description'),
            minWidth: 200,
            flex: 1,
            sortable: false,
        },
    ]

    return (
        <EntityTable
            {...props}
            initialPagination={initialPagination}
            pageSizeOptions={pageSizeOptions}
            initialSort={initialSort}
            columns={columns}
            dataRequest={dataRequest}
            deleteRequest={deleteRequest}
            editableIf={r => !r.static}
            deletableIf={r => !r.static}
            parentResource={'ROLE'}
        />
    )
}

export default RoleTable
