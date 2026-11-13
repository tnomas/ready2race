import InvoiceTable from '@components/invoice/InvoiceTable.tsx'
import {useEntityAdministration} from '@utils/hooks.ts'
import {InvoiceDto} from '@api/types.gen.ts'
import {useTranslation} from 'react-i18next'
import {PaginationParameters} from '@utils/ApiUtils.ts'
import {getInvoices} from '@api/sdk.gen'
import {PageHeader} from '@components/ui'

const InvoicePage = () => {
    const {t} = useTranslation()

    const invoiceAdministrationProps = useEntityAdministration<InvoiceDto>(t('invoice.invoice'), {
        entityCreate: false,
        entityUpdate: false,
    })

    return (
        <>
            <PageHeader title={t('invoice.invoices')} />
            <InvoiceTable
                {...invoiceAdministrationProps.table}
                dataRequest={(signal: AbortSignal, params: PaginationParameters) =>
                    getInvoices({signal, query: {...params}})
                }
            />
        </>
    )
}

export default InvoicePage
