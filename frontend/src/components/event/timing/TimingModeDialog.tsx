import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    Stack,
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
import {
    DEFAULT_START_TONE_PLAN,
    PRESET_ONLY_START,
    PRESET_TEN_COUNTDOWN,
    TONE_PLAN_MAX_STEPS,
    equalsDefaultStartPlan,
} from '@utils/timing/tonePlan.ts'
import {ToneRow, planFromRows, rowsFromPlan} from './tonePlanEditor.ts'
import ToneSequenceEditor from './ToneSequenceEditor.tsx'

export type TimingModeDialogProps = {
    open: boolean
    onClose: () => void
    eventId: string
    /** undefined = neuen Typ anlegen. */
    entity: TimingModeDto | undefined
    reloadData: () => void
}

/**
 * Anlegen/Bearbeiten eines Zeitnahmetyps. Die Zahlenfelder werden als Strings geführt,
 * damit sie beim Tippen vorübergehend leer sein dürfen (gleiche Begründung wie im
 * Sequenz-Setup-Formular); validiert wird beim Speichern. Ein leeres Intervall ist dabei kein
 * Fehler, sondern die bewusste Bedeutung „jeder Start wird von Hand ausgelöst".
 *
 * Der Abschnitt „Töne" pflegt den Tonplan der Startsequenz im gemeinsamen Tonfolge-Editor
 * ([ToneSequenceEditor], denselben nutzen Fehlstart-Folge und Erfassungstöne): Zeitleiste,
 * kompakte Zeilen zum Aufklappen, Vorlagen, Abspielknopf je Ton und eine „Sequenz
 * anhören"-Vorschau. Der Klick auf einen Abspielknopf IST die Nutzergeste, die WebAudio
 * entsperrt (iOS-Regel). Gespeichert wird `null`, wenn der Plan inhaltlich dem eingebauten
 * Standard entspricht — so bleibt „unkonfiguriert" unkonfiguriert und eine künftige
 * Standard-Änderung erreicht auch Typen, deren Töne nie bewusst verstellt wurden.
 */
const TimingModeDialog = ({open, onClose, eventId, entity, reloadData}: TimingModeDialogProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [name, setName] = useState('')
    const [startGrouping, setStartGrouping] = useState<TimingStartGrouping>('EINZEL')
    const [intervalInput, setIntervalInput] = useState('')
    const [leadInInput, setLeadInInput] = useState('10')
    const [toneRows, setToneRows] = useState<ToneRow[]>([])
    const [submitting, setSubmitting] = useState(false)
    const [invalidField, setInvalidField] = useState<
        'name' | 'interval' | 'leadIn' | 'tones' | undefined
    >(undefined)

    useEffect(() => {
        if (!open) return
        setName(entity?.name ?? '')
        setStartGrouping(entity?.startGrouping ?? 'EINZEL')
        setIntervalInput(entity?.intervalSeconds != null ? String(entity.intervalSeconds) : '')
        setLeadInInput(String(entity?.leadInSeconds ?? 10))
        // null/leer = eingebauter Standard: der Editor zeigt ihn als konkrete, bearbeitbare
        // Zeilen — beim Speichern wird ein unveränderter Standard wieder zu null normalisiert.
        setToneRows(
            rowsFromPlan(
                entity?.tonePlan != null && entity.tonePlan.length > 0
                    ? entity.tonePlan
                    : DEFAULT_START_TONE_PLAN,
            ),
        )
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
        const plan = planFromRows(toneRows, 'BEFORE_START')
        if (plan === null || plan.length === 0 || plan.length > TONE_PLAN_MAX_STEPS) {
            setInvalidField('tones')
            return
        }
        setInvalidField(undefined)

        const body: TimingModeRequest = {
            name: trimmedName,
            startGrouping,
            intervalSeconds: intervalSeconds !== null ? Math.floor(intervalSeconds) : null,
            leadInSeconds: Math.floor(leadInSeconds),
            // Standard bleibt null in der Datenbank — siehe Komponenten-Kommentar.
            tonePlan: equalsDefaultStartPlan(plan) ? null : plan,
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

                    <Divider />

                    {/* --- Töne der Startsequenz -------------------------------------------
                        Derselbe Baustein wie bei Fehlstart-Folge und Erfassungstönen; hier
                        zählen die Zeitpunkte rückwärts zum Start (0 = Start). */}
                    <Stack spacing={1.5}>
                        <Typography variant="subtitle2">
                            {t('event.timing.modes.tones.title')}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {t('event.timing.modes.tones.hint')}
                        </Typography>
                        <ToneSequenceEditor
                            direction={'BEFORE_START'}
                            rows={toneRows}
                            onChange={rows => {
                                setToneRows(rows)
                                if (invalidField === 'tones') setInvalidField(undefined)
                            }}
                            invalid={invalidField === 'tones'}
                            invalidText={t('event.timing.modes.tones.invalid')}
                            maxSteps={TONE_PLAN_MAX_STEPS}
                            presets={[
                                {
                                    label: t('event.timing.modes.tones.presetOnlyStart'),
                                    steps: PRESET_ONLY_START,
                                },
                                {
                                    label: t('event.timing.modes.tones.presetTenCountdown'),
                                    steps: PRESET_TEN_COUNTDOWN,
                                },
                                {
                                    label: t('event.timing.modes.tones.presetDefault'),
                                    steps: DEFAULT_START_TONE_PLAN,
                                },
                            ]}
                            help={
                                <>
                                    {t('event.timing.modes.tones.previewHint')}{' '}
                                    {t('event.timing.toneEnvelope.decayHelp')}{' '}
                                    {t('event.timing.toneEnvelope.heldHelp')}{' '}
                                    {t('event.timing.toneWaveform.help')}
                                </>
                            }
                        />
                    </Stack>
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
