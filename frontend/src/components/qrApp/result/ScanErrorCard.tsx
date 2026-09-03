import {Alert, AlertTitle, Button, Stack} from '@mui/material'
import {useTranslation} from 'react-i18next'

type Props = {
    title: string
    message: string
    onRescan: () => void
}

export const ScanErrorCard = ({title, message, onRescan}: Props) => {
    const {t} = useTranslation()
    return (
        <Stack spacing={2} sx={{width: 1}}>
            <Alert severity="error" sx={{p: 2}}>
                <AlertTitle>{title}</AlertTitle>
                {message}
            </Alert>
            <Button variant="contained" size="large" fullWidth onClick={onRescan}>
                {t('app.result.rescan')}
            </Button>
        </Stack>
    )
}
