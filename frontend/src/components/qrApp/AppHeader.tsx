import {Box, IconButton, Stack, Typography} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import SettingsIcon from '@mui/icons-material/Settings'
import {ReactNode} from 'react'
import {useNavigate} from '@tanstack/react-router'
import {useTranslation} from 'react-i18next'

type Props = {
    title: string
    /** Meist der Name der Veranstaltung — damit auf jeder Seite steht, wofür man gerade arbeitet. */
    subtitle?: string
    onBack?: () => void
    /** Zeigt das Zahnrad zu den Einstellungen. */
    settings?: boolean
    /** Zusätzliche Zeile unter dem Titel, etwa der Modus-Chip. */
    children?: ReactNode
}

/**
 * Die Kopfzeile jeder App-Seite. Der Zurück-Pfeil ist nötig, weil die installierte App keine
 * Browser-Leiste hat; das Zahnrad ist der einzige Weg zu allem, was nicht in den Ablauf gehört.
 */
const AppHeader = ({title, subtitle, onBack, settings, children}: Props) => {
    const {t} = useTranslation()
    const navigate = useNavigate()
    return (
        <Stack sx={{width: 1, mb: 1}} spacing={1} alignItems="center">
            <Stack direction="row" sx={{width: 1, alignItems: 'center', minHeight: 48}}>
                <Box sx={{width: 48}}>
                    {onBack && (
                        <IconButton onClick={onBack} aria-label={t('common.back')} size="large">
                            <ArrowBackIcon />
                        </IconButton>
                    )}
                </Box>
                <Box sx={{flex: 1, textAlign: 'center', minWidth: 0}}>
                    {/* Kein `noWrap`: eine lange Veranstaltungs- oder Postenbezeichnung soll auf eine
                        zweite Zeile umbrechen statt mit „…“ abgeschnitten zu werden (Spezifikation
                        §11). `overflowWrap: 'anywhere'` bricht dabei auch mitten in einem langen Wort
                        ohne Leerzeichen um. */}
                    <Typography variant="h5" sx={{overflowWrap: 'anywhere'}}>
                        {title}
                    </Typography>
                    {subtitle && (
                        <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{overflowWrap: 'anywhere'}}>
                            {subtitle}
                        </Typography>
                    )}
                </Box>
                <Box sx={{width: 48}}>
                    {settings && (
                        <IconButton
                            onClick={() => void navigate({to: '/app/einstellungen'})}
                            aria-label={t('app.header.settings')}
                            size="large">
                            <SettingsIcon />
                        </IconButton>
                    )}
                </Box>
            </Stack>
            {children}
        </Stack>
    )
}

export default AppHeader
