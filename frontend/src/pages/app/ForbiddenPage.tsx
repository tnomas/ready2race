import {Button, Stack, Typography} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {useUser} from '@contexts/user/UserContext.ts'

/**
 * Wer keine einzige Welt betreten darf, landet hier. Der Knopf meldet ab statt zurückzuführen:
 * Ein Zurück ohne Abmelden führt über die Weiche sofort wieder hierher.
 */
const ForbiddenPage = () => {
    const {t} = useTranslation()
    const user = useUser()

    return (
        <Stack spacing={2} alignItems="center" justifyContent="center" p={4}>
            <Typography variant="h2" color="error" textAlign="center">
                {t('app.forbidden.title')}
            </Typography>
            <Typography textAlign="center">{t('app.forbidden.message')}</Typography>
            <Button variant="contained" onClick={() => 'logout' in user && user.logout(true)}>
                {t('user.settings.logout')}
            </Button>
        </Stack>
    )
}

export default ForbiddenPage
