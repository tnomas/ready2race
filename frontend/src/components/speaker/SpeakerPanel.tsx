import {Box, IconButton, Popover, Stack, Typography} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import SettingsIcon from '@mui/icons-material/Settings'
import {ReactNode, useRef, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {useSpeakerColors} from './speakerSettings.ts'

type Props = {
    title: ReactNode
    /** Kleingedrucktes unter dem Titel. */
    subtitle?: ReactNode
    /** Zusätzliche Kopfzeilen-Elemente (Filter, Umschalter) rechts neben dem Titel. */
    headerExtra?: ReactNode
    /** Inhalt des Zahnrad-Popovers; ohne Angabe erscheint kein Zahnrad. */
    settings?: ReactNode
    /** Schließen-Kreuz — für Panels, die stehen bleiben, bis man sie wegklickt. */
    onClose?: () => void
    children: ReactNode
}

/**
 * Gemeinsame Hülle der Dashboard-Panels des Sprecher-Boards: Karte in Board-Farben mit Kopfzeile,
 * optionalem Einstellungs-Zahnrad je Panel (das Popover übernimmt die Board-Palette, nicht das
 * App-Theme) und optionalem Schließen-Kreuz. Die Panels stehen nebeneinander und bleiben stehen —
 * bewusst keine Dialoge mehr.
 */
const SpeakerPanel = ({title, subtitle, headerExtra, settings, onClose, children}: Props) => {
    const {t} = useTranslation()
    const colors = useSpeakerColors()
    const gearRef = useRef<HTMLButtonElement | null>(null)
    const [settingsOpen, setSettingsOpen] = useState(false)

    return (
        <Box
            sx={{
                bgcolor: colors.panel,
                border: `1px solid ${colors.border}`,
                borderRadius: 2,
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                height: '100%',
                overflow: 'hidden',
            }}>
            <Stack
                direction={'row'}
                alignItems={'center'}
                spacing={1}
                sx={{px: 1.5, py: 1, borderBottom: `1px solid ${colors.border}`}}>
                <Box sx={{flex: 1, minWidth: 0}}>
                    {/* component div, weil Titel auch Chips (divs) tragen — die dürfen nicht in ein <p> */}
                    <Typography component={'div'} fontWeight={'bold'} noWrap sx={{color: colors.text}}>
                        {title}
                    </Typography>
                    {subtitle && (
                        <Typography
                            component={'div'}
                            variant={'caption'}
                            noWrap
                            sx={{color: colors.textSecondary}}>
                            {subtitle}
                        </Typography>
                    )}
                </Box>
                {headerExtra}
                {settings && (
                    <>
                        <IconButton
                            size={'small'}
                            ref={gearRef}
                            onClick={() => setSettingsOpen(true)}
                            aria-label={t('common.settings')}
                            sx={{color: colors.textSecondary}}>
                            <SettingsIcon fontSize={'small'} />
                        </IconButton>
                        <Popover
                            open={settingsOpen}
                            anchorEl={gearRef.current}
                            onClose={() => setSettingsOpen(false)}
                            anchorOrigin={{vertical: 'bottom', horizontal: 'right'}}
                            transformOrigin={{vertical: 'top', horizontal: 'right'}}
                            slotProps={{
                                paper: {
                                    sx: {
                                        bgcolor: colors.panel,
                                        color: colors.text,
                                        border: `1px solid ${colors.border}`,
                                    },
                                },
                            }}>
                            <Stack spacing={2} sx={{p: 2, minWidth: 'min(280px, 90vw)'}}>
                                {settings}
                            </Stack>
                        </Popover>
                    </>
                )}
                {onClose && (
                    <IconButton
                        size={'small'}
                        onClick={onClose}
                        aria-label={t('common.close')}
                        sx={{color: colors.textSecondary}}>
                        <CloseIcon fontSize={'small'} />
                    </IconButton>
                )}
            </Stack>
            <Box sx={{flex: 1, minHeight: 0, overflowY: 'auto'}}>{children}</Box>
        </Box>
    )
}

export default SpeakerPanel
