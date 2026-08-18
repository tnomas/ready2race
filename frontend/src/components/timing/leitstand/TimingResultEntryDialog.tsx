import {
    Alert,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    MenuItem,
    Stack,
    Switch,
    TextField,
} from '@mui/material'
import {useEffect, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {setTimingResult} from '@api/sdk.gen.ts'
import {TimingResultDto, TimingResultStatus} from '@api/types.gen.ts'
import {useFeedback} from '@utils/hooks.ts'

const RESULT_STATUSES: TimingResultStatus[] = ['NONE', 'DNS', 'DNF', 'DSQ']

export type TimingResultEntryDialogProps = {
    open: boolean
    onClose: () => void
    eventId: string
    competitionMatchTeam: string
    /** Human label of the team the row belongs to, for the dialog title. */
    teamLabel: string
    /** The row this dialog edits, or undefined while it has not loaded. */
    result: TimingResultDto | undefined
    /** Called after a successful save so the caller can re-sync (the websocket echo is the fast path). */
    onSaved: () => void
}

/**
 * The **judged** half of one team's result: a penalty in seconds, a note for it, and the DNS/DNF/DSQ
 * status. Everything measured — start, finish, the difference — stays untouched here: it comes from
 * the marks and is recomputed on every read, and correcting *it* means correcting a mark on the Zeiten
 * tab (or overriding the time outright in the competition execution view).
 *
 * The penalty is entered in **whole and fractional seconds**, matching the API's `penaltySeconds` and
 * the unit a jury actually works in ("plus five"). An empty field clears the penalty, because the PUT
 * has replace semantics: every absent field is reset server-side, which is what makes "take it all
 * back" expressible at all.
 *
 * A status other than NONE supersedes any measured time and also drops a previously pushed timecode —
 * that is the server's behaviour, not something reconstructed here.
 *
 * `force` is offered only when the row is `frozen` (a place recorded, or places calculated). Without
 * it the server answers 409 for such a team, so hiding the switch on an unfrozen row keeps the
 * destructive option out of the way in the ordinary case, and the hint spells out what it overrides.
 */
const TimingResultEntryDialog = ({
    open,
    onClose,
    eventId,
    competitionMatchTeam,
    teamLabel,
    result,
    onSaved,
}: TimingResultEntryDialogProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [penaltyInput, setPenaltyInput] = useState('')
    const [noteInput, setNoteInput] = useState('')
    const [status, setStatus] = useState<TimingResultStatus>('NONE')
    const [force, setForce] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    // Re-seed from the row only when the dialog opens (or is opened for a different row) — NOT on every
    // `result` identity change. A websocket-driven recompute replaces the `result` object whenever a
    // mark of this team changes; reseeding then would clobber whatever the operator is mid-typing.
    // `result` is intentionally read from the closure rather than listed as a dependency.
    useEffect(() => {
        if (!open) return
        setPenaltyInput(result?.penaltySeconds != null ? String(result.penaltySeconds) : '')
        setNoteInput(result?.penaltyNote ?? '')
        setStatus(result?.resultStatus ?? 'NONE')
        setForce(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, competitionMatchTeam])

    const trimmedPenalty = penaltyInput.trim().replace(',', '.')
    const penaltyValue = trimmedPenalty.length === 0 ? null : Number(trimmedPenalty)
    const penaltyInvalid =
        penaltyValue !== null && (!Number.isFinite(penaltyValue) || penaltyValue < 0)

    const handleSave = () => {
        if (penaltyInvalid) return
        setSubmitting(true)
        void (async () => {
            try {
                const {error} = await setTimingResult({
                    path: {eventId, competitionMatchTeamId: competitionMatchTeam},
                    body: {
                        penaltySeconds: penaltyValue,
                        // An empty note next to a penalty is a note that was cleared, not an empty
                        // string to store — the PUT's reset semantics take `null` for that.
                        penaltyNote: noteInput.trim().length > 0 ? noteInput.trim() : null,
                        resultStatus: status,
                        force,
                    },
                })
                if (error !== undefined) {
                    feedback.error(t('timing.leitstand.results.entry.error'))
                    return
                }
                feedback.success(t('timing.leitstand.results.entry.success'))
                onSaved()
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
                {t('timing.leitstand.results.entry.title')} — {teamLabel}
            </DialogTitle>
            <DialogContent>
                <Stack spacing={3} sx={{mt: 1}}>
                    <TextField
                        label={t('timing.leitstand.results.entry.penaltySeconds')}
                        helperText={
                            penaltyInvalid
                                ? t('timing.leitstand.results.entry.invalidSeconds')
                                : t('timing.leitstand.results.entry.penaltyHelp')
                        }
                        error={penaltyInvalid}
                        value={penaltyInput}
                        onChange={event => setPenaltyInput(event.target.value)}
                        disabled={submitting}
                        fullWidth
                    />
                    <TextField
                        label={t('timing.leitstand.results.entry.penaltyNote')}
                        helperText={t('timing.leitstand.results.entry.penaltyNoteHelp')}
                        value={noteInput}
                        onChange={event => setNoteInput(event.target.value)}
                        disabled={submitting}
                        fullWidth
                    />
                    <TextField
                        select
                        label={t('timing.leitstand.results.entry.status')}
                        helperText={t('timing.leitstand.results.entry.statusHelp')}
                        value={status}
                        onChange={event => setStatus(event.target.value as TimingResultStatus)}
                        disabled={submitting}
                        fullWidth>
                        {RESULT_STATUSES.map(value => (
                            <MenuItem key={value} value={value}>
                                {t(`timing.leitstand.results.status.${value}`)}
                            </MenuItem>
                        ))}
                    </TextField>
                    {result?.frozen === true && (
                        <Stack spacing={1}>
                            <Alert severity="warning">
                                {t('timing.leitstand.results.entry.forceHint')}
                            </Alert>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={force}
                                        onChange={event => setForce(event.target.checked)}
                                        disabled={submitting}
                                    />
                                }
                                label={t('timing.leitstand.results.entry.force')}
                            />
                        </Stack>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={submitting}>
                    {t('common.cancel')}
                </Button>
                <Button
                    variant="contained"
                    onClick={handleSave}
                    disabled={submitting || penaltyInvalid}>
                    {t('common.save')}
                </Button>
            </DialogActions>
        </Dialog>
    )
}

export default TimingResultEntryDialog
