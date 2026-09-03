import {Button} from '@mui/material'
import {useState} from 'react'
import {useTranslation} from 'react-i18next'
import {deleteQrCode} from '@api/sdk.gen.ts'
import {useFeedback} from '@utils/hooks.ts'
import {QrDeleteDialog} from '@components/qrApp/QrDeleteDialog'

type Props = {
    qrCodeId: string
    bandType: 'participant' | 'appuser'
    /** Primär in der Bandverwaltung; als Nebenweg (Textknopf) in jedem anderen Modus. */
    emphasis: 'primary' | 'secondary'
    onRemoved: () => void
}

export const RemoveBandButton = ({qrCodeId, bandType, emphasis, onRemoved}: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const [open, setOpen] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    const handleDelete = async () => {
        setSubmitting(true)
        const {error} = await deleteQrCode({path: {qrCodeId}})
        setSubmitting(false)
        setOpen(false)
        if (error) {
            feedback.error(
                t(bandType === 'participant' ? 'qrParticipant.deleteError' : 'qrAppuser.deleteError'),
            )
            return
        }
        feedback.success(t('qrAssign.deleteSuccess'))
        onRemoved()
    }

    return (
        <>
            <Button
                color="error"
                variant={emphasis === 'primary' ? 'contained' : 'text'}
                size={emphasis === 'primary' ? 'large' : 'medium'}
                fullWidth
                onClick={() => setOpen(true)}>
                {t('app.result.removeBand')}
            </Button>
            <QrDeleteDialog
                open={open}
                onClose={() => setOpen(false)}
                onDelete={() => void handleDelete()}
                loading={submitting}
                type={bandType}
            />
        </>
    )
}
