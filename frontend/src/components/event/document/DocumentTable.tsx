import EntityTable from '@components/EntityTable.tsx'
import {BaseEntityTableProps, EntityAction} from '@utils/types.ts'
import {EventDocumentDto} from '@api/types.gen.ts'
import {GridActionsCellItem, GridColDef, GridPaginationModel, GridSortModel} from '@mui/x-data-grid'
import {PaginationParameters} from '@utils/ApiUtils.ts'
import {deleteDocument, downloadDocument, getDocuments} from '@api/sdk.gen.ts'
import {eventIndexRoute} from '@routes'
import {Download} from '@mui/icons-material'
import {Box} from '@mui/material'
import {downloadBlob} from '@utils/download.ts'
import {isRequestNetworkError, runRequest} from '@utils/request.ts'
import {useFeedback} from '@utils/hooks.ts'
import {useTranslation} from 'react-i18next'

const initialPagination: GridPaginationModel = {
    page: 0,
    pageSize: 10,
}
const pageSizeOptions: (number | {value: number; label: string})[] = [10]
const initialSort: GridSortModel = [{field: 'name', sort: 'asc'}]

const DocumentTable = (props: BaseEntityTableProps<EventDocumentDto>) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const {eventId} = eventIndexRoute.useParams()

    const dataRequest = (signal: AbortSignal, paginationParameters: PaginationParameters) =>
        getDocuments({
            signal,
            path: {
                eventId,
            },
            query: {...paginationParameters},
        })

    const deleteRequest = (entity: EventDocumentDto) =>
        deleteDocument({
            path: {
                eventId,
                eventDocumentId: entity.id,
            },
        })

    const columns: GridColDef<EventDocumentDto>[] = [
        {
            field: 'name',
            headerName: t('event.document.name'),
            minWidth: 200,
            flex: 1,
        },
        {
            field: 'documentType',
            headerName: t('event.document.type.type'),
            minWidth: 200,
            flex: 1,
            valueGetter: (_, row) => row.documentType?.name,
        },
    ]

    const handleDownloadDocument = async (entity: EventDocumentDto) => {
        // Dateiname ist hier immer der Name des Dokuments, nicht die Kopfzeile der Antwort.
        const {data, error} = await runRequest(undefined, () =>
            downloadDocument({
                path: {
                    eventId,
                    eventDocumentId: entity.id,
                },
            }),
        )

        if (isRequestNetworkError(error)) {
            feedback.error(t('common.error.network'))
        } else if (error) {
            feedback.error(t('event.document.download.error'))
        } else if (data !== undefined) {
            downloadBlob(data, entity.name)
        }
    }

    const customEntityActions = (entity: EventDocumentDto): EntityAction[] => [
        <GridActionsCellItem
            icon={<Download />}
            label={t('event.document.download.download')}
            onClick={() => handleDownloadDocument(entity)}
            showInMenu
        />,
    ]

    return (
        <Box>
            <EntityTable
                {...props}
                parentResource={'EVENT'}
                initialPagination={initialPagination}
                pageSizeOptions={pageSizeOptions}
                initialSort={initialSort}
                columns={columns}
                dataRequest={dataRequest}
                deleteRequest={deleteRequest}
                customEntityActions={customEntityActions}
            />
        </Box>
    )
}

export default DocumentTable
