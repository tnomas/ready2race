import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    Paper,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import QRCode from 'react-qr-code'
import {useEffect, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {issueTimingDeviceToken} from '@api/sdk.gen.ts'
import {TimingStationDto} from '@api/types.gen.ts'
import {useFeedback} from '@utils/hooks.ts'

export type TimingStationShareDialogProps = {
    open: boolean
    onClose: () => void
    eventId: string
    station: TimingStationDto
}

type ShareTarget = 'capture' | 'display'

/**
 * „Auf Gerät teilen": ein teilbarer Link auf die /event-Timing-Route des Postens, der das
 * Geräte-Token direkt trägt (`?token=…`) — als QR-Code zum Abfotografieren und als kopierbare
 * Adresse. Das Gerät (geteiltes Handy am Posten, Anzeige-Bildschirm am Start) braucht damit
 * keine Anmeldung.
 *
 * Wiederverwendet wird der VORHANDENE Geräte-Token-Mechanismus des Leitstands
 * (`issueTimingDeviceToken`, Widerruf über den Geräte-Reiter) — nur die zweite Phase ist anders
 * als im `DeviceTokenIssueDialog`: statt des nackten Tokens (für Hardware-Konfigurationen) zeigt
 * sie die fertige Posten-Adresse. Wie dort gilt: der Klartext existiert nur in dieser Antwort,
 * der Link ist nach dem Schließen nicht wiederherstellbar — nur neu ausstellen und den alten
 * Token widerrufen.
 */
const TimingStationShareDialog = ({
    open,
    onClose,
    eventId,
    station,
}: TimingStationShareDialogProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [name, setName] = useState('')
    const [target, setTarget] = useState<ShareTarget>('capture')
    const [submitting, setSubmitting] = useState(false)
    const [shareUrl, setShareUrl] = useState<string | null>(null)

    // Nur auf der false->true-Flanke zurücksetzen, damit ein einmal erzeugter Link nicht unter
    // dem Nutzer weggeräumt wird (gleiche Begründung wie im DeviceTokenIssueDialog).
    useEffect(() => {
        if (!open) return
        setName(station.name)
        setTarget('capture')
        setShareUrl(null)
        setSubmitting(false)
    }, [open, station])

    const canSubmit = name.trim().length > 0 && !submitting

    const handleIssue = () => {
        if (!canSubmit) return
        setSubmitting(true)
        void (async () => {
            try {
                const {data, error} = await issueTimingDeviceToken({
                    path: {eventId},
                    body: {name: name.trim(), station: station.id},
                })
                if (error !== undefined || data === undefined) {
                    feedback.error(t('timing.leitstand.devices.issue.error'))
                    return
                }
                // Gleiche Adressbildung wie die Board-Links (BoardsPanel): origin + fester Pfad.
                const base = `${window.location.origin}/event/${eventId}/timing/${station.id}`
                const path = target === 'display' ? `${base}/anzeige` : base
                setShareUrl(`${path}?token=${encodeURIComponent(data.token)}`)
            } catch {
                feedback.error(t('common.error.unexpected'))
            } finally {
                setSubmitting(false)
            }
        })()
    }

    const handleCopy = () => {
        if (shareUrl === null) return
        void navigator.clipboard
            .writeText(shareUrl)
            .then(() => feedback.success(t('timing.station.share.copied')))
            .catch(() => feedback.error(t('timing.leitstand.devices.issue.copyError')))
    }

    // Solange der Link angezeigt wird, schließt nur der explizite Fertig-Knopf — Escape oder ein
    // Klick daneben würde den einzigen Weg zu diesem Token verwerfen.
    const handleDialogClose = (_event: object, reason: 'backdropClick' | 'escapeKeyDown') => {
        if (shareUrl !== null && (reason === 'backdropClick' || reason === 'escapeKeyDown')) return
        onClose()
    }

    return (
        <Dialog
            open={open}
            onClose={handleDialogClose}
            disableEscapeKeyDown={shareUrl !== null}
            fullWidth
            maxWidth="sm">
            <DialogTitle>{t('timing.station.share.title', {station: station.name})}</DialogTitle>
            {shareUrl === null ? (
                <>
                    <DialogContent>
                        <Stack spacing={2} sx={{mt: 1}}>
                            <Typography variant="body2" color="text.secondary">
                                {t('timing.station.share.description')}
                            </Typography>
                            {station.type === 'START' && (
                                <ToggleButtonGroup
                                    value={target}
                                    exclusive
                                    fullWidth
                                    onChange={(_, value: ShareTarget | null) => {
                                        if (value !== null) setTarget(value)
                                    }}>
                                    <ToggleButton value="capture">
                                        {t('timing.station.share.target.capture')}
                                    </ToggleButton>
                                    <ToggleButton value="display">
                                        {t('timing.station.share.target.display')}
                                    </ToggleButton>
                                </ToggleButtonGroup>
                            )}
                            <TextField
                                label={t('timing.leitstand.devices.column.name')}
                                value={name}
                                autoFocus
                                disabled={submitting}
                                helperText={t('timing.station.share.nameHelp')}
                                onChange={event => setName(event.target.value)}
                            />
                        </Stack>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={onClose} disabled={submitting}>
                            {t('common.cancel')}
                        </Button>
                        <Button variant="contained" onClick={handleIssue} disabled={!canSubmit}>
                            {t('timing.station.share.createLink')}
                        </Button>
                    </DialogActions>
                </>
            ) : (
                <>
                    <DialogContent>
                        <Stack spacing={2} sx={{mt: 1}} alignItems="center">
                            <Alert severity="warning" sx={{width: 1}}>
                                {t('timing.station.share.onceWarning')}
                            </Alert>
                            <Paper elevation={0} sx={{p: 2, bgcolor: 'white'}}>
                                <QRCode value={shareUrl} size={220} level="M" />
                            </Paper>
                            <Stack direction="row" spacing={1} alignItems="center" sx={{width: 1}}>
                                <Typography
                                    sx={{
                                        fontFamily: 'monospace',
                                        wordBreak: 'break-all',
                                        flexGrow: 1,
                                        p: 1,
                                        borderRadius: 1,
                                        bgcolor: 'action.hover',
                                        fontSize: '0.8rem',
                                    }}>
                                    {shareUrl}
                                </Typography>
                                <Tooltip title={t('timing.station.share.copy')}>
                                    <IconButton
                                        aria-label={t('timing.station.share.copy')}
                                        onClick={handleCopy}>
                                        <ContentCopyIcon />
                                    </IconButton>
                                </Tooltip>
                            </Stack>
                            <Box sx={{width: 1}}>
                                <Typography variant="body2" color="text.secondary">
                                    {t('timing.station.share.revokeHint')}
                                </Typography>
                            </Box>
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

export default TimingStationShareDialog
