import {describe, expect, test} from 'vitest'
import {DEFAULT_FALSE_START_SEQUENCE, DEFAULT_START_TONE_PLAN} from '@utils/timing/tonePlan.ts'
import {
    TONE_BAR_MIN_WIDTH_PERCENT,
    formatToneSummary,
    planFromRows,
    rowsFromPlan,
    stepFromRow,
    toneOffsetLabel,
    toneTimelineGeometry,
} from './tonePlanEditor.ts'

describe('tonePlanEditor', () => {
    test('Roundtrip: Plan -> Zeilen -> Plan bleibt identisch', () => {
        expect(planFromRows(rowsFromPlan(DEFAULT_START_TONE_PLAN))).toEqual(DEFAULT_START_TONE_PLAN)
    })

    test('Sekunden vor Start: 10 wird zu Offset -10000, 0 bleibt der Start', () => {
        const rows = rowsFromPlan([
            {offsetMillis: -10_000, frequencyHz: 600, durationMillis: 100},
            {offsetMillis: 0, frequencyHz: 900, durationMillis: 400},
        ])
        expect(rows.map(row => row.offsetInput)).toEqual(['10', '0'])
        expect(planFromRows(rows)?.map(step => step.offsetMillis)).toEqual([-10_000, 0])
    })

    test('Dezimalsekunden werden auf Millisekunden gerundet', () => {
        const step = stepFromRow({
            key: 1,
            offsetInput: '2.5',
            frequencyHz: '700',
            durationMillis: '120',
            envelope: 'DECAY',
            waveform: 'SINE',
            releaseMillis: '',
        })
        expect(step).toEqual({offsetMillis: -2500, frequencyHz: 700, durationMillis: 120})
    })

    test('Huellkurve: null wird zur Zeile "Abfallend", jede Zahl (auch 0) zu "Gehalten"', () => {
        const rows = rowsFromPlan([
            {offsetMillis: -1000, frequencyHz: 600, durationMillis: 100},
            {offsetMillis: 0, frequencyHz: 900, durationMillis: 400, releaseMillis: 800},
        ])
        expect(rows[0].envelope).toBe('DECAY')
        expect(rows[0].releaseMillis).toBe('')
        expect(rows[1].envelope).toBe('HELD')
        expect(rows[1].releaseMillis).toBe('800')
        // 0 ist ein legitimer Gehalten-Wert und bleibt beim Roundtrip erhalten — KEINE
        // Normalisierung mehr zu "nicht gesetzt", sonst spraenge die Klanggestalt.
        const zeroRows = rowsFromPlan([
            {offsetMillis: 0, frequencyHz: 900, durationMillis: 400, releaseMillis: 0},
        ])
        expect(zeroRows[0].envelope).toBe('HELD')
        expect(zeroRows[0].releaseMillis).toBe('0')
        expect(planFromRows(zeroRows)).toEqual([
            {offsetMillis: 0, frequencyHz: 900, durationMillis: 400, releaseMillis: 0},
        ])
    })

    test('Ausklingen: Roundtrip erhaelt den Wert, "Abfallend" traegt nie ein releaseMillis', () => {
        const rows = rowsFromPlan([
            {offsetMillis: 0, frequencyHz: 900, durationMillis: 400, releaseMillis: 800},
        ])
        expect(planFromRows(rows)).toEqual([
            {offsetMillis: 0, frequencyHz: 900, durationMillis: 400, releaseMillis: 800},
        ])
        // "Abfallend" ignoriert einen (noch) eingetragenen Ausklingen-Text — das Feld hat in
        // diesem Modus keine Bedeutung und darf die Zeile weder praegen noch kaputt machen.
        const decay = stepFromRow({
            key: 1,
            offsetInput: '0',
            frequencyHz: '900',
            durationMillis: '400',
            envelope: 'DECAY',
            waveform: 'SINE',
            releaseMillis: '800',
        })
        expect(decay).toEqual({offsetMillis: 0, frequencyHz: 900, durationMillis: 400})
    })

    test('leere oder unsinnige Felder machen die Zeile ungueltig', () => {
        const base = {
            key: 1,
            offsetInput: '5',
            frequencyHz: '600',
            durationMillis: '100',
            envelope: 'DECAY',
            waveform: 'SINE',
        } as const
        const decayBase = {...base, releaseMillis: ''}
        expect(stepFromRow({...decayBase, offsetInput: ''})).toBeNull()
        expect(stepFromRow({...decayBase, frequencyHz: 'abc'})).toBeNull()
        expect(stepFromRow({...decayBase, frequencyHz: '600.5'})).toBeNull()
        expect(stepFromRow({...decayBase, durationMillis: ''})).toBeNull()
        // Grenzen aus tonePlan.ts greifen auch hier (Dauer seit dem Fehlstart-Ton bis 10 s).
        expect(stepFromRow({...decayBase, offsetInput: '-1'})).toBeNull()
        expect(stepFromRow({...decayBase, frequencyHz: '99'})).toBeNull()
        expect(stepFromRow({...decayBase, durationMillis: '10001'})).toBeNull()
        expect(stepFromRow({...decayBase, durationMillis: '2001'})).not.toBeNull()
        // Gehalten: 0-5000 ganze ms, ein leeres Feld ist hier ein FEHLER (der Wert hat Bedeutung).
        const held = {...base, envelope: 'HELD'} as const
        expect(stepFromRow({...held, releaseMillis: ''})).toBeNull()
        expect(stepFromRow({...held, releaseMillis: '-1'})).toBeNull()
        expect(stepFromRow({...held, releaseMillis: '5001'})).toBeNull()
        expect(stepFromRow({...held, releaseMillis: '2.5'})).toBeNull()
        expect(stepFromRow({...held, releaseMillis: 'abc'})).toBeNull()
        expect(stepFromRow({...held, releaseMillis: '0'})).toEqual({
            offsetMillis: -5000,
            frequencyHz: 600,
            durationMillis: 100,
            releaseMillis: 0,
        })
        expect(stepFromRow({...held, releaseMillis: '5000'})).not.toBeNull()
    })

    test('Wellenform: Roundtrip erhaelt sie, explizites SINE wird zu "nicht gesetzt"', () => {
        // Gespeichertes Rechteck kommt als Rechteck-Zeile wieder hoch und geht als Rechteck zurueck.
        const rows = rowsFromPlan([
            {offsetMillis: 0, frequencyHz: 440, durationMillis: 300, waveform: 'SQUARE'},
        ])
        expect(rows[0].waveform).toBe('SQUARE')
        expect(planFromRows(rows)).toEqual([
            {offsetMillis: 0, frequencyHz: 440, durationMillis: 300, waveform: 'SQUARE'},
        ])
        // Ohne waveform (Alt-Bestand) zeigt die Zeile Sinus.
        expect(rowsFromPlan([{offsetMillis: 0, frequencyHz: 900, durationMillis: 400}])[0].waveform).toBe(
            'SINE',
        )
        // Explizit gewaehlter Sinus wird zu "nicht gesetzt" normalisiert: SINE und null sind
        // KLANGGLEICH (gleicher Oszillatortyp, gleicher Formfaktor) — hier verschluckt die
        // Normalisierung also keine Bedeutung, anders als es bei releaseMillis 0 vs null waere.
        const sineStep = stepFromRow({
            key: 1,
            offsetInput: '0',
            frequencyHz: '900',
            durationMillis: '400',
            envelope: 'DECAY',
            waveform: 'SINE',
            releaseMillis: '',
        })
        expect(sineStep).toEqual({offsetMillis: 0, frequencyHz: 900, durationMillis: 400})
        // Wellenform und Huellkurve sind unabhaengig: gehaltener Saegezahn traegt beides.
        const held = stepFromRow({
            key: 2,
            offsetInput: '0',
            frequencyHz: '440',
            durationMillis: '800',
            envelope: 'HELD',
            waveform: 'SAWTOOTH',
            releaseMillis: '800',
        })
        expect(held).toEqual({
            offsetMillis: 0,
            frequencyHz: 440,
            durationMillis: 800,
            releaseMillis: 800,
            waveform: 'SAWTOOTH',
        })
    })

    test('planFromRows liefert null, sobald eine Zeile kaputt ist, sonst sortiert', () => {
        const rows = rowsFromPlan([
            {offsetMillis: 0, frequencyHz: 900, durationMillis: 400},
            {offsetMillis: -3000, frequencyHz: 600, durationMillis: 100},
        ])
        expect(planFromRows(rows)?.map(step => step.offsetMillis)).toEqual([-3000, 0])
        expect(
            planFromRows([
                ...rows,
                {
                    key: 99,
                    offsetInput: 'x',
                    frequencyHz: '600',
                    durationMillis: '100',
                    envelope: 'DECAY',
                    waveform: 'SINE',
                    releaseMillis: '',
                },
            ]),
        ).toBeNull()
    })
})

// --- Fehlstart-Richtung: Millisekunden VORWAERTS --------------------------------------------------

describe('Tonfolge-Zeilen mit Zeitpunkt nach der Ausloesung', () => {
    test('Roundtrip: Folge -> Zeilen -> Folge, die Einheit ist hier Millisekunden', () => {
        const rows = rowsFromPlan(DEFAULT_FALSE_START_SEQUENCE, 'AFTER_TRIGGER')
        // Anders als beim Startplan (Sekunden VOR Start) steht hier die rohe Millisekundenzahl
        // im Feld: das Raster einer Fehlstart-Folge liegt bei 400 ms, Sekunden waeren zu grob.
        expect(rows.map(row => row.offsetInput)).toEqual(['0', '400', '800'])
        expect(planFromRows(rows, 'AFTER_TRIGGER')).toEqual([...DEFAULT_FALSE_START_SEQUENCE])
    })

    const row = (offsetInput: string) =>
        ({
            key: 1,
            offsetInput,
            frequencyHz: '200',
            durationMillis: '300',
            envelope: 'HELD',
            waveform: 'SAWTOOTH',
            releaseMillis: '0',
        }) as const

    test('Das Offset-Fenster zaehlt vorwaerts: 0 bis 60000, nichts Negatives', () => {
        expect(stepFromRow(row('0'), 'AFTER_TRIGGER')?.offsetMillis).toBe(0)
        expect(stepFromRow(row('60000'), 'AFTER_TRIGGER')?.offsetMillis).toBe(60_000)
        expect(stepFromRow(row('60001'), 'AFTER_TRIGGER')).toBeNull()
        expect(stepFromRow(row('-1'), 'AFTER_TRIGGER')).toBeNull()
        // Halbe Millisekunden gibt es nicht.
        expect(stepFromRow(row('400.5'), 'AFTER_TRIGGER')).toBeNull()
        expect(stepFromRow(row(''), 'AFTER_TRIGGER')).toBeNull()
    })

    test('Einzelton-Modus: kein Zeitpunkt-Feld, der Ton liegt immer bei 0', () => {
        const single = stepFromRow({...row(''), waveform: 'SINE'}, null)
        expect(single?.offsetMillis).toBe(0)
        // Ein Feldrest wird im Einzelton-Modus ignoriert, nicht als Zeitpunkt gedeutet.
        expect(stepFromRow({...row('999'), waveform: 'SINE'}, null)?.offsetMillis).toBe(0)
        // Und die Zeile fuehrt gar keinen Zeitpunkt-Text mit.
        expect(rowsFromPlan([{offsetMillis: 0, frequencyHz: 880, durationMillis: 150}], null)[0].offsetInput).toBe('')
    })
})

// --- Zusammenfassungstext ------------------------------------------------------------------------

describe('toneOffsetLabel', () => {
    test('Die 0 ist ein benannter Sonderfall, kein Zahlentext', () => {
        // "Start" bzw. "sofort" haengt an der Sprache — die reine Funktion sagt nur, DASS hier
        // ein Wort hingehoert.
        expect(toneOffsetLabel(0)).toEqual({kind: 'ZERO'})
    })

    test('Vorzeichen zeigt die Richtung, die Einheit haengt an der Groessenordnung', () => {
        expect(toneOffsetLabel(400)).toEqual({kind: 'VALUE', text: '+400 ms'})
        expect(toneOffsetLabel(-400)).toEqual({kind: 'VALUE', text: '−400 ms'})
        // Ab einer Sekunde in Sekunden - eine "+5000 ms" liest sich niemand gern.
        expect(toneOffsetLabel(-5000)).toEqual({kind: 'VALUE', text: '−5 s'})
        expect(toneOffsetLabel(2500)).toEqual({kind: 'VALUE', text: '+2.5 s'})
        expect(toneOffsetLabel(-600_000)).toEqual({kind: 'VALUE', text: '−600 s'})
        // Genau die Sekundengrenze zaehlt schon als Sekunde.
        expect(toneOffsetLabel(1000)).toEqual({kind: 'VALUE', text: '+1 s'})
        expect(toneOffsetLabel(999)).toEqual({kind: 'VALUE', text: '+999 ms'})
    })
})

describe('formatToneSummary', () => {
    const texts = {waveformText: 'Sägezahn', envelopeText: 'gehalten'}

    test('Zeitpunkt, Wellenform, Tonhoehe, Dauer, Huellkurve — mit Trennpunkten', () => {
        expect(
            formatToneSummary({
                offsetText: '+400 ms',
                frequencyHz: 200,
                durationMillis: 300,
                ...texts,
            }),
        ).toBe('+400 ms · Sägezahn · 200 Hz · 300 ms · gehalten')
    })

    test('Ohne Zeitpunkt (Einzelton) faellt die erste Stelle ganz weg', () => {
        expect(
            formatToneSummary({
                offsetText: null,
                frequencyHz: 200,
                durationMillis: 2000,
                ...texts,
            }),
        ).toBe('Sägezahn · 200 Hz · 2000 ms · gehalten')
    })

    test('Beim Tippen steht der rohe Feldinhalt da, kein NaN', () => {
        expect(
            formatToneSummary({offsetText: '—', frequencyHz: '', durationMillis: '30', ...texts}),
        ).toBe('— · Sägezahn ·  Hz · 30 ms · gehalten')
    })
})

// --- Zeitleiste ----------------------------------------------------------------------------------

describe('toneTimelineGeometry', () => {
    const entries = DEFAULT_FALSE_START_SEQUENCE.map((step, index) => ({key: index, step}))

    test('Die Achse reicht bis zum letzten KLANG, nicht bis zum letzten Zeitpunkt', () => {
        const timeline = toneTimelineGeometry(entries)
        expect(timeline.startMillis).toBe(0)
        // 800 + 1500 gehalten + 400 Ausklingen = 2700, nicht 800.
        expect(timeline.endMillis).toBe(2700)
    })

    test('Position proportional zum Zeitpunkt, Breite proportional zur Klanglaenge', () => {
        const {bars} = toneTimelineGeometry(entries)
        expect(bars.map(bar => Math.round(bar.leftPercent * 100) / 100)).toEqual([0, 14.81, 29.63])
        // Die kurzen sind 308 ms breit, nicht 300: „Gehalten mit 0 ms Ausklingen" faellt trotzdem
        // ueber die eingebaute Mini-Entknackung ab, und die Leiste zeigt, was man HOERT.
        expect(bars.map(bar => Math.round(bar.widthPercent * 100) / 100)).toEqual([11.41, 11.41, 70.37])
        // Der Schlussbalken endet genau am rechten Rand.
        const last = bars[bars.length - 1]
        expect(Math.round(last.leftPercent + last.widthPercent)).toBe(100)
    })

    test('Ein Countdown liest sich von links (frueh) nach rechts (Start)', () => {
        const plan = DEFAULT_START_TONE_PLAN.map((step, index) => ({key: index, step}))
        const timeline = toneTimelineGeometry(plan)
        expect(timeline.startMillis).toBe(-5000)
        expect(timeline.endMillis).toBe(400)
        expect(timeline.bars[0].leftPercent).toBe(0)
        // Die fuenf Ticks liegen im gleichen Abstand — genau das soll man sehen.
        const lefts = timeline.bars.map(bar => Math.round(bar.leftPercent))
        expect([lefts[1] - lefts[0], lefts[2] - lefts[1], lefts[3] - lefts[2]]).toEqual([19, 18, 19])
    })

    test('Ein sehr kurzer Ton bekommt eine Mindestbreite, damit er anklickbar bleibt', () => {
        // 20 ms neben 10 s waeren 0.2 % — ein unsichtbarer, untreffbarer Strich.
        const {bars} = toneTimelineGeometry([
            {key: 1, step: {offsetMillis: 0, frequencyHz: 600, durationMillis: 20}},
            {key: 2, step: {offsetMillis: 1000, frequencyHz: 600, durationMillis: 10_000}},
        ])
        expect(bars[0].widthPercent).toBe(TONE_BAR_MIN_WIDTH_PERCENT)
    })

    test('Kein Balken laeuft ueber den rechten Rand hinaus', () => {
        const {bars} = toneTimelineGeometry([
            {key: 1, step: {offsetMillis: 0, frequencyHz: 600, durationMillis: 5000}},
            // Der letzte Ton ist sehr kurz und liegt ganz am Ende: Mindestbreite trifft Rand.
            {key: 2, step: {offsetMillis: 4980, frequencyHz: 600, durationMillis: 20}},
        ])
        bars.forEach(bar => expect(bar.leftPercent + bar.widthPercent).toBeLessThanOrEqual(100))
    })

    test('Eine leere Folge hat keine Balken und keine Achse', () => {
        expect(toneTimelineGeometry([])).toEqual({startMillis: 0, endMillis: 0, bars: []})
    })
})
