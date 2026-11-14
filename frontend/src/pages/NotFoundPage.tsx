import {Button, Stack, Typography} from '@mui/material'
import {useNavigate, useRouterState} from '@tanstack/react-router'
import {useTranslation} from 'react-i18next'

/**
 * Unbekannte Adresse. Statt TanStacks englischem „Not Found" ohne Layout eine übersetzte Seite mit
 * Rückweg - in der Helfer-App zurück zur Weiche unter /app, sonst zur Startseite.
 */
const NotFoundPage = () => {
    const {t} = useTranslation()
    const navigate = useNavigate()
    const inApp = useRouterState({
        select: s => s.location.pathname === '/app' || s.location.pathname.startsWith('/app/'),
    })

    return (
        <Stack
            spacing={2}
            alignItems="center"
            justifyContent="center"
            p={4}
            sx={{minHeight: '50vh'}}>
            <Typography variant="h1" color="text.secondary" textAlign="center">
                404
            </Typography>
            <Typography variant="h4" component="h2" textAlign="center">
                {t('notFound.title')}
            </Typography>
            <Typography textAlign="center" sx={{maxWidth: 560}}>
                {t('notFound.description')}
            </Typography>
            <Button variant="contained" onClick={() => void navigate({to: inApp ? '/app' : '/'})}>
                {inApp ? t('notFound.appHome') : t('notFound.home')}
            </Button>
        </Stack>
    )
}

export default NotFoundPage
