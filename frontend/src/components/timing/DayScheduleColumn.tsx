import {ButtonBase, Chip, IconButton, Stack, Tooltip, Typography} from '@mui/material'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import {MouseEvent, ReactNode} from 'react'
import {useTranslation} from 'react-i18next'
import {TimingMatchDto} from '@api/types.gen.ts'
import {compactScheduleTitle, dayScheduleStatus} from '@utils/timing/matchBoard.ts'
import {ModeChip} from '@components/timing/matchDisplay.tsx'
import {touchTargetSx} from '@utils/touch.ts'

/** Chip-Farbe je Status — dieselbe Sprache wie der ProgressChip der Arbeitsfläche. */
const STATUS_COLOR = {
    OPEN: 'default',
    STARTING: 'info',
    STARTED: 'primary',
    FINISHED: 'success',
} as const

export type DayScheduleColumnProps = {
    matches: TimingMatchDto[]
    /** Die in der Arbeitsfläche fokussierte Partie. */
    focusedId: string | undefined
    onFocus: (matchId: string) => void
    collapsed: boolean
    onToggleCollapsed: () => void
    /**
     * Aktionsmenü je Partie (Startposten: Sequenz abbrechen, Start zurücknehmen). Ohne Handler
     * gibt es keinen Menü-Knopf — der Zielposten korrigiert über die Zeitenliste.
     */
    onOpenMenu?: (match: TimingMatchDto, anchor: HTMLElement) => void
    /** Ob das Menü für diese Partie überhaupt etwas anzubieten hat. */
    menuAvailable?: (match: TimingMatchDto) => boolean
    /**
     * Telefon-Layout: die Spalte lebt in einer überlagernden Schublade der Seite. Sie füllt dann
     * fast die Bildschirmbreite, und der Einklapp-Knopf schließt die Schublade (die Seite reicht
     * ihr Schließen als `onToggleCollapsed` herein).
     */
    inDrawer?: boolean
}

/** „09:20" aus dem geplanten Start — ohne Zeit bleibt der Platz leer statt „Invalid Date". */
function startTimeLabel(match: TimingMatchDto): string | null {
    if (match.startTime == null) return null
    return new Date(match.startTime).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})
}

/**
 * Die Tagesablauf-Spalte beider Posten-Boards: alle Partien des Tages chronologisch (die
 * Reihenfolge liefert `/matches` bereits), je Partie Uhrzeit, Rennnummer/Kurzname, Typ-Chip und
 * Status. Ein Klick fokussiert die Partie in der Arbeitsfläche. Eingeklappt bleibt eine schmale
 * Leiste mit dem Aufklapp-Knopf stehen, damit die Spalte auf einem Telefon keine Erfassungsfläche
 * frisst — der Zustand gehört der Seite (sie merkt ihn sich über Reloads hinweg).
 */
const DayScheduleColumn = ({
    matches,
    focusedId,
    onFocus,
    collapsed,
    onToggleCollapsed,
    onOpenMenu,
    menuAvailable,
    inDrawer = false,
}: DayScheduleColumnProps) => {
    const {t} = useTranslation()

    if (collapsed) {
        return (
            <Stack
                sx={{
                    flexShrink: 0,
                    borderRight: 1,
                    borderColor: 'divider',
                    alignItems: 'center',
                    py: 0.5,
                }}>
                <Tooltip title={t('timing.schedule.expand')}>
                    <IconButton
                        size="small"
                        aria-label={t('timing.schedule.expand')}
                        onClick={onToggleCollapsed}
                        sx={touchTargetSx}>
                        <ChevronRightIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            </Stack>
        )
    }

    const renderStatus = (match: TimingMatchDto): ReactNode => {
        const status = dayScheduleStatus(match)
        const label =
            status.kind === 'STARTED'
                ? t('timing.schedule.status.finishProgress', {
                      finished: status.finished,
                      total: status.total,
                  })
                : t(`timing.schedule.status.${status.kind}`)
        return <Chip size="small" color={STATUS_COLOR[status.kind]} label={label} />
    }

    return (
        <Stack
            sx={{
                // In der Schublade darf die Spalte fast die ganze Telefon-Breite nutzen — als
                // Seitenspalte bleibt sie bewusst schmal, damit die Arbeitsfläche dominiert.
                width: inDrawer ? 'min(85vw, 320px)' : 280,
                flexShrink: 0,
                minHeight: 0,
                height: inDrawer ? 1 : undefined,
                borderRight: inDrawer ? 0 : 1,
                borderColor: 'divider',
            }}>
            <Stack
                direction="row"
                alignItems="center"
                sx={{px: 1, py: 0.5, flexShrink: 0, borderBottom: 1, borderColor: 'divider'}}>
                <Typography variant="subtitle2" sx={{flexGrow: 1}}>
                    {t('timing.schedule.title')}
                </Typography>
                <Tooltip title={t('timing.schedule.collapse')}>
                    <IconButton
                        size="small"
                        aria-label={t('timing.schedule.collapse')}
                        onClick={onToggleCollapsed}
                        sx={touchTargetSx}>
                        <ChevronLeftIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            </Stack>
            <Stack sx={{flexGrow: 1, minHeight: 0, overflowY: 'auto'}}>
                {matches.map(match => {
                    const isFocused = match.competitionSetupMatch === focusedId
                    const time = startTimeLabel(match)
                    const showMenu =
                        onOpenMenu !== undefined && (menuAvailable?.(match) ?? true)
                    return (
                        <Stack
                            key={match.competitionSetupMatch}
                            direction="row"
                            alignItems="stretch"
                            sx={{borderBottom: 1, borderColor: 'divider'}}>
                            <ButtonBase
                                onClick={() => onFocus(match.competitionSetupMatch)}
                                sx={{
                                    flexGrow: 1,
                                    minWidth: 0,
                                    display: 'block',
                                    textAlign: 'left',
                                    px: 1,
                                    py: 0.75,
                                    minHeight: 44,
                                    bgcolor: isFocused ? 'action.selected' : undefined,
                                    borderLeft: 3,
                                    borderLeftColor: isFocused ? 'primary.main' : 'transparent',
                                }}>
                                <Stack spacing={0.5}>
                                    <Stack direction="row" spacing={0.75} alignItems="baseline">
                                        {time !== null && (
                                            <Typography
                                                variant="caption"
                                                sx={{
                                                    fontVariantNumeric: 'tabular-nums',
                                                    color: 'text.secondary',
                                                    flexShrink: 0,
                                                }}>
                                                {time}
                                            </Typography>
                                        )}
                                        <Typography
                                            variant="body2"
                                            noWrap
                                            sx={{fontWeight: isFocused ? 700 : 500, minWidth: 0}}>
                                            {compactScheduleTitle(match)}
                                        </Typography>
                                    </Stack>
                                    <Stack
                                        direction="row"
                                        spacing={0.5}
                                        flexWrap="wrap"
                                        useFlexGap>
                                        <ModeChip mode={match.timingMode} />
                                        {renderStatus(match)}
                                    </Stack>
                                </Stack>
                            </ButtonBase>
                            {showMenu && (
                                <IconButton
                                    size="small"
                                    aria-label={t('timing.matches.menu.open')}
                                    sx={[{alignSelf: 'center', mx: 0.25}, touchTargetSx]}
                                    onClick={(event: MouseEvent<HTMLButtonElement>) =>
                                        onOpenMenu(match, event.currentTarget)
                                    }>
                                    <MoreVertIcon fontSize="small" />
                                </IconButton>
                            )}
                        </Stack>
                    )
                })}
                {matches.length === 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{p: 1.5}}>
                        {t('timing.matches.empty')}
                    </Typography>
                )}
            </Stack>
        </Stack>
    )
}

export default DayScheduleColumn

/** localStorage-Schlüssel des Einklapp-Zustands — geräteweit, nicht je Posten. */
const DAY_SCHEDULE_COLLAPSED_KEY = 'timing.board.scheduleCollapsed'

/** Anfangszustand: gemerkter Wert, sonst auf schmalen Bildschirmen eingeklappt. */
export function initialScheduleCollapsed(): boolean {
    try {
        const stored = localStorage.getItem(DAY_SCHEDULE_COLLAPSED_KEY)
        if (stored !== null) return stored === '1'
    } catch {
        // localStorage kann fehlen (Privatmodus) — dann entscheidet die Bildschirmbreite.
    }
    return window.innerWidth < 900
}

export function persistScheduleCollapsed(collapsed: boolean): void {
    try {
        localStorage.setItem(DAY_SCHEDULE_COLLAPSED_KEY, collapsed ? '1' : '0')
    } catch {
        // Nicht speicherbar — der Zustand gilt dann eben nur für diese Sitzung.
    }
}
