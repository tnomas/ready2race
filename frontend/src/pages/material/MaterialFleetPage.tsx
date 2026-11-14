import {useState} from 'react'
import {Box} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {useNavigate} from '@tanstack/react-router'
import {materialFleetRoute} from '@routes'
import {useUser} from '@contexts/user/UserContext.ts'
import {readMaterialGlobal} from '@authorization/privileges.ts'
import {useEntityAdministration} from '@utils/hooks.ts'
import {MaterialItemDto} from '@api/types.gen.ts'
import {PageHeader} from '@components/ui'
import MaterialItemTable from '@components/material/MaterialItemTable.tsx'
import MaterialItemDialog from '@components/material/MaterialItemDialog.tsx'
import MaterialDamageDialog from '@components/material/MaterialDamageDialog.tsx'
import MaterialProviderPicker from '@components/material/MaterialProviderPicker.tsx'
import MaterialProviderSwitch from '@components/material/MaterialProviderSwitch.tsx'
import {useMaterialWrite} from '@components/material/useMaterialWrite.ts'
import {effectiveProviderId, showsProviderSwitch} from './materialDashboardLogic.ts'

/**
 * Flotte eines Anbieters über alle Veranstaltungen. Eigene Anbieter sehen nur ihre Flotte; Konten
 * mit READ MATERIAL GLOBAL ohne Zuordnung wählen den Anbieter (`?provider=`).
 */
const MaterialFleetPage = () => {
    const {t} = useTranslation()
    const user = useUser()
    const search = materialFleetRoute.useSearch()
    const navigate = useNavigate()

    const mayReadGlobal = user.checkPrivilege(readMaterialGlobal)
    const providerId = effectiveProviderId({
        ownProviderId: user.loggedIn ? user.materialProviderId : undefined,
        mayReadGlobal,
        searchProvider: search.provider,
    })
    const providerSearch = search.provider ? {provider: search.provider} : {}
    const switchable = showsProviderSwitch({
        ownProviderId: user.loggedIn ? user.materialProviderId : undefined,
        mayReadGlobal,
        searchProvider: search.provider,
    })
    const canWrite = useMaterialWrite(providerId)

    const administrationProps = useEntityAdministration<MaterialItemDto>(t('material.item.item'))
    // Schaden melden aus der Flotte hat keinen Veranstaltungsbezug - kein Verursacher-Vorschlag,
    // kein Ausfall-Dialog danach (siehe MaterialDamageDialog).
    const [damageItem, setDamageItem] = useState<MaterialItemDto | null>(null)

    return (
        <Box>
            <PageHeader
                title={t('material.fleet.title')}
                subtitle={t('material.fleet.subtitle')}
                meta={
                    switchable &&
                    providerId && (
                        <MaterialProviderSwitch
                            providerId={providerId}
                            onSwitch={() =>
                                void navigate({from: materialFleetRoute.fullPath, search: {}})
                            }
                        />
                    )
                }
                breadcrumbs={[
                    {
                        label: t('navigation.titles.material'),
                        link: {to: '/material', search: providerSearch},
                    },
                    {label: t('material.fleet.title')},
                ]}
            />
            {providerId === undefined ? (
                <MaterialProviderPicker
                    mayReadGlobal={mayReadGlobal}
                    onSelect={provider =>
                        void navigate({from: materialFleetRoute.fullPath, search: {provider}})
                    }
                />
            ) : (
                <>
                    <MaterialItemTable
                        providerId={providerId}
                        onReportDamage={canWrite ? setDamageItem : undefined}
                        canWrite={canWrite}
                        {...administrationProps.table}
                    />
                    <MaterialItemDialog providerId={providerId} {...administrationProps.dialog} />
                    <MaterialDamageDialog
                        open={damageItem != null}
                        providerId={providerId}
                        damage={null}
                        presetItem={damageItem ?? undefined}
                        onClose={() => setDamageItem(null)}
                        onSaved={() => setDamageItem(null)}
                        reload={administrationProps.table.reloadData}
                    />
                </>
            )}
        </Box>
    )
}

export default MaterialFleetPage
