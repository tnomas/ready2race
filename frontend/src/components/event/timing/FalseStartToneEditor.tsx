import {Button, Stack, Typography} from '@mui/material'
import {useEffect, useRef, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {ToneStepDto} from '@api/types.gen.ts'
import {
    DEFAULT_FALSE_START_SEQUENCE,
    PRESET_FALSE_START_SINGLE,
    PRESET_FALSE_START_TRIPLE,
    ToneStep,
    equalsDefaultFalseStartSequence,
    equalsToneSequence,
} from '@utils/timing/tonePlan.ts'
import {ToneRow, planFromRows, rowsFromPlan} from './tonePlanEditor.ts'
import ToneSequenceEditor from './ToneSequenceEditor.tsx'

export type FalseStartToneEditorProps = {
    /** null = eingebaute Standardfolge ([DEFAULT_FALSE_START_SEQUENCE]). */
    value: ToneStepDto[] | null
    onChange: (value: ToneStepDto[] | null) => void
}

/**
 * Der Fehlstart-Rückruf als TONFOLGE: eine Liste von Tönen mit Zeitpunkt, gezählt VORWÄRTS ab der
 * Auslösung (0 = sofort). Damit lässt sich ein Muster mit abweichendem Schluss bauen — „död, död,
 * dööööd" —, das am Wasser als Rückruf erkennbar ist, wo ein einzelner Ton als „irgendein Signal"
 * durchgeht. Bewusst kein „Wiederholungen"-Zähler: der könnte den abweichenden letzten Ton nicht
 * ausdrücken.
 *
 * Gespeichert wird `null`, sobald die Folge inhaltlich dem eingebauten Standard entspricht — so
 * bleibt „unkonfiguriert" in der Datenbank unkonfiguriert, und eine künftige Änderung des
 * Standards erreicht auch Veranstaltungen, deren Folge nie bewusst verstellt wurde.
 */
const FalseStartToneEditor = ({value, onChange}: FalseStartToneEditorProps) => {
    const {t} = useTranslation()
    const effective: readonly ToneStep[] =
        value !== null && value.length > 0 ? value : DEFAULT_FALSE_START_SEQUENCE

    const [rows, setRows] = useState<ToneRow[]>(() => rowsFromPlan(effective, 'AFTER_TRIGGER'))
    const [invalid, setInvalid] = useState(false)

    // Von außen hereinkommende Stände (frischer GET, „Standard wiederherstellen") übernehmen —
    // aber nur, wenn sie sich klanglich vom Bearbeiteten unterscheiden, sonst kämpfte der Effekt
    // gegen die Eingabe an.
    const lastPropRef = useRef<readonly ToneStep[]>(effective)
    useEffect(() => {
        if (!equalsToneSequence(lastPropRef.current, effective)) {
            lastPropRef.current = effective
            setRows(rowsFromPlan(effective, 'AFTER_TRIGGER'))
            setInvalid(false)
        }
    }, [effective])

    const handleRows = (next: ToneRow[]) => {
        setRows(next)
        const sequence = planFromRows(next, 'AFTER_TRIGGER')
        // Eine leere Folge wäre ein stummer Rückruf — der Editor lässt sie zwar zu (man löscht
        // erst und baut dann neu), gibt sie aber nicht an den Parent weiter.
        if (sequence === null || sequence.length === 0) {
            setInvalid(true)
            return
        }
        setInvalid(false)
        lastPropRef.current = sequence
        onChange(equalsDefaultFalseStartSequence(sequence) ? null : sequence)
    }

    return (
        <Stack spacing={1}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography variant="body2" color="text.secondary">
                    {t('event.timing.falseStartTone.label')}
                    {value === null ? ` — ${t('event.timing.captureTones.isDefault')}` : ''}
                </Typography>
                {value !== null && (
                    <Button
                        size="small"
                        onClick={() => {
                            lastPropRef.current = DEFAULT_FALSE_START_SEQUENCE
                            setRows(rowsFromPlan(DEFAULT_FALSE_START_SEQUENCE, 'AFTER_TRIGGER'))
                            setInvalid(false)
                            onChange(null)
                        }}>
                        {t('event.timing.captureTones.reset')}
                    </Button>
                )}
            </Stack>
            <ToneSequenceEditor
                direction={'AFTER_TRIGGER'}
                rows={rows}
                onChange={handleRows}
                invalid={invalid}
                invalidText={t('event.timing.falseStartTone.invalid')}
                presets={[
                    {
                        label: t('event.timing.falseStartTone.presetSingle'),
                        steps: PRESET_FALSE_START_SINGLE,
                    },
                    {
                        label: t('event.timing.falseStartTone.presetTriple'),
                        steps: PRESET_FALSE_START_TRIPLE,
                    },
                    {
                        label: t('event.timing.falseStartTone.presetShortShortLong'),
                        steps: DEFAULT_FALSE_START_SEQUENCE,
                    },
                ]}
                help={
                    <>
                        {t('event.timing.tones.offsetAfterTriggerHelp')}{' '}
                        {t('event.timing.toneEnvelope.decayHelp')}{' '}
                        {t('event.timing.toneEnvelope.heldHelp')}{' '}
                        {t('event.timing.toneWaveform.help')}
                    </>
                }
            />
        </Stack>
    )
}

export default FalseStartToneEditor
