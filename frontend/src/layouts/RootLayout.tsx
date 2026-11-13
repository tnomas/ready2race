import {Outlet, useLocation, useMatchRoute} from '@tanstack/react-router'
import {
    AppBar,
    Box,
    Chip,
    Divider,
    Drawer,
    IconButton,
    Stack,
    Toolbar,
    Typography,
    useMediaQuery,
    useTheme,
} from '@mui/material'
import {useEffect, useState} from 'react'
import {Login, Menu, MenuOpen} from '@mui/icons-material'
import UserWidget from '@components/appbar/UserWidget.tsx'
import {useTranslation} from 'react-i18next'
import {useUser} from '@contexts/user/UserContext.ts'
import LanguageWidget from '@components/appbar/LanguageWidget.tsx'
import SidebarContent from '@components/sidebar/SidebarContent.tsx'
import {useThemeConfig} from '@contexts/theme/ThemeContext.ts'
import Config from '../Config.ts'
import {FullWidthLayoutContext} from './fullWidthLayout.ts'
import {AdminThemeScope, LegacyThemeScope} from '../theme/AdminThemeScope.tsx'
import {ButtonLink, TextLink} from '@components/ui/links.tsx'

/** Innere Inhaltsbreite des Verwaltungsrahmens (der Rahmen selbst ist vollflächig). */
const CONTENT_MAX_WIDTH = 1600

/**
 * Vollbild-Arbeitsplätze unter diesem Layout, die ihr eigenes, fertig gestaltetes Erscheinungsbild
 * haben und deshalb das unveränderte Mandanten-Theme behalten (LegacyThemeScope): Regie,
 * Leitstand, Zeitnahme-Posten und Startanzeige liegen als `position: fixed` über dem Rahmen.
 * Das Schiedsrichter-Dashboard steht im Rahmen, ist aber eine Renntags-Arbeitsfläche am Steg
 * (Tablet): unter dem Verwaltungs-Theme schrumpften alle Überschriften (Laufname, „geplant
 * 18:06", Platzziffern) von 20,8 auf 16 px – deshalb behält auch sein Inhalt das
 * Mandanten-Theme; nur der Rahmen (Kopfleiste, Seitenleiste, Arbeitsfläche) ist neu.
 */
const useIsLegacyThemeRoute = (): boolean => {
    const matchRoute = useMatchRoute()
    return Boolean(
        matchRoute({to: '/event/$eventId/streamPanel'}) ||
            matchRoute({to: '/event/$eventId/timing', fuzzy: true}) ||
            matchRoute({to: '/event/$eventId/liveDashboard'}),
    )
}

/**
 * Rahmen der Verwaltungsoberfläche: Kopfleiste, Seitenleiste, Arbeitsfläche. Legt das
 * Verwaltungs-Theme über alles darunter (siehe theme/adminTheme.ts).
 */
const RootLayout = () => (
    <AdminThemeScope>
        <RootLayoutFrame />
    </AdminThemeScope>
)

const RootLayoutFrame = () => {
    const {t} = useTranslation()
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))
    const [drawerExpanded, setDrawerExpanded] = useState(!isMobile)
    const user = useUser()
    const location = useLocation()
    const matchRoute = useMatchRoute()
    const {themeConfig} = useThemeConfig()
    const logo = Config.r2rLogoUrl

    const languageSet = Boolean(document.getElementById('ready2race-root')!.dataset.lng)

    const isOnLoginRoute = matchRoute({to: '/login'})
    const isOnRegistrationRoute = matchRoute({to: '/registration'})

    // Einzelne Ansichten (Veranstaltungs-Modus im Zeitplan-Tab) heben die Beschränkung der
    // Inhaltsbreite vorübergehend auf — siehe fullWidthLayout.ts.
    const [fullWidth, setFullWidth] = useState(false)
    const legacyTheme = useIsLegacyThemeRoute()

    // Auto-close drawer on navigation when on mobile
    useEffect(() => {
        if (isMobile && drawerExpanded) {
            setDrawerExpanded(false)
        }
    }, [location.pathname, isMobile])

    const customLogo =
        themeConfig?.customLogo?.enabled && themeConfig?.customLogo?.filename
            ? `${Config.logosUrl}/${themeConfig.customLogo.filename}`
            : null
    const showModeChip = Config.mode === 'development' || Config.mode === 'test'

    return (
        <FullWidthLayoutContext.Provider value={setFullWidth}>
            <Box
                sx={{
                    minHeight: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                    bgcolor: 'canvas',
                }}>
                <AppBar position={'static'}>
                    <Toolbar sx={{justifyContent: 'space-between', gap: 1}}>
                        <Stack
                            direction={'row'}
                            spacing={{xs: 1, sm: 2}}
                            alignItems={'center'}
                            sx={{minWidth: 0}}>
                            {isMobile && (
                                <IconButton
                                    edge={'start'}
                                    aria-label={
                                        drawerExpanded
                                            ? t('navigation.sidebar.collapse')
                                            : t('navigation.sidebar.expand')
                                    }
                                    aria-expanded={drawerExpanded}
                                    onClick={() => setDrawerExpanded(prev => !prev)}>
                                    {drawerExpanded ? <MenuOpen /> : <Menu />}
                                </IconButton>
                            )}
                            <Box
                                component={'img'}
                                src={logo}
                                alt={'Ready2Race Logo'}
                                sx={{height: {xs: 24, sm: 32, md: 40}, width: 'auto'}}
                            />
                            {customLogo && (
                                <>
                                    <Typography
                                        variant={'subtitle2'}
                                        color={'text.secondary'}
                                        sx={{display: {xs: 'none', sm: 'block'}}}>
                                        {t('common.for')}
                                    </Typography>
                                    <Box
                                        component={'img'}
                                        src={customLogo}
                                        alt={'Custom Logo'}
                                        sx={{height: {xs: 24, sm: 32, md: 40}, width: 'auto'}}
                                    />
                                </>
                            )}
                            {showModeChip && (
                                <Chip
                                    size={'small'}
                                    label={Config.mode === 'development' ? 'Dev-Mode' : 'Test-Mode'}
                                    color={Config.mode === 'development' ? 'warning' : 'secondary'}
                                    sx={{fontWeight: 600}}
                                />
                            )}
                        </Stack>
                        <Stack direction={'row'} spacing={1} sx={{flexShrink: 0}}>
                            {!languageSet && <LanguageWidget />}
                            <UserWidget />
                        </Stack>
                    </Toolbar>
                </AppBar>
                <Box sx={{display: 'flex', position: 'relative', flex: 1}}>
                    {isMobile ? (
                        <Drawer
                            variant="temporary"
                            open={drawerExpanded}
                            onClose={() => setDrawerExpanded(false)}
                            ModalProps={{
                                keepMounted: true,
                            }}
                            className={'ready2race'}
                            sx={{
                                '& .MuiDrawer-paper': {
                                    boxSizing: 'border-box',
                                    width: 280,
                                },
                            }}>
                            <SidebarContent
                                drawerExpanded={drawerExpanded}
                                setDrawerExpanded={setDrawerExpanded}
                                isSmallScreen={isMobile}
                            />
                        </Drawer>
                    ) : (
                        <Box sx={{display: 'flex', bgcolor: 'background.paper'}}>
                            <SidebarContent
                                drawerExpanded={drawerExpanded}
                                setDrawerExpanded={setDrawerExpanded}
                                isSmallScreen={isMobile}
                            />
                        </Box>
                    )}
                    <Stack
                        component={'main'}
                        sx={{
                            padding: {xs: 2, sm: 3, md: 4},
                            boxSizing: 'border-box',
                            flex: 1,
                            minWidth: 0,
                        }}>
                        <Stack
                            sx={{
                                width: '100%',
                                maxWidth: fullWidth ? 'none' : CONTENT_MAX_WIDTH,
                                mx: 'auto',
                                flex: 1,
                                justifyContent: 'space-between',
                            }}>
                            {legacyTheme ? (
                                <LegacyThemeScope>
                                    <Outlet />
                                </LegacyThemeScope>
                            ) : (
                                <Outlet />
                            )}
                            {!user.loggedIn && (
                                <Stack
                                    mt={3}
                                    spacing={{xs: 1, sm: 2}}
                                    direction={{xs: 'column', sm: 'row'}}
                                    alignItems={'center'}
                                    divider={
                                        !isMobile && <Divider orientation={'vertical'} flexItem />
                                    }
                                    justifyContent={'center'}>
                                    {!isOnLoginRoute && (
                                        <ButtonLink
                                            to={'/login'}
                                            endIcon={<Login />}
                                            fullWidth={isMobile}>
                                            {t('user.login.login')}
                                        </ButtonLink>
                                    )}
                                    {!isOnRegistrationRoute && (
                                        <Stack
                                            direction={isMobile ? 'column' : 'row'}
                                            spacing={0.5}
                                            justifyContent="center"
                                            sx={{textAlign: 'center'}}>
                                            <Typography variant={'body2'} color={'text.secondary'}>
                                                {t('user.login.signUp.message')}
                                            </Typography>
                                            <TextLink to="/registration" variant={'body2'}>
                                                {t('user.login.signUp.link')}
                                            </TextLink>
                                        </Stack>
                                    )}
                                </Stack>
                            )}
                        </Stack>
                    </Stack>
                </Box>
            </Box>
        </FullWidthLayoutContext.Provider>
    )
}

export default RootLayout
