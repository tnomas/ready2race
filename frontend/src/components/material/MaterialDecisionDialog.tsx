import {useState} from 'react'
import {Button, DialogActions, DialogContent, DialogTitle, TextField} from '@mui/material'
import {useTranslation} from 'react-i18next'
import BaseDialog from '@components/BaseDialog.tsx'
import {decideMaterialRequest} from '@api/sdk.gen.ts'
import {useFeedback} from '@utils/hooks.ts'

type Props = {
    open: boolean
    eventId: string
    providerId: string
    requestId: string | null
    /** Bestätigen braucht keine Notiz und läuft direkt in der Tabelle, ohne diesen Dialog. */
    status: 'WAITLISTED' | 'DECLINED'
    onClose: () => void
    onDecided: () => void
}

/**
 * Notiz-Dialog für Warteliste und Ablehnung - die einzigen zwei Entscheidungen, bei denen eine
 * Begründung sinnvoll ist. `requestId` ist null, solange der Dialog geschlossen ist, damit das
 * Formular ihn nicht zwischenspeichern muss.
 */
const MaterialDecisionDialog = ({
    open,
    eventId,
    providerId,
    requestId,
    status,
    onClose,
    onDecided,
}: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [note, setNote] = useState('')
    const [submitting, setSubmitting] = useState(false)

    const handleClose = () => {
        setNote('')
        onClose()
    }

    const handleSubmit = async () => {
        if (requestId == null) {
            return
        }
        setSubmitting(true)
        const {error} = await decideMaterialRequest({
            path: {eventId, providerId, requestId},
            body: {status, decisionNote: note.trim() === '' ? undefined : note.trim()},
        })
        setSubmitting(false)
        if (error) {
            feedback.error(t('material.decision.error'))
        } else {
            feedback.success(t('material.decision.success'))
            setNote('')
            onDecided()
        }
    }

    return (
        <BaseDialog open={open} onClose={handleClose} maxWidth={'sm'}>
            <DialogTitle>{t(`material.decision.title.${status}`)}</DialogTitle>
            <DialogContent>
                <TextField
                    autoFocus
                    fullWidth
                    multiline
                    minRows={2}
                    label={t('material.decision.note')}
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    sx={{mt: 1}}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose} disabled={submitting}>
                    {t('common.cancel')}
                </Button>
                <Button
                    onClick={() => void handleSubmit()}
                    variant={'contained'}
                    color={status === 'DECLINED' ? 'error' : 'primary'}
                    disabled={submitting}>
                    {t(`material.decision.title.${status}`)}
                </Button>
            </DialogActions>
        </BaseDialog>
    )
}

export default MaterialDecisionDialog
