import {useTranslation} from 'react-i18next'
import {PropsWithChildren, useMemo, useState} from 'react'
import {Confirmation, ConfirmationContext, ConfirmationOptions} from './ConfirmationContext'
import {Button, DialogActions, DialogContent, DialogTitle} from '@mui/material'
import BaseDialog from '@components/BaseDialog.tsx'

type ConfirmationState =
    | {
          open: false
          action: null
          options?: ConfirmationOptions
      }
    | {
          open: true
          action: () => void
          options?: ConfirmationOptions
      }

const closedConfirmation = (options?: ConfirmationOptions): ConfirmationState => ({
    open: false,
    action: null,
    options: options, // to avoid changing content right before closing dialog
})

export const ConfirmationProvider = (props: PropsWithChildren) => {
    const {t} = useTranslation()
    const [confirmation, setConfirmation] = useState<ConfirmationState>(closedConfirmation)

    const handleCancel = () => {
        if (confirmation.open) {
            confirmation.options?.cancelAction?.()
        }
        setConfirmation(closedConfirmation(confirmation.options))
    }

    const handleConfirm = () => {
        // Nach dem ersten Klick ist `open` im nächsten Render falsch: ein Doppelklick während der
        // Ausblend-Animation löst die Aktion nicht ein zweites Mal aus.
        if (confirmation.open) {
            confirmation.action()
        }
        setConfirmation(closedConfirmation(confirmation.options))
    }

    // Stabil über alle Renderdurchläufe: Jede Öffnung oder Schließung der Bestätigung hätte sonst
    // alle Verbraucher des Kontexts (jede Tabelle, jeden Dialog) neu gerendert.
    const confirmationValue: Confirmation = useMemo(
        () => ({
            confirmAction: (action, options) =>
                setConfirmation({
                    open: true,
                    action,
                    options,
                }),
        }),
        [],
    )

    const destructive = confirmation.options?.destructive ?? false

    return (
        <ConfirmationContext.Provider value={confirmationValue}>
            {props.children}
            <BaseDialog
                open={confirmation.open}
                onClose={handleCancel}
                maxWidth={'sm'}
                mobileFullScreen={false}
                aria-labelledby={'confirmation-dialog-title'}>
                <DialogTitle id={'confirmation-dialog-title'}>
                    {confirmation.options?.title ?? t('common.confirmation.title')}
                </DialogTitle>
                <DialogContent dividers>
                    {confirmation.options?.content ?? t('common.confirmation.content')}
                </DialogContent>
                <DialogActions>
                    <Button
                        variant={'text'}
                        onClick={handleCancel}
                        sx={confirmation.options?.buttonsSX}>
                        {confirmation.options?.cancelText ?? t('common.cancel')}
                    </Button>
                    <Button
                        variant={'contained'}
                        color={destructive ? 'error' : 'primary'}
                        onClick={handleConfirm}
                        sx={confirmation.options?.buttonsSX}>
                        {confirmation.options?.okText ?? t('common.ok')}
                    </Button>
                </DialogActions>
            </BaseDialog>
        </ConfirmationContext.Provider>
    )
}
