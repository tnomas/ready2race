import {Box, Divider, Stack, Typography} from '@mui/material'
import {EmailOutlined} from '@mui/icons-material'
import {PropsWithChildren} from 'react'

type Props = {
    header: string
}

const ConfirmationMailSent = ({header, children}: PropsWithChildren<Props>) => {
    return (
        <Stack spacing={2}>
            <Box sx={{display: 'flex'}}>
                <EmailOutlined sx={{height: 64, width: 64, margin: 'auto'}} />
            </Box>
            <Typography variant="h2" component="h1" textAlign="center">
                {header}
            </Typography>
            {children && <Divider />}
            {children}
        </Stack>
    )
}

export default ConfirmationMailSent
