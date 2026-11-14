import {Box, Stack, Typography} from '@mui/material'
import {CheckCircleOutline, ErrorOutline} from '@mui/icons-material'
import {ButtonLink} from '@components/ui'
import {PropsWithChildren} from 'react'
import {useTranslation} from 'react-i18next'

type Props = {
    success: boolean
    header: string
    showLoginNavigation?: boolean
}

const RequestStatusResponse = ({children, ...props}: PropsWithChildren<Props>) => {
    const {t} = useTranslation()
    return (
        <Stack spacing={3}>
            <Box sx={{display: 'flex', justifyContent: 'center'}}>
                {(props.success && (
                    <CheckCircleOutline color="success" sx={{height: 64, width: 64}} />
                )) || <ErrorOutline color="error" sx={{height: 64, width: 64}} />}
            </Box>
            {/* Diese Seiten haben außer dem Ergebnis keinen anderen Titel: h1 mit h2-Größe. */}
            <Typography variant="h2" component="h1" textAlign="center">
                {props.header}
            </Typography>
            {children}
            {props.showLoginNavigation && (
                <Box sx={{display: 'flex', justifyContent: 'center'}}>
                    <ButtonLink to="/login" variant="contained">
                        {t('user.login.login')}
                    </ButtonLink>
                </Box>
            )}
        </Stack>
    )
}

export default RequestStatusResponse
