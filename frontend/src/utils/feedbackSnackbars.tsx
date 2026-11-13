import {ComponentType} from 'react'
import {styled} from '@mui/material'
import {CustomContentProps, MaterialDesignContent, SnackbarProviderProps} from 'notistack'

/**
 * Stil der Rückmeldungen (Snackbars) für `SnackbarProvider`: Fläche des Themes, feiner Rahmen
 * und ein Farbbalken links in der Statusfarbe – lesbar auf jedem Mandanten-Theme, ohne die
 * Statusfarbe als Textfläche zu benutzen. Ersetzt den früheren Inline-`style` in `useFeedback`.
 *
 * Einbindung (App.tsx): `<SnackbarProvider Components={feedbackSnackbarComponents} …>`
 */
const StyledContent = styled(MaterialDesignContent)(({theme}) => {
    const variant = (key: 'success' | 'warning' | 'error' | 'info') => ({
        borderLeftColor: theme.palette[key].main,
    })
    return {
        '&.notistack-MuiContent': {
            flexWrap: 'nowrap',
            backgroundColor: theme.palette.background.paper,
            color: theme.palette.text.primary,
            border: `1px solid ${theme.palette.border ?? theme.palette.divider}`,
            borderLeftWidth: 4,
            boxShadow: theme.shadows[3],
            '& #notistack-snackbar': {alignItems: 'center'},
        },
        '&.notistack-MuiContent-success': variant('success'),
        '&.notistack-MuiContent-warning': variant('warning'),
        '&.notistack-MuiContent-error': variant('error'),
        '&.notistack-MuiContent-info': variant('info'),
    }
})

type Components = NonNullable<SnackbarProviderProps['Components']>

export const feedbackSnackbarComponents: Components = {
    success: StyledContent as ComponentType<CustomContentProps>,
    warning: StyledContent as ComponentType<CustomContentProps>,
    error: StyledContent as ComponentType<CustomContentProps>,
    info: StyledContent as ComponentType<CustomContentProps>,
}
