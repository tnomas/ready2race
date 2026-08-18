import {useState} from 'react'
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    TextField,
} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {canSubmitNote} from './common.ts'

/**
 * Der Grund ist Pflicht — hier durch den deaktivierten Knopf, im Server durch den Validator und
 * in der Datenbank durch `check (btrim(clarification_reason) <> '')`. Der Knopf bietet nicht an,
 * was der Server ohnehin ablehnt; dieselbe Regel wie bei den Schiedsrichter-Notizen.
 */
const ClarificationDialog = ({
    open,
    onClose,
    onSubmit,
}: {
    open: boolean
    onClose: () => void
    onSubmit: (reason: string) => Promise<void>
}) => {
    const {t} = useTranslation()
    const [reason, setReason] = useState('')
    const [busy, setBusy] = useState(false)

    const close = () => {
        setReason('')
        onClose()
    }

    return (
        <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
            <DialogTitle>{t('event.liveDashboard.clarification.dialogTitle')}</DialogTitle>
            <DialogContent>
                <TextField
                    autoFocus
                    fullWidth
                    margin="dense"
                    label={t('event.liveDashboard.clarification.reasonLabel')}
                    placeholder={t('event.liveDashboard.clarification.reasonPlaceholder')}
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={close}>{t('common.cancel')}</Button>
                <Button
                    variant="contained"
                    disabled={!canSubmitNote(reason) || busy}
                    onClick={async () => {
                        setBusy(true)
                        try {
                            await onSubmit(reason.trim())
                            close()
                        } finally {
                            setBusy(false)
                        }
                    }}>
                    {t('event.liveDashboard.clarification.submit')}
                </Button>
            </DialogActions>
        </Dialog>
    )
}

export default ClarificationDialog
