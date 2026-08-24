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
    TONE_RELEASE_MAX_MILLIS,
    TONE_RELEASE_MIN_MILLIS,
    isValidToneRelease,
} from '@utils/timing/tonePlan.ts'

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

/**
 * Leeres Ausklingen-Feld = keine eigene Ausklingzeit; 0 wird gleichbedeutend zu „nicht gesetzt"
 * normalisiert (dieselbe Hüllkurve), damit die API nie ein bedeutungsloses 0 trägt.
 */
const parseTone = (frequency: string, duration: string, release: string): CaptureToneDto | null => {
    if (frequency.trim() === '' || duration.trim() === '') return null
    const releaseText = release.trim()
    const releaseMillis = releaseText === '' ? undefined : Number(releaseText)
    if (releaseMillis !== undefined && !Number.isInteger(releaseMillis)) return null
    const tone: CaptureToneDto = {
        frequencyHz: Number(frequency),
        durationMillis: Number(duration),
        ...(releaseMillis ? {releaseMillis} : {}),
    }
    if (releaseMillis !== undefined && !isValidToneRelease(releaseMillis)) return null
    return isValidTone(tone) ? tone : null
}

const releaseOf = (tone: CaptureToneDto): number => tone.releaseMillis ?? 0

/**
 * Editor für EINEN konfigurierbaren Ton der Veranstaltung (Erfassungston eines Ziel- oder
 * Zwischenzeitpostens, Fehlstart-Ton): Tonhöhe, Dauer, Ausklingen, Abspiel-Vorschau (der Klick
 * IST die WebAudio-Nutzergeste und spielt die echte Hüllkurve) und „Standard wiederherstellen".
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
    const [release, setRelease] = useState(releaseOf(effective) !== 0 ? String(releaseOf(effective)) : '')

    // Von außen hereinkommende Stände (frischer GET, „Standard wiederherstellen") übernehmen —
    // aber nur, wenn sie sich wirklich vom Getippten unterscheiden, sonst kämpfte der Effekt
    // gegen die Eingabe an.
    const lastPropRef = useRef(effective)
    useEffect(() => {
        if (
            lastPropRef.current.frequencyHz !== effective.frequencyHz ||
            lastPropRef.current.durationMillis !== effective.durationMillis ||
            releaseOf(lastPropRef.current) !== releaseOf(effective)
        ) {
            lastPropRef.current = effective
            setFrequency(String(effective.frequencyHz))
            setDuration(String(effective.durationMillis))
            setRelease(releaseOf(effective) !== 0 ? String(releaseOf(effective)) : '')
        }
    }, [effective])

    const publish = (nextFrequency: string, nextDuration: string, nextRelease: string) => {
        const tone = parseTone(nextFrequency, nextDuration, nextRelease)
        if (tone === null) return
        lastPropRef.current = tone
        const isDefault =
            tone.frequencyHz === builtIn.frequencyHz &&
            tone.durationMillis === builtIn.durationMillis &&
            releaseOf(tone) === releaseOf(builtIn)
        onChange(isDefault ? null : tone)
    }

    const parsed = parseTone(frequency, duration, release)
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
                        publish(event.target.value, duration, release)
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
                        publish(frequency, event.target.value, release)
                    }}
                />
                {/* Leer = Standardhüllkurve (Abfall über die Nenndauer); gesetzt = Haltezeit,
                    danach Abfall über diese Zeit — der Gesamtklang ist Dauer + Ausklingen. */}
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
                        publish(frequency, duration, event.target.value)
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
                            lastPropRef.current = builtIn
                            setFrequency(String(builtIn.frequencyHz))
                            setDuration(String(builtIn.durationMillis))
                            setRelease(releaseOf(builtIn) !== 0 ? String(releaseOf(builtIn)) : '')
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
