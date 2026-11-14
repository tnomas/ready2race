import {ReactNode} from 'react'
import {Alert, AlertTitle, Box, Button} from '@mui/material'
import {Refresh} from '@mui/icons-material'
import {useTranslation} from 'react-i18next'

export type ErrorStateProps = {
    /**
     * Was nicht geklappt hat, in Worten der Nutzerin. Fehlt er, steht „Die Daten konnten nicht
     * geladen werden." (`ui.loadError`).
     */
    message?: ReactNode
    /** Optionaler fetter Titel über der Meldung. */
    title?: ReactNode
    /** Erneut laden; zeigt den Knopf „Erneut versuchen" (`ui.retry`). */
    onRetry?: () => void
    /** Kompakt für Karten, Widgets und Tabellen (weniger Außenabstand). */
    dense?: boolean
}

/**
 * Fehlerzustand eines Bereichs, der nicht laden konnte – statt einer leeren Fläche oder nur
 * einer Snackbar. Steht dort, wo sonst der Inhalt stünde; der Seitenkopf bleibt darüber
 * sichtbar, damit man weiter navigieren kann.
 *
 * @example
 * const {data, pending, error, reload} = useFetch(...)
 * if (error) return <ErrorState message={t('event.loadError')} onRetry={reload} />
 */
export const ErrorState = ({message, title, onRetry, dense}: ErrorStateProps) => {
    const {t} = useTranslation()
    return (
        <Box sx={{py: dense ? 0 : 2}}>
            <Alert
                severity={'error'}
                action={
                    onRetry && (
                        <Button
                            color={'inherit'}
                            size={'small'}
                            startIcon={<Refresh />}
                            onClick={onRetry}
                            sx={{whiteSpace: 'nowrap'}}>
                            {t('ui.retry')}
                        </Button>
                    )
                }
                sx={{alignItems: 'center'}}>
                {title && <AlertTitle>{title}</AlertTitle>}
                {message ?? t('ui.loadError')}
            </Alert>
        </Box>
    )
}

export default ErrorState
