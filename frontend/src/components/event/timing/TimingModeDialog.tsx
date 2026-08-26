import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControlLabel,
    MenuItem,
    Stack,
    Switch,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material'
import {useEffect, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {addTimingMode, getTimingToneSets, updateTimingMode} from '@api/sdk.gen.ts'
import {TimingModeDto, TimingModeRequest, TimingStartGrouping} from '@api/types.gen.ts'
import {DEFAULT_BOAT_KEYS} from '@utils/timing/boardFocus.ts'
import {useFeedback, useFetch} from '@utils/hooks.ts'

export type TimingModeDialogProps = {
    open: boolean
    onClose: () => void
    eventId: string
    /** undefined = neuen Typ anlegen. */
    entity: TimingModeDto | undefined
    reloadData: () => void
}

/** „Kein eigener Ton-Satz" — dieselbe Schreibweise wie im Zeitnahmeprofil-Baum. */
const INHERIT_VALUE = ''

/** So viele Boote hat eine Partie am Zielposten höchstens — mehr Tasten wären ohne Ziel. */
const MAX_BOAT_KEYS = 6

/**
 * Spiegel der Server-Regeln für eine Tastenreihe (`TimingBoatKeys` im Backend): nicht leer,
 * höchstens [MAX_BOAT_KEYS] Zeichen, kein Leerzeichen (die Leertaste ist der große
 * Erfassungsknopf) und keine Taste zweimal — groß und klein sind dieselbe Taste, weil das Board
 * den Druck ohne Rücksicht auf die Umschalttaste liest.
 */
const validBoatKeyRow = (row: string): boolean =>
    row.length > 0 &&
    row.length <= MAX_BOAT_KEYS &&
    !/\s/.test(row) &&
    new Set([...row.toUpperCase()]).size === row.length

/**
 * Beide Reihen zusammen — getrennt ginge die wichtigste Regel verloren: keine Doppelung ZWISCHEN
 * den Reihen. `null` heißt „keine zweite Reihe".
 */
const validBoatKeys = (primary: string, secondary: string | null): boolean => {
    if (!validBoatKeyRow(primary)) return false
    if (secondary === null) return true
    if (!validBoatKeyRow(secondary)) return false
    const used = new Set([...primary.toUpperCase()])
    return ![...secondary.toUpperCase()].some(key => used.has(key))
}

/**
 * Anlegen/Bearbeiten eines Zeitnahmetyps. Die Zahlenfelder werden als Strings geführt,
 * damit sie beim Tippen vorübergehend leer sein dürfen (gleiche Begründung wie im
 * Sequenz-Setup-Formular); validiert wird beim Speichern. Ein leeres Intervall ist dabei kein
 * Fehler, sondern die bewusste Bedeutung „jeder Start wird von Hand ausgelöst".
 *
 * Der Typ beschreibt, wie ein Lauf gestartet und gemessen wird — und trägt seit dem 26.08.2026
 * alles dazu: die Startart, den Fehlstart-Rückruf, ob die App den Lauf überhaupt startet, die
 * Tastenbelegung des Zielpostens und den Ton-Satz. Die TÖNE selbst stehen bewusst nicht hier: Sie
 * gehören dem Ton-Satz, den sich beliebig viele Typen teilen; dieser Dialog wählt nur einen aus
 * (oder lässt die Wahl leer und erbt den Vorgabesatz der Veranstaltung). Ein zweiter Schreibweg
 * auf dieselben Töne wäre eine Einladung, sie an zwei Stellen verschieden zu setzen.
 *
 * Zwei Felder tragen Erklärtexte statt bloßer Beschriftungen, weil ihre Bedeutung sonst regelmäßig
 * falsch geraten wird: die Startart (der Massenstart ist keine dritte Ausprägung, sondern eine
 * Welle mit allen Booten) und der Fehlstart-Schalter (er ist Bedienhilfe am Startposten und greift
 * NICHT in die Wertung ein).
 */
const TimingModeDialog = ({open, onClose, eventId, entity, reloadData}: TimingModeDialogProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [name, setName] = useState('')
    const [startGrouping, setStartGrouping] = useState<TimingStartGrouping>('EINZEL')
    const [intervalInput, setIntervalInput] = useState('')
    const [leadInInput, setLeadInInput] = useState('10')
    const [falseStartEnabled, setFalseStartEnabled] = useState(true)
    const [toneSet, setToneSet] = useState<string>(INHERIT_VALUE)
    const [startSequenceEnabled, setStartSequenceEnabled] = useState(true)
    const [boatKeysPrimary, setBoatKeysPrimary] = useState(DEFAULT_BOAT_KEYS.primary)
    const [boatKeysSecondary, setBoatKeysSecondary] = useState(DEFAULT_BOAT_KEYS.secondary ?? '')
    const [submitting, setSubmitting] = useState(false)
    const [invalidField, setInvalidField] = useState<
        'name' | 'interval' | 'leadIn' | 'boatKeys' | undefined
    >(undefined)

    // Die Ton-Sätze werden bei jedem Öffnen frisch geholt: Sie werden weiter oben auf derselben
    // Seite gepflegt, und ein gerade angelegter Satz soll hier ohne Neuladen zur Wahl stehen.
    const {data: toneSets} = useFetch(signal => getTimingToneSets({signal, path: {eventId}}), {
        onResponse: ({error}) => {
            if (error) {
                feedback.error(t('common.error.unexpected'))
            }
        },
        preCondition: () => open,
        deps: [eventId, open],
    })

    const sets = toneSets ?? []
    const defaultSet = sets.find(option => option.isDefault)
    const toneSetsReady = toneSets !== null
    /**
     * Der Wert, den die Auswahl zeigt UND der gespeichert wird — beides muss dasselbe sein, sonst
     * speichert jemand etwas anderes, als er liest. Solange die Sätze noch unterwegs sind, bleibt
     * die gewählte Kennung stehen (mit einem eigenen „wird geladen"-Eintrag, damit die Auswahl
     * nicht auf einen Eintrag zeigt, den sie noch nicht hat); ist der Satz danach nicht dabei,
     * wurde er inzwischen gelöscht — dann gilt, was auch der Server tut: zurück auf „erbt".
     */
    const selectedToneSet =
        toneSet === INHERIT_VALUE || !toneSetsReady
            ? toneSet
            : sets.some(option => option.id === toneSet)
              ? toneSet
              : INHERIT_VALUE

    useEffect(() => {
        if (!open) return
        setName(entity?.name ?? '')
        setStartGrouping(entity?.startGrouping ?? 'EINZEL')
        setIntervalInput(entity?.intervalSeconds != null ? String(entity.intervalSeconds) : '')
        setLeadInInput(String(entity?.leadInSeconds ?? 10))
        // Vorgabe „an“ wie in der Datenbank: der Rückruf ist der Normalfall, abgeschaltet wird er
        // bewusst (Timetrial: Strafzeit statt Rückruf).
        setFalseStartEnabled(entity?.falseStartEnabled ?? true)
        // Leere Wahl = erbt den Vorgabesatz. Das ist die Vorgabe für neue Typen, damit ein neuer
        // Typ ohne Zutun so klingt wie die Veranstaltung.
        setToneSet(entity?.toneSet ?? INHERIT_VALUE)
        setStartSequenceEnabled(entity?.startSequenceEnabled ?? true)
        setBoatKeysPrimary(entity?.boatKeysPrimary ?? DEFAULT_BOAT_KEYS.primary)
        // Leeres Feld = keine zweite Reihe; der Server kennt dafür nur `null`, nie den leeren
        // String — beim Speichern wird das eine ins andere übersetzt.
        setBoatKeysSecondary(
            entity === undefined
                ? (DEFAULT_BOAT_KEYS.secondary ?? '')
                : (entity.boatKeysSecondary ?? ''),
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
        const primaryKeys = boatKeysPrimary.trim()
        const secondaryTrimmed = boatKeysSecondary.trim()
        const secondaryKeys = secondaryTrimmed === '' ? null : secondaryTrimmed
        // Die Prüfung sitzt im Server; hier wird sie nur vorweggenommen, damit die Belegung mit
        // einem lesbaren Satz zurückkommt statt mit einem nackten Fehlerschluss.
        if (!validBoatKeys(primaryKeys, secondaryKeys)) {
            setInvalidField('boatKeys')
            return
        }
        setInvalidField(undefined)

        const body: TimingModeRequest = {
            name: trimmedName,
            falseStartEnabled,
            startGrouping,
            intervalSeconds: intervalSeconds !== null ? Math.floor(intervalSeconds) : null,
            leadInSeconds: Math.floor(leadInSeconds),
            toneSet: selectedToneSet === INHERIT_VALUE ? null : selectedToneSet,
            startSequenceEnabled,
            boatKeysPrimary: primaryKeys,
            boatKeysSecondary: secondaryKeys,
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
                    {/* Startart: Der Erklärtext trägt die Unterscheidung, die sonst regelmäßig
                        falsch geraten wird — insbesondere, dass es keinen eigenen Massenstart
                        gibt, sondern nur die Welle, in der alle Boote stehen. */}
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
                            <ToggleButton value="EINZEL" className="cursor-pointer">
                                {t('event.timing.modes.startGrouping.EINZEL')}
                            </ToggleButton>
                            <ToggleButton value="WELLE" className="cursor-pointer">
                                {t('event.timing.modes.startGrouping.WELLE')}
                            </ToggleButton>
                        </ToggleButtonGroup>
                        <Typography variant="body2" color="text.secondary">
                            {t('event.timing.modes.startGrouping.help')}
                        </Typography>
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
                    {/* Startsequenz: Nicht jeder Lauf wird von der App gestartet. Aus heißt, dass
                        das Start-Board für diesen Typ gar kein Countdown-Fenster anbietet — und
                        die beiden Felder darüber dann ins Leere zeigen. */}
                    <Stack spacing={0.5}>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={startSequenceEnabled}
                                    className="cursor-pointer"
                                    onChange={(_, checked) => setStartSequenceEnabled(checked)}
                                />
                            }
                            label={t('event.timing.modes.startSequenceEnabled')}
                        />
                        <Typography variant="body2" color="text.secondary">
                            {t('event.timing.modes.startSequenceEnabledHelp')}
                        </Typography>
                    </Stack>
                    {/* Fehlstart-Rückruf: der Schalter entscheidet, ob das Erfassungsboard des
                        START-Postens den Fehlstart überhaupt anbietet — und der Server lehnt ihn
                        ohne ihn auch ab. Was ein Fehlstart für die WERTUNG bedeutet, steht
                        woanders: im Regelwerk, und von Hand am Lauf. Genau das sagt der
                        Erklärtext, weil der Schalter sonst für eine Wertungsregel gehalten wird. */}
                    <Stack spacing={0.5}>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={falseStartEnabled}
                                    className="cursor-pointer"
                                    onChange={(_, checked) => setFalseStartEnabled(checked)}
                                />
                            }
                            label={t('event.timing.modes.falseStartEnabled')}
                        />
                        <Typography variant="body2" color="text.secondary">
                            {t('event.timing.modes.falseStartEnabledHelp')}
                        </Typography>
                    </Stack>

                    <Divider />

                    {/* Ton-Satz: die Wahl, nicht die Töne. Gepflegt werden die Sätze weiter oben
                        auf derselben Seite; „erbt" ist die Vorgabe und nennt den Satz, der dann
                        gilt — eine Vererbung, die ihr Ziel verschweigt, ist keine Hilfe. */}
                    <Stack spacing={0.5}>
                        <TextField
                            select
                            label={t('event.timing.modes.toneSet')}
                            value={selectedToneSet}
                            disabled={!toneSetsReady}
                            onChange={event => setToneSet(event.target.value)}>
                            <MenuItem value={INHERIT_VALUE} className="cursor-pointer">
                                <em>
                                    {defaultSet !== undefined
                                        ? t('event.timing.modes.toneSetInherit', {
                                              name: defaultSet.name,
                                          })
                                        : t('event.timing.modes.toneSetInheritNone')}
                                </em>
                            </MenuItem>
                            {!toneSetsReady && toneSet !== INHERIT_VALUE && (
                                <MenuItem value={toneSet} className="cursor-pointer">
                                    <em>{t('event.timing.modes.toneSetLoading')}</em>
                                </MenuItem>
                            )}
                            {sets.map(option => (
                                <MenuItem
                                    key={option.id}
                                    value={option.id}
                                    className="cursor-pointer">
                                    {option.name}
                                </MenuItem>
                            ))}
                        </TextField>
                        <Typography variant="body2" color="text.secondary">
                            {t('event.timing.modes.toneSetHelp')}
                        </Typography>
                    </Stack>

                    {/* Tastenbelegung des Zielpostens: In Positionsreihenfolge, das erste Zeichen
                        trifft das Boot mit der niedrigsten Startnummer. Die Boots-Knöpfe am Board
                        tragen genau diese Zeichen als Hinweis — deshalb muss hier stehen, was
                        dort wirkt. */}
                    <Stack spacing={1}>
                        <Typography variant="body2" color="text.secondary">
                            {t('event.timing.modes.boatKeys.title')}
                        </Typography>
                        <Stack direction={{xs: 'column', sm: 'row'}} spacing={2}>
                            <TextField
                                fullWidth
                                label={t('event.timing.modes.boatKeys.primary')}
                                value={boatKeysPrimary}
                                error={invalidField === 'boatKeys'}
                                slotProps={{htmlInput: {maxLength: MAX_BOAT_KEYS}}}
                                onChange={event => setBoatKeysPrimary(event.target.value)}
                            />
                            <TextField
                                fullWidth
                                label={t('event.timing.modes.boatKeys.secondary')}
                                value={boatKeysSecondary}
                                error={invalidField === 'boatKeys'}
                                slotProps={{htmlInput: {maxLength: MAX_BOAT_KEYS}}}
                                onChange={event => setBoatKeysSecondary(event.target.value)}
                            />
                        </Stack>
                        <Typography
                            variant="body2"
                            color={invalidField === 'boatKeys' ? 'error' : 'text.secondary'}>
                            {invalidField === 'boatKeys'
                                ? t('event.timing.modes.boatKeys.invalid')
                                : t('event.timing.modes.boatKeys.help')}
                        </Typography>
                    </Stack>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={submitting} className="cursor-pointer">
                    {t('common.cancel')}
                </Button>
                <Button
                    variant="contained"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="cursor-pointer">
                    {t('common.save')}
                </Button>
            </DialogActions>
        </Dialog>
    )
}

export default TimingModeDialog
