import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    Stack,
    Switch,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material'
import {useEffect, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {addTimingMode, updateTimingMode} from '@api/sdk.gen.ts'
import {TimingModeDto, TimingModeRequest, TimingStartGrouping} from '@api/types.gen.ts'
import {useFeedback} from '@utils/hooks.ts'

export type TimingModeDialogProps = {
    open: boolean
    onClose: () => void
    eventId: string
    /** undefined = neuen Typ anlegen. */
    entity: TimingModeDto | undefined
    reloadData: () => void
}

/**
 * Anlegen/Bearbeiten eines Zeitnahmetyps. Die beiden Zahlenfelder werden als Strings geführt,
 * damit sie beim Tippen vorübergehend leer sein dürfen (gleiche Begründung wie im
 * Sequenz-Setup-Formular); validiert wird beim Speichern. Ein leeres Intervall ist dabei kein
 * Fehler, sondern die bewusste Bedeutung „jeder Start wird von Hand ausgelöst".
 */
const TimingModeDialog = ({open, onClose, eventId, entity, reloadData}: TimingModeDialogProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [name, setName] = useState('')
    const [startGrouping, setStartGrouping] = useState<TimingStartGrouping>('EINZEL')
    const [intervalInput, setIntervalInput] = useState('')
    const [leadInInput, setLeadInInput] = useState('10')
    const [withLaps, setWithLaps] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [invalidField, setInvalidField] = useState<'name' | 'interval' | 'leadIn' | undefined>(
        undefined,
    )

    useEffect(() => {
        if (!open) return
        setName(entity?.name ?? '')
        setStartGrouping(entity?.startGrouping ?? 'EINZEL')
        setIntervalInput(entity?.intervalSeconds != null ? String(entity.intervalSeconds) : '')
        setLeadInInput(String(entity?.leadInSeconds ?? 10))
        setWithLaps(entity?.withLaps ?? false)
        setSubmitting(false)
        setInvalidField(undefined)
    }, [open, entity])

    const handleSubmit = () => {
        const trimmedName = name.trim()
        if (trimmedName.length === 0) {
            setInvalidField('name')
            return
        }
        const intervalSeconds = intervalInput.trim() === '' ? null : Number(intervalInput)
        if (
            intervalSeconds !== null &&
            (!Number.isFinite(intervalSeconds) || Math.floor(intervalSeconds) < 1)
        ) {
            setInvalidField('interval')
            return
        }
        const leadInSeconds = Number(leadInInput)
        if (!Number.isFinite(leadInSeconds) || leadInSeconds < 0) {
            setInvalidField('leadIn')
            return
        }
        setInvalidField(undefined)

        const body: TimingModeRequest = {
            name: trimmedName,
            withLaps,
            startGrouping,
            intervalSeconds: intervalSeconds !== null ? Math.floor(intervalSeconds) : null,
            leadInSeconds: Math.floor(leadInSeconds),
        }

        setSubmitting(true)
        void (async () => {
            try {
                const {error} =
                    entity === undefined
                        ? await addTimingMode({path: {eventId}, body})
                        : await updateTimingMode({path: {eventId, modeId: entity.id}, body})
                if (error !== undefined) {
                    feedback.error(t('common.error.unexpected'))
                    return
                }
                feedback.success(t('event.timing.modes.saved'))
                reloadData()
                onClose()
            } catch {
                feedback.error(t('common.error.unexpected'))
            } finally {
                setSubmitting(false)
            }
        })()
    }

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>
                {t(entity === undefined ? 'event.timing.modes.add' : 'event.timing.modes.edit')}
            </DialogTitle>
            <DialogContent>
                <Stack spacing={3} sx={{mt: 1}}>
                    <TextField
                        label={t('event.timing.modes.name')}
                        value={name}
                        autoFocus
                        required
                        error={invalidField === 'name'}
                        helperText={
                            invalidField === 'name' ? t('common.form.required') : undefined
                        }
                        onChange={event => setName(event.target.value)}
                    />
                    <Stack spacing={1}>
                        <Typography variant="body2" color="text.secondary">
                            {t('event.timing.modes.startGrouping.label')}
                        </Typography>
                        <ToggleButtonGroup
                            value={startGrouping}
                            exclusive
                            fullWidth
                            onChange={(_, value: TimingStartGrouping | null) => {
                                if (value !== null) setStartGrouping(value)
                            }}>
                            <ToggleButton value="EINZEL">
                                {t('event.timing.modes.startGrouping.EINZEL')}
                            </ToggleButton>
                            <ToggleButton value="WELLE">
                                {t('event.timing.modes.startGrouping.WELLE')}
                            </ToggleButton>
                        </ToggleButtonGroup>
                    </Stack>
                    <TextField
                        type="number"
                        label={t('event.timing.modes.intervalSeconds')}
                        value={intervalInput}
                        error={invalidField === 'interval'}
                        helperText={
                            invalidField === 'interval'
                                ? t('event.timing.modes.invalidInterval')
                                : t('event.timing.modes.intervalHelp')
                        }
                        slotProps={{htmlInput: {min: 1}}}
                        onChange={event => setIntervalInput(event.target.value)}
                    />
                    <TextField
                        type="number"
                        label={t('event.timing.modes.leadInSeconds')}
                        value={leadInInput}
                        error={invalidField === 'leadIn'}
                        helperText={
                            invalidField === 'leadIn'
                                ? t('event.timing.modes.invalidLeadIn')
                                : t('event.timing.modes.leadInHelp')
                        }
                        slotProps={{htmlInput: {min: 0}}}
                        onChange={event => setLeadInInput(event.target.value)}
                    />
                    <FormControlLabel
                        control={
                            <Switch
                                checked={withLaps}
                                onChange={(_, checked) => setWithLaps(checked)}
                            />
                        }
                        label={t('event.timing.modes.withLaps')}
                    />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={submitting}>
                    {t('common.cancel')}
                </Button>
                <Button variant="contained" onClick={handleSubmit} disabled={submitting}>
                    {t('common.save')}
                </Button>
            </DialogActions>
        </Dialog>
    )
}

export default TimingModeDialog
