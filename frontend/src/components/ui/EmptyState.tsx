import {ReactElement, ReactNode} from 'react'
import {Box, Stack, Typography} from '@mui/material'

export type EmptyStateProps = {
    /** MUI-Icon; wird auf 40 px und `text.disabled` gesetzt. */
    icon?: ReactElement
    /** Kurzer Satz, was fehlt („Noch keine Wettkämpfe angelegt"). */
    title: string
    /** Optionaler Folgesatz, was man tun kann. */
    description?: ReactNode
    /** Primäraktion, z. B. „Anlegen" oder „Suche zurücksetzen". */
    action?: ReactNode
    /** Kompakt für Karten und Dashboard-Widgets (weniger Innenabstand). */
    dense?: boolean
}

/**
 * Leerzustand einer Liste, Tabelle, Karte oder Seite – immer derselbe Look statt von Hand
 * gebauter „Keine Einträge"-Zeilen. Für „Suche ohne Treffer" einen eigenen Titel und als
 * `action` das Zurücksetzen der Suche übergeben.
 *
 * @example
 * <EmptyState
 *     icon={<EventBusy />}
 *     title={t('event.empty')}
 *     action={<Button variant="contained" onClick={create}>{t('common.create')}</Button>}
 * />
 */
export const EmptyState = ({icon, title, description, action, dense}: EmptyStateProps) => (
    <Stack
        alignItems={'center'}
        justifyContent={'center'}
        textAlign={'center'}
        spacing={1}
        sx={{py: dense ? 2 : 6, px: 2}}>
        {icon && (
            <Box
                aria-hidden
                sx={{
                    color: 'text.disabled',
                    display: 'flex',
                    '& .MuiSvgIcon-root': {fontSize: dense ? 32 : 40},
                }}>
                {icon}
            </Box>
        )}
        <Typography variant={dense ? 'body2' : 'subtitle1'} component={'p'} sx={{fontWeight: 500}}>
            {title}
        </Typography>
        {description && (
            <Typography
                variant={'body2'}
                color={'text.secondary'}
                component={'div'}
                sx={{maxWidth: '40rem'}}>
                {description}
            </Typography>
        )}
        {action && <Box sx={{pt: 1}}>{action}</Box>}
    </Stack>
)

export default EmptyState
