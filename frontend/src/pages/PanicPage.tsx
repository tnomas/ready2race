import {Trans} from 'react-i18next'
import {
    Alert,
    AlertTitle,
    Button,
    CircularProgress,
    Container,
    Stack,
    Typography,
} from '@mui/material'

type Props = {
    /** Die Seite versucht es von selbst erneut (wachsender Abstand, siehe UserProvider). */
    retrying?: boolean
    /** Sofort erneut versuchen, ohne auf den nächsten automatischen Versuch zu warten. */
    onRetry?: () => void
    /** Ein Versuch läuft gerade. */
    retryPending?: boolean
}

const PanicPage = ({retrying = false, onRetry, retryPending = false}: Props) => {
    return (
        <Container maxWidth={'sm'} sx={{pt: 8}}>
            <Alert
                variant={'outlined'}
                severity={'error'}
                action={
                    onRetry && (
                        <Button
                            color={'inherit'}
                            size={'small'}
                            onClick={onRetry}
                            disabled={retryPending}
                            sx={{cursor: 'pointer'}}>
                            <Trans i18nKey={'panic.retry'} />
                        </Button>
                    )
                }>
                <AlertTitle>
                    <Trans i18nKey={'panic.title'} />
                </AlertTitle>
                <Trans i18nKey={'panic.text'} />
                {retrying && (
                    <Stack direction={'row'} spacing={1} sx={{alignItems: 'center', mt: 2}}>
                        <CircularProgress size={14} color={'inherit'} />
                        <Typography variant={'body2'}>
                            <Trans i18nKey={'panic.retrying'} />
                        </Typography>
                    </Stack>
                )}
            </Alert>
        </Container>
    )
}

export default PanicPage
