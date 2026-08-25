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
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import QRCode from 'react-qr-code'
import {useEffect, useRef, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {createTimingStationShareLink} from '@api/sdk.gen.ts'
import {TimingShareLinkDto, TimingStationDto} from '@api/types.gen.ts'
import {useFeedback} from '@utils/hooks.ts'

export type TimingStationShareDialogProps = {
    open: boolean
    onClose: () => void
    eventId: string
    station: TimingStationDto
}

type ShareTarget = 'capture' | 'display'

/**
 * „Auf Gerät teilen" ohne Handarbeit: Der Klick ruft den Share-Link-Endpunkt des Postens und
 * zeigt SOFORT Link und QR-Code — kein Ausstellungs-Formular, keine „nur einmal sichtbar"-
 * Warnung. Der Endpunkt ist wiederholbar: derselbe Posten liefert denselben Link, bis das
 * zugehörige Geräte-Token im Geräte-Reiter des Leitstands widerrufen wird (dort sind solche
 * Auto-Tokens als „Link" gekennzeichnet). Die manuelle Token-Ausstellung für Hardware ist aus
 * diesem Dialog verschwunden — sie lebt weiterhin im Geräte-Reiter des Leitstands.
 *
 * Für START-Posten gibt es zusätzlich das Ziel „Startbildschirm": derselbe (lesefähige) Token,
 * nur die Adresse zeigt auf die Anzeige-Route des Postens. ANZEIGE-Posten brauchen den Umschalter
 * nicht — ihr `path` führt schon vom Server direkt auf die Anzeige.
 */
const TimingStationShareDialog = ({
    open,
    onClose,
    eventId,
    station,
}: TimingStationShareDialogProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [target, setTarget] = useState<ShareTarget>('capture')
    const [sharePath, setSharePath] = useState<string | null>(null)
    const [error, setError] = useState(false)

    // Die laufende Share-Link-Anfrage, geteilt über doppelte Effekt-Läufe hinweg: Reacts
    // StrictMode feuert den Effekt in der Entwicklung zweimal, und zwei GLEICHZEITIGE erste
    // Anfragen konnten serverseitig je ein Token anlegen (der Endpunkt ist nur sequenziell
    // idempotent). Eine Anfrage pro Öffnen genügt — der zweite Lauf hängt sich an dieselbe.
    // Bewusst auf die {data, error}-Gestalt verengt: der generierte Rückgabetyp trägt auch die
    // ThrowOnError-Variante der Union, deren Zweig kein error-Feld hat.
    const requestRef = useRef<Promise<{data?: TimingShareLinkDto; error?: unknown}> | null>(null)

    // Auf der false->true-Flanke direkt den Link holen — der Endpunkt ist idempotent, ein
    // erneutes Öffnen liefert denselben Link.
    useEffect(() => {
        if (!open) return
        setTarget('capture')
        setSharePath(null)
        setError(false)
        let cancelled = false
        const request =
            requestRef.current ??
            createTimingStationShareLink({path: {eventId, stationId: station.id}})
        requestRef.current = request
        void request
            .then(({data, error: err}) => {
                if (cancelled) return
                if (err !== undefined || data === undefined) {
                    setError(true)
                    return
                }
                setSharePath(data.path)
            })
            .catch(() => {
                if (!cancelled) setError(true)
            })
            .finally(() => {
                if (requestRef.current === request) requestRef.current = null
            })
        return () => {
            cancelled = true
        }
    }, [open, eventId, station])

    // Der Server liefert den root-relativen Pfad samt Token; der Client hängt seinen Origin
    // davor. Für das Startbildschirm-Ziel eines START-Postens wird das statische Suffix
    // `/anzeige` vor den Query-Teil geschoben — gleicher Token, andere Ansicht.
    const shareUrl = (() => {
        if (sharePath === null) return null
        let path = sharePath
        if (target === 'display' && station.type === 'START') {
            const queryStart = path.indexOf('?')
            path =
                queryStart === -1
                    ? `${path}/anzeige`
                    : `${path.slice(0, queryStart)}/anzeige${path.slice(queryStart)}`
        }
        return `${window.location.origin}${path}`
    })()

    const handleCopy = () => {
        if (shareUrl === null) return
        void navigator.clipboard
            .writeText(shareUrl)
            .then(() => feedback.success(t('timing.station.share.copied')))
            .catch(() => feedback.error(t('timing.leitstand.devices.issue.copyError')))
    }

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>{t('timing.station.share.title', {station: station.name})}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{mt: 1}} alignItems="center">
                    <Typography variant="body2" color="text.secondary" sx={{width: 1}}>
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
                    {error && (
                        <Alert severity="error" sx={{width: 1}}>
                            {t('timing.station.share.error')}
                        </Alert>
                    )}
                    {!error && shareUrl === null && <CircularProgress sx={{my: 4}} />}
                    {shareUrl !== null && (
                        <>
                            <Paper elevation={0} sx={{p: 2, bgcolor: 'white'}}>
                                <QRCode value={shareUrl} size={220} level="M" />
                            </Paper>
                            <Stack
                                direction="row"
                                spacing={1}
                                alignItems="center"
                                sx={{width: 1}}>
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
                        </>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button variant="contained" onClick={onClose}>
                    {t('common.close')}
                </Button>
            </DialogActions>
        </Dialog>
    )
}

export default TimingStationShareDialog
