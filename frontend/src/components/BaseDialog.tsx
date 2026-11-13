import {Dialog, DialogProps, IconButton, useMediaQuery, useTheme} from '@mui/material'
import {Close} from '@mui/icons-material'
import {useTranslation} from 'react-i18next'

export type BaseDialogProps = Omit<DialogProps, 'onClose'> & {
    onClose: () => void
    noTopRightClose?: boolean
    /**
     * Auf Handybreite (xs) als Vollbild öffnen (Standard `true`). Ein ausdrückliches `fullScreen`
     * gewinnt immer; `false` hier hält kleine Rückfragen als schwebendes Fenster.
     */
    mobileFullScreen?: boolean
}

const BaseDialog = ({
    className,
    onClose,
    children,
    noTopRightClose,
    mobileFullScreen = true,
    fullScreen,
    sx,
    ...props
}: BaseDialogProps) => {
    const {t} = useTranslation()
    const theme = useTheme()
    // noSsr: sonst liefert der erste Render `false`, und der Dialog springt nach dem Öffnen ins Vollbild.
    const isXs = useMediaQuery(theme.breakpoints.down('sm'), {noSsr: true})

    return (
        <Dialog
            scroll={'paper'}
            fullWidth
            fullScreen={fullScreen ?? (mobileFullScreen && isXs)}
            {...props}
            sx={[
                // Lange Titel laufen nicht unter den Schließen-Knopf.
                !noTopRightClose && {'& .MuiDialogTitle-root': {pr: 7}},
                ...(Array.isArray(sx) ? sx : [sx]),
            ]}
            className={'ready2race' + (className ? ` ${className}` : '')}
            onClose={(_, reason) => {
                // Ein Klick auf den Hintergrund schließt bewusst nicht (Datenverlustschutz).
                if (reason === 'escapeKeyDown') {
                    onClose()
                }
            }}>
            {!noTopRightClose && (
                <IconButton
                    aria-label={t('common.close')}
                    onClick={onClose}
                    size={'small'}
                    sx={{
                        position: 'absolute',
                        right: 12,
                        top: 12,
                        cursor: 'pointer',
                    }}>
                    <Close />
                </IconButton>
            )}
            {children}
        </Dialog>
    )
}

export default BaseDialog
