import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControlLabel,
    Stack,
    Switch,
    TextField,
    Typography,
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import {useEffect, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {addTimingToneSet, updateTimingToneSet} from '@api/sdk.gen.ts'
import {
    ApiError,
    CaptureToneDto,
    TimingToneSetDto,
    TimingToneSetRequest,
    ToneStepDto,
} from '@api/types.gen.ts'
import {BOAT_PITCH_POSITIONS, boatPitch} from '@utils/timing/boatPitch.ts'
import {playToneSequence} from '@utils/timing/feedback.ts'
import {
    DEFAULT_CAPTURE_TONE,
    DEFAULT_START_TONE_PLAN,
    PRESET_ONLY_START,
    PRESET_TEN_COUNTDOWN,
    TONE_PLAN_MAX_STEPS,
    equalsDefaultStartPlan,
    toneTotalMillis,
} from '@utils/timing/tonePlan.ts'
import {useFeedback} from '@utils/hooks.ts'
import CaptureToneEditor from './CaptureToneEditor.tsx'
import FalseStartToneEditor from './FalseStartToneEditor.tsx'
import ToneSequenceEditor from './ToneSequenceEditor.tsx'
import {ToneRow, planFromRows, rowsFromPlan} from './tonePlanEditor.ts'

export type ToneSetDialogProps = {
    open: boolean
    onClose: () => void
    eventId: string
    /** undefined = neuen Satz anlegen. */
    entity: TimingToneSetDto | undefined
    /** Ob die Veranstaltung noch gar keinen Satz hat — dann wird dieser hier ungefragt Vorgabe. */
    isFirstSet: boolean
    reloadData: () => void
}

/** Abstand zwischen zwei Stufen der Hörprobe, damit sich lange Töne nicht überlagern. */
const AUDITION_GAP_MILLIS = 150

/**
 * Anlegen/Bearbeiten eines Ton-Satzes: der benannten Klang-Vorlage einer Veranstaltung („Laut
 * fürs Wasser", „Leise für die Halle"), von der sich beliebig viele Zeitnahmetypen einen teilen.
 *
 * Alle vier Töne stehen hier in denselben Bausteinen, die sie schon vorher hatten — der
 * Startsequenz-Plan im gemeinsamen [ToneSequenceEditor], Zwischen- und Zielton im
 * [CaptureToneEditor], der Fehlstart-Rückruf im [FalseStartToneEditor]. Es ist ein Umzug, kein
 * Neubau: Wer die Editoren aus den alten Veranstaltungs-Einstellungen kennt, findet sie hier
 * unverändert wieder, nur eben je Satz statt einmal für die ganze Regatta.
 *
 * `null` bedeutet in jedem der vier Felder „eingebauter Standard" — genau wie in der Datenbank.
 * Die Editoren normalisieren einen werte-gleichen Stand selbst wieder auf `null`; beim
 * Startsequenz-Plan macht das hier [equalsDefaultStartPlan]. So bleibt „unkonfiguriert"
 * unkonfiguriert, und eine künftige Änderung des eingebauten Standards erreicht auch Sätze, deren
 * Töne nie bewusst verstellt wurden.
 *
 * Die eine Server-Regel, die dieser Dialog vorwegnimmt: Eine Veranstaltung mit Sätzen hat immer
 * genau EINEN Vorgabesatz. Der Schalter ist deshalb gesperrt, wo ein Abwählen einen 409er
 * auslösen würde — siehe die Begründung am Schalter selbst.
 */
const ToneSetDialog = ({
    open,
    onClose,
    eventId,
    entity,
    isFirstSet,
    reloadData,
}: ToneSetDialogProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [name, setName] = useState('')
    const [isDefault, setIsDefault] = useState(false)
    const [toneRows, setToneRows] = useState<ToneRow[]>([])
    const [splitTone, setSplitTone] = useState<CaptureToneDto | null>(null)
    const [falseStartTone, setFalseStartTone] = useState<ToneStepDto[] | null>(null)
    const [finishTone, setFinishTone] = useState<CaptureToneDto | null>(null)
    const [tonePerBoat, setTonePerBoat] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [invalidField, setInvalidField] = useState<'name' | 'sequence' | undefined>(undefined)

    useEffect(() => {
        if (!open) return
        setName(entity?.name ?? '')
        // Der erste Satz einer Veranstaltung wird ungefragt Vorgabe — der Schalter zeigt das,
        // statt es beim Speichern schweigend zu tun.
        setIsDefault(entity?.isDefault ?? isFirstSet)
        // null/leer = eingebauter Standard: der Editor zeigt ihn als konkrete, bearbeitbare
        // Zeilen — beim Speichern wird ein unveränderter Standard wieder zu null normalisiert.
        setToneRows(
            rowsFromPlan(
                entity?.sequenceTonePlan != null && entity.sequenceTonePlan.length > 0
                    ? entity.sequenceTonePlan
                    : DEFAULT_START_TONE_PLAN,
            ),
        )
        setSplitTone(entity?.splitTone ?? null)
        setFalseStartTone(entity?.falseStartTone ?? null)
        setFinishTone(entity?.finishTone ?? null)
        setTonePerBoat(entity?.tonePerBoat ?? true)
        setSubmitting(false)
        setInvalidField(undefined)
    }, [open, entity, isFirstSet])

    /**
     * Gesperrt, sobald dieser Satz die Vorgabe IST: Der Server nimmt ein Abwählen nur an, solange
     * es keinen zweiten Satz gibt, und die Vorgabe des einzigen Satzes abzuwählen ändert ohnehin
     * nichts Hörbares. Weitergegeben wird sie, indem man einen ANDEREN Satz zur Vorgabe macht —
     * die Liste bietet das je Zeile an. Beim ersten Satz ist der Schalter aus demselben Grund
     * gesperrt, nur andersherum: Er wird die Vorgabe, ob man will oder nicht.
     */
    const defaultLocked = entity?.isDefault === true || (entity === undefined && isFirstSet)

    /**
     * Die sechs Stufen der Tonleiter hintereinander — ohne sie stellt man den Schalter blind ein.
     * Grundton ist der ZIELTON dieses Satzes in seinem gerade bearbeiteten Stand, denn genau der
     * klingt später an Position 1.
     */
    const playAudition = () => {
        const base = finishTone ?? DEFAULT_CAPTURE_TONE
        const spacing = toneTotalMillis(base) + AUDITION_GAP_MILLIS
        playToneSequence(
            Array.from({length: BOAT_PITCH_POSITIONS}, (_, index) => ({
                atMillis: index * spacing,
                step: {...base, frequencyHz: boatPitch(base.frequencyHz, index + 1)},
            })),
        )
    }

    const handleSubmit = () => {
        const trimmedName = name.trim()
        if (trimmedName.length === 0) {
            setInvalidField('name')
            return
        }
        const plan = planFromRows(toneRows, 'BEFORE_START')
        if (plan === null || plan.length === 0 || plan.length > TONE_PLAN_MAX_STEPS) {
            setInvalidField('sequence')
            return
        }
        setInvalidField(undefined)

        const body: TimingToneSetRequest = {
            name: trimmedName,
            isDefault,
            // Standard bleibt null in der Datenbank — siehe Komponenten-Kommentar. Die drei
            // anderen Töne führen ihre Editoren bereits als null/eigener Wert.
            sequenceTonePlan: equalsDefaultStartPlan(plan) ? null : plan,
            splitTone,
            falseStartTone,
            finishTone,
            tonePerBoat,
        }

        setSubmitting(true)
        void (async () => {
            try {
                const {error} = (await (entity === undefined
                    ? addTimingToneSet({path: {eventId}, body})
                    : updateTimingToneSet({
                          path: {eventId, toneSetId: entity.id},
                          body,
                      }))) as {error?: ApiError}
                if (error !== undefined) {
                    // Die zweite 409-Ursache (eine Veranstaltung ohne Vorgabesatz) fängt der
                    // gesperrte Schalter ab, bevor sie hier ankommen kann — bleibt der Name.
                    feedback.error(
                        error.status?.value === 409
                            ? t('event.timing.toneSets.nameTaken')
                            : t('common.error.unexpected'),
                    )
                    return
                }
                feedback.success(t('event.timing.toneSets.saved'))
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
                {t(entity === undefined ? 'event.timing.toneSets.add' : 'event.timing.toneSets.edit')}
            </DialogTitle>
            <DialogContent>
                <Stack spacing={3} sx={{mt: 1}}>
                    <TextField
                        label={t('event.timing.toneSets.name')}
                        value={name}
                        autoFocus
                        required
                        error={invalidField === 'name'}
                        helperText={
                            invalidField === 'name'
                                ? t('common.form.required')
                                : t('event.timing.toneSets.nameHelp')
                        }
                        onChange={event => setName(event.target.value)}
                    />
                    <Stack spacing={0.5}>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={isDefault}
                                    disabled={defaultLocked}
                                    className={'cursor-pointer'}
                                    onChange={(_, checked) => setIsDefault(checked)}
                                />
                            }
                            label={t('event.timing.toneSets.isDefault')}
                        />
                        <Typography variant="body2" color="text.secondary">
                            {t(
                                defaultLocked
                                    ? entity === undefined
                                        ? 'event.timing.toneSets.isDefaultFirstHelp'
                                        : 'event.timing.toneSets.isDefaultLockedHelp'
                                    : 'event.timing.toneSets.isDefaultHelp',
                            )}
                        </Typography>
                    </Stack>

                    <Divider />

                    {/* --- Startsequenz ----------------------------------------------------
                        Derselbe Baustein wie bei Fehlstart-Folge und Erfassungstönen; hier
                        zählen die Zeitpunkte rückwärts zum Start (0 = Start). */}
                    <Stack spacing={1.5}>
                        <Typography variant="subtitle2">
                            {t('event.timing.toneSets.tones.sequence')}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {t('event.timing.modes.tones.hint')}
                        </Typography>
                        <ToneSequenceEditor
                            direction={'BEFORE_START'}
                            rows={toneRows}
                            onChange={rows => {
                                setToneRows(rows)
                                if (invalidField === 'sequence') setInvalidField(undefined)
                            }}
                            invalid={invalidField === 'sequence'}
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

                    <Divider />

                    {/* --- Zwischenton und Fehlstart --------------------------------------
                        Der Zwischenton bestätigt eine Zeit am Zwischenzeitposten, der
                        Fehlstart-Rückruf holt ein Feld zurück — dieselben Editoren wie früher
                        in den Veranstaltungs-Einstellungen, nur eben je Satz. */}
                    <CaptureToneEditor
                        label={t('event.timing.toneSets.tones.split')}
                        value={splitTone}
                        onChange={setSplitTone}
                    />
                    <FalseStartToneEditor value={falseStartTone} onChange={setFalseStartTone} />

                    <Divider />

                    {/* --- Zielton und die Tonleiter darüber -------------------------------
                        Bewusst nebeneinander: Die Leiter hat den Zielton als Grundton, und wer
                        ihn hier verstellt, hört das eine Zeile weiter unten in der Hörprobe. */}
                    <CaptureToneEditor
                        label={t('event.timing.toneSets.tones.finish')}
                        value={finishTone}
                        onChange={setFinishTone}
                    />
                    <Stack spacing={0.5}>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={tonePerBoat}
                                    className={'cursor-pointer'}
                                    onChange={(_, checked) => setTonePerBoat(checked)}
                                />
                            }
                            label={t('event.timing.toneSets.tonePerBoat')}
                        />
                        <Typography variant="body2" color="text.secondary">
                            {t('event.timing.toneSets.tonePerBoatHelp')}
                        </Typography>
                        {/* Die Hörprobe steht auch bei ausgeschaltetem Schalter bereit: Man
                            entscheidet über eine Leiter, die man gehört hat, statt über eine
                            Beschreibung. Der Klick IST zugleich die Nutzergeste, die WebAudio
                            entsperrt (iOS-Regel). */}
                        <Box>
                            <Button
                                size="small"
                                startIcon={<PlayArrowIcon />}
                                className={'cursor-pointer'}
                                onClick={playAudition}>
                                {t('event.timing.toneSets.tonePerBoatAudition')}
                            </Button>
                        </Box>
                    </Stack>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={submitting} className={'cursor-pointer'}>
                    {t('common.cancel')}
                </Button>
                <Button
                    variant="contained"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className={'cursor-pointer'}>
                    {t('common.save')}
                </Button>
            </DialogActions>
        </Dialog>
    )
}

export default ToneSetDialog
