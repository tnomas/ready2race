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
import {createBoardShareLink, revokeTimingDeviceToken} from '@api/sdk.gen.ts'
import {BoardDto, BoardShareLinkDto} from '@api/types.gen.ts'
import {useFeedback} from '@utils/hooks.ts'
import {useConfirmation} from '@contexts/confirmation/ConfirmationContext'

export type BoardShareDialogProps = {
    open: boolean
    onClose: () => void
    eventId: string
    board: BoardDto
}

/**
 * „Link teilen" für ein Board — dasselbe Verfahren wie beim Zeitnahme-Posten
 * (`TimingStationShareDialog`), nur mit einem Board als Ziel: Der Klick ruft den
 * Share-Link-Endpunkt und zeigt SOFORT Link und QR-Code, ohne Ausstellungs-Formular. Der QR-Code
 * ist am Regattatag der eigentliche Weg — der Link wird abfotografiert, nicht abgetippt.
 *
 * Der Endpunkt ist wiederholbar: dasselbe Board liefert denselben Link (und dieselbe
 * `deviceTokenId`), solange sein Token nicht widerrufen ist. Ein zweites Öffnen des Dialogs
 * erzeugt also kein zweites Token.
 *
 * Widerrufen läuft über dieselbe Route wie bei den Posten-Tokens (`revokeTimingDeviceToken`, eine
 * Tabelle für beide Ziele). Es steckt hier im Dialog, weil ein Board-Token derzeit in KEINER Liste
 * auftaucht: Der Geräte-Reiter des Leitstands führt bewusst nur Posten-Tokens. Ohne diesen Knopf
 * wäre ein einmal geteilter Board-Link nur noch über die Datenbank zurückzunehmen — die
 * `deviceTokenId` aus der Antwort ist die einzige Stelle, an der die Oberfläche ihn überhaupt zu
 * fassen bekommt.
 */
const BoardShareDialog = ({open, onClose, eventId, board}: BoardShareDialogProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const {confirmAction} = useConfirmation()

    const [share, setShare] = useState<BoardShareLinkDto | null>(null)
    const [error, setError] = useState(false)
    const [revoked, setRevoked] = useState(false)
    const [busy, setBusy] = useState(false)

    // Die laufende Share-Link-Anfrage, geteilt über doppelte Effekt-Läufe hinweg: Reacts
    // StrictMode feuert den Effekt in der Entwicklung zweimal, und zwei GLEICHZEITIGE erste
    // Anfragen konnten serverseitig je ein Token anlegen (der Endpunkt ist nur sequenziell
    // idempotent). Eine Anfrage pro Öffnen genügt — der zweite Lauf hängt sich an dieselbe.
    // Bewusst auf die {data, error}-Gestalt verengt: der generierte Rückgabetyp trägt auch die
    // ThrowOnError-Variante der Union, deren Zweig kein error-Feld hat.
    const requestRef = useRef<Promise<{data?: BoardShareLinkDto; error?: unknown}> | null>(null)
    // Ein abgeräumter Dialog darf keinen State mehr setzen (und keine Antwort einer alten
    // Anfrage mehr anzeigen).
    const cancelledRef = useRef(false)

    const requestShare = useCallback(() => {
        setError(false)
        setRevoked(false)
        setShare(null)
        const request =
            requestRef.current ?? createBoardShareLink({path: {eventId, boardId: board.id}})
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
    }, [eventId, board.id])

    // Auf der false->true-Flanke direkt den Link holen — der Endpunkt ist idempotent, ein
    // erneutes Öffnen liefert denselben Link.
    useEffect(() => {
        if (!open) return
        cancelledRef.current = false
        requestShare()
        return () => {
            cancelledRef.current = true
        }
    }, [open, requestShare])

    // Der Server liefert den root-relativen Pfad samt Token; der Client hängt seinen Origin davor.
    const shareUrl = share === null ? null : `${window.location.origin}${share.path}`

    const handleCopy = () => {
        if (shareUrl === null) return
        void navigator.clipboard
            .writeText(shareUrl)
            .then(() => feedback.success(t('event.boards.share.copied')))
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
                        feedback.error(t('event.boards.share.revoke.error'))
                        return
                    }
                    feedback.success(t('event.boards.share.revoke.success'))
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
                title: t('event.boards.share.revoke.confirm.title'),
                content: t('event.boards.share.revoke.confirm.content', {name: board.name}),
                okText: t('event.boards.share.revoke.action'),
            },
        )
    }

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>{t('event.boards.share.title', {name: board.name})}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{mt: 1}} alignItems="center">
                    <Typography variant="body2" color="text.secondary" sx={{width: 1}}>
                        {t('event.boards.share.description')}
                    </Typography>
                    {error && (
                        <Alert severity="error" sx={{width: 1}}>
                            {t('event.boards.share.error')}
                        </Alert>
                    )}
                    {revoked && (
                        <>
                            <Alert severity="info" sx={{width: 1}}>
                                {t('event.boards.share.revoke.done')}
                            </Alert>
                            <Button variant="outlined" onClick={requestShare}>
                                {t('event.boards.share.again')}
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
                                <Tooltip title={t('event.boards.share.copy')}>
                                    <IconButton
                                        aria-label={t('event.boards.share.copy')}
                                        onClick={handleCopy}>
                                        <ContentCopyIcon />
                                    </IconButton>
                                </Tooltip>
                            </Stack>
                            <Box sx={{width: 1}}>
                                <Typography variant="body2" color="text.secondary">
                                    {t('event.boards.share.revokeHint')}
                                </Typography>
                            </Box>
                        </>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                {shareUrl !== null && (
                    <Button color="error" disabled={busy} onClick={handleRevoke}>
                        {t('event.boards.share.revoke.action')}
                    </Button>
                )}
                <Button variant="contained" onClick={onClose}>
                    {t('common.close')}
                </Button>
            </DialogActions>
        </Dialog>
    )
}

export default BoardShareDialog
