import {GridColDef, GridPaginationModel, GridSortModel} from '@mui/x-data-grid'
import {BaseEntityTableProps, PageResponse} from '@utils/types.ts'
import {ApiError, TimingRaceTypeDto} from '@api/types.gen.ts'
import {useTranslation} from 'react-i18next'
import {eventIndexRoute} from '@routes'
import {PaginationParameters} from '@utils/ApiUtils.ts'
import EntityTable from '@components/EntityTable.tsx'
import {deleteTimingRaceType, getTimingRaceTypes} from '@api/sdk.gen.ts'
import {RequestResult} from '@hey-api/client-fetch'

const initialPagination: GridPaginationModel = {
    page: 0,
    pageSize: 10,
}
const pageSizeOptions: (number | {value: number; label: string})[] = [10, 25, 50]
const initialSort: GridSortModel = [{field: 'sorting', sort: 'asc'}]

// Like the stations endpoint, the race types come back as one unpaginated list - fetch everything,
// filter here, and let the DataGrid paginate/sort the loaded rows locally.
const TimingRaceTypeTable = (props: BaseEntityTableProps<TimingRaceTypeDto>) => {
    const {t} = useTranslation()

    const {eventId} = eventIndexRoute.useParams()

    const dataRequest = (signal: AbortSignal, paginationParameters: PaginationParameters) =>
        getTimingRaceTypes({signal, path: {eventId}}).then(result => {
            if (result.data === undefined) {
                return result
            }

            const search = paginationParameters.search?.toLowerCase()
            const filtered = search
                ? result.data.filter(raceType => raceType.name.toLowerCase().includes(search))
                : result.data

            return {
                ...result,
                data: {
                    data: filtered,
                    pagination: {
                        total: filtered.length,
                        limit: paginationParameters.limit,
                        offset: paginationParameters.offset,
                        sort: [],
                        search: paginationParameters.search ?? '',
                    },
                },
            }
        }) as unknown as RequestResult<PageResponse<TimingRaceTypeDto>, ApiError, false>

    const deleteRequest = (dto: TimingRaceTypeDto) =>
        deleteTimingRaceType({
            path: {eventId: dto.event, raceTypeId: dto.id},
        }) as unknown as RequestResult<void, ApiError, false>

    const columns: GridColDef<TimingRaceTypeDto>[] = [
        {
            field: 'name',
            headerName: t('timing.raceType.name'),
            minWidth: 200,
            flex: 1,
        },
        {
            field: 'startMode',
            headerName: t('timing.raceType.startMode'),
            minWidth: 150,
            flex: 1,
            valueGetter: (_, row) => t(`timing.sequence.mode.${row.startMode}`),
        },
        {
            field: 'timed',
            headerName: t('timing.raceType.timed'),
            minWidth: 140,
            flex: 0,
            valueGetter: (_, row) =>
                row.timed ? t('timing.raceType.timedYes') : t('timing.raceType.timedNo'),
        },
        {
            field: 'intervalMillis',
            headerName: t('timing.raceType.interval'),
            minWidth: 140,
            flex: 0,
            // Only INTERVAL race types carry a cadence, and even those may leave it to the starter.
            valueGetter: (_, row) =>
                row.intervalMillis != null ? `${Math.round(row.intervalMillis / 1000)} s` : '-',
        },
        {
            field: 'leadInMillis',
            headerName: t('timing.raceType.leadIn'),
            minWidth: 140,
            flex: 0,
            valueGetter: (_, row) =>
                row.leadInMillis != null ? `${Math.round(row.leadInMillis / 1000)} s` : '-',
        },
        {
            field: 'sorting',
            headerName: t('timing.raceType.sorting'),
            minWidth: 120,
            flex: 0,
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
            gridProps={{paginationMode: 'client', sortingMode: 'client'}}
        />
    )
}

export default TimingRaceTypeTable
