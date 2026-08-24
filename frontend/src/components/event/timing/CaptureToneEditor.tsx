import {Button, IconButton, MenuItem, Stack, TextField, Tooltip, Typography} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import {useEffect, useRef, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {CaptureToneDto} from '@api/types.gen.ts'
import {playToneStep} from '@utils/timing/feedback.ts'
import {
    DEFAULT_CAPTURE_TONE,
    TONE_DURATION_MAX_MILLIS,
    TONE_DURATION_MIN_MILLIS,
    TONE_FREQUENCY_MAX_HZ,
    TONE_FREQUENCY_MIN_HZ,
    TONE_RELEASE_MAX_MILLIS,
    TONE_RELEASE_MIN_MILLIS,
    TONE_WAVEFORMS,
    ToneWaveform,
    isValidToneRelease,
} from '@utils/timing/tonePlan.ts'
import {ToneEnvelopeChoice} from './tonePlanEditor.ts'

export type CaptureToneEditorProps = {
    label: string
    /** null = eingebauter Standard ([defaultTone], ohne Angabe der Erfassungs-Standard 880/150). */
    value: CaptureToneDto | null
    onChange: (value: CaptureToneDto | null) => void
    /**
     * Der eingebaute Standard dieses Tons — die Erfassungstöne teilen sich 880 Hz / 150 ms, der
     * Fehlstart-Ton bringt seinen eigenen (440 Hz / 3000 ms) mit.
     */
    defaultTone?: CaptureToneDto
}

const isValidTone = (tone: CaptureToneDto): boolean =>
    Number.isInteger(tone.frequencyHz) &&
    tone.frequencyHz >= TONE_FREQUENCY_MIN_HZ &&
    tone.frequencyHz <= TONE_FREQUENCY_MAX_HZ &&
    Number.isInteger(tone.durationMillis) &&
    tone.durationMillis >= TONE_DURATION_MIN_MILLIS &&
    tone.durationMillis <= TONE_DURATION_MAX_MILLIS &&
    isValidToneRelease(tone.releaseMillis ?? undefined)

/** Die Hüllkurven-Wahl eines gespeicherten Tons: null = Abfallend, jede Zahl (auch 0) = Gehalten. */
const envelopeOf = (tone: CaptureToneDto): ToneEnvelopeChoice =>
    tone.releaseMillis != null ? 'HELD' : 'DECAY'

/** Die Wellenform eines gespeicherten Tons — nicht gesetzt (Alt-Bestand) heißt Sinus. */
const waveformOf = (tone: CaptureToneDto): ToneWaveform => tone.waveform ?? 'SINE'

const releaseTextOf = (tone: CaptureToneDto): string =>
    tone.releaseMillis != null ? String(tone.releaseMillis) : ''

/**
 * Felder + Hüllkurven-/Wellenform-Wahl zurück in einen Ton, oder null, solange etwas ungültig ist.
 * „Abfallend" trägt NIE ein `releaseMillis`; „Gehalten" verlangt eine ganze Zahl 0–5000 —
 * auch die 0 geht als echter Wert an die API (Gehalten mit Sofort-Ausklang), sie wird nicht
 * mehr zu „nicht gesetzt" normalisiert, denn das wäre die andere Klangform.
 * Die Wellenform SINE wird dagegen zu „nicht gesetzt" normalisiert — dort ist das verlustfrei,
 * weil SINE und `null` denselben Klang spielen (gleicher Oszillatortyp, gleicher Formfaktor).
 */
const parseTone = (
    frequency: string,
    duration: string,
    envelope: ToneEnvelopeChoice,
    release: string,
    waveform: ToneWaveform,
): CaptureToneDto | null => {
    if (frequency.trim() === '' || duration.trim() === '') return null
    let releaseMillis: number | undefined
    if (envelope === 'HELD') {
        const releaseText = release.trim()
        if (releaseText === '') return null
        releaseMillis = Number(releaseText)
        if (!Number.isInteger(releaseMillis) || !isValidToneRelease(releaseMillis)) return null
    }
    const tone: CaptureToneDto = {
        frequencyHz: Number(frequency),
        durationMillis: Number(duration),
        ...(releaseMillis !== undefined ? {releaseMillis} : {}),
        ...(waveform !== 'SINE' ? {waveform} : {}),
    }
    return isValidTone(tone) ? tone : null
}

/**
 * Klanggenauer Vergleich: Bei der Hüllkurve sind `null` (Abfallend) und 0 (Gehalten)
 * VERSCHIEDEN; bei der Wellenform sind `null` und SINE dagegen GLEICH (identischer Klang).
 */
const sameTone = (a: CaptureToneDto, b: CaptureToneDto): boolean =>
    a.frequencyHz === b.frequencyHz &&
    a.durationMillis === b.durationMillis &&
    (a.releaseMillis ?? null) === (b.releaseMillis ?? null) &&
    (a.waveform ?? 'SINE') === (b.waveform ?? 'SINE')

/**
 * Editor für EINEN konfigurierbaren Ton der Veranstaltung (Erfassungston eines Ziel- oder
 * Zwischenzeitpostens, Fehlstart-Ton): Tonhöhe, Dauer, die Hüllkurven-Wahl Abfallend/Gehalten
 * (nur Gehalten hat ein Ausklingen-Feld — bei Abfallend hätte es keine Bedeutung), Abspiel-
 * Vorschau (der Klick IST die WebAudio-Nutzergeste und spielt die echte Hüllkurve) und
 * „Standard wiederherstellen".
 *
 * Die Felder werden als Strings geführt (dürfen beim Tippen leer sein); an den Parent geht nur ein
 * gültiger Stand — und werte-gleich mit dem Standard wird zu `null` normalisiert, damit
 * „unkonfiguriert" in der Datenbank unkonfiguriert bleibt. Ungültige Eingaben zeigen einen Fehler
 * und lassen den letzten gültigen Stand im Parent unangetastet.
 */
const CaptureToneEditor = ({label, value, onChange, defaultTone}: CaptureToneEditorProps) => {
    const {t} = useTranslation()
    const builtIn = defaultTone ?? DEFAULT_CAPTURE_TONE
    const effective = value ?? builtIn
    const [frequency, setFrequency] = useState(String(effective.frequencyHz))
    const [duration, setDuration] = useState(String(effective.durationMillis))
    const [envelope, setEnvelope] = useState<ToneEnvelopeChoice>(envelopeOf(effective))
    const [waveform, setWaveform] = useState<ToneWaveform>(waveformOf(effective))
    const [release, setRelease] = useState(releaseTextOf(effective))

    // Von außen hereinkommende Stände (frischer GET, „Standard wiederherstellen") übernehmen —
    // aber nur, wenn sie sich wirklich vom Getippten unterscheiden, sonst kämpfte der Effekt
    // gegen die Eingabe an.
    const lastPropRef = useRef(effective)
    useEffect(() => {
        if (!sameTone(lastPropRef.current, effective)) {
            lastPropRef.current = effective
            setFrequency(String(effective.frequencyHz))
            setDuration(String(effective.durationMillis))
            setEnvelope(envelopeOf(effective))
            setWaveform(waveformOf(effective))
            setRelease(releaseTextOf(effective))
        }
    }, [effective])

    const publish = (
        nextFrequency: string,
        nextDuration: string,
        nextEnvelope: ToneEnvelopeChoice,
        nextRelease: string,
        nextWaveform: ToneWaveform,
    ) => {
        const tone = parseTone(nextFrequency, nextDuration, nextEnvelope, nextRelease, nextWaveform)
        if (tone === null) return
        lastPropRef.current = tone
        onChange(sameTone(tone, builtIn) ? null : tone)
    }

    const parsed = parseTone(frequency, duration, envelope, release, waveform)
    const invalid = parsed === null

    return (
        <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
                {label}
                {value === null ? ` — ${t('event.timing.captureTones.isDefault')}` : ''}
            </Typography>
            <Stack direction="row" spacing={1} alignItems="flex-start" flexWrap="wrap" useFlexGap>
                <TextField
                    type="number"
                    size="small"
                    label={t('event.timing.captureTones.frequencyHz')}
                    value={frequency}
                    error={invalid}
                    slotProps={{htmlInput: {min: TONE_FREQUENCY_MIN_HZ, max: TONE_FREQUENCY_MAX_HZ}}}
                    sx={{width: 140}}
                    onChange={event => {
                        setFrequency(event.target.value)
                        publish(event.target.value, duration, envelope, release, waveform)
                    }}
                />
                <TextField
                    type="number"
                    size="small"
                    label={t('event.timing.captureTones.durationMillis')}
                    value={duration}
                    error={invalid}
                    slotProps={{htmlInput: {min: TONE_DURATION_MIN_MILLIS, max: TONE_DURATION_MAX_MILLIS}}}
                    sx={{width: 140}}
                    onChange={event => {
                        setDuration(event.target.value)
                        publish(frequency, event.target.value, envelope, release, waveform)
                    }}
                />
                {/* Wellenform vor der Hüllkurve — unabhängige Klangdimensionen: die Form bestimmt
                    Farbe und Formfaktor-Gain, die Hüllkurve den Lautstärkeverlauf. */}
                <TextField
                    select
                    size="small"
                    label={t('event.timing.toneWaveform.label')}
                    value={waveform}
                    sx={{width: 140}}
                    onChange={event => {
                        const nextWaveform = event.target.value as ToneWaveform
                        setWaveform(nextWaveform)
                        publish(frequency, duration, envelope, release, nextWaveform)
                    }}>
                    {TONE_WAVEFORMS.map(candidate => (
                        <MenuItem key={candidate} value={candidate}>
                            {t(`event.timing.toneWaveform.${candidate}`)}
                        </MenuItem>
                    ))}
                </TextField>
                {/* Sichtbare Hüllkurven-Wahl statt der versteckten Zahlen-Fuge: früher schaltete
                    allein der Wert des Ausklingen-Felds die Klangform um (0 ≠ 1 ms). */}
                <TextField
                    select
                    size="small"
                    label={t('event.timing.toneEnvelope.label')}
                    value={envelope}
                    sx={{width: 140}}
                    onChange={event => {
                        const nextEnvelope = event.target.value as ToneEnvelopeChoice
                        // Beim Umschalten auf Gehalten ist das Feld Pflicht — leer mit 0 vorbelegen.
                        const nextRelease =
                            nextEnvelope === 'HELD' && release.trim() === '' ? '0' : release
                        setEnvelope(nextEnvelope)
                        setRelease(nextRelease)
                        publish(frequency, duration, nextEnvelope, nextRelease, waveform)
                    }}>
                    <MenuItem value="DECAY">{t('event.timing.toneEnvelope.decay')}</MenuItem>
                    <MenuItem value="HELD">{t('event.timing.toneEnvelope.held')}</MenuItem>
                </TextField>
                {envelope === 'HELD' && (
                    <TextField
                        type="number"
                        size="small"
                        label={t('event.timing.captureTones.releaseMillis')}
                        value={release}
                        error={invalid}
                        slotProps={{htmlInput: {min: TONE_RELEASE_MIN_MILLIS, max: TONE_RELEASE_MAX_MILLIS}}}
                        sx={{width: 140}}
                        onChange={event => {
                            setRelease(event.target.value)
                            publish(frequency, duration, envelope, event.target.value, waveform)
                        }}
                    />
                )}
                <Tooltip title={t('event.timing.captureTones.play')}>
                    <span>
                        <IconButton
                            size="small"
                            aria-label={t('event.timing.captureTones.play')}
                            disabled={invalid}
                            onClick={() => parsed !== null && playToneStep(parsed)}>
                            <PlayArrowIcon fontSize="small" />
                        </IconButton>
                    </span>
                </Tooltip>
                {value !== null && (
                    <Button
                        size="small"
                        onClick={() => {
                            lastPropRef.current = builtIn
                            setFrequency(String(builtIn.frequencyHz))
                            setDuration(String(builtIn.durationMillis))
                            setEnvelope(envelopeOf(builtIn))
                            setWaveform(waveformOf(builtIn))
                            setRelease(releaseTextOf(builtIn))
                            onChange(null)
                        }}>
                        {t('event.timing.captureTones.reset')}
                    </Button>
                )}
            </Stack>
            {/* Zeilen-Zusammenfassung („Sägezahn · gehalten · 800 ms Ausklingen") + der
                Ein-Satz-Hilfetext zur gewählten Hüllkurve und der Wellenform-Hinweis. */}
            <Typography variant="caption" color="text.secondary">
                {t(`event.timing.toneWaveform.${waveform}`)}
                {' · '}
                {envelope === 'HELD'
                    ? t('event.timing.toneEnvelope.summaryHeld', {
                          millis: parsed?.releaseMillis ?? release,
                      })
                    : t('event.timing.toneEnvelope.summaryDecay')}
                {' — '}
                {t(
                    envelope === 'HELD'
                        ? 'event.timing.toneEnvelope.heldHelp'
                        : 'event.timing.toneEnvelope.decayHelp',
                )}{' '}
                {t('event.timing.toneWaveform.help')}
            </Typography>
            {invalid && (
                <Typography variant="caption" color="error">
                    {t('event.timing.captureTones.invalid')}
                </Typography>
            )}
        </Stack>
    )
}

export default CaptureToneEditor
