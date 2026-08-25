import {Button, Stack, Typography} from '@mui/material'
import {useEffect, useRef, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {CaptureToneDto} from '@api/types.gen.ts'
import {DEFAULT_CAPTURE_TONE, ToneStep} from '@utils/timing/tonePlan.ts'
import {ToneRow, rowFromStep, stepFromRow} from './tonePlanEditor.ts'
import ToneSequenceEditor from './ToneSequenceEditor.tsx'

export type CaptureToneEditorProps = {
    label: string
    /** null = eingebauter Standard ([defaultTone], ohne Angabe der Erfassungs-Standard 880/150). */
    value: CaptureToneDto | null
    onChange: (value: CaptureToneDto | null) => void
    /** Der eingebaute Standard dieses Tons — ohne Angabe der Erfassungs-Piep (880 Hz / 150 ms). */
    defaultTone?: CaptureToneDto
}

/** Ein Folgen-Eintrag zurück in einen Einzelton: der Zeitpunkt fällt weg, er ist hier immer 0. */
const toneFromStep = (step: ToneStep): CaptureToneDto => ({
    frequencyHz: step.frequencyHz,
    durationMillis: step.durationMillis,
    ...(step.releaseMillis !== undefined ? {releaseMillis: step.releaseMillis} : {}),
    ...(step.waveform !== undefined ? {waveform: step.waveform} : {}),
})

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
 * Zwischenzeitpostens). Ein Erfassungston bleibt bewusst ein EINZELTON — er bestätigt einen
 * Tastendruck und muss knapp sein, eine Folge würde in die nächste Erfassung hineinlaufen.
 *
 * Die Darstellung teilt er sich trotzdem mit den Tonfolgen ([ToneSequenceEditor] mit
 * `direction={null}`): eine kompakte Zusammenfassungszeile, die auf Klick ihre Felder zeigt,
 * dieselbe Abspiel-Vorschau. Weg fallen nur Zeitpunkt, Zeitleiste und „Ton hinzufügen" — es gibt
 * hier genau eine Zeile, und sie lässt sich nicht löschen.
 *
 * An den Parent geht nur ein gültiger Stand — und werte-gleich mit dem Standard wird zu `null`
 * normalisiert, damit „unkonfiguriert" in der Datenbank unkonfiguriert bleibt.
 */
const CaptureToneEditor = ({label, value, onChange, defaultTone}: CaptureToneEditorProps) => {
    const {t} = useTranslation()
    const builtIn = defaultTone ?? DEFAULT_CAPTURE_TONE
    const effective = value ?? builtIn

    const [rows, setRows] = useState<ToneRow[]>(() => [
        rowFromStep({offsetMillis: 0, ...effective}, null),
    ])

    // Von außen hereinkommende Stände (frischer GET, „Standard wiederherstellen") übernehmen —
    // aber nur, wenn sie sich wirklich vom Getippten unterscheiden, sonst kämpfte der Effekt
    // gegen die Eingabe an.
    const lastPropRef = useRef<CaptureToneDto>(effective)
    useEffect(() => {
        if (!sameTone(lastPropRef.current, effective)) {
            lastPropRef.current = effective
            setRows([rowFromStep({offsetMillis: 0, ...effective}, null)])
        }
    }, [effective])

    const handleRows = (next: ToneRow[]) => {
        setRows(next)
        const step = next.length > 0 ? stepFromRow(next[0], null) : null
        // Ungültige Eingaben markiert die Zeile selbst; der Parent behält seinen letzten
        // gültigen Stand.
        if (step === null) return
        const tone = toneFromStep(step)
        lastPropRef.current = tone
        onChange(sameTone(tone, builtIn) ? null : tone)
    }

    const invalid = rows.length === 0 || stepFromRow(rows[0], null) === null

    return (
        <Stack spacing={1}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography variant="body2" color="text.secondary">
                    {label}
                    {value === null ? ` — ${t('event.timing.captureTones.isDefault')}` : ''}
                </Typography>
                {value !== null && (
                    <Button
                        size="small"
                        onClick={() => {
                            lastPropRef.current = builtIn
                            setRows([rowFromStep({offsetMillis: 0, ...builtIn}, null)])
                            onChange(null)
                        }}>
                        {t('event.timing.captureTones.reset')}
                    </Button>
                )}
            </Stack>
            <ToneSequenceEditor
                direction={null}
                rows={rows}
                onChange={handleRows}
                invalid={invalid}
                invalidText={t('event.timing.captureTones.invalid')}
            />
        </Stack>
    )
}

export default CaptureToneEditor
