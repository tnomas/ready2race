import {Box, CircularProgress, CircularProgressProps} from '@mui/material'
import {useTranslation} from 'react-i18next'

type Props = CircularProgressProps

/**
 * Kleiner Lade-Spinner für Stellen, an denen ein Skelett nicht passt (Dialoge, Alert-Icons,
 * Menüeinträge, Vollbild-Ansichten). Für Seiten und Abschnitte `LoadingState` aus
 * `@components/ui` nehmen. Meldet sich per `role="status"` bei Screenreadern.
 */
const Throbber = ({...rest}: Props) => {
    const {t} = useTranslation()
    const throbberSize = rest.size ?? 24
    return (
        <Box role={'status'} aria-label={t('ui.loading')} sx={{height: 1, display: 'flex'}}>
            <CircularProgress size={throbberSize} aria-hidden sx={{m: 'auto'}} />
        </Box>
    )
}

export default Throbber
