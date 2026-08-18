import {
    Alert,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    MenuItem,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import {useEffect, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {issueTimingDeviceToken} from '@api/sdk.gen.ts'
import {TimingStationDto} from '@api/types.gen.ts'
import {useFeedback} from '@utils/hooks.ts'

export type DeviceTokenIssueDialogProps = {
    open: boolean
    onClose: () => void
    eventId: string
    stations: TimingStationDto[]
    /** Called once the token exists so the caller can re-list. */
    onIssued: () => void
}

/**
 * Two-phase dialog for issuing a hardware device token: the form (name + station), then the plaintext
 * token.
 *
 * The plaintext is shown **once** — the server only stores its hash, so there is no way to retrieve it
 * again — which is why the second phase is a separate, deliberately loud step with a copy button and a
 * warning rather than a snackbar that can be missed. Closing that phase discards the value from this
 * component's state; the only recovery is issuing a new token and revoking the old one.
 */
const DeviceTokenIssueDialog = ({
    open,
    onClose,
    eventId,
    stations,
    onIssued,
}: DeviceTokenIssueDialogProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [name, setName] = useState('')
    const [station, setStation] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [issuedToken, setIssuedToken] = useState<string | null>(null)

    // Reset only on the false->true open transition so a previous token can never be re-shown, and
    // preselect the only sensible default when the event has exactly one station. `stations` is
    // deliberately NOT a dependency: the leitstand page refetches it on every visibilitychange, which
    // would otherwise give this effect a new array identity and wipe the just-issued plaintext token
    // out from under the operator while phase 2 is still showing it.
    useEffect(() => {
        if (!open) return
        setName('')
        setStation(stations.length === 1 ? stations[0].id : '')
        setIssuedToken(null)
        setSubmitting(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    const canSubmit = name.trim().length > 0 && station.length > 0 && !submitting

    const handleIssue = () => {
        if (!canSubmit) return
        setSubmitting(true)
        void (async () => {
            try {
                const {data, error} = await issueTimingDeviceToken({
                    path: {eventId},
                    body: {name: name.trim(), station},
                })
                if (error !== undefined || data === undefined) {
                    feedback.error(t('timing.leitstand.devices.issue.error'))
                    return
                }
                setIssuedToken(data.token)
                onIssued()
            } catch {
                feedback.error(t('common.error.unexpected'))
            } finally {
                setSubmitting(false)
            }
        })()
    }

    const handleCopy = () => {
        if (issuedToken === null) return
        void navigator.clipboard
            .writeText(issuedToken)
            .then(() => feedback.success(t('timing.leitstand.devices.issue.copied')))
            // Clipboard access can be denied outright (insecure context, permission policy) — say so
            // instead of leaving the operator thinking the token is on the clipboard when it is not.
            .catch(() => feedback.error(t('timing.leitstand.devices.issue.copyError')))
    }

    // Once the plaintext token is showing, it can only be dismissed via the explicit "done" button —
    // not Escape, not a backdrop click — since closing any other way is the one action that discards a
    // value the operator can never retrieve again.
    const handleDialogClose = (_event: object, reason: 'backdropClick' | 'escapeKeyDown') => {
        if (issuedToken !== null && (reason === 'backdropClick' || reason === 'escapeKeyDown')) return
        onClose()
    }

    return (
        <Dialog
            open={open}
            onClose={handleDialogClose}
            disableEscapeKeyDown={issuedToken !== null}
            fullWidth
            maxWidth="sm">
            <DialogTitle>{t('timing.leitstand.devices.issue.title')}</DialogTitle>
            {issuedToken === null ? (
                <>
                    <DialogContent>
                        <Stack spacing={2} sx={{mt: 1}}>
                            <TextField
                                label={t('timing.leitstand.devices.column.name')}
                                value={name}
                                autoFocus
                                disabled={submitting}
                                onChange={event => setName(event.target.value)}
                            />
                            <TextField
                                select
                                label={t('timing.leitstand.devices.column.station')}
                                value={station}
                                disabled={submitting}
                                onChange={event => setStation(event.target.value)}>
                                {[...stations]
                                    .sort((a, b) => a.sorting - b.sorting)
                                    .map(entry => (
                                        <MenuItem key={entry.id} value={entry.id}>
                                            {entry.name}
                                        </MenuItem>
                                    ))}
                            </TextField>
                        </Stack>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={onClose} disabled={submitting}>
                            {t('common.cancel')}
                        </Button>
                        <Button variant="contained" onClick={handleIssue} disabled={!canSubmit}>
                            {t('timing.leitstand.devices.issue.action')}
                        </Button>
                    </DialogActions>
                </>
            ) : (
                <>
                    <DialogContent>
                        <Stack spacing={2} sx={{mt: 1}}>
                            <Alert severity="warning">
                                {t('timing.leitstand.devices.issue.onceWarning')}
                            </Alert>
                            <Stack direction="row" spacing={1} alignItems="center">
                                <Typography
                                    sx={{
                                        fontFamily: 'monospace',
                                        wordBreak: 'break-all',
                                        flexGrow: 1,
                                        p: 1,
                                        borderRadius: 1,
                                        bgcolor: 'action.hover',
                                    }}>
                                    {issuedToken}
                                </Typography>
                                <Tooltip title={t('timing.leitstand.devices.issue.copy')}>
                                    <IconButton
                                        aria-label={t('timing.leitstand.devices.issue.copy')}
                                        onClick={handleCopy}>
                                        <ContentCopyIcon />
                                    </IconButton>
                                </Tooltip>
                            </Stack>
                            <Typography variant="body2" color="text.secondary">
                                {t('timing.leitstand.devices.issue.usageHint')}
                            </Typography>
                        </Stack>
                    </DialogContent>
                    <DialogActions>
                        <Button variant="contained" onClick={onClose}>
                            {t('timing.leitstand.devices.issue.done')}
                        </Button>
                    </DialogActions>
                </>
            )}
        </Dialog>
    )
}

export default DeviceTokenIssueDialog
