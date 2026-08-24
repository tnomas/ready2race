import {
    Alert,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControlLabel,
    IconButton,
    MenuItem,
    Stack,
    Switch,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import {useCallback, useEffect, useRef, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {addTimingMode, updateTimingMode} from '@api/sdk.gen.ts'
import {TimingModeDto, TimingModeRequest, TimingStartGrouping} from '@api/types.gen.ts'
import {useFeedback} from '@utils/hooks.ts'
import {playToneStep} from '@utils/timing/feedback.ts'
import {
    DEFAULT_START_TONE_PLAN,
    NEW_TONE_DURATION_MILLIS,
    PRESET_ONLY_START,
    PRESET_TEN_COUNTDOWN,
    TONE_DURATION_MAX_MILLIS,
    TONE_DURATION_MIN_MILLIS,
    TONE_FREQUENCY_MAX_HZ,
    TONE_FREQUENCY_MIN_HZ,
    TONE_PLAN_MAX_STEPS,
    TONE_RELEASE_MAX_MILLIS,
    TONE_RELEASE_MIN_MILLIS,
    ToneStep,
    equalsDefaultStartPlan,
    previewSchedule,
    toneTotalMillis,
} from '@utils/timing/tonePlan.ts'
import {
    ToneEnvelopeChoice,
    ToneRow,
    planFromRows,
    rowFromStep,
    rowsFromPlan,
    stepFromRow,
} from './tonePlanEditor.ts'

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
 * Der Abschnitt „Töne" pflegt den Tonplan der Startsequenz: je Eintrag Zeitpunkt (Sekunden vor
 * Start, 0 = Start), Tonhöhe, Dauer und die Hüllkurven-Wahl (Abfallend/Gehalten — nur Gehalten
 * hat ein Ausklingen-Feld), mit Abspielknopf je Eintrag und einer „Sequenz anhören"-Vorschau
 * (zeitlich gerafft, Pausen über 2 s gekürzt — siehe `previewSchedule`).
 * Der Klick auf einen Abspielknopf IST die Nutzergeste, die WebAudio entsperrt (iOS-Regel).
 * Gespeichert wird `null`, wenn der Plan inhaltlich dem eingebauten Standard entspricht — so
 * bleibt „unkonfiguriert" unkonfiguriert und eine künftige Standard-Änderung erreicht auch
 * Typen, deren Töne nie bewusst verstellt wurden.
 */
const TimingModeDialog = ({open, onClose, eventId, entity, reloadData}: TimingModeDialogProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [name, setName] = useState('')
    const [startGrouping, setStartGrouping] = useState<TimingStartGrouping>('EINZEL')
    const [intervalInput, setIntervalInput] = useState('')
    const [leadInInput, setLeadInInput] = useState('10')
    const [withLaps, setWithLaps] = useState(false)
    const [toneRows, setToneRows] = useState<ToneRow[]>([])
    const [submitting, setSubmitting] = useState(false)
    const [invalidField, setInvalidField] = useState<
        'name' | 'interval' | 'leadIn' | 'tones' | undefined
    >(undefined)

    // Laufende „Sequenz anhören"-Vorschau: Timeout-Ids, damit Schließen/Neustart sie abräumt —
    // ein geschlossener Dialog darf nicht weiterpiepen.
    const previewTimeoutsRef = useRef<number[]>([])
    const [previewPlaying, setPreviewPlaying] = useState(false)
    const stopPreview = useCallback(() => {
        previewTimeoutsRef.current.forEach(id => window.clearTimeout(id))
        previewTimeoutsRef.current = []
        setPreviewPlaying(false)
    }, [])
    useEffect(() => stopPreview, [stopPreview])

    useEffect(() => {
        if (!open) return
        setName(entity?.name ?? '')
        setStartGrouping(entity?.startGrouping ?? 'EINZEL')
        setIntervalInput(entity?.intervalSeconds != null ? String(entity.intervalSeconds) : '')
        setLeadInInput(String(entity?.leadInSeconds ?? 10))
        setWithLaps(entity?.withLaps ?? false)
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
        stopPreview()
    }, [open, entity, stopPreview])

    const updateRow = (key: number, patch: Partial<ToneRow>) => {
        setToneRows(rows => rows.map(row => (row.key === key ? {...row, ...patch} : row)))
    }

    const playRow = (row: ToneRow) => {
        const step = stepFromRow(row)
        if (step !== null) playToneStep(step)
    }

    const playWholePlan = () => {
        const plan = planFromRows(toneRows)
        if (plan === null || plan.length === 0) return
        stopPreview()
        setPreviewPlaying(true)
        const schedule = previewSchedule(plan)
        schedule.forEach(({atMillis, step}) => {
            previewTimeoutsRef.current.push(window.setTimeout(() => playToneStep(step), atMillis))
        })
        const last = schedule[schedule.length - 1]
        previewTimeoutsRef.current.push(
            // Gesamtklanglänge statt Nenndauer: ein letzter Ton mit Ausklingzeit klingt länger.
            window.setTimeout(() => setPreviewPlaying(false), last.atMillis + toneTotalMillis(last.step)),
        )
    }

    const applyPreset = (preset: readonly ToneStep[]) => {
        stopPreview()
        setToneRows(rowsFromPlan(preset))
        if (invalidField === 'tones') setInvalidField(undefined)
    }

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
        const plan = planFromRows(toneRows)
        if (plan === null || plan.length === 0 || plan.length > TONE_PLAN_MAX_STEPS) {
            setInvalidField('tones')
            return
        }
        setInvalidField(undefined)

        const body: TimingModeRequest = {
            name: trimmedName,
            withLaps,
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
                    <FormControlLabel
                        control={
                            <Switch
                                checked={withLaps}
                                onChange={(_, checked) => setWithLaps(checked)}
                            />
                        }
                        label={t('event.timing.modes.withLaps')}
                    />

                    <Divider />

                    {/* --- Töne der Startsequenz ------------------------------------------- */}
                    <Stack spacing={1.5}>
                        <Typography variant="subtitle2">
                            {t('event.timing.modes.tones.title')}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {t('event.timing.modes.tones.hint')}
                        </Typography>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Button size="small" onClick={() => applyPreset(PRESET_ONLY_START)}>
                                {t('event.timing.modes.tones.presetOnlyStart')}
                            </Button>
                            <Button size="small" onClick={() => applyPreset(PRESET_TEN_COUNTDOWN)}>
                                {t('event.timing.modes.tones.presetTenCountdown')}
                            </Button>
                            <Button
                                size="small"
                                onClick={() => applyPreset(DEFAULT_START_TONE_PLAN)}>
                                {t('event.timing.modes.tones.presetDefault')}
                            </Button>
                        </Stack>

                        {invalidField === 'tones' && (
                            <Alert severity="error">
                                {t('event.timing.modes.tones.invalid')}
                            </Alert>
                        )}

                        <Stack spacing={1}>
                            {toneRows.map(row => {
                                const step = stepFromRow(row)
                                const rowInvalid = step === null
                                const atStart = step !== null && step.offsetMillis === 0
                                return (
                                    <Stack key={row.key} spacing={0.25}>
                                    <Stack
                                        direction="row"
                                        spacing={1}
                                        flexWrap="wrap"
                                        useFlexGap
                                        alignItems="flex-start">
                                        <TextField
                                            type="number"
                                            size="small"
                                            label={t('event.timing.modes.tones.secondsBeforeStart')}
                                            value={row.secondsBeforeStart}
                                            error={rowInvalid && invalidField === 'tones'}
                                            helperText={
                                                atStart
                                                    ? t('event.timing.modes.tones.atStart')
                                                    : undefined
                                            }
                                            slotProps={{htmlInput: {min: 0, max: 600, step: 'any'}}}
                                            sx={{width: 150}}
                                            onChange={event =>
                                                updateRow(row.key, {
                                                    secondsBeforeStart: event.target.value,
                                                })
                                            }
                                        />
                                        <TextField
                                            type="number"
                                            size="small"
                                            label={t('event.timing.modes.tones.frequencyHz')}
                                            value={row.frequencyHz}
                                            error={rowInvalid && invalidField === 'tones'}
                                            slotProps={{htmlInput: {min: TONE_FREQUENCY_MIN_HZ, max: TONE_FREQUENCY_MAX_HZ}}}
                                            sx={{width: 120}}
                                            onChange={event =>
                                                updateRow(row.key, {frequencyHz: event.target.value})
                                            }
                                        />
                                        <TextField
                                            type="number"
                                            size="small"
                                            label={t('event.timing.modes.tones.durationMillis')}
                                            value={row.durationMillis}
                                            error={rowInvalid && invalidField === 'tones'}
                                            slotProps={{htmlInput: {min: TONE_DURATION_MIN_MILLIS, max: TONE_DURATION_MAX_MILLIS}}}
                                            sx={{width: 120}}
                                            onChange={event =>
                                                updateRow(row.key, {
                                                    durationMillis: event.target.value,
                                                })
                                            }
                                        />
                                        {/* Die Hüllkurve ist eine SICHTBARE Wahl je Ton: Abfallend
                                            (Abfall über die gesamte Dauer, kein Ausklingen-Feld)
                                            oder Gehalten (volle Lautstärke, dann Ausklingen — 0 ist
                                            dort ein legitimer Wert mit eingebauter Entknackung).
                                            Früher schaltete die nackte Zahl zwischen den zwei
                                            Klangformen um: 0 klang völlig anders als 1 ms. */}
                                        <TextField
                                            select
                                            size="small"
                                            label={t('event.timing.toneEnvelope.label')}
                                            value={row.envelope}
                                            sx={{width: 130}}
                                            onChange={event => {
                                                const envelope = event.target
                                                    .value as ToneEnvelopeChoice
                                                updateRow(row.key, {
                                                    envelope,
                                                    // Beim Umschalten auf Gehalten ist das Feld
                                                    // Pflicht — leer mit 0 vorbelegen.
                                                    releaseMillis:
                                                        envelope === 'HELD' &&
                                                        row.releaseMillis.trim() === ''
                                                            ? '0'
                                                            : row.releaseMillis,
                                                })
                                            }}>
                                            <MenuItem value="DECAY">
                                                {t('event.timing.toneEnvelope.decay')}
                                            </MenuItem>
                                            <MenuItem value="HELD">
                                                {t('event.timing.toneEnvelope.held')}
                                            </MenuItem>
                                        </TextField>
                                        {row.envelope === 'HELD' && (
                                            <TextField
                                                type="number"
                                                size="small"
                                                label={t('event.timing.modes.tones.releaseMillis')}
                                                value={row.releaseMillis}
                                                error={rowInvalid && invalidField === 'tones'}
                                                slotProps={{htmlInput: {min: TONE_RELEASE_MIN_MILLIS, max: TONE_RELEASE_MAX_MILLIS}}}
                                                sx={{width: 130}}
                                                onChange={event =>
                                                    updateRow(row.key, {
                                                        releaseMillis: event.target.value,
                                                    })
                                                }
                                            />
                                        )}
                                        <Tooltip title={t('event.timing.modes.tones.play')}>
                                            <span>
                                                <IconButton
                                                    size="small"
                                                    aria-label={t('event.timing.modes.tones.play')}
                                                    disabled={rowInvalid}
                                                    onClick={() => playRow(row)}>
                                                    <PlayArrowIcon fontSize="small" />
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                        <Tooltip title={t('event.timing.modes.tones.remove')}>
                                            <IconButton
                                                size="small"
                                                aria-label={t('event.timing.modes.tones.remove')}
                                                onClick={() =>
                                                    setToneRows(rows =>
                                                        rows.filter(r => r.key !== row.key),
                                                    )
                                                }>
                                                <DeleteIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    </Stack>
                                    {/* Zeilen-Zusammenfassung: die gewählte Klangform in Worten,
                                        damit sie auch beim Überfliegen ablesbar ist. */}
                                    <Typography variant="caption" color="text.secondary">
                                        {row.envelope === 'HELD'
                                            ? t('event.timing.toneEnvelope.summaryHeld', {
                                                  millis:
                                                      step?.releaseMillis ?? row.releaseMillis,
                                              })
                                            : t('event.timing.toneEnvelope.summaryDecay')}
                                    </Typography>
                                    </Stack>
                                )
                            })}
                        </Stack>

                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Button
                                size="small"
                                startIcon={<AddIcon />}
                                disabled={toneRows.length >= TONE_PLAN_MAX_STEPS}
                                onClick={() =>
                                    setToneRows(rows => [
                                        ...rows,
                                        // Vorbelegung neuer Töne: 500 ms (Wunsch vom 24.08.2026)
                                        // — die eingebauten Standardpläne bleiben davon unberührt.
                                        rowFromStep({
                                            offsetMillis: 0,
                                            frequencyHz: 900,
                                            durationMillis: NEW_TONE_DURATION_MILLIS,
                                        }),
                                    ])
                                }>
                                {t('event.timing.modes.tones.addTone')}
                            </Button>
                            <Button
                                size="small"
                                startIcon={<PlayArrowIcon />}
                                disabled={
                                    previewPlaying ||
                                    toneRows.length === 0 ||
                                    planFromRows(toneRows) === null
                                }
                                onClick={playWholePlan}>
                                {t('event.timing.modes.tones.playAll')}
                            </Button>
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                            {t('event.timing.modes.tones.previewHint')}
                        </Typography>
                        {/* Die zwei Klangformen in je einem Satz — die Wahl selbst steht je Ton. */}
                        <Typography variant="caption" color="text.secondary">
                            {t('event.timing.toneEnvelope.decayHelp')}{' '}
                            {t('event.timing.toneEnvelope.heldHelp')}
                        </Typography>
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
