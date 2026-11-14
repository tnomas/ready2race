import {useTranslation} from 'react-i18next'
import {Box} from '@mui/material'
import {getEventRegistration, getRegistrationInvoices} from '@api/sdk.gen.ts'
import {eventRegistrationRoute} from '@routes'
import {useEntityAdministration, useFeedback, useFetch} from '@utils/hooks.ts'
import {ErrorState, LoadingState, PageHeader} from '@components/ui'
import {buildEventTrail} from '@utils/navigation/breadcrumbs.ts'
import InvoiceTable from '@components/invoice/InvoiceTable.tsx'
import {PaginationParameters} from '@utils/ApiUtils.ts'
import {InvoiceDto} from '@api/types.gen.ts'
import {useEventName} from '../event/useEventName.ts'

const EventRegistrationPage = () => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const path = eventRegistrationRoute.useParams()
    const eventName = useEventName(path.eventId)

    const {data, error, reload} = useFetch(signal => getEventRegistration({signal, path}), {
        onResponse: ({error}) => {
            if (error) {
                feedback.error(
                    t('common.load.error.single', {entity: t('event.registration.registration')}),
                )
            }
        },
        deps: [path],
    })

    const invoiceAdministrationProps = useEntityAdministration<InvoiceDto>(t('invoice.invoice'), {
        entityCreate: false,
        entityUpdate: false,
    })

    const title = data?.clubName ?? t('event.registration.registration')

    return (
        <Box>
            <PageHeader
                title={title}
                subtitle={data && t('event.registration.registration')}
                breadcrumbs={buildEventTrail({
                    eventsLabel: t('navigation.titles.events'),
                    eventId: path.eventId,
                    eventName: data?.eventName ?? eventName,
                    section: {tab: 'registrations', label: t('nav.event.sections.registrations')},
                    trail: [{label: title}],
                })}
            />
            {data ? (
                <InvoiceTable
                    {...invoiceAdministrationProps.table}
                    title={t('invoice.invoices')}
                    dataRequest={(signal: AbortSignal, params: PaginationParameters) =>
                        getRegistrationInvoices({
                            signal,
                            path,
                            query: {...params},
                        })
                    }
                />
            ) : error ? (
                <ErrorState
                    message={t('common.load.error.single', {
                        entity: t('event.registration.registration'),
                    })}
                    onRetry={reload}
                />
            ) : (
                <LoadingState />
            )}
        </Box>
    )
}

export default EventRegistrationPage
