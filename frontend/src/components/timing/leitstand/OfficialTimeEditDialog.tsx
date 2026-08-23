import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    MenuItem,
    Stack,
    TextField,
    Typography,
} from '@mui/material'
import {useEffect, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {setOfficialTimeOverride} from '@api/sdk.gen.ts'
import {OfficialTimeDto, OfficialTimeResultStatus} from '@api/types.gen.ts'
import {useFeedback} from '@utils/hooks.ts'
import {formatSeconds, parseSecondsToMillis} from '@components/timing/leitstand/format.ts'

const RESULT_STATUSES: OfficialTimeResultStatus[] = ['NONE', 'DNS', 'DNF', 'DSQ']

export type OfficialTimeEditDialogProps = {
    open: boolean
    onClose: () => void
    eventId: string
    competitionMatchTeam: string
    /** Human label of the team the row belongs to, for the dialog title. */
    teamLabel: string
    /** The row's current official time, or undefined when the team has no row yet. */
    official: OfficialTimeDto | undefined
    /** Called after a successful save so the caller can re-sync (the websocket echo is the fast path). */
    onSaved: () => void
}

/**
 * Manual correction of one team's official time: an override time, a penalty, and the DNS/DNF/DSQ
 * status.
 *
 * Both time inputs are **seconds with decimals** rather than a mm:ss.d mask. The values an operator
 * types here are corrections (`+5` penalty, "the real time was 92.4") and a free-form number field is
 * the least error-prone way to enter those; `parseSecondsToMillis` converts to the millis the API
 * takes and rejects anything non-numeric or negative before a request is spent.
 *
 * The PUT has reset semantics — an absent field is cleared server-side — so an emptied override field
 * genuinely removes the override and falls the row back to its computed time. Penalty and status are
 * always sent (0 / `NONE` being their neutral values), which makes "clear everything" expressible.
 */
const OfficialTimeEditDialog = ({
    open,
    onClose,
    eventId,
    competitionMatchTeam,
    teamLabel,
    official,
    onSaved,
}: OfficialTimeEditDialogProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [overrideInput, setOverrideInput] = useState('')
    const [penaltyInput, setPenaltyInput] = useState('')
    const [penaltyNoteInput, setPenaltyNoteInput] = useState('')
    const [status, setStatus] = useState<OfficialTimeResultStatus>('NONE')
    const [submitting, setSubmitting] = useState(false)

    // Re-seed from the row only when the dialog opens (or is opened for a different row) — NOT on every
    // `official` identity change. A websocket-driven recompute can replace the `official` object while
    // the dialog is open for that same row; reseeding then would clobber whatever the operator is mid-
    // typing. `official` is intentionally read from the closure rather than listed as a dependency.
    useEffect(() => {
        if (!open) return
        setOverrideInput(official?.overrideMillis !== undefined ? formatSeconds(official.overrideMillis) : '')
        setPenaltyInput(
            official?.penaltyMillis !== undefined && official.penaltyMillis !== 0
                ? formatSeconds(official.penaltyMillis)
                : '',
        )
        setPenaltyNoteInput(official?.penaltyNote ?? '')
        setStatus(official?.resultStatus ?? 'NONE')
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, competitionMatchTeam])

    const overrideMillis = overrideInput.trim().length === 0 ? null : parseSecondsToMillis(overrideInput)
    const penaltyMillis = penaltyInput.trim().length === 0 ? 0 : parseSecondsToMillis(penaltyInput)
    const overrideInvalid = overrideInput.trim().length > 0 && overrideMillis === null
    const penaltyInvalid = penaltyInput.trim().length > 0 && penaltyMillis === null

    const handleSave = () => {
        if (overrideInvalid || penaltyInvalid) return
        setSubmitting(true)
        void (async () => {
            try {
                const {error} = await setOfficialTimeOverride({
                    path: {eventId, competitionMatchTeamId: competitionMatchTeam},
                    body: {
                        ...(overrideMillis !== null ? {overrideMillis} : {}),
                        penaltyMillis: penaltyMillis ?? 0,
                        // PUT-Semantik: ein leerer Grund wird gar nicht gesendet und räumt damit
                        // einen früheren Grund ab.
                        ...(penaltyNoteInput.trim().length > 0
                            ? {penaltyNote: penaltyNoteInput.trim()}
                            : {}),
                        resultStatus: status,
                    },
                })
                if (error !== undefined) {
                    feedback.error(t('timing.leitstand.results.edit.error'))
                    return
                }
                feedback.success(t('timing.leitstand.results.edit.success'))
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
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
            <DialogTitle>{t('timing.leitstand.results.edit.title')}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{mt: 1}}>
                    <Typography variant="body2" color="text.secondary">
                        {teamLabel}
                    </Typography>
                    <TextField
                        label={t('timing.leitstand.results.edit.overrideSeconds')}
                        helperText={
                            overrideInvalid
                                ? t('timing.leitstand.results.edit.invalidSeconds')
                                : t('timing.leitstand.results.edit.overrideHelp')
                        }
                        error={overrideInvalid}
                        value={overrideInput}
                        disabled={submitting}
                        onChange={event => setOverrideInput(event.target.value)}
                        inputProps={{inputMode: 'decimal'}}
                    />
                    <TextField
                        label={t('timing.leitstand.results.edit.penaltySeconds')}
                        helperText={
                            penaltyInvalid
                                ? t('timing.leitstand.results.edit.invalidSeconds')
                                : t('timing.leitstand.results.edit.penaltyHelp')
                        }
                        error={penaltyInvalid}
                        value={penaltyInput}
                        disabled={submitting}
                        onChange={event => setPenaltyInput(event.target.value)}
                        inputProps={{inputMode: 'decimal'}}
                    />
                    <TextField
                        label={t('timing.leitstand.results.edit.penaltyNote')}
                        helperText={t('timing.leitstand.results.edit.penaltyNoteHelp')}
                        value={penaltyNoteInput}
                        disabled={submitting}
                        onChange={event => setPenaltyNoteInput(event.target.value)}
                    />
                    <TextField
                        select
                        label={t('timing.leitstand.results.edit.status')}
                        helperText={t('timing.leitstand.results.edit.statusHelp')}
                        value={status}
                        disabled={submitting}
                        onChange={event => setStatus(event.target.value as OfficialTimeResultStatus)}>
                        {RESULT_STATUSES.map(value => (
                            <MenuItem key={value} value={value}>
                                {t(`timing.leitstand.results.status.${value}`)}
                            </MenuItem>
                        ))}
                    </TextField>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={submitting}>
                    {t('common.cancel')}
                </Button>
                <Button
                    variant="contained"
                    onClick={handleSave}
                    disabled={submitting || overrideInvalid || penaltyInvalid}>
                    {t('common.save')}
                </Button>
            </DialogActions>
        </Dialog>
    )
}

export default OfficialTimeEditDialog
