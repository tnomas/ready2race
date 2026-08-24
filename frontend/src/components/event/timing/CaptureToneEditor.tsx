import {Button, IconButton, Stack, TextField, Tooltip, Typography} from '@mui/material'
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
} from '@utils/timing/tonePlan.ts'

export type CaptureToneEditorProps = {
    label: string
    /** null = eingebauter Standard (880 Hz / 150 ms). */
    value: CaptureToneDto | null
    onChange: (value: CaptureToneDto | null) => void
}

const isValidTone = (tone: CaptureToneDto): boolean =>
    Number.isInteger(tone.frequencyHz) &&
    tone.frequencyHz >= TONE_FREQUENCY_MIN_HZ &&
    tone.frequencyHz <= TONE_FREQUENCY_MAX_HZ &&
    Number.isInteger(tone.durationMillis) &&
    tone.durationMillis >= TONE_DURATION_MIN_MILLIS &&
    tone.durationMillis <= TONE_DURATION_MAX_MILLIS

const parseTone = (frequency: string, duration: string): CaptureToneDto | null => {
    const tone = {frequencyHz: Number(frequency), durationMillis: Number(duration)}
    return frequency.trim() !== '' && duration.trim() !== '' && isValidTone(tone) ? tone : null
}

/**
 * Editor für EINEN Erfassungston (Ziel- oder Zwischenzeitposten): Tonhöhe, Dauer, Abspiel-Vorschau
 * (der Klick IST die WebAudio-Nutzergeste) und „Standard wiederherstellen".
 *
 * Die Felder werden als Strings geführt (dürfen beim Tippen leer sein); an den Parent geht nur ein
 * gültiger Stand — und werte-gleich mit dem Standard wird zu `null` normalisiert, damit
 * „unkonfiguriert" in der Datenbank unkonfiguriert bleibt. Ungültige Eingaben zeigen einen Fehler
 * und lassen den letzten gültigen Stand im Parent unangetastet.
 */
const CaptureToneEditor = ({label, value, onChange}: CaptureToneEditorProps) => {
    const {t} = useTranslation()
    const effective = value ?? DEFAULT_CAPTURE_TONE
    const [frequency, setFrequency] = useState(String(effective.frequencyHz))
    const [duration, setDuration] = useState(String(effective.durationMillis))

    // Von außen hereinkommende Stände (frischer GET, „Standard wiederherstellen") übernehmen —
    // aber nur, wenn sie sich wirklich vom Getippten unterscheiden, sonst kämpfte der Effekt
    // gegen die Eingabe an.
    const lastPropRef = useRef(effective)
    useEffect(() => {
        if (
            lastPropRef.current.frequencyHz !== effective.frequencyHz ||
            lastPropRef.current.durationMillis !== effective.durationMillis
        ) {
            lastPropRef.current = effective
            setFrequency(String(effective.frequencyHz))
            setDuration(String(effective.durationMillis))
        }
    }, [effective])

    const publish = (nextFrequency: string, nextDuration: string) => {
        const tone = parseTone(nextFrequency, nextDuration)
        if (tone === null) return
        lastPropRef.current = tone
        const isDefault =
            tone.frequencyHz === DEFAULT_CAPTURE_TONE.frequencyHz &&
            tone.durationMillis === DEFAULT_CAPTURE_TONE.durationMillis
        onChange(isDefault ? null : tone)
    }

    const parsed = parseTone(frequency, duration)
    const invalid = parsed === null

    return (
        <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
                {label}
                {value === null ? ` — ${t('event.timing.captureTones.isDefault')}` : ''}
            </Typography>
            <Stack direction="row" spacing={1} alignItems="flex-start">
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
                        publish(event.target.value, duration)
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
                        publish(frequency, event.target.value)
                    }}
                />
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
                            lastPropRef.current = DEFAULT_CAPTURE_TONE
                            setFrequency(String(DEFAULT_CAPTURE_TONE.frequencyHz))
                            setDuration(String(DEFAULT_CAPTURE_TONE.durationMillis))
                            onChange(null)
                        }}>
                        {t('event.timing.captureTones.reset')}
                    </Button>
                )}
            </Stack>
            {invalid && (
                <Typography variant="caption" color="error">
                    {t('event.timing.captureTones.invalid')}
                </Typography>
            )}
        </Stack>
    )
}

export default CaptureToneEditor
