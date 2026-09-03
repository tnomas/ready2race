import {
    Box,
    Card,
    CardActionArea,
    CardContent,
    Typography,
    useMediaQuery,
    useTheme,
} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {useNavigate} from '@tanstack/react-router'
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner'
import SportsScoreIcon from '@mui/icons-material/SportsScore'
import TimerIcon from '@mui/icons-material/Timer'
import AppHeader from '@components/qrApp/AppHeader.tsx'
import AppColumn from '@components/qrApp/AppColumn.tsx'
import {useAppSession} from '@contexts/app/AppSessionContext.tsx'
import {AppWorld, worldPath} from '@components/qrApp/appAccess.ts'

const WORLD_ICONS: Record<AppWorld, typeof QrCodeScannerIcon> = {
    SCAN: QrCodeScannerIcon,
    TIMING: TimerIcon,
    DASHBOARD: SportsScoreIcon,
}

/** Die Kacheln der Welten — nur zu sehen, wenn jemand mehr als eine betreten darf. */
const WorldsPage = () => {
    const {t} = useTranslation()
    const {worlds, event} = useAppSession()
    const navigate = useNavigate()
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

    return (
        <AppColumn maxWidth={800}>
            <AppHeader title={t('app.start.title')} subtitle={event?.name} settings />
            <Box
                display="grid"
                gridTemplateColumns={{xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)'}}
                gap={{xs: 2, sm: 3}}
                width="100%">
                {worlds.map(world => {
                    const Icon = WORLD_ICONS[world]
                    return (
                        <Card
                            key={world}
                            sx={{
                                height: {xs: '180px', sm: '200px'},
                                display: 'flex',
                                flexDirection: 'column',
                                transition: 'all 0.2s ease-in-out',
                                '&:hover': {
                                    transform: {xs: 'none', sm: 'scale(1.05)'},
                                    boxShadow: {xs: 2, sm: 4},
                                },
                                '&:active': {
                                    transform: 'scale(0.98)',
                                },
                            }}>
                            <CardActionArea
                                onClick={() => void navigate({to: worldPath[world]})}
                                sx={{
                                    height: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    p: {xs: 2, sm: 3},
                                }}>
                                <CardContent sx={{textAlign: 'center', p: 0}}>
                                    <Icon
                                        sx={{
                                            fontSize: {xs: 48, sm: 60},
                                            mb: {xs: 1, sm: 2},
                                            color: 'primary.main',
                                        }}
                                    />
                                    <Typography
                                        variant={isMobile ? 'body1' : 'h6'}
                                        sx={{fontWeight: isMobile ? 600 : 400}}>
                                        {t(`app.world.${world}`)}
                                    </Typography>
                                </CardContent>
                            </CardActionArea>
                        </Card>
                    )
                })}
            </Box>
        </AppColumn>
    )
}

export default WorldsPage
