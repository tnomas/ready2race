import {FormControl, InputLabel, MenuItem, Select} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {getMaterialProviders} from '@api/sdk.gen.ts'
import {useFetch} from '@utils/hooks.ts'
import {EmptyState, ErrorState, LoadingState} from '@components/ui'
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined'

type Props = {
    /** Darf die Person Anbieter wählen (READ MATERIAL GLOBAL ohne eigene Zuordnung)? */
    mayReadGlobal: boolean
    onSelect: (providerId: string) => void
}

/**
 * Was Material-Seiten ohne geltenden Anbieter zeigen: mit READ MATERIAL GLOBAL eine
 * Anbieterauswahl (setzt `?provider=`), sonst den Hinweis, dass das Konto keinem Anbieter
 * zugeordnet ist. Einmal gebaut für Veranstaltungswahl, Dashboard und Flotte.
 */
const MaterialProviderPicker = ({mayReadGlobal, onSelect}: Props) => {
    const {t} = useTranslation()

    const {data, pending, error, reload} = useFetch(
        signal => getMaterialProviders({signal, query: {limit: 200}}),
        {preCondition: () => mayReadGlobal, deps: [mayReadGlobal]},
    )

    if (!mayReadGlobal) {
        return (
            <EmptyState
                icon={<Inventory2Outlined />}
                title={t('material.fleet.noProvider')}
                description={t('material.fleet.noProviderHint')}
            />
        )
    }
    if (error) {
        return (
            <ErrorState
                message={t('common.load.error.multiple.short', {
                    entity: t('material.provider.providers'),
                })}
                onRetry={reload}
            />
        )
    }
    if (pending && !data) {
        return <LoadingState variant={'section'} />
    }
    if ((data?.data.length ?? 0) === 0) {
        return <EmptyState icon={<Inventory2Outlined />} title={t('material.provider.none')} />
    }

    return (
        <FormControl sx={{width: '100%', maxWidth: 360}}>
            <InputLabel id={'material-provider-picker-label'}>
                {t('material.dashboard.chooseProvider')}
            </InputLabel>
            <Select
                labelId={'material-provider-picker-label'}
                label={t('material.dashboard.chooseProvider')}
                value={''}
                onChange={e => onSelect(e.target.value as string)}>
                {data?.data.map(provider => (
                    <MenuItem key={provider.id} value={provider.id}>
                        {provider.name}
                    </MenuItem>
                ))}
            </Select>
        </FormControl>
    )
}

export default MaterialProviderPicker
