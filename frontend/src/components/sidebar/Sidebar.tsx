import {Box, Divider, List} from '@mui/material'
import {SidebarContext, SidebarProps} from './SidebarContext.ts'
import {PropsWithChildren} from 'react'
import {useTranslation} from 'react-i18next'

const SIDEBAR_OPEN_WIDTH = 264

const Sidebar = ({children, ...props}: PropsWithChildren<SidebarProps>) => {
    const {t} = useTranslation()
    return (
        <Box
            component={'nav'}
            aria-label={t('nav.mainLabel')}
            sx={{
                display: 'flex',
                // Ausgeklappt feste Breite: sonst spränge die Leiste zwischen Seiten mit und ohne
                // Veranstaltungsblock (lange Namen) hin und her.
                width: props.isSmallScreen ? '100%' : props.isOpen ? SIDEBAR_OPEN_WIDTH : undefined,
                flexShrink: 0,
                flex: props.isSmallScreen ? 1 : undefined,
            }}>
            <SidebarContext.Provider value={props}>
                <List sx={{width: '100%', flex: 1, display: 'flex', flexDirection: 'column'}}>
                    {children}
                </List>
            </SidebarContext.Provider>
            <Divider orientation={'vertical'} />
        </Box>
    )
}

export default Sidebar
