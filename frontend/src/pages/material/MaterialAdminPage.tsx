import {useEntityAdministration} from '@utils/hooks.ts'
import {MaterialProviderDto, MaterialTypeDto} from '@api/types.gen.ts'
import {Box, Stack} from '@mui/material'
import {PageHeader} from '@components/ui'
import {useTranslation} from 'react-i18next'
import MaterialProviderTable from '@components/material/MaterialProviderTable.tsx'
import MaterialProviderDialog from '@components/material/MaterialProviderDialog.tsx'
import MaterialTypeTable from '@components/material/MaterialTypeTable.tsx'
import MaterialTypeDialog from '@components/material/MaterialTypeDialog.tsx'

/**
 * Verwaltung der Stammdaten: Anbieter und Materialarten, wie RolesPage untereinander — die
 * Flotte selbst (Materialstücke je Anbieter) lebt getrennt auf der Flotten-Seite.
 */
const MaterialAdminPage = () => {
    const {t} = useTranslation()
    const providerAdministrationProps = useEntityAdministration<MaterialProviderDto>(
        t('material.provider.provider'),
    )
    const typeAdministrationProps = useEntityAdministration<MaterialTypeDto>(
        t('material.type.type'),
    )

    return (
        <Box>
            <PageHeader title={t('material.admin.title')} subtitle={t('material.admin.subtitle')} />
            <Stack spacing={4}>
                <MaterialProviderTable
                    {...providerAdministrationProps.table}
                    title={t('material.provider.providers')}
                />
                <MaterialTypeTable
                    {...typeAdministrationProps.table}
                    title={t('material.type.types')}
                />
            </Stack>
            <MaterialProviderDialog {...providerAdministrationProps.dialog} />
            <MaterialTypeDialog {...typeAdministrationProps.dialog} />
        </Box>
    )
}

export default MaterialAdminPage
