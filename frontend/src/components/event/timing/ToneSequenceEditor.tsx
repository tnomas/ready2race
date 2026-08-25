import {
    Alert,
    Box,
    Button,
    Collapse,
    IconButton,
    MenuItem,
    Stack,
    TextField,
    Tooltip,
    Typography,
    useTheme,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import {ReactNode, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {playToneSequence, playToneStep} from '@utils/timing/feedback.ts'
import {touchTargetSx} from '@utils/touch.ts'
import {
    NEW_TONE_DURATION_MILLIS,
    TONE_DURATION_MAX_MILLIS,
    TONE_DURATION_MIN_MILLIS,
    TONE_FREQUENCY_MAX_HZ,
    TONE_FREQUENCY_MIN_HZ,
    TONE_PLAN_MAX_STEPS,
    TONE_RELEASE_MAX_MILLIS,
    TONE_RELEASE_MIN_MILLIS,
    TONE_SEQUENCE_OFFSET_MAX_MILLIS,
    TONE_WAVEFORMS,
    ToneStep,
    ToneWaveform,
    previewSchedule,
    sequenceSchedule,
} from '@utils/timing/tonePlan.ts'
import {
    ToneEnvelopeChoice,
    ToneRow,
    ToneRowDirection,
    formatToneSummary,
    planFromRows,
    rowFromStep,
    rowsFromPlan,
    stepFromRow,
    toneOffsetLabel,
    toneTimelineGeometry,
} from './tonePlanEditor.ts'

export type ToneSequencePreset = {
    label: string
    steps: readonly ToneStep[]
}

export type ToneSequenceEditorProps = {
    /**
     * Der Bezugspunkt der Zeitpunkte — und ob es überhaupt welche gibt. `null` ist der
     * Einzelton-Fall (Erfassungstöne): dieselbe Zeilendarstellung, aber ohne Zeit-Spalte, ohne
     * Zeitleiste, ohne „Ton hinzufügen" und ohne „Folge anhören".
     */
    direction: ToneRowDirection
    rows: ToneRow[]
    onChange: (rows: ToneRow[]) => void
    /**
     * Der Hilfetext des ABSCHNITTS — genau einmal gerendert, unter der Liste. Er stand früher
     * unter JEDEM Ton und war der Hauptgrund, warum drei Töne wie eine Textwüste aussahen.
     */
    help?: ReactNode
    /** Vorlagen als Knopfreihe über der Zeitleiste; leer/fehlend blendet die Reihe aus. */
    presets?: readonly ToneSequencePreset[]
    /** Von außen gesetzt, wenn das Speichern an den Tönen scheiterte: markiert kaputte Zeilen. */
    invalid?: boolean
    /** Fehlertext des Abschnitts, wenn [invalid]. */
    invalidText?: string
    /** Höchstzahl Töne; darüber ist „Ton hinzufügen" gesperrt. */
    maxSteps?: number
}

/**
 * Der gemeinsame Tonfolge-Editor: EINE Liste von Tönen, verwendet vom Startplan eines
 * Zeitnahmetyps (Zeitpunkte rückwärts zum Start), von der Fehlstart-Folge (vorwärts ab der
 * Auslösung) und — mit `direction={null}` — von den beiden Erfassungstönen, die Einzeltöne
 * bleiben, aber gleich aussehen sollen.
 *
 * Der Aufbau folgt drei Beobachtungen aus der alten Fassung, die „recht unübersichtlich" war:
 *
 * 1. **Der Hilfetext steht genau EINMAL je Abschnitt.** Vorher hing der dreizeilige Text zu
 *    Hüllkurve und Wellenform unter jedem einzelnen Ton — bei sechs Countdown-Tönen sechsmal
 *    dasselbe. Das war der größte Einzelposten an Unruhe.
 * 2. **Eine kompakte Zeile je Ton, Felder nur für den bearbeiteten.** Fünf gleichrangige Felder
 *    standen immer offen, und das Ausklingen-Feld erschien/verschwand beim Umschalten der
 *    Hüllkurve — jedes Mal ein Layout-Sprung. Jetzt zeigt die Zeile eine Zusammenfassung
 *    („+400 ms · Sägezahn · 200 Hz · 300 ms · gehalten") und klappt auf Klick auf; offen ist
 *    immer höchstens eine.
 * 3. **Eine kleine Zeitleiste über der Liste.** Der Rhythmus — „kurz, kurz, lang" oder der
 *    Countdown — ist die eigentliche Aussage einer Folge und war aus einer Zahlenkolonne nicht
 *    ablesbar. Bewusst schlicht: absolut positionierte Kästchen, keine Bibliothek, Farben aus
 *    dem Theme.
 *
 * Bedienung: Die Zeilen und die Balken der Zeitleiste sind echte Knöpfe (Tab-erreichbar,
 * Enter/Leertaste klappen auf); die Icon-Knöpfe tragen `touchTargetSx`, damit sie auf reinen
 * Touch-Geräten 44 pt groß werden.
 */
const ToneSequenceEditor = ({
    direction,
    rows,
    onChange,
    help,
    presets,
    invalid = false,
    invalidText,
    maxSteps = TONE_PLAN_MAX_STEPS,
}: ToneSequenceEditorProps) => {
    const {t} = useTranslation()
    const theme = useTheme()

    /**
     * Welche Zeile ihre Felder zeigt. Genau eine (oder keine): zwei offene Zeilen wären wieder
     * die alte Feldwand, und der Wechsel zwischen zwei Tönen ist ein Klick.
     */
    const [openKey, setOpenKey] = useState<number | null>(null)

    const steps = rows.map(row => ({row, step: stepFromRow(row, direction)}))
    const timelineEntries = steps
        .filter((entry): entry is {row: ToneRow; step: ToneStep} => entry.step !== null)
        .map(entry => ({key: entry.row.key, step: entry.step}))
    const timeline = toneTimelineGeometry(timelineEntries)

    const updateRow = (key: number, patch: Partial<ToneRow>) => {
        onChange(rows.map(row => (row.key === key ? {...row, ...patch} : row)))
    }

    const removeRow = (key: number) => {
        if (openKey === key) setOpenKey(null)
        onChange(rows.filter(row => row.key !== key))
    }

    const addRow = () => {
        // Ein neuer Ton landet HINTER dem letzten: beim Startplan beim Start selbst (0), bei der
        // Fehlstart-Folge ein Raster weiter — so entsteht beim Klicken von selbst eine Folge und
        // nicht ein Stapel gleichzeitiger Töne.
        const lastStep = timelineEntries[timelineEntries.length - 1]?.step
        const offsetMillis =
            direction === 'AFTER_TRIGGER'
                ? Math.min(
                      lastStep === undefined ? 0 : lastStep.offsetMillis + 400,
                      TONE_SEQUENCE_OFFSET_MAX_MILLIS,
                  )
                : 0
        const row = rowFromStep(
            {offsetMillis, frequencyHz: 900, durationMillis: NEW_TONE_DURATION_MILLIS},
            direction,
        )
        onChange([...rows, row])
        // Frisch angelegt heißt: der Benutzer will ihn jetzt einstellen.
        setOpenKey(row.key)
    }

    const applyPreset = (preset: ToneSequencePreset) => {
        setOpenKey(null)
        onChange(rowsFromPlan(preset.steps, direction))
    }

    /**
     * Die ganze Folge anhören. Der Startplan wird zeitlich GERAFFT (Pausen über 2 s gekürzt —
     * sonst wartete man bei einem Ton bei −60 s eine Minute), die Fehlstart-Folge läuft in
     * echter Zeit, weil sie kurz ist und ihr Rhythmus genau die Aussage ist.
     */
    const playAll = () => {
        const plan = planFromRows(rows, direction)
        if (plan === null || plan.length === 0) return
        playToneSequence(direction === 'AFTER_TRIGGER' ? sequenceSchedule(plan) : previewSchedule(plan))
    }

    const offsetLabelText = (step: ToneStep | null, row: ToneRow): string | null => {
        if (direction === null) return null
        if (step === null) return row.offsetInput.trim() === '' ? '—' : row.offsetInput
        const label = toneOffsetLabel(step.offsetMillis)
        if (label.kind === 'VALUE') return label.text
        return t(
            direction === 'AFTER_TRIGGER'
                ? 'event.timing.tones.atTrigger'
                : 'event.timing.tones.atStart',
        )
    }

    const summaryOf = (row: ToneRow, step: ToneStep | null): string =>
        formatToneSummary({
            offsetText: offsetLabelText(step, row),
            waveformText: t(`event.timing.toneWaveform.${row.waveform}`),
            frequencyHz: step?.frequencyHz ?? row.frequencyHz,
            durationMillis: step?.durationMillis ?? row.durationMillis,
            envelopeText:
                row.envelope === 'HELD'
                    ? t('event.timing.toneEnvelope.summaryHeld', {
                          millis: step?.releaseMillis ?? row.releaseMillis,
                      })
                    : t('event.timing.toneEnvelope.summaryDecay'),
        })

    return (
        <Stack spacing={1.5}>
            {presets !== undefined && presets.length > 0 && (
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {presets.map(preset => (
                        <Button key={preset.label} size="small" onClick={() => applyPreset(preset)}>
                            {preset.label}
                        </Button>
                    ))}
                </Stack>
            )}

            {/* --- Zeitleiste ------------------------------------------------------------
                Nur wo es Zeitpunkte gibt und mehr als nichts zu zeigen ist. Die Achse ist eine
                schlichte Box mit absolut gesetzten Balken; auf schmalen Bildschirmen staucht sie
                sich (Prozentbreiten), sie scrollt also nie und schneidet nie ab. */}
            {direction !== null && timeline.bars.length > 0 && (
                <Box>
                    <Box
                        role="group"
                        aria-label={t('event.timing.tones.timeline')}
                        sx={{
                            position: 'relative',
                            height: 34,
                            borderRadius: 1,
                            bgcolor: 'action.hover',
                            // Die Grundlinie macht aus den schwebenden Kästchen eine Achse.
                            borderBottom: `2px solid ${theme.palette.divider}`,
                        }}>
                        {timeline.bars.map(bar => {
                            const row = rows.find(candidate => candidate.key === bar.key)
                            const entry = timelineEntries.find(candidate => candidate.key === bar.key)
                            if (row === undefined || entry === undefined) return null
                            const selected = openKey === bar.key
                            return (
                                <Tooltip key={bar.key} title={summaryOf(row, entry.step)}>
                                    <Box
                                        component="button"
                                        type="button"
                                        aria-label={summaryOf(row, entry.step)}
                                        aria-pressed={selected}
                                        onClick={() =>
                                            setOpenKey(current =>
                                                current === bar.key ? null : bar.key,
                                            )
                                        }
                                        sx={{
                                            position: 'absolute',
                                            top: 6,
                                            bottom: 4,
                                            left: `${bar.leftPercent}%`,
                                            width: `${bar.widthPercent}%`,
                                            p: 0,
                                            border: 'none',
                                            borderRadius: 0.5,
                                            cursor: 'pointer',
                                            bgcolor: selected ? 'primary.main' : 'primary.light',
                                            opacity: selected ? 1 : 0.75,
                                            '&:hover': {opacity: 1},
                                            '&:focus-visible': {
                                                outline: `2px solid ${theme.palette.text.primary}`,
                                                outlineOffset: 1,
                                            },
                                        }}
                                    />
                                </Tooltip>
                            )
                        })}
                    </Box>
                    {/* Die Achsenbeschriftung nennt nur die Spannweite — mehr Ziffern würden die
                        Leiste in eine zweite Zahlenkolonne verwandeln, und genau die soll sie
                        ersetzen. */}
                    <Typography variant="caption" color="text.secondary">
                        {t('event.timing.tones.timelineSpan', {
                            millis: timeline.endMillis - timeline.startMillis,
                        })}
                    </Typography>
                </Box>
            )}

            {invalid && invalidText !== undefined && <Alert severity="error">{invalidText}</Alert>}

            <Stack spacing={0.5}>
                {steps.map(({row, step}) => {
                    const rowInvalid = step === null
                    const open = openKey === row.key
                    return (
                        <Box
                            key={row.key}
                            sx={{
                                border: 1,
                                borderColor: rowInvalid && invalid ? 'error.main' : 'divider',
                                borderRadius: 1,
                            }}>
                            {/* Die Kopfzeile: Zusammenfassung links, Werkzeuge rechts. Die
                                Zusammenfassung selbst ist der Aufklapp-Knopf — eine ganze Zeile
                                als Ziel trifft man auch mit dem Finger. */}
                            <Stack direction="row" alignItems="center" spacing={0.5} sx={{pr: 0.5}}>
                                <Box
                                    component="button"
                                    type="button"
                                    aria-expanded={open}
                                    onClick={() => setOpenKey(open ? null : row.key)}
                                    sx={{
                                        flexGrow: 1,
                                        minWidth: 0,
                                        textAlign: 'left',
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: 'inherit',
                                        font: 'inherit',
                                        px: 1.5,
                                        py: 1,
                                        minHeight: 44,
                                        '&:focus-visible': {
                                            outline: `2px solid ${theme.palette.text.primary}`,
                                            outlineOffset: -2,
                                        },
                                    }}>
                                    <Typography
                                        variant="body2"
                                        color={rowInvalid ? 'error' : 'text.primary'}
                                        sx={{wordBreak: 'break-word'}}>
                                        {summaryOf(row, step)}
                                    </Typography>
                                </Box>
                                <Tooltip title={t('event.timing.tones.play')}>
                                    <span>
                                        <IconButton
                                            size="small"
                                            sx={touchTargetSx}
                                            aria-label={t('event.timing.tones.play')}
                                            disabled={rowInvalid}
                                            onClick={() => step !== null && playToneStep(step)}>
                                            <PlayArrowIcon fontSize="small" />
                                        </IconButton>
                                    </span>
                                </Tooltip>
                                <Tooltip title={t('event.timing.tones.edit')}>
                                    <IconButton
                                        size="small"
                                        sx={touchTargetSx}
                                        aria-label={t('event.timing.tones.edit')}
                                        onClick={() => setOpenKey(open ? null : row.key)}>
                                        <EditIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                                {direction !== null && (
                                    <Tooltip title={t('event.timing.tones.remove')}>
                                        <IconButton
                                            size="small"
                                            sx={touchTargetSx}
                                            aria-label={t('event.timing.tones.remove')}
                                            onClick={() => removeRow(row.key)}>
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                )}
                            </Stack>

                            <Collapse in={open} unmountOnExit>
                                <Stack
                                    direction="row"
                                    spacing={1}
                                    flexWrap="wrap"
                                    useFlexGap
                                    alignItems="flex-start"
                                    sx={{px: 1.5, pb: 1.5, pt: 0.5}}>
                                    {direction !== null && (
                                        <TextField
                                            type="number"
                                            size="small"
                                            label={t(
                                                direction === 'AFTER_TRIGGER'
                                                    ? 'event.timing.tones.millisAfterTrigger'
                                                    : 'event.timing.tones.secondsBeforeStart',
                                            )}
                                            value={row.offsetInput}
                                            error={rowInvalid && invalid}
                                            slotProps={{
                                                htmlInput:
                                                    direction === 'AFTER_TRIGGER'
                                                        ? {min: 0, max: TONE_SEQUENCE_OFFSET_MAX_MILLIS}
                                                        : {min: 0, max: 600, step: 'any'},
                                            }}
                                            sx={{width: 160}}
                                            onChange={event =>
                                                updateRow(row.key, {offsetInput: event.target.value})
                                            }
                                        />
                                    )}
                                    <TextField
                                        type="number"
                                        size="small"
                                        label={t('event.timing.tones.frequencyHz')}
                                        value={row.frequencyHz}
                                        error={rowInvalid && invalid}
                                        slotProps={{htmlInput: {min: TONE_FREQUENCY_MIN_HZ, max: TONE_FREQUENCY_MAX_HZ}}}
                                        sx={{width: 130}}
                                        onChange={event =>
                                            updateRow(row.key, {frequencyHz: event.target.value})
                                        }
                                    />
                                    <TextField
                                        type="number"
                                        size="small"
                                        label={t('event.timing.tones.durationMillis')}
                                        value={row.durationMillis}
                                        error={rowInvalid && invalid}
                                        slotProps={{htmlInput: {min: TONE_DURATION_MIN_MILLIS, max: TONE_DURATION_MAX_MILLIS}}}
                                        sx={{width: 130}}
                                        onChange={event =>
                                            updateRow(row.key, {durationMillis: event.target.value})
                                        }
                                    />
                                    {/* Wellenform vor der Hüllkurve: die beiden sind unabhängig
                                        (ein gehaltener Sägezahn trägt beides). */}
                                    <TextField
                                        select
                                        size="small"
                                        label={t('event.timing.toneWaveform.label')}
                                        value={row.waveform}
                                        sx={{width: 130}}
                                        onChange={event =>
                                            updateRow(row.key, {
                                                waveform: event.target.value as ToneWaveform,
                                            })
                                        }>
                                        {TONE_WAVEFORMS.map(waveform => (
                                            <MenuItem key={waveform} value={waveform}>
                                                {t(`event.timing.toneWaveform.${waveform}`)}
                                            </MenuItem>
                                        ))}
                                    </TextField>
                                    <TextField
                                        select
                                        size="small"
                                        label={t('event.timing.toneEnvelope.label')}
                                        value={row.envelope}
                                        sx={{width: 130}}
                                        onChange={event => {
                                            const envelope = event.target.value as ToneEnvelopeChoice
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
                                    {/* Das Ausklingen-Feld erscheint nur bei „Gehalten" — hier
                                        ohne Layout-Sprung für die Nachbarn, weil die ganze
                                        Feldgruppe ohnehin nur für DIESE Zeile offen steht. */}
                                    {row.envelope === 'HELD' && (
                                        <TextField
                                            type="number"
                                            size="small"
                                            label={t('event.timing.tones.releaseMillis')}
                                            value={row.releaseMillis}
                                            error={rowInvalid && invalid}
                                            slotProps={{htmlInput: {min: TONE_RELEASE_MIN_MILLIS, max: TONE_RELEASE_MAX_MILLIS}}}
                                            sx={{width: 130}}
                                            onChange={event =>
                                                updateRow(row.key, {
                                                    releaseMillis: event.target.value,
                                                })
                                            }
                                        />
                                    )}
                                </Stack>
                            </Collapse>
                        </Box>
                    )
                })}
            </Stack>

            {direction !== null && (
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Button
                        size="small"
                        startIcon={<AddIcon />}
                        disabled={rows.length >= maxSteps}
                        onClick={addRow}>
                        {t('event.timing.tones.addTone')}
                    </Button>
                    <Button
                        size="small"
                        startIcon={<PlayArrowIcon />}
                        disabled={rows.length === 0 || planFromRows(rows, direction) === null}
                        onClick={playAll}>
                        {t('event.timing.tones.playAll')}
                    </Button>
                </Stack>
            )}

            {/* Der Hilfetext des Abschnitts — GENAU EINMAL, ganz unten. */}
            {help !== undefined && (
                <Typography variant="caption" color="text.secondary">
                    {help}
                </Typography>
            )}
        </Stack>
    )
}

export default ToneSequenceEditor
