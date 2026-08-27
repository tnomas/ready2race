import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    Paper,
    Stack,
    Tooltip,
    Typography,
} from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import QRCode from 'react-qr-code'
import {useCallback, useEffect, useRef, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {createStreamSceneShareLink, revokeTimingDeviceToken} from '@api/sdk.gen.ts'
import {StreamSceneDto, StreamSceneShareLinkDto} from '@api/types.gen.ts'
import {useFeedback} from '@utils/hooks.ts'
import {useConfirmation} from '@contexts/confirmation/ConfirmationContext'

export type StreamSceneShareDialogProps = {
    open: boolean
    onClose: () => void
    eventId: string
    scene: StreamSceneDto
}

/**
 * „Link teilen" für eine Stream-Szene — wortgleiches Verfahren zu `BoardShareDialog`: der Klick
 * ruft sofort den Share-Link-Endpunkt und zeigt Link plus QR-Code, ohne Ausstellungs-Formular.
 * Das ist der Weg für Wirecast/OBS-Quellen, die sich nicht anmelden können; ein Verwaltungsplatz
 * mit Sitzung öffnet die Szene stattdessen direkt über die nackte URL (siehe `StreamScenesPanel`).
 *
 * Wiederholbar: dieselbe Szene liefert denselben Link (und dieselbe `deviceTokenId`), solange ihr
 * Token nicht widerrufen ist. Widerrufen läuft über dieselbe Route wie bei Board- und
 * Zeitnahme-Tokens (`revokeTimingDeviceToken`, eine Tabelle für alle Geräte-Tokens).
 */
const StreamSceneShareDialog = ({open, onClose, eventId, scene}: StreamSceneShareDialogProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const {confirmAction} = useConfirmation()

    const [share, setShare] = useState<StreamSceneShareLinkDto | null>(null)
    const [error, setError] = useState(false)
    const [revoked, setRevoked] = useState(false)
    const [busy, setBusy] = useState(false)

    // Wie BoardShareDialog: eine laufende Anfrage über doppelte Effekt-Läufe hinweg teilen (React
    // StrictMode feuert den Öffnen-Effekt in der Entwicklung zweimal).
    const requestRef = useRef<Promise<{data?: StreamSceneShareLinkDto; error?: unknown}> | null>(null)
    const cancelledRef = useRef(false)

    const requestShare = useCallback(() => {
        setError(false)
        setRevoked(false)
        setShare(null)
        const request =
            requestRef.current ?? createStreamSceneShareLink({path: {eventId, sceneId: scene.id}})
        requestRef.current = request
        void request
            .then(({data, error: err}) => {
                if (cancelledRef.current) return
                if (err !== undefined || data === undefined) {
                    setError(true)
                    return
                }
                setShare(data)
            })
            .catch(() => {
                if (!cancelledRef.current) setError(true)
            })
            .finally(() => {
                if (requestRef.current === request) requestRef.current = null
            })
    }, [eventId, scene.id])

    useEffect(() => {
        if (!open) return
        cancelledRef.current = false
        requestShare()
        return () => {
            cancelledRef.current = true
        }
    }, [open, requestShare])

    const shareUrl = share === null ? null : `${window.location.origin}${share.path}`

    const handleCopy = () => {
        if (shareUrl === null) return
        void navigator.clipboard
            .writeText(shareUrl)
            .then(() => feedback.success(t('event.stream.scenes.share.copied')))
            .catch(() => feedback.error(t('common.error.unexpected')))
    }

    const handleRevoke = () => {
        const tokenId = share?.deviceTokenId
        if (tokenId === undefined) return
        confirmAction(
            async () => {
                setBusy(true)
                try {
                    const {error: revokeError} = await revokeTimingDeviceToken({
                        path: {eventId, tokenId},
                    })
                    if (revokeError !== undefined) {
                        feedback.error(t('event.stream.scenes.share.revoke.error'))
                        return
                    }
                    feedback.success(t('event.stream.scenes.share.revoke.success'))
                    if (cancelledRef.current) return
                    setShare(null)
                    setRevoked(true)
                } catch {
                    feedback.error(t('common.error.unexpected'))
                } finally {
                    setBusy(false)
                }
            },
            {
                title: t('event.stream.scenes.share.revoke.confirm.title'),
                content: t('event.stream.scenes.share.revoke.confirm.content', {name: scene.name}),
                okText: t('event.stream.scenes.share.revoke.action'),
            },
        )
    }

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>{t('event.stream.scenes.share.title', {name: scene.name})}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{mt: 1}} alignItems="center">
                    <Typography variant="body2" color="text.secondary" sx={{width: 1}}>
                        {t('event.stream.scenes.share.description')}
                    </Typography>
                    {error && (
                        <Alert severity="error" sx={{width: 1}}>
                            {t('event.stream.scenes.share.error')}
                        </Alert>
                    )}
                    {revoked && (
                        <>
                            <Alert severity="info" sx={{width: 1}}>
                                {t('event.stream.scenes.share.revoke.done')}
                            </Alert>
                            <Button variant="outlined" onClick={requestShare}>
                                {t('event.stream.scenes.share.again')}
                            </Button>
                        </>
                    )}
                    {!error && !revoked && shareUrl === null && <CircularProgress sx={{my: 4}} />}
                    {shareUrl !== null && (
                        <>
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
                                <Tooltip title={t('event.stream.scenes.share.copy')}>
                                    <IconButton
                                        aria-label={t('event.stream.scenes.share.copy')}
                                        onClick={handleCopy}>
                                        <ContentCopyIcon />
                                    </IconButton>
                                </Tooltip>
                            </Stack>
                            <Box sx={{width: 1}}>
                                <Typography variant="body2" color="text.secondary">
                                    {t('event.stream.scenes.share.revokeHint')}
                                </Typography>
                            </Box>
                        </>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                {shareUrl !== null && (
                    <Button color="error" disabled={busy} onClick={handleRevoke}>
                        {t('event.stream.scenes.share.revoke.action')}
                    </Button>
                )}
                <Button variant="contained" onClick={onClose}>
                    {t('common.close')}
                </Button>
            </DialogActions>
        </Dialog>
    )
}

export default StreamSceneShareDialog
