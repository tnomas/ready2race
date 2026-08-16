import {
    Box,
    Button,
    Dialog,
    DialogContent,
    IconButton,
    MenuItem,
    Select,
    Slider,
    Stack,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import {useTranslation} from 'react-i18next'
import {
    DEFAULT_SPEAKER_SETTINGS,
    SpeakerAccentKey,
    SpeakerThemePreset,
    useSpeakerSettings,
} from './speakerSettings.ts'

type Props = {
    open: boolean
    onClose: () => void
}

const ACCENT_KEYS: SpeakerAccentKey[] = ['upcoming', 'running', 'finished', 'now']

const SpeakerSettingsDialog = ({open, onClose}: Props) => {
    const {t} = useTranslation()
    const {settings, colors, updateSettings} = useSpeakerSettings()

    const labelSx = {color: colors.textSecondary, fontWeight: 'bold', mb: 0.5}

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth={'xs'}
            fullWidth
            PaperProps={{
                sx: {
                    bgcolor: colors.panel,
                    color: colors.text,
                    border: `1px solid ${colors.border}`,
                },
            }}>
            <Box sx={{p: 2, borderBottom: `1px solid ${colors.border}`}}>
                <Stack direction={'row'} alignItems={'center'}>
                    <Typography variant={'h6'} fontWeight={'bold'} sx={{flex: 1}}>
                        ⚙️ {t('speaker.settings.title')}
                    </Typography>
                    <IconButton onClick={onClose} sx={{color: colors.textSecondary}}>
                        <CloseIcon />
                    </IconButton>
                </Stack>
                <Typography variant={'caption'} sx={{color: colors.textSecondary}}>
                    {t('speaker.settings.storedLocally')}
                </Typography>
            </Box>
            <DialogContent>
                <Stack spacing={3}>
                    <Box>
                        <Typography variant={'body2'} sx={labelSx}>
                            {t('speaker.settings.theme')}
                        </Typography>
                        <ToggleButtonGroup
                            exclusive
                            fullWidth
                            size={'small'}
                            value={settings.themePreset}
                            onChange={(_, value: SpeakerThemePreset | null) => {
                                if (value) updateSettings({themePreset: value})
                            }}
                            sx={{
                                '& .MuiToggleButton-root': {
                                    color: colors.textSecondary,
                                    borderColor: colors.border,
                                    '&.Mui-selected': {
                                        color: colors.text,
                                        bgcolor: colors.panelHover,
                                    },
                                },
                            }}>
                            <ToggleButton value={'dark'}>
                                {t('speaker.settings.themeDark')}
                            </ToggleButton>
                            <ToggleButton value={'black'}>
                                {t('speaker.settings.themeBlack')}
                            </ToggleButton>
                            <ToggleButton value={'light'}>
                                {t('speaker.settings.themeLight')}
                            </ToggleButton>
                        </ToggleButtonGroup>
                    </Box>
                    <Box>
                        <Typography variant={'body2'} sx={labelSx}>
                            {t('speaker.settings.scale')}: {settings.scalePercent}%
                        </Typography>
                        <Slider
                            value={settings.scalePercent}
                            min={75}
                            max={150}
                            step={5}
                            marks={[{value: 100, label: '100%'}]}
                            onChange={(_, value) =>
                                updateSettings({scalePercent: value as number})
                            }
                            sx={{
                                color: colors.upcoming,
                                '& .MuiSlider-markLabel': {color: colors.textSecondary},
                            }}
                        />
                    </Box>
                    <Box>
                        <Typography variant={'body2'} sx={labelSx}>
                            {t('speaker.settings.colors')}
                        </Typography>
                        <Stack spacing={1}>
                            {ACCENT_KEYS.map(key => (
                                <Stack
                                    key={key}
                                    direction={'row'}
                                    alignItems={'center'}
                                    spacing={1.5}>
                                    <Box
                                        component={'input'}
                                        type={'color'}
                                        value={colors[key]}
                                        onChange={(
                                            event: React.ChangeEvent<HTMLInputElement>,
                                        ) =>
                                            updateSettings({
                                                customColors: {
                                                    ...settings.customColors,
                                                    [key]: event.target.value,
                                                },
                                            })
                                        }
                                        sx={{
                                            width: 40,
                                            height: 28,
                                            p: 0,
                                            border: `1px solid ${colors.border}`,
                                            borderRadius: 1,
                                            bgcolor: 'transparent',
                                            cursor: 'pointer',
                                        }}
                                    />
                                    <Typography variant={'body2'}>
                                        {t(`speaker.settings.color.${key}`)}
                                    </Typography>
                                </Stack>
                            ))}
                        </Stack>
                        <Button
                            size={'small'}
                            sx={{mt: 1, color: colors.textSecondary}}
                            onClick={() => updateSettings({customColors: {}})}>
                            {t('speaker.settings.resetColors')}
                        </Button>
                    </Box>
                    <Stack direction={'row'} spacing={2}>
                        <Box sx={{flex: 1}}>
                            <Typography variant={'body2'} sx={labelSx}>
                                {t('speaker.settings.refresh')}
                            </Typography>
                            <Select
                                size={'small'}
                                fullWidth
                                value={settings.refreshSeconds}
                                onChange={event =>
                                    updateSettings({
                                        refreshSeconds: Number(event.target.value),
                                    })
                                }
                                sx={{
                                    color: colors.text,
                                    '& .MuiOutlinedInput-notchedOutline': {
                                        borderColor: colors.border,
                                    },
                                    '& .MuiSvgIcon-root': {color: colors.textSecondary},
                                }}>
                                {[10, 20, 30, 60].map(seconds => (
                                    <MenuItem key={seconds} value={seconds}>
                                        {seconds} s
                                    </MenuItem>
                                ))}
                            </Select>
                        </Box>
                        <Box sx={{flex: 1}}>
                            <Typography variant={'body2'} sx={labelSx}>
                                {t('speaker.settings.turnaround')}
                            </Typography>
                            <Select
                                size={'small'}
                                fullWidth
                                value={settings.turnaroundMinutes}
                                onChange={event =>
                                    updateSettings({
                                        turnaroundMinutes: Number(event.target.value),
                                    })
                                }
                                sx={{
                                    color: colors.text,
                                    '& .MuiOutlinedInput-notchedOutline': {
                                        borderColor: colors.border,
                                    },
                                    '& .MuiSvgIcon-root': {color: colors.textSecondary},
                                }}>
                                {[20, 30, 45, 60, 90].map(minutes => (
                                    <MenuItem key={minutes} value={minutes}>
                                        {minutes} min
                                    </MenuItem>
                                ))}
                            </Select>
                        </Box>
                    </Stack>
                    <Button
                        variant={'outlined'}
                        size={'small'}
                        onClick={() => updateSettings({...DEFAULT_SPEAKER_SETTINGS})}
                        sx={{color: colors.textSecondary, borderColor: colors.border}}>
                        {t('speaker.settings.resetAll')}
                    </Button>
                </Stack>
            </DialogContent>
        </Dialog>
    )
}

export default SpeakerSettingsDialog
