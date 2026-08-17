import {GridColDef, GridPaginationModel, GridSortModel} from '@mui/x-data-grid'
import {BaseEntityTableProps, PageResponse} from '@utils/types.ts'
import {ApiError, TimingStationDto} from '@api/types.gen.ts'
import {useTranslation} from 'react-i18next'
import {eventIndexRoute} from '@routes'
import {PaginationParameters} from '@utils/ApiUtils.ts'
import EntityTable from '@components/EntityTable.tsx'
import {deleteTimingStation, getTimingStations} from '@api/sdk.gen.ts'
import {RequestResult} from '@hey-api/client-fetch'
import {useFeedback} from '@utils/hooks.ts'

const initialPagination: GridPaginationModel = {
    page: 0,
    pageSize: 10,
}
const pageSizeOptions: (number | {value: number; label: string})[] = [10, 25, 50]
const initialSort: GridSortModel = [{field: 'sorting', sort: 'asc'}]

// The stations endpoint is not paginated - it returns the full list for the event in one go.
// We fetch everything, apply the search filter ourselves, and let the DataGrid paginate/sort
// the already-loaded rows locally (see gridProps below).
const TimingStationTable = (props: BaseEntityTableProps<TimingStationDto>) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const {eventId} = eventIndexRoute.useParams()

    // getTimingStations has no GetError union in the generated client (it merges to `unknown`
    // since the tsp op has no declared error responses); the runtime shape is still the usual
    // ApiError envelope, so we cast the whole result to line up with EntityTable's generic bound.
    const dataRequest = (signal: AbortSignal, paginationParameters: PaginationParameters) =>
        getTimingStations({signal, path: {eventId}}).then(result => {
            if (result.data === undefined) {
                return result
            }

            const search = paginationParameters.search?.toLowerCase()
            const filtered = search
                ? result.data.filter(station => station.name.toLowerCase().includes(search))
                : result.data
            const sorted = [...filtered].sort((a, b) => a.sorting - b.sorting)

            return {
                ...result,
                data: {
                    data: sorted,
                    pagination: {
                        total: sorted.length,
                        limit: paginationParameters.limit,
                        offset: paginationParameters.offset,
                        sort: [],
                        search: paginationParameters.search ?? '',
                    },
                },
            }
        }) as unknown as RequestResult<PageResponse<TimingStationDto>, ApiError, false>

    const deleteRequest = (dto: TimingStationDto) =>
        deleteTimingStation({
            path: {eventId: dto.event, stationId: dto.id},
        }) as unknown as RequestResult<void, ApiError, false>

    const onDeleteError = (error: ApiError) => {
        feedback.error(error.message)
    }

    const columns: GridColDef<TimingStationDto>[] = [
        {
            field: 'name',
            headerName: t('timing.station.name'),
            minWidth: 200,
            flex: 1,
        },
        {
            field: 'type',
            headerName: t('timing.station.type'),
            minWidth: 150,
            flex: 1,
            valueGetter: (_, row) => t(`timing.station.types.${row.type}`),
        },
        {
            field: 'sorting',
            headerName: t('timing.station.sorting'),
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
            onDeleteError={onDeleteError}
            gridProps={{paginationMode: 'client', sortingMode: 'client'}}
        />
    )
}

export default TimingStationTable
