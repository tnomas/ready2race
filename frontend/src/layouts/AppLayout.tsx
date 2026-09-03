import {useEffect} from 'react'
import {Outlet} from '@tanstack/react-router'
import {Container, Box, Button} from '@mui/material'
import {useSnackbar} from 'notistack'
import {useTranslation} from 'react-i18next'
import {AppSessionProvider} from '@contexts/app/AppSessionContext.tsx'
import {useRegisterAppSW} from '@pwa/registerAppSW.ts'

const AppLayout = () => {
    const {t} = useTranslation()
    const {enqueueSnackbar} = useSnackbar()
    const {needRefresh, updateApp} = useRegisterAppSW()

    useEffect(() => {
        if (needRefresh) {
            enqueueSnackbar(t('app.update.available'), {
                variant: 'info',
                persist: true,
                action: (
                    <Button color="inherit" size="small" onClick={updateApp}>
                        {t('app.update.reload')}
                    </Button>
                ),
            })
        }
    }, [needRefresh, enqueueSnackbar, t, updateApp])

    return (
        <Container
            className="mobile-optimized-layout"
            maxWidth="lg"
            sx={{
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                px: {xs: 2, sm: 3},
                // Safe-Areas: Die installierte App läuft ohne Browser-Leiste bis unter die Kerbe und die
                // Home-Leiste, sonst liegt die Kopfzeile unter der Uhr.
                pt: 'calc(env(safe-area-inset-top) + 12px)',
                pb: 'calc(env(safe-area-inset-bottom) + 16px)',
            }}>
            <Box
                component="main"
                sx={{
                    width: '100%',
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                }}>
                <AppSessionProvider>
                    <Outlet />
                </AppSessionProvider>
            </Box>
        </Container>
    )
}

export default AppLayout
