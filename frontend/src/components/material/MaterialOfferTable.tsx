import {useMemo} from 'react'
import {GridColDef, GridPaginationModel, GridSortModel} from '@mui/x-data-grid'
import {BaseEntityTableProps, PageResponse} from '@utils/types.ts'
import {PaginationParameters} from '@utils/ApiUtils.ts'
import {deleteMaterialOffer, getMaterialOffers} from '@api/sdk.gen.ts'
import {ApiError, MaterialOfferDto} from '@api/types.gen.ts'
import {useTranslation} from 'react-i18next'
import {useMaterialDeleteError} from './useMaterialDeleteError.ts'
import EntityTable from '@components/EntityTable.tsx'
import {RequestResult} from '@hey-api/client-fetch'

const initialPagination: GridPaginationModel = {
    page: 0,
    pageSize: 10,
}
const pageSizeOptions: (number | {value: number; label: string})[] = [10]
const initialSort: GridSortModel = [{field: 'materialTypeName', sort: 'asc'}]

type Props = BaseEntityTableProps<MaterialOfferDto> & {
    eventId: string
    providerId: string
    /** Ohne Schreibrecht beim Anbieter: keine Anlage, keine Zeilenaktionen. */
    canWrite: boolean
}

// Angebote je Veranstaltung/Anbieter sind nicht seitenweise - die Liste ist naturgemäß klein
// (eine Zeile je Materialart). Wie bei TimingStationTable wird alles geladen und die DataGrid
// paginiert/sortiert lokal (gridProps unten).
const MaterialOfferTable = ({eventId, providerId, canWrite, ...props}: Props) => {
    const {t} = useTranslation()
    // Mit Anfragen nicht löschbar: sagen, warum und was stattdessen geht.
    const onDeleteError = useMaterialDeleteError(t('material.offer.offer'))

    const dataRequest = async (
        signal: AbortSignal,
        paginationParameters: PaginationParameters,
    ): RequestResult<PageResponse<MaterialOfferDto>, ApiError, false> => {
        const result = await getMaterialOffers({signal, path: {eventId, providerId}})
        if (result.data === undefined) {
            return {
                data: undefined,
                error: result.error,
                request: result.request,
                response: result.response,
            }
        }

        const search = paginationParameters.search?.toLowerCase()
        const filtered = search
            ? result.data.filter(offer => offer.materialTypeName.toLowerCase().includes(search))
            : result.data
        const sorted = [...filtered].sort((a, b) =>
            a.materialTypeName.localeCompare(b.materialTypeName),
        )

        return {
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
            error: undefined,
            request: result.request,
            response: result.response,
        }
    }

    const deleteRequest = (dto: MaterialOfferDto) =>
        deleteMaterialOffer({path: {eventId, providerId, offerId: dto.id}})

    const columns: GridColDef<MaterialOfferDto>[] = useMemo(
        () => [
            {
                field: 'materialTypeName',
                headerName: t('material.offer.type'),
                minWidth: 150,
                flex: 1,
            },
            {
                field: 'priceText',
                headerName: t('material.offer.priceText'),
                minWidth: 150,
                flex: 1,
            },
            {
                field: 'plannedCount',
                headerName: t('material.offer.plannedCount'),
                width: 140,
            },
            {
                field: 'changeoverMinutes',
                headerName: t('material.offer.changeoverMinutes'),
                width: 160,
            },
        ],
        [t],
    )

    return (
        <EntityTable
            {...props}
            // Wie bei MaterialItemTable: MATERIAL hat kein eigenes CREATE/DELETE-Recht.
            parentResource={'MATERIAL'}
            initialPagination={initialPagination}
            pageSizeOptions={pageSizeOptions}
            initialSort={initialSort}
            columns={columns}
            dataRequest={dataRequest}
            entityName={t('material.offer.offer')}
            deleteRequest={deleteRequest}
            onDeleteError={onDeleteError}
            gridProps={{paginationMode: 'client', sortingMode: 'client'}}
            creatable={canWrite}
            hideEntityActions={!canWrite}
        />
    )
}

export default MaterialOfferTable
