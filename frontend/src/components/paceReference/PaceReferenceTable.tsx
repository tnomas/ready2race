import EntityTable, {ExtendedGridColDef} from '@components/EntityTable.tsx'
import {BaseEntityTableProps} from '@utils/types.ts'
import {PaceReferenceDto} from '@api/types.gen.ts'
import {GridPaginationModel, GridSortModel} from '@mui/x-data-grid'
import {PaginationParameters} from '@utils/ApiUtils.ts'
import {deletePaceReference, getPaceReferences} from '@api/sdk.gen.ts'
import {useTranslation} from 'react-i18next'
import {paceReferenceLabel} from '@components/paceReference/paceReferenceLabel.ts'

const initialPagination: GridPaginationModel = {
    page: 0,
    pageSize: 10,
}
const pageSizeOptions: (number | {value: number; label: string})[] = [10]
const initialSort: GridSortModel = [{field: 'name', sort: 'asc'}]

const dataRequest = (signal: AbortSignal, paginationParameters: PaginationParameters) =>
    getPaceReferences({
        signal,
        query: {...paginationParameters},
    })

const deleteRequest = (dto: PaceReferenceDto) =>
    deletePaceReference({path: {paceReferenceId: dto.id}})

const PaceReferenceTable = (props: BaseEntityTableProps<PaceReferenceDto>) => {
    const {t} = useTranslation()

    const columns: ExtendedGridColDef<PaceReferenceDto>[] = [
        {
            field: 'name',
            headerName: t('configuration.paceReference.name'),
            minWidth: 200,
            flex: 1,
        },
        {
            field: 'mode',
            headerName: t('configuration.paceReference.mode.mode'),
            minWidth: 200,
            flex: 1,
            valueGetter: (_, row) => t(`configuration.paceReference.mode.${row.mode}`),
        },
        {
            // Die Beschriftung ist abgeleitet, steht also in keiner Spalte der Tabelle - hier zeigt
            // sie, was am Ende an der Zwischenzeit steht.
            field: 'referenceMeters',
            headerName: t('configuration.paceReference.label'),
            minWidth: 120,
            valueGetter: (_, row) => paceReferenceLabel(row.mode, row.referenceMeters),
        },
    ]

    return (
        <EntityTable
            {...props}
            parentResource={'EVENT'}
            initialPagination={initialPagination}
            pageSizeOptions={pageSizeOptions}
            initialSort={initialSort}
            columns={columns}
            dataRequest={dataRequest}
            deleteRequest={deleteRequest}
        />
    )
}

export default PaceReferenceTable
