import {useState} from 'react'
import {
    Button,
    DialogActions,
    DialogContent,
    DialogTitle,
    TextField,
    Typography,
} from '@mui/material'
import {useTranslation} from 'react-i18next'
import BaseDialog from '@components/BaseDialog.tsx'
import {decideMaterialRequest} from '@api/sdk.gen.ts'
import {useFeedback} from '@utils/hooks.ts'
import {isRequestNetworkError, runRequest} from '@utils/request.ts'
import {materialErrorKey} from '@components/material/materialErrors.ts'

type Props = {
    open: boolean
    eventId: string
    providerId: string
    requestId: string | null
    /** Bestätigen braucht keine Notiz und läuft direkt in der Tabelle, ohne diesen Dialog. */
    status: 'WAITLISTED' | 'DECLINED'
    /**
     * Zuteilungen der Anfrage (Grund und Ausnahmen). Warteliste oder Ablehnung löschen sie im
     * Backend; eine spätere Bestätigung beginnt ohne Stück – das sagt der Dialog vorher.
     */
    assignmentCount: number
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
    assignmentCount,
    onClose,
    onDecided,
}: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [note, setNote] = useState('')
    const [submitting, setSubmitting] = useState(false)
    // Die Seite setzt `status` beim Schließen zurück; während der Ausblend-Animation soll der
    // Dialog aber weiter „Auf Warteliste setzen" zeigen statt kurz auf „Anfrage ablehnen" zu
    // springen. Deshalb gilt der Status, mit dem der Dialog zuletzt offen war.
    const [shownStatus, setShownStatus] = useState(status)
    if (open && status !== shownStatus) {
        setShownStatus(status)
    }

    const handleClose = () => {
        setNote('')
        onClose()
    }

    const handleSubmit = async () => {
        if (requestId == null || submitting) {
            return
        }
        const {error} = await runRequest(setSubmitting, () =>
            decideMaterialRequest({
                path: {eventId, providerId, requestId},
                body: {status, decisionNote: note.trim() === '' ? undefined : note.trim()},
            }),
        )
        if (isRequestNetworkError(error)) {
            feedback.error(t('common.error.network'))
        } else if (error) {
            feedback.error(t(materialErrorKey(error) ?? 'material.decision.error'))
        } else {
            feedback.success(t('material.decision.success'))
            setNote('')
            onDecided()
        }
    }

    return (
        <BaseDialog open={open} onClose={handleClose} maxWidth={'sm'}>
            <DialogTitle>{t(`material.decision.title.${shownStatus}`)}</DialogTitle>
            <DialogContent>
                <Typography variant={'body2'} color={'text.secondary'}>
                    {t(`material.decision.hint.${shownStatus}`)}
                </Typography>
                {assignmentCount > 0 && (
                    <Typography variant={'body2'} sx={{mt: 1}}>
                        {t('material.decision.removesAssignments', {count: assignmentCount})}
                    </Typography>
                )}
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
                <Button onClick={handleClose} disabled={submitting} sx={{cursor: 'pointer'}}>
                    {t('common.cancel')}
                </Button>
                <Button
                    onClick={() => void handleSubmit()}
                    variant={'contained'}
                    color={shownStatus === 'DECLINED' ? 'error' : 'primary'}
                    disabled={submitting}
                    sx={{cursor: 'pointer'}}>
                    {t(`material.decision.title.${shownStatus}`)}
                </Button>
            </DialogActions>
        </BaseDialog>
    )
}

export default MaterialDecisionDialog
