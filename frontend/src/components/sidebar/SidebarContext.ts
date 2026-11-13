import {createContext, useContext} from 'react'

export type SidebarProps = {
    isOpen: boolean
    open: () => void
    close: () => void
    /** Unter `md`: die Seitenleiste ist ein Drawer über dem Inhalt und schließt nach jedem Klick. */
    isSmallScreen: boolean
}

export const SidebarContext = createContext<SidebarProps | null>(null)

export const useSidebar = (): SidebarProps => {
    const props = useContext(SidebarContext)
    if (props === null) {
        throw Error('Sidebar context not initialized')
    }
    return props
}
