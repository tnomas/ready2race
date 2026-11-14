import Sidebar from '@components/sidebar/Sidebar.tsx'
import SidebarItem from '@components/sidebar/SidebarItem.tsx'
import {
    AdminPanelSettings,
    Assessment,
    ChevronLeft,
    ChevronRight,
    Dashboard,
    Event,
    Groups,
    Home,
    People,
    PhoneAndroid,
    Receipt,
    Sailing,
    Settings,
    Work,
    Workspaces,
} from '@mui/icons-material'
import {Box, Divider, IconButton, ListSubheader, Tooltip, Typography} from '@mui/material'
import EventSidebarSection from '@components/sidebar/EventSidebarSection.tsx'
import {useLocation, useRouter} from '@tanstack/react-router'
import {isMaterialWorkplacePath} from '../../pages/material/materialDashboardLogic.ts'
import {
    readAdministrationConfigGlobal,
    readClubGlobal,
    readClubOwn,
    readInvoiceGlobal,
    readMaterialGlobal,
    readMaterialOwn,
    readRoleGlobal,
    readUserGlobal,
    updateEventGlobal,
} from '@authorization/privileges.ts'
import {useTranslation} from 'react-i18next'
import {useUser} from '@contexts/user/UserContext.ts'
import {useThemeConfig} from '@contexts/theme/ThemeContext.ts'
import Config from '../../Config.ts'

type Props = {
    drawerExpanded: boolean
    setDrawerExpanded: (expanded: boolean) => void
    isSmallScreen: boolean
}

const SidebarContent = ({...props}: Props) => {
    const {t} = useTranslation()
    const user = useUser()
    const {themeConfig} = useThemeConfig()
    const location = useLocation()
    const router = useRouter()
    // „Material" ist der Arbeitsplatz des Anbieters (Wahl, Dashboard, Flotte); die Stammdaten
    // unter /material/admin haben ihren eigenen Eintrag im Verwaltungsblock.
    const materialActive = isMaterialWorkplacePath(location.pathname, router.basepath)

    // Überschrift „Verwaltung" nur, wenn mindestens ein Eintrag darunter sichtbar ist.
    const showManagement =
        user.loggedIn &&
        [
            readUserGlobal,
            readRoleGlobal,
            updateEventGlobal,
            readMaterialGlobal,
            readAdministrationConfigGlobal,
        ].some(privilege => user.checkPrivilege(privilege))

    const showCustomLogo =
        themeConfig?.customLogo?.enabled === true &&
        themeConfig.customLogo?.filename !== null &&
        themeConfig.customLogo.filename !== undefined

    return (
        <Sidebar
            isOpen={props.drawerExpanded}
            open={() => props.setDrawerExpanded(true)}
            close={() => props.setDrawerExpanded(false)}
            isSmallScreen={props.isSmallScreen}>
            {!props.isSmallScreen && (
                <>
                    <Tooltip
                        title={t(
                            props.drawerExpanded
                                ? 'navigation.sidebar.collapse'
                                : 'navigation.sidebar.expand',
                        )}
                        placement="right"
                        arrow>
                        <IconButton
                            aria-label={t(
                                props.drawerExpanded
                                    ? 'navigation.sidebar.collapse'
                                    : 'navigation.sidebar.expand',
                            )}
                            aria-expanded={props.drawerExpanded}
                            onClick={() => props.setDrawerExpanded(!props.drawerExpanded)}
                            sx={{
                                width: '100%',
                                borderRadius: 0,
                                py: 1.5,
                                justifyContent: 'flex-end',
                                px: 2,
                            }}>
                            {props.drawerExpanded ? <ChevronLeft /> : <ChevronRight />}
                        </IconButton>
                    </Tooltip>
                    <Divider sx={{my: 1}} />
                </>
            )}
            {props.isSmallScreen && (
                <>
                    <SidebarItem
                        text={t('landing.smallScreen.to.results')}
                        icon={<Assessment />}
                        to={'/results'}
                    />
                    <SidebarItem
                        text={t('landing.smallScreen.to.app')}
                        icon={<PhoneAndroid />}
                        to={'/app'}
                    />
                    <Divider sx={{my: 1}} />
                </>
            )}
            {!user.loggedIn && (
                <SidebarItem text={t('navigation.titles.landing')} icon={<Home />} to={'/'} exact />
            )}
            <SidebarItem
                text={t('navigation.titles.dashboard')}
                icon={<Dashboard />}
                authenticatedOnly
                to={'/dashboard'}
            />
            {/* `exact`: innerhalb einer Veranstaltung ist ihr Bereich hervorgehoben, nicht die Liste. */}
            <SidebarItem
                text={t('navigation.titles.events')}
                icon={<Event />}
                to={'/event'}
                exact
            />
            {user.loggedIn && user.clubId && (
                <SidebarItem
                    text={t('navigation.titles.myClub')}
                    icon={<Workspaces />}
                    privilege={readClubOwn}
                    to={'/club/$clubId'}
                    params={{clubId: user.clubId}}
                />
            )}
            <SidebarItem
                text={t('navigation.titles.clubs')}
                icon={<Groups />}
                privilege={readClubGlobal}
                to={'/club'}
                exact
            />
            {/* Arbeitsplatz der Materialvermietung: READ MATERIAL OWN (der eigene Anbieter); wer
                GLOBAL trägt, wählt dort einen Anbieter. Die Stammdaten stehen unter Verwaltung. */}
            <SidebarItem
                text={t('navigation.titles.material')}
                icon={<Sailing />}
                privilege={readMaterialOwn}
                to={'/material'}
                active={materialActive}
            />
            <SidebarItem
                text={t('navigation.titles.invoices')}
                icon={<Receipt />}
                privilege={readInvoiceGlobal}
                to={'/invoices'}
            />
            {showManagement && (
                <>
                    {props.drawerExpanded ? (
                        <ListSubheader
                            disableSticky
                            sx={{
                                lineHeight: '32px',
                                mt: 1,
                                bgcolor: 'transparent',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                            }}>
                            {t('nav.management')}
                        </ListSubheader>
                    ) : (
                        <Divider component={'li'} sx={{my: 0.5, mx: 1}} />
                    )}
                    <SidebarItem
                        text={t('navigation.titles.users')}
                        icon={<People />}
                        privilege={readUserGlobal}
                        to={'/user'}
                    />
                    {/* Dasselbe Recht wie die Route (rolesIndexRoute). */}
                    <SidebarItem
                        text={t('navigation.titles.roles')}
                        icon={<Work />}
                        privilege={readRoleGlobal}
                        to={'/role'}
                    />
                    <SidebarItem
                        text={t('navigation.titles.config')}
                        icon={<Settings />}
                        privilege={updateEventGlobal}
                        to={'/config'}
                    />
                    <SidebarItem
                        text={t('navigation.titles.materialAdmin')}
                        icon={<Sailing />}
                        privilege={readMaterialGlobal}
                        to={'/material/admin'}
                    />
                    <SidebarItem
                        text={t('navigation.titles.administration')}
                        icon={<AdminPanelSettings />}
                        privilege={readAdministrationConfigGlobal}
                        to={'/administration'}
                    />
                </>
            )}
            <EventSidebarSection />
            {props.isSmallScreen && (
                <Box
                    sx={{
                        marginTop: 'auto',
                        px: 3,
                        py: 3,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                    }}>
                    <Typography variant="subtitle1" fontWeight={'bold'}>
                        Ready2Race
                    </Typography>
                    {showCustomLogo && (
                        <>
                            <Divider
                                sx={{
                                    width: '80%',
                                    my: 1.5,
                                }}
                            />
                            <Box
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 2,
                                }}>
                                <Typography
                                    variant="subtitle2"
                                    sx={{
                                        color: 'text.secondary',
                                    }}>
                                    {t('common.for')}
                                </Typography>
                                <Box
                                    component={'img'}
                                    src={`${Config.logosUrl}/${themeConfig.customLogo.filename}`}
                                    alt={'Custom Logo'}
                                    sx={{
                                        height: {xs: 36, sm: 44},
                                        width: 'auto',
                                        maxWidth: '140px',
                                    }}
                                />
                            </Box>
                        </>
                    )}
                </Box>
            )}
        </Sidebar>
    )
}

export default SidebarContent
