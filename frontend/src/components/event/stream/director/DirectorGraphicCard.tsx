import {useState} from 'react'
import {Box, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {clearStreamOverride, setStreamOverride} from '@api/sdk.gen'
import {StreamGraphicViewDto, StreamOverrideState, StreamSceneViewDto} from '@api/types.gen'
import {useFeedback} from '@utils/hooks'
import {isRequestNetworkError, runRequest} from '@utils/request'
import {extractErrorReason} from '../streamApiError'
import {
    buildOverrideRequest,
    graphicUsesMatchPicker,
    STREAM_PANEL_DURATION_CHOICES,
    StreamPanelDurationChoice,
} from '../panel/streamPanelOverride'
import {graphicFeed, StreamFeedStatus} from './graphicFeed'
import StreamPreview from './StreamPreview'
import {DIRECTOR_COLORS} from './directorTheme'

export interface DirectorMatchOption {
    id: string
    label: string
}

interface DirectorGraphicCardProps {
    eventId: string
    view: StreamSceneViewDto
    graphic: StreamGraphicViewDto
    /** Nur ausgewertet für STARTLIST/RESULT/NEXT_UP (siehe `graphicUsesMatchPicker`). */
    matchOptions: DirectorMatchOption[]
    clockOffsetMs: number
    /** Ohne Schreibrecht (UPDATE STREAM/UPDATE EVENT) bleibt die Karte reine Anzeige. */
    canEdit: boolean
}

const STATUS_COLOR: Record<StreamFeedStatus, string> = {
    onAir: DIRECTOR_COLORS.onAir,
    ready: DIRECTOR_COLORS.ready,
    off: DIRECTOR_COLORS.off,
    noFeed: DIRECTOR_COLORS.noFeed,
}

/**
 * Eine Karte je aktiver Grafik der gewählten Szene: Live-Miniatur (dieselben Komponenten wie die
 * Bühne, nur mit erzwungenem `visible`, damit auch eine gerade unsichtbare Grafik ihren Inhalt
 * zeigt), Zustand samt Grund bei fehlendem Inhalt, und die Regie-Schalter Auto | An | Aus mit
 * Lauf- und Dauerwahl.
 *
 * „An" ist gesperrt, solange die Grafik keinen Inhalt hat: Erzwingen blendete dann nichts ein,
 * und die Karte sagt lieber, was fehlt. Ein bereits erzwungenes „An" mit unauflösbarem
 * Lauf-Bezug bleibt bedienbar, damit die Regie es zurücknehmen kann.
 */
const DirectorGraphicCard = ({eventId, view, graphic, matchOptions, clockOffsetMs, canEdit}: DirectorGraphicCardProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const sceneId = view.sceneId

    const [pending, setPending] = useState(false)
    // Rein lokale Regie-Auswahl — der Server bestätigt weder Lauf noch Dauer im gepushten Stand
    // zurück (nur `overrideState`), ein Wiederherstellen aus dem Push ist also nicht möglich.
    const [matchChoice, setMatchChoice] = useState('')
    const [duration, setDuration] = useState<StreamPanelDurationChoice>('UNTIL_REVOKED')

    const feed = graphicFeed(graphic)
    const usesMatchPicker = graphicUsesMatchPicker(graphic.type)
    const forceOnLocked = feed.status === 'noFeed' && graphic.overrideState !== 'FORCED_ON'

    const applyOverride = async (state: 'FORCED_ON' | 'FORCED_OFF', match: string | null, dur: StreamPanelDurationChoice) => {
        const {error} = await runRequest(setPending, () =>
            setStreamOverride({
                path: {eventId, sceneId, graphicType: graphic.type},
                body: buildOverrideRequest(state, match, dur),
            }),
        )
        if (isRequestNetworkError(error)) feedback.error(t('common.error.network'))
        else if (error) feedback.error(extractErrorReason(error) ?? t('common.error.unexpected'))
    }

    const clearOverride = async () => {
        const {error} = await runRequest(setPending, () =>
            clearStreamOverride({path: {eventId, sceneId, graphicType: graphic.type}}),
        )
        if (isRequestNetworkError(error)) feedback.error(t('common.error.network'))
        else if (error) feedback.error(t('common.error.unexpected'))
    }

    const handleStateChange = (_: unknown, value: StreamOverrideState | null) => {
        if (value === null || pending) return
        if (value === 'AUTO') void clearOverride()
        else void applyOverride(value, matchChoice || null, duration)
    }

    const handleMatchChange = (value: string) => {
        setMatchChoice(value)
        // Schon erzwungen? Dann wirkt eine neue Laufwahl sofort — jeder Aufruf wird zum jüngsten
        // Eingriff, ein zweiter Klick auf „An" ist nicht nötig.
        if (graphic.overrideState === 'FORCED_ON') void applyOverride('FORCED_ON', value || null, duration)
    }

    const handleDurationChange = (value: StreamPanelDurationChoice) => {
        setDuration(value)
        if (graphic.overrideState === 'FORCED_ON') void applyOverride('FORCED_ON', matchChoice || null, value)
    }

    // Ohne Inhalt bleibt die Miniatur leer: `StreamGraphic` hält sonst den ZULETZT bekannten
    // Inhalt fest (Rückfall für die Ausblendanimation der Bühne) — auf einer erzwungen sichtbaren
    // Miniatur stünde eine längst abgelaufene Uhr dauerhaft neben „Kein Inhalt".
    const previewView: StreamSceneViewDto = {
        ...view,
        graphics: feed.status === 'noFeed' ? [] : [{...graphic, visible: true}],
    }

    return (
        <Box
            sx={{
                borderRadius: 1.5,
                border: `1px solid ${DIRECTOR_COLORS.border}`,
                backgroundColor: DIRECTOR_COLORS.paper,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                // Die on-air-Karte trägt eine rote Kante — im Raster sofort zu finden.
                boxShadow: feed.status === 'onAir' ? `inset 0 0 0 2px ${DIRECTOR_COLORS.onAir}` : 'none',
            }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{px: 1.5, py: 1}}>
                <StatusDot status={feed.status} />
                <Typography variant="subtitle2" sx={{fontWeight: 700, flex: 1, minWidth: 0}} noWrap>
                    {t(`event.stream.scenes.type.${graphic.type}`)}
                </Typography>
                <Typography variant="caption" sx={{color: STATUS_COLOR[feed.status], fontWeight: 700, letterSpacing: '0.04em'}}>
                    {t(`event.stream.director.feed.${feed.status}`).toUpperCase()}
                </Typography>
            </Stack>

            <Box sx={{position: 'relative', mx: 1.5}}>
                <StreamPreview view={previewView} clockOffsetMs={clockOffsetMs} checkerSize={12} focus={graphic.placement} />
                {feed.status === 'noFeed' && (
                    <Box
                        sx={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center',
                            p: 2,
                            backgroundColor: 'rgba(11, 17, 28, 0.72)',
                            borderRadius: 1,
                        }}>
                        <Box>
                            <Typography variant="body2" sx={{fontWeight: 700, color: DIRECTOR_COLORS.noFeed}}>
                                {t('event.stream.director.feed.noFeed')}
                            </Typography>
                            <Typography variant="body2" sx={{color: 'text.secondary'}}>
                                {t(`event.stream.director.reason.${feed.reason}`)}
                            </Typography>
                        </Box>
                    </Box>
                )}
            </Box>

            <Stack spacing={1} sx={{p: 1.5}}>
                {canEdit ? (
                    <>
                        <ToggleButtonGroup
                            exclusive
                            fullWidth
                            size="small"
                            value={graphic.overrideState}
                            disabled={pending}
                            onChange={handleStateChange}
                            sx={{
                                // Drei gleich breite Felder: das „An" steckt für seinen Tooltip in
                                // einem span und blieb ohne gleiche Flex-Basis 32 px schmal.
                                '& > *': {flex: '1 1 0', minWidth: 0},
                                '& .MuiToggleButton-root': {minHeight: 48, fontWeight: 700},
                                '& .MuiToggleButton-root.Mui-selected': {
                                    color: '#fff',
                                    backgroundColor:
                                        graphic.overrideState === 'FORCED_ON'
                                            ? DIRECTOR_COLORS.ready
                                            : graphic.overrideState === 'FORCED_OFF'
                                              ? DIRECTOR_COLORS.off
                                              : DIRECTOR_COLORS.raised,
                                },
                            }}>
                            <ToggleButton value="AUTO">{t('event.stream.panel.overrideAction.AUTO')}</ToggleButton>
                            <Tooltip title={forceOnLocked ? t('event.stream.director.forceHint') : ''} placement="top">
                                <span style={{display: 'flex', flex: 1}}>
                                    <ToggleButton value="FORCED_ON" disabled={pending || forceOnLocked} sx={{flex: 1, width: '100%'}}>
                                        {t('event.stream.panel.overrideAction.FORCED_ON')}
                                    </ToggleButton>
                                </span>
                            </Tooltip>
                            <ToggleButton value="FORCED_OFF">{t('event.stream.panel.overrideAction.FORCED_OFF')}</ToggleButton>
                        </ToggleButtonGroup>

                        <Stack direction="row" spacing={1}>
                            {usesMatchPicker && (
                                <TextField
                                    select
                                    fullWidth
                                    disabled={pending}
                                    label={t('event.stream.panel.matchPicker.label')}
                                    value={matchChoice}
                                    onChange={e => handleMatchChange(e.target.value)}>
                                    <MenuItem value="">{t('event.stream.panel.matchPicker.current')}</MenuItem>
                                    {matchOptions.map(option => (
                                        <MenuItem key={option.id} value={option.id}>
                                            {option.label}
                                        </MenuItem>
                                    ))}
                                </TextField>
                            )}
                            <TextField
                                select
                                fullWidth={!usesMatchPicker}
                                disabled={pending}
                                label={t('event.stream.panel.duration.label')}
                                value={String(duration)}
                                sx={{minWidth: 140}}
                                onChange={e =>
                                    handleDurationChange(
                                        e.target.value === 'UNTIL_REVOKED'
                                            ? 'UNTIL_REVOKED'
                                            : (Number(e.target.value) as StreamPanelDurationChoice),
                                    )
                                }>
                                {STREAM_PANEL_DURATION_CHOICES.map(choice => (
                                    <MenuItem key={choice} value={String(choice)}>
                                        {choice === 'UNTIL_REVOKED'
                                            ? t('event.stream.panel.duration.untilRevoked')
                                            : t('event.stream.panel.duration.seconds', {seconds: choice})}
                                    </MenuItem>
                                ))}
                            </TextField>
                        </Stack>
                    </>
                ) : (
                    <Typography variant="caption" color="text.secondary">
                        {t(`event.stream.panel.overrideState.${graphic.overrideState}`)}
                    </Typography>
                )}
            </Stack>
        </Box>
    )
}

/** Zustandspunkt vor dem Grafiktyp — „on air" pulsiert, die anderen stehen still. */
export const StatusDot = ({status}: {status: StreamFeedStatus}) => (
    <Box
        aria-hidden
        sx={{
            width: '0.7rem',
            height: '0.7rem',
            borderRadius: '50%',
            flexShrink: 0,
            backgroundColor: STATUS_COLOR[status],
            ...(status === 'onAir'
                ? {
                      '@keyframes streamDirectorOnAirPulse': {
                          '0%': {boxShadow: `0 0 0 0 ${DIRECTOR_COLORS.onAir}80`},
                          '70%': {boxShadow: '0 0 0 6px rgba(229, 57, 53, 0)'},
                          '100%': {boxShadow: '0 0 0 0 rgba(229, 57, 53, 0)'},
                      },
                      animation: 'streamDirectorOnAirPulse 1.4s ease-out infinite',
                      '@media (prefers-reduced-motion: reduce)': {animation: 'none'},
                  }
                : {}),
        }}
    />
)

export default DirectorGraphicCard
