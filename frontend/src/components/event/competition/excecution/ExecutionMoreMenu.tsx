import {Divider, IconButton, ListItemText, Menu, MenuItem, Tooltip} from '@mui/material'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import {Fragment, MouseEvent, useId, useState} from 'react'
import {statusTextColor} from '../../../../theme/themeColors.ts'

export type ExecutionMoreMenuItem = {
    id: string
    label: string
    onSelect: () => void
    /** Zerstörerisch: steht abgesetzt hinter einer Trennlinie und in Fehlerfarbe. */
    destructive?: boolean
}

type Props = {
    /** Vorgelesener Name des Menüknopfs, z. B. „Weitere Aktionen". */
    label: string
    items: ExecutionMoreMenuItem[]
    disabled?: boolean
}

/**
 * Das eine Überlaufmenü der Durchführung (Lauf-Karte und Runden-Kopf): ein ⋮-Knopf, eine flache
 * Liste ohne Untermenüs. Zerstörerische Einträge stehen zuletzt, durch eine Linie abgesetzt; ihre
 * Bestätigung bleibt Sache des Aufrufers.
 */
const ExecutionMoreMenu = ({label, items, disabled}: Props) => {
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
    const open = anchorEl !== null
    const baseId = useId()
    const buttonId = `${baseId}-button`
    const menuId = `${baseId}-menu`

    if (items.length === 0) return null

    const regular = items.filter(item => !item.destructive)
    const destructive = items.filter(item => item.destructive)

    const select = (item: ExecutionMoreMenuItem) => {
        setAnchorEl(null)
        item.onSelect()
    }

    return (
        <Fragment>
            <Tooltip title={label}>
                {/* span: Tooltip braucht ein Element, das auch im gesperrten Zustand Maus-Ereignisse annimmt. */}
                <span>
                    <IconButton
                        id={buttonId}
                        aria-label={label}
                        aria-haspopup={'menu'}
                        aria-controls={open ? menuId : undefined}
                        aria-expanded={open ? 'true' : undefined}
                        disabled={disabled}
                        onClick={(e: MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget)}
                        sx={{cursor: 'pointer'}}>
                        <MoreVertIcon />
                    </IconButton>
                </span>
            </Tooltip>
            <Menu
                id={menuId}
                anchorEl={anchorEl}
                open={open}
                onClose={() => setAnchorEl(null)}
                disableScrollLock
                anchorOrigin={{vertical: 'bottom', horizontal: 'right'}}
                transformOrigin={{vertical: 'top', horizontal: 'right'}}
                MenuListProps={{'aria-labelledby': buttonId, dense: true}}>
                {regular.map(item => (
                    <MenuItem key={item.id} onClick={() => select(item)}>
                        <ListItemText>{item.label}</ListItemText>
                    </MenuItem>
                ))}
                {regular.length > 0 && destructive.length > 0 && <Divider />}
                {destructive.map(item => (
                    <MenuItem
                        key={item.id}
                        onClick={() => select(item)}
                        sx={{color: theme => statusTextColor(theme, 'error')}}>
                        <ListItemText>{item.label}</ListItemText>
                    </MenuItem>
                ))}
            </Menu>
        </Fragment>
    )
}

export default ExecutionMoreMenu
