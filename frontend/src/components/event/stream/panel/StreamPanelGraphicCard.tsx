import {useState} from 'react'
import {
    Box,
    Card,
    CardContent,
    Chip,
    MenuItem,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {clearStreamOverride, setStreamOverride} from '@api/sdk.gen'
import {StreamGraphicViewDto, StreamOverrideState} from '@api/types.gen'
import {useFeedback} from '@utils/hooks'
import {extractErrorReason} from '../streamApiError'
import StreamGraphic from '../graphics/StreamGraphic'
import {STREAM_SLOT_STYLE} from '../streamPlacement'
import {stageScale, STREAM_STAGE_HEIGHT, STREAM_STAGE_WIDTH} from '../stageScale'
import {graphicStatus} from './streamPanelGraphicStatus'
import {
    buildOverrideRequest,
    graphicUsesMatchPicker,
    STREAM_PANEL_DURATION_CHOICES,
    StreamPanelDurationChoice,
} from './streamPanelOverride'

export interface StreamPanelMatchOption {
    id: string
    label: string
}

interface StreamPanelGraphicCardProps {
    eventId: string
    sceneId: string
    graphic: StreamGraphicViewDto
    /** Nur ausgewertet für STARTLIST/RESULT/NEXT_UP (siehe `graphicUsesMatchPicker`). */
    matchOptions: StreamPanelMatchOption[]
    safeAreaPercent: number
    clockOffsetMs: number
    /** Ohne Schreibrecht (UPDATE STREAM/UPDATE EVENT) bleibt die Karte reine Anzeige. */
    canEdit: boolean
}

/** Feste Kantenlänge der Miniatur-Vorschau — Breite bestimmt, Höhe folgt dem 16:9-Bühnenraster. */
const PREVIEW_WIDTH_PX = 260
const PREVIEW_HEIGHT_PX = Math.round((PREVIEW_WIDTH_PX / STREAM_STAGE_WIDTH) * STREAM_STAGE_HEIGHT)

/**
 * Eine Karte je aktiver Grafik der gewählten Szene — Zustand, Regie-Schalter und eine
 * Miniatur-Vorschau ihres aktuellen Inhalts.
 *
 * Die Vorschau rendert dieselben Grafik-Komponenten wie die Bühne selbst (`StreamGraphic`),
 * nur mit erzwungenem `visible: true`: `GraphicFrame` blendet eine Grafik erst nach ihrer
 * Ausblendanimation komplett aus (rendert dann `null`) — ohne den Zwang zeigte eine gerade
 * unsichtbare, aber inhaltlich befüllte Grafik (z. B. eine vorbereitete Startliste vor ihrem
 * Anzeigefenster) im Panel gar nichts, obwohl die Regie genau DAS sehen und ggf. erzwingen
 * will. Größe/Position bleiben unverändert, dieselbe Technik wie die Bühne selbst (feste
 * 1920×1080-Entwurfsfläche plus `transform: scale(...)`, hier nur sehr viel kleiner skaliert)
 * — siehe `StreamStaleContext`, dessen Voreinstellung `false` genau für eine Vorschau ohne
 * Bühnen-Provider gedacht ist.
 */
const StreamPanelGraphicCard = ({
    eventId,
    sceneId,
    graphic,
    matchOptions,
    safeAreaPercent,
    clockOffsetMs,
    canEdit,
}: StreamPanelGraphicCardProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [pending, setPending] = useState(false)
    // Rein lokale Regie-Auswahl, bevor/während "An" gewählt ist — der Server bestätigt weder
    // Lauf noch Dauer im gepushten Stand zurück (nur `overrideState`), ein Wiederherstellen aus
    // dem Push ist also weder möglich noch nötig (siehe Aufgabe: "optimistische UI nicht nötig").
    const [matchChoice, setMatchChoice] = useState('')
    const [duration, setDuration] = useState<StreamPanelDurationChoice>('UNTIL_REVOKED')

    const status = graphicStatus(graphic)
    const usesMatchPicker = graphicUsesMatchPicker(graphic.type)

    const previewScale = stageScale(PREVIEW_WIDTH_PX, PREVIEW_HEIGHT_PX)

    const applyOverride = async (state: 'FORCED_ON' | 'FORCED_OFF', match: string | null, dur: StreamPanelDurationChoice) => {
        setPending(true)
        try {
            const {error} = await setStreamOverride({
                path: {eventId, sceneId, graphicType: graphic.type},
                body: buildOverrideRequest(state, match, dur),
            })
            if (error) {
                feedback.error(extractErrorReason(error) ?? t('common.error.unexpected'))
            }
        } finally {
            setPending(false)
        }
    }

    const clearOverride = async () => {
        setPending(true)
        try {
            const {error} = await clearStreamOverride({
                path: {eventId, sceneId, graphicType: graphic.type},
            })
            if (error) {
                feedback.error(t('common.error.unexpected'))
            }
        } finally {
            setPending(false)
        }
    }

    const handleStateChange = (_: unknown, value: StreamOverrideState | null) => {
        if (value === null || pending) return
        if (value === 'AUTO') void clearOverride()
        else void applyOverride(value, matchChoice || null, duration)
    }

    const handleMatchChange = (value: string) => {
        setMatchChoice(value)
        // Schon erzwungen? Dann wirkt eine neue Laufwahl sofort — "jeder Aufruf wird zum
        // jüngsten Eingriff" (siehe setStreamOverride-Doku), ein zweiter Klick auf "An" ist
        // nicht nötig.
        if (graphic.overrideState === 'FORCED_ON') void applyOverride('FORCED_ON', value || null, duration)
    }

    const handleDurationChange = (value: StreamPanelDurationChoice) => {
        setDuration(value)
        if (graphic.overrideState === 'FORCED_ON') void applyOverride('FORCED_ON', matchChoice || null, value)
    }

    return (
        <Card variant="outlined">
            <CardContent>
                <Stack spacing={1.5}>
                    <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                        <StatusDot status={status} />
                        <Typography variant="subtitle1" sx={{fontWeight: 700, flex: 1, minWidth: 0}}>
                            {t(`event.stream.scenes.type.${graphic.type}`)}
                        </Typography>
                        <Chip
                            size="small"
                            variant="outlined"
                            label={t(`event.stream.panel.overrideState.${graphic.overrideState}`)}
                        />
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                        {t(`event.stream.panel.status.${status}`)}
                    </Typography>

                    <Box
                        aria-hidden
                        sx={{
                            width: PREVIEW_WIDTH_PX,
                            height: PREVIEW_HEIGHT_PX,
                            position: 'relative',
                            overflow: 'hidden',
                            borderRadius: 1,
                            bgcolor: '#000',
                            // Die Vorschau darf nie Klicks/Tipp-Gesten schlucken — sie liegt
                            // dekorativ über den eigentlichen Bedienelementen darunter.
                            pointerEvents: 'none',
                        }}>
                        <Box
                            sx={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                width: STREAM_STAGE_WIDTH,
                                height: STREAM_STAGE_HEIGHT,
                                transform: `translate(-50%, -50%) scale(${previewScale})`,
                                transformOrigin: 'center center',
                            }}>
                            <Box sx={{position: 'absolute', inset: `${safeAreaPercent}%`}}>
                                <Box sx={STREAM_SLOT_STYLE[graphic.placement]}>
                                    {/* Dieselbe Breiten-Kappung wie auf der Bühne
                                        (`StreamScenePage`): noWrap-Inhalt darf die Grid-Spur
                                        nicht über die Platzbreite hinausziehen. */}
                                    <Box sx={{gridArea: '1 / 1', minWidth: 0, maxWidth: '100%'}}>
                                        <StreamGraphic
                                            graphic={{...graphic, visible: true}}
                                            clockOffsetMs={clockOffsetMs}
                                        />
                                    </Box>
                                </Box>
                            </Box>
                        </Box>
                    </Box>

                    {canEdit && (
                        <>
                            <ToggleButtonGroup
                                exclusive
                                fullWidth
                                value={graphic.overrideState}
                                disabled={pending}
                                onChange={handleStateChange}
                                sx={{'& .MuiToggleButton-root': {minHeight: 44}}}>
                                <ToggleButton value="AUTO">
                                    {t('event.stream.panel.overrideAction.AUTO')}
                                </ToggleButton>
                                <ToggleButton value="FORCED_ON">
                                    {t('event.stream.panel.overrideAction.FORCED_ON')}
                                </ToggleButton>
                                <ToggleButton value="FORCED_OFF">
                                    {t('event.stream.panel.overrideAction.FORCED_OFF')}
                                </ToggleButton>
                            </ToggleButtonGroup>

                            {usesMatchPicker && (
                                <TextField
                                    select
                                    disabled={pending}
                                    label={t('event.stream.panel.matchPicker.label')}
                                    value={matchChoice}
                                    onChange={e => handleMatchChange(e.target.value)}>
                                    <MenuItem value="">
                                        {t('event.stream.panel.matchPicker.current')}
                                    </MenuItem>
                                    {matchOptions.map(option => (
                                        <MenuItem key={option.id} value={option.id}>
                                            {option.label}
                                        </MenuItem>
                                    ))}
                                </TextField>
                            )}

                            <TextField
                                select
                                disabled={pending}
                                label={t('event.stream.panel.duration.label')}
                                value={String(duration)}
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
                        </>
                    )}
                </Stack>
            </CardContent>
        </Card>
    )
}

const STATUS_COLOR: Record<ReturnType<typeof graphicStatus>, string> = {
    onAir: '#2e7d32',
    ready: '#9e9e9e',
    off: '#616161',
}

/** Zustandspunkt vor dem Grafiktyp — „on air" pulsiert, die anderen beiden stehen still. */
const StatusDot = ({status}: {status: ReturnType<typeof graphicStatus>}) => (
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
                      '@keyframes streamPanelOnAirPulse': {
                          '0%': {boxShadow: `0 0 0 0 ${STATUS_COLOR.onAir}80`},
                          '70%': {boxShadow: '0 0 0 6px rgba(46, 125, 50, 0)'},
                          '100%': {boxShadow: '0 0 0 0 rgba(46, 125, 50, 0)'},
                      },
                      animation: 'streamPanelOnAirPulse 1.4s ease-out infinite',
                      '@media (prefers-reduced-motion: reduce)': {animation: 'none'},
                  }
                : {}),
        }}
    />
)

export default StreamPanelGraphicCard
