import {Box, IconButton, Typography, useMediaQuery, useTheme} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import {useTranslation} from 'react-i18next'
import {IconButtonLink} from '@components/ui'
import LanguageWidget from '@components/appbar/LanguageWidget.tsx'

type Props = {
    competitionSelected?: boolean
    resetSelectedCompetition?: () => void
    title?: string
    navigateToHome?: boolean
}

const ResultsConfigurationTopBar = (props: Props) => {
    const {t} = useTranslation()
    const theme = useTheme()
    const smallScreenLayout = useMediaQuery(`(max-width:${theme.breakpoints.values.sm}px)`)

    return (
        <Box
            sx={{
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                mb: smallScreenLayout ? 0 : 1,
            }}>
            <Box>
                {props.navigateToHome ? (
                    <IconButtonLink to={'/'} aria-label={t('common.back')}>
                        <ArrowBackIcon />
                    </IconButtonLink>
                ) : props.competitionSelected ? (
                    <IconButton
                        onClick={props.resetSelectedCompetition}
                        aria-label={t('common.back')}>
                        <ArrowBackIcon />
                    </IconButton>
                ) : (
                    <IconButtonLink to={'/results'} aria-label={t('common.back')}>
                        <ArrowBackIcon />
                    </IconButtonLink>
                )}
            </Box>
            {props.title && !smallScreenLayout && (
                <Typography variant={'h6'}>{props.title}</Typography>
            )}
            <LanguageWidget />
        </Box>
    )
}

export default ResultsConfigurationTopBar
