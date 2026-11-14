import {Button, Chip, Stack} from '@mui/material'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import {useTranslation} from 'react-i18next'
import {getMaterialProvider} from '@api/sdk.gen.ts'
import {useFetch} from '@utils/hooks.ts'

type Props = {
    providerId: string
    /** Entfernt `?provider=`, damit die Auswahl wieder erscheint. */
    onSwitch: () => void
}

/**
 * Seitenkopf-Hinweis für Konten ohne eigene Anbieter-Zuordnung: welcher Anbieter gerade gezeigt
 * wird und ein Knopf zum Wechseln. Ohne ihn sah ein globales Konto nirgends, wessen Daten es vor
 * sich hat, und kam nur über die Seitenleiste zurück zur Auswahl.
 */
const MaterialProviderSwitch = ({providerId, onSwitch}: Props) => {
    const {t} = useTranslation()
    const {data} = useFetch(signal => getMaterialProvider({signal, path: {providerId}}), {
        deps: [providerId],
    })

    return (
        <Stack direction={'row'} gap={0.5} alignItems={'center'} flexWrap={'wrap'}>
            <Chip
                size={'small'}
                variant={'outlined'}
                label={t('material.dashboard.providerShown', {name: data?.name ?? '…'})}
            />
            <Button
                size={'small'}
                startIcon={<SwapHorizIcon />}
                onClick={onSwitch}
                sx={{cursor: 'pointer'}}>
                {t('material.dashboard.switchProvider')}
            </Button>
        </Stack>
    )
}

export default MaterialProviderSwitch
