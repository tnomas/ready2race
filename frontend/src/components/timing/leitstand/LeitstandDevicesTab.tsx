import {
    Alert,
    Box,
    Button,
    Chip,
    IconButton,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Tooltip,
    Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import BlockIcon from '@mui/icons-material/Block'
import {useCallback, useMemo, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {format} from 'date-fns'
import {listTimingDeviceTokens, revokeTimingDeviceToken} from '@api/sdk.gen.ts'
import {TimingStationDto} from '@api/types.gen.ts'
import {useConfirmation} from '@contexts/confirmation/ConfirmationContext.ts'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import Throbber from '@components/Throbber.tsx'
import DeviceTokenIssueDialog from '@components/timing/leitstand/DeviceTokenIssueDialog.tsx'
import StationBoardLink from '@components/timing/StationBoardLink.tsx'

export type LeitstandDevicesTabProps = {
    eventId: string
    stations: TimingStationDto[]
}

/**
 * Hardware device tokens of the event: list, issue, revoke.
 *
 * Tokens are not part of the live timing feed (no websocket message carries them), so this tab owns
 * its own fetch and re-lists after every mutation rather than reacting to a push.
 */
const LeitstandDevicesTab = ({eventId, stations}: LeitstandDevicesTabProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const {confirmAction} = useConfirmation()

    const [issueDialogOpen, setIssueDialogOpen] = useState(false)
    const [revoking, setRevoking] = useState<Set<string>>(new Set())

    const {
        data: tokens,
        pending,
        error,
        reload,
    } = useFetch(signal => listTimingDeviceTokens({signal, path: {eventId}}), {deps: [eventId]})

    const stationById = useMemo(() => new Map(stations.map(s => [s.id, s])), [stations])

    const sortedTokens = useMemo(
        () =>
            [...(tokens ?? [])].sort((a, b) => {
                // Active tokens first (they are the ones an operator acts on), then newest first.
                if (a.revoked !== b.revoked) return a.revoked ? 1 : -1
                return b.createdAt.localeCompare(a.createdAt)
            }),
        [tokens],
    )

    const handleRevoke = useCallback(
        (tokenId: string, name: string) => {
            confirmAction(
                () => {
                    setRevoking(prev => new Set(prev).add(tokenId))
                    void (async () => {
                        try {
                            const {error: revokeError} = await revokeTimingDeviceToken({
                                path: {eventId, tokenId},
                            })
                            if (revokeError !== undefined) {
                                feedback.error(t('timing.leitstand.devices.revoke.error'))
                                return
                            }
                            feedback.success(t('timing.leitstand.devices.revoke.success'))
                            reload()
                        } catch {
                            feedback.error(t('common.error.unexpected'))
                        } finally {
                            setRevoking(prev => {
                                const next = new Set(prev)
                                next.delete(tokenId)
                                return next
                            })
                        }
                    })()
                },
                {
                    title: t('timing.leitstand.devices.revoke.confirm.title'),
                    content: t('timing.leitstand.devices.revoke.confirm.content', {name}),
                    okText: t('timing.leitstand.devices.revoke.action'),
                },
            )
        },
        [confirmAction, eventId, feedback, reload, t],
    )

    return (
        <Stack spacing={2} sx={{width: 1}}>
            <Stack direction="row" spacing={2} alignItems="center">
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    disabled={stations.length === 0}
                    onClick={() => setIssueDialogOpen(true)}>
                    {t('timing.leitstand.devices.issue.action')}
                </Button>
                <Box sx={{flexGrow: 1}} />
                {pending && <Throbber />}
            </Stack>

            {error !== null && <Alert severity="error">{t('timing.leitstand.devices.loadError')}</Alert>}
            {stations.length === 0 && (
                <Alert severity="info">{t('timing.leitstand.devices.noStations')}</Alert>
            )}

            <Box sx={{overflowX: 'auto', width: 1}}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>{t('timing.leitstand.devices.column.name')}</TableCell>
                            <TableCell>{t('timing.leitstand.devices.column.station')}</TableCell>
                            <TableCell>{t('timing.leitstand.devices.column.created')}</TableCell>
                            <TableCell>{t('timing.leitstand.devices.column.state')}</TableCell>
                            <TableCell align="right">{t('common.actions')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {sortedTokens.map(token => (
                            <TableRow key={token.id} hover>
                                <TableCell>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <span>{token.name}</span>
                                        {/* Auto-Token aus dem Teilen-Dialog des Postens: sein
                                            Klartext bleibt über den Share-Link abrufbar —
                                            anders als bei Hand-Tokens für Hardware. */}
                                        {token.autoIssued && (
                                            <Chip
                                                size="small"
                                                variant="outlined"
                                                label={t('timing.leitstand.devices.autoIssued')}
                                            />
                                        )}
                                    </Stack>
                                </TableCell>
                                <TableCell>
                                    {/* Der Postenname führt auf sein Board (neues Fenster) —
                                        wie im Posten-Streifen der Übersicht. */}
                                    {stationById.has(token.station) ? (
                                        <StationBoardLink
                                            eventId={eventId}
                                            stationId={token.station}>
                                            {stationById.get(token.station)!.name}
                                        </StationBoardLink>
                                    ) : (
                                        token.station.slice(0, 8)
                                    )}
                                </TableCell>
                                <TableCell>
                                    {format(new Date(token.createdAt), t('format.datetime'))}
                                </TableCell>
                                <TableCell>
                                    <Chip
                                        size="small"
                                        color={token.revoked ? 'default' : 'success'}
                                        label={t(
                                            `timing.leitstand.devices.state.${token.revoked ? 'REVOKED' : 'ACTIVE'}`,
                                        )}
                                    />
                                </TableCell>
                                <TableCell align="right">
                                    {!token.revoked && (
                                        <Tooltip title={t('timing.leitstand.devices.revoke.action')}>
                                            <IconButton
                                                size="small"
                                                color="error"
                                                disabled={revoking.has(token.id)}
                                                aria-label={t('timing.leitstand.devices.revoke.action')}
                                                onClick={() => handleRevoke(token.id, token.name)}>
                                                <BlockIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                        {sortedTokens.length === 0 && !pending && (
                            <TableRow>
                                <TableCell colSpan={5}>
                                    <Typography variant="body2" color="text.secondary">
                                        {t('timing.leitstand.devices.empty')}
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </Box>

            <DeviceTokenIssueDialog
                open={issueDialogOpen}
                onClose={() => setIssueDialogOpen(false)}
                eventId={eventId}
                stations={stations}
                onIssued={reload}
            />
        </Stack>
    )
}

export default LeitstandDevicesTab
