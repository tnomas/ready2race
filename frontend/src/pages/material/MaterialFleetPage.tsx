import {useState} from 'react'
import {Box, FormControl, InputLabel, MenuItem, Select, Typography} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {useNavigate} from '@tanstack/react-router'
import {materialFleetRoute} from '@routes'
import {useUser} from '@contexts/user/UserContext.ts'
import {readMaterialGlobal} from '@authorization/privileges.ts'
import {useEntityAdministration, useFeedback, useFetch} from '@utils/hooks.ts'
import {getMaterialProviders} from '@api/sdk.gen.ts'
import {MaterialItemDto} from '@api/types.gen.ts'
import MaterialItemTable from '@components/material/MaterialItemTable.tsx'
import MaterialItemDialog from '@components/material/MaterialItemDialog.tsx'
import MaterialDamageDialog from '@components/material/MaterialDamageDialog.tsx'
import Throbber from '@components/Throbber.tsx'

/**
 * Flotte eines Anbieters. Eigene Anbieter (materialProviderId am Konto) sehen immer nur ihre
 * eigene Flotte; Konten mit READ MATERIAL GLOBAL ohne eigene Zuordnung wählen den Anbieter über
 * die Adresse (`?provider=`), sonst gibt es ohne Zuordnung und ohne globales Recht nichts zu
 * zeigen.
 */
const MaterialFleetPage = () => {
    const {t} = useTranslation()
    const user = useUser()
    const feedback = useFeedback()
    const search = materialFleetRoute.useSearch()
    const navigate = useNavigate()

    const mayReadGlobal = user.checkPrivilege(readMaterialGlobal)
    const ownProviderId = user.loggedIn ? user.materialProviderId : undefined
    const providerId = ownProviderId ?? (mayReadGlobal ? search.provider : undefined)

    const administrationProps = useEntityAdministration<MaterialItemDto>(t('material.item.item'))
    // Schaden melden aus der Flotte hat keinen Veranstaltungsbezug - kein Verursacher-Vorschlag,
    // kein Ausfall-Dialog danach (siehe MaterialDamageDialog).
    const [damageItem, setDamageItem] = useState<MaterialItemDto | null>(null)

    const {data: providers, pending: providersPending} = useFetch(
        signal => getMaterialProviders({signal, query: {limit: 200}}),
        {
            preCondition: () => providerId === undefined && mayReadGlobal,
            onResponse: ({error}) => {
                if (error) {
                    feedback.error(
                        t('common.load.error.multiple.short', {
                            entity: t('material.provider.providers'),
                        }),
                    )
                }
            },
            deps: [providerId, mayReadGlobal],
        },
    )

    if (providerId === undefined) {
        return (
            <Box>
                <Typography variant={'h1'}>{t('material.fleet.title')}</Typography>
                {!mayReadGlobal ? (
                    <Typography>{t('material.fleet.noProvider')}</Typography>
                ) : providersPending && !providers ? (
                    <Throbber />
                ) : (
                    <FormControl sx={{minWidth: 300, mt: 2}}>
                        <InputLabel id={'material-fleet-provider-label'}>
                            {t('material.provider.provider')}
                        </InputLabel>
                        <Select
                            labelId={'material-fleet-provider-label'}
                            label={t('material.provider.provider')}
                            value={''}
                            onChange={e => {
                                const provider = e.target.value as string
                                navigate({
                                    from: materialFleetRoute.fullPath,
                                    search: {provider},
                                }).then()
                            }}>
                            {providers?.data.map(provider => (
                                <MenuItem key={provider.id} value={provider.id}>
                                    {provider.name}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                )}
            </Box>
        )
    }

    return (
        <Box>
            <Typography variant={'h1'}>{t('material.fleet.title')}</Typography>
            <MaterialItemTable
                providerId={providerId}
                onReportDamage={setDamageItem}
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
        </Box>
    )
}

export default MaterialFleetPage
