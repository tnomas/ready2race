import {
    GridActionsCellItem,
    GridColDef,
    GridPaginationModel,
    GridSortModel,
} from '@mui/x-data-grid'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import SmartDisplayOutlinedIcon from '@mui/icons-material/SmartDisplayOutlined'
import QrCode2Icon from '@mui/icons-material/QrCode2'
import {useState} from 'react'
import {BaseEntityTableProps, PageResponse} from '@utils/types.ts'
import {ApiError, TimingStationDto} from '@api/types.gen.ts'
import {useTranslation} from 'react-i18next'
import {eventRoute} from '@routes'
import {PaginationParameters} from '@utils/ApiUtils.ts'
import EntityTable from '@components/EntityTable.tsx'
import {deleteTimingStation, getTimingStations} from '@api/sdk.gen.ts'
import {RequestResult} from '@hey-api/client-fetch'
import {useFeedback} from '@utils/hooks.ts'
import TimingStationShareDialog from '@components/event/timing/TimingStationShareDialog.tsx'

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

    const {eventId} = eventRoute.useParams()

    const [shareStation, setShareStation] = useState<TimingStationDto | null>(null)

    // Direkte Wege vom Posten zur Arbeit am Renntag: Erfassung und (für START-Posten) der
    // Startbildschirm öffnen in neuem Fenster - am Renntag laufen sie auf eigenen Bildschirmen.
    // „Auf Gerät teilen" erzeugt einen Link mit Geräte-Token für Geräte ohne Anmeldung.
    const stationUrl = (station: TimingStationDto) =>
        `${window.location.origin}/event/${eventId}/timing/${station.id}`

    const customEntityActions = (station: TimingStationDto) => [
        // Ein ANZEIGE-Posten erfasst nichts — er hat nur die Anzeige, alle anderen nur bzw.
        // zusätzlich die Erfassung.
        station.type !== 'ANZEIGE' && (
            <GridActionsCellItem
                icon={<OpenInNewIcon />}
                label={t('timing.station.openCapture')}
                onClick={() => window.open(stationUrl(station), '_blank', 'noopener')}
                showInMenu
            />
        ),
        (station.type === 'START' || station.type === 'ANZEIGE') && (
            <GridActionsCellItem
                icon={<SmartDisplayOutlinedIcon />}
                label={t('timing.station.openStartDisplay')}
                onClick={() => window.open(`${stationUrl(station)}/anzeige`, '_blank', 'noopener')}
                showInMenu
            />
        ),
        <GridActionsCellItem
            icon={<QrCode2Icon />}
            label={t('timing.station.share.action')}
            onClick={() => setShareStation(station)}
            showInMenu
        />,
    ]

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

    // The backend's own message is untranslated English, so map the one case it actually produces —
    // 409, the station still has time marks referencing it — to a translated key, and fall back to the
    // generic delete error for anything else.
    const onDeleteError = (error: ApiError) => {
        if (error.status.value === 409) {
            feedback.error(t('timing.station.error.hasTimeMarks'))
        } else {
            feedback.error(t('entity.delete.error', {entity: props.entityName}))
        }
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
        <>
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
                customEntityActions={customEntityActions}
                gridProps={{paginationMode: 'client', sortingMode: 'client'}}
            />
            {shareStation !== null && (
                <TimingStationShareDialog
                    open
                    onClose={() => setShareStation(null)}
                    eventId={eventId}
                    station={shareStation}
                />
            )}
        </>
    )
}

export default TimingStationTable
