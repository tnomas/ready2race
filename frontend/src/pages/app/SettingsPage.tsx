import {Button, Divider, Stack, ToggleButton, ToggleButtonGroup, Typography} from '@mui/material'
import LogoutIcon from '@mui/icons-material/Logout'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import {useNavigate} from '@tanstack/react-router'
import {useTranslation} from 'react-i18next'
import AppHeader from '@components/qrApp/AppHeader.tsx'
import AppColumn from '@components/qrApp/AppColumn.tsx'
import LanguageWidget from '@components/appbar/LanguageWidget.tsx'
import {useAppSession} from '@contexts/app/AppSessionContext.tsx'
import {useUser} from '@contexts/user/UserContext.ts'
import {useConfirmation} from '@contexts/confirmation/ConfirmationContext.ts'
import {resetAppInstallation} from '@pwa/registerAppSW.ts'
import {parseEventDay} from '@components/qrApp/eventOperations.ts'
import {ScanMode} from '@components/qrApp/appAccess.ts'

/** Das Abseits: alles, was selten ist und im Ablauf nur stören würde. */
const SettingsPage = () => {
    const {t} = useTranslation()
    const navigate = useNavigate()
    const user = useUser()
    const {confirmAction} = useConfirmation()
    const {event, scanRights, scanMode, setScanMode} = useAppSession()

    const dateRange = () => {
        const from = event?.firstEventDay ? parseEventDay(event.firstEventDay) : null
        if (!from) return t('app.event.noDays')
        const to = event?.lastEventDay ? parseEventDay(event.lastEventDay) : null
        const full = (d: Date) =>
            d.toLocaleDateString(undefined, {day: '2-digit', month: '2-digit', year: 'numeric'})
        return to && to.getTime() !== from.getTime() ? `${full(from)} – ${full(to)}` : full(from)
    }

    const section = (title: string) => (
        <Typography variant="overline" color="text.secondary">
            {title}
        </Typography>
    )

    return (
        <AppColumn>
            <AppHeader title={t('app.settings.title')} onBack={() => void navigate({to: '/app'})} />
            <Stack spacing={1}>
                {section(t('app.settings.event.title'))}
                <Typography sx={{fontWeight: 700}}>{event?.name ?? '–'}</Typography>
                <Typography variant="body2" color="text.secondary">
                    {dateRange()}
                </Typography>
                <Button
                    variant="outlined"
                    size="large"
                    fullWidth
                    startIcon={<SwapHorizIcon />}
                    onClick={() => void navigate({to: '/app/veranstaltung'})}>
                    {t('app.settings.event.switch')}
                </Button>
            </Stack>
            {scanRights.length > 1 && (
                <>
                    <Divider />
                    <Stack spacing={1}>
                        {section(t('app.settings.mode.title'))}
                        <ToggleButtonGroup
                            orientation="vertical"
                            exclusive
                            fullWidth
                            value={scanMode}
                            onChange={(_e, value: ScanMode | null) => {
                                if (value !== null) setScanMode(value)
                            }}>
                            {scanRights.map(mode => (
                                <ToggleButton key={mode} value={mode} sx={{py: 1.5}}>
                                    {t(`app.mode.${mode}`)}
                                </ToggleButton>
                            ))}
                        </ToggleButtonGroup>
                        <Typography variant="body2" color="text.secondary">
                            {t('app.settings.mode.hint')}
                        </Typography>
                    </Stack>
                </>
            )}
            <Divider />
            <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                {section(t('app.settings.language.title'))}
                <LanguageWidget />
            </Stack>
            <Divider />
            <Stack spacing={1}>
                {section(t('app.settings.account.title'))}
                <Button
                    variant="outlined"
                    size="large"
                    fullWidth
                    startIcon={<LogoutIcon />}
                    onClick={() => 'logout' in user && user.logout(true)}>
                    {t('user.settings.logout')}
                </Button>
                <Button
                    variant="text"
                    size="small"
                    onClick={() =>
                        confirmAction(() => void resetAppInstallation(), {
                            content: t('app.reset.confirm'),
                            okText: t('app.reset.button'),
                        })
                    }>
                    {t('app.reset.button')}
                </Button>
            </Stack>
        </AppColumn>
    )
}

export default SettingsPage
