import {useState} from 'react'
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    MenuItem,
    Stack,
    TextField,
} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {exportOpenParticipantRequirements} from '@api/sdk.gen.ts'
import {ParticipantRequirementForEventDto} from '@api/types.gen.ts'
import {useFeedback} from '@utils/hooks.ts'
import {runDownload} from '@utils/download.ts'
import {eventIndexRoute} from '@routes'
import LoadingButton from '@components/form/LoadingButton.tsx'
import {isRequestNetworkError} from '@utils/request.ts'

/**
 * Auswahlwert für "alle aktiven Bedingungen". Bewusst ein eigenes Kürzel und kein leerer
 * String: MUI wertet '' als "nichts ausgewählt" und zeigt dann ein leeres Feld statt der
 * Voreinstellung. Beim Aufruf wird daraus schlicht kein Filterparameter.
 */
const ALL = 'ALL'

type Props = {
    open: boolean
    onClose: () => void
    /** Die an der Veranstaltung aktiven Bedingungen. */
    requirements: ParticipantRequirementForEventDto[]
}

/**
 * Zieht die Liste der Gemeldeten, denen noch Bedingungen fehlen - Grundlage dafür, die
 * betroffenen Vereine anzuschreiben.
 */
const OpenRequirementExportDialog = ({open, onClose, requirements}: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const {eventId} = eventIndexRoute.useParams()

    const [requirementId, setRequirementId] = useState<string>(ALL)
    const [pending, setPending] = useState(false)

    const handleExport = async () => {
        const {downloaded, error} = await runDownload(
            setPending,
            () =>
                exportOpenParticipantRequirements({
                    path: {eventId},
                    query: requirementId === ALL ? {} : {requirementId},
                }),
            'offene-Bedingungen.xlsx',
        )

        if (isRequestNetworkError(error)) {
            feedback.error(t('common.error.network'))
            return
        }
        if (error) {
            feedback.error(t('event.participantRequirement.openExport.error'))
            return
        }

        if (downloaded) {
            onClose()
        }
    }

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth={'sm'}>
            <DialogTitle>{t('event.participantRequirement.openExport.title')}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{pt: 1}}>
                    <DialogContentText>
                        {t('event.participantRequirement.openExport.description')}
                    </DialogContentText>
                    <TextField
                        select
                        fullWidth
                        label={t('event.participantRequirement.openExport.requirement')}
                        value={requirementId}
                        onChange={e => setRequirementId(e.target.value)}>
                        <MenuItem value={ALL}>
                            {t('event.participantRequirement.openExport.allRequirements')}
                        </MenuItem>
                        {requirements.map(r => (
                            <MenuItem key={r.id} value={r.id}>
                                {r.name}
                            </MenuItem>
                        ))}
                    </TextField>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={pending}>
                    {t('common.cancel')}
                </Button>
                <LoadingButton variant={'contained'} pending={pending} onClick={handleExport}>
                    {t('event.participantRequirement.openExport.submit')}
                </LoadingButton>
            </DialogActions>
        </Dialog>
    )
}

export default OpenRequirementExportDialog
