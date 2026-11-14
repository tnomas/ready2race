import {ReactElement} from 'react'
import {LinkComponentProps} from '@tanstack/react-router'
import {ListItem, ListItemIcon, ListItemText, Tooltip} from '@mui/material'
import {useSidebar} from './SidebarContext.ts'
import {useUser} from '@contexts/user/UserContext.ts'
import {Privilege} from '@api/types.gen.ts'
import {ListItemButtonLink} from '@components/ui/links.tsx'

type Props = {
    text: string
    icon: ReactElement
    /**
     * Aktiv-Zustand von außen, z. B. für Veranstaltungsbereiche (`?tab=`), die auch auf
     * Unterseiten hervorgehoben werden. Ohne Angabe entscheidet der Router (Pfad und Search
     * wie im Link, Unterseiten eingeschlossen; `exact` schließt sie aus).
     */
    active?: boolean
    /** Nur genau dieser Pfad ist aktiv, nicht seine Unterseiten. */
    exact?: boolean
} & (
    | {
          authenticatedOnly?: never
          privilege: Privilege
      }
    | {
          authenticatedOnly?: boolean
          privilege?: never
      }
) &
    Pick<LinkComponentProps<'a'>, 'to' | 'params' | 'search'>

/**
 * Ein Eintrag der Seitenleiste: EIN Link mit EINEM Tabstopp (`ListItemButtonLink`), aktiv mit
 * `aria-current="page"`, eingeklappt mit Tooltip und zugänglichem Namen.
 */
const SidebarItem = ({
    text,
    icon,
    active,
    exact,
    authenticatedOnly,
    privilege,
    ...linkProps
}: Props) => {
    // Alle Hooks vor jedem bedingten `return` — die Sichtbarkeit hängt an Rechten, die sich zur
    // Laufzeit ändern (An-/Abmelden), und eine wechselnde Hook-Zahl bricht React.
    const {isOpen, close, isSmallScreen} = useSidebar()
    const user = useUser()

    const allowed = user.loggedIn
        ? !privilege || user.checkPrivilege(privilege)
        : !authenticatedOnly && !privilege
    if (!allowed) {
        return null
    }

    const controlled = active !== undefined

    const button = (
        <ListItemButtonLink
            {...linkProps}
            // Gesteuert: der Router soll nur bei exakt gleicher Adresse „aktiv" melden, damit sein
            // `aria-current` nie einem anderen Eintrag widerspricht.
            activeOptions={controlled || exact ? {exact: true} : undefined}
            activeProps={controlled ? undefined : {selected: true}}
            selected={controlled ? active : undefined}
            aria-current={controlled && active ? 'page' : undefined}
            aria-label={isOpen ? undefined : text}
            onClick={() => {
                // Nur der Drawer (unter md) schließt nach dem Klick; die feste Leiste bleibt, wie
                // sie ist. Der Drawer schließt hier und nicht erst beim Pfadwechsel, weil ein
                // Bereichswechsel (`?tab=`) den Pfad nicht ändert.
                if (isSmallScreen && isOpen) {
                    close()
                }
            }}
            sx={{
                cursor: 'pointer',
                minHeight: 44,
                mx: 1,
                px: isOpen ? 1.5 : 1,
                justifyContent: isOpen ? 'flex-start' : 'center',
                '&.Mui-selected': {
                    boxShadow: theme => `inset 3px 0 0 ${theme.palette.primary.main}`,
                },
            }}>
            <ListItemIcon
                sx={{
                    minWidth: 0,
                    mr: isOpen ? 2 : 0,
                    justifyContent: 'center',
                    color: 'inherit',
                }}>
                {icon}
            </ListItemIcon>
            {isOpen && <ListItemText primary={text} sx={{margin: 0}} />}
        </ListItemButtonLink>
    )

    return (
        <ListItem disablePadding sx={{display: 'block'}}>
            {isOpen ? (
                button
            ) : (
                <Tooltip title={text} placement={'right'} describeChild>
                    {button}
                </Tooltip>
            )}
        </ListItem>
    )
}

export default SidebarItem
