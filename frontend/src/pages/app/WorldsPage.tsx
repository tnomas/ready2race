import {ButtonBase, Stack, Typography} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {useNavigate} from '@tanstack/react-router'
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner'
import SportsIcon from '@mui/icons-material/Sports'
import AppHeader from '@components/qrApp/AppHeader.tsx'
import AppColumn from '@components/qrApp/AppColumn.tsx'
import AppEntryCard from '@components/qrApp/AppEntryCard.tsx'
import TimingStationList from '@components/qrApp/TimingStationList.tsx'
import {useAppSession} from '@contexts/app/AppSessionContext.tsx'

/**
 * Die Startseite für alle, die mehr als eine Welt betreten dürfen. Scannen zuerst: der Scanner
 * ist die große Fläche oben. Darunter das Dashboard und – statt einer weiteren Kachel „Zeitnahme"
 * – gleich die Posten selbst, damit der eigene Posten mit einem Tipp erreichbar ist.
 */
const WorldsPage = () => {
    const {t} = useTranslation()
    const {worlds, event, scanMode} = useAppSession()
    const navigate = useNavigate()

    return (
        <AppColumn>
            <AppHeader title={t('app.start.title')} subtitle={event?.name} settings />
            {worlds.includes('SCAN') && (
                <ButtonBase
                    onClick={() => void navigate({to: '/app/scan'})}
                    focusRipple
                    className="cursor-pointer"
                    sx={{
                        width: 1,
                        minHeight: 128,
                        borderRadius: 2,
                        bgcolor: 'primary.main',
                        color: 'primary.contrastText',
                        '&:active': {bgcolor: 'primary.dark'},
                    }}>
                    <Stack alignItems="center" spacing={0.5} sx={{py: 2, px: 2}}>
                        <QrCodeScannerIcon sx={{fontSize: 56}} />
                        <Typography variant="h5" component="span" sx={{fontWeight: 700}}>
                            {t('app.world.SCAN')}
                        </Typography>
                        {scanMode && (
                            <Typography variant="body2" component="span" sx={{opacity: 0.9}}>
                                {t('app.scan.modeChip', {mode: t(`app.mode.${scanMode}`)})}
                            </Typography>
                        )}
                    </Stack>
                </ButtonBase>
            )}
            {worlds.includes('DASHBOARD') && (
                <AppEntryCard
                    icon={<SportsIcon />}
                    title={t('app.world.DASHBOARD')}
                    onClick={() => void navigate({to: '/app/dashboard'})}
                />
            )}
            {worlds.includes('TIMING') && <TimingStationList heading={t('app.world.TIMING')} />}
        </AppColumn>
    )
}

export default WorldsPage
