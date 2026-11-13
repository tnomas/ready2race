import {Box, Container, Stack, Typography} from '@mui/material'
import {ReactNode} from 'react'
import {CheckCircle, Error, Info} from '@mui/icons-material'

type ResultStatus = 'SUCCESS' | 'ERROR' | 'INFO'

const ICON_SIZE = 64

/**
 * Ergebnisseite (Erfolg, Fehler, Hinweis). Der Titel ist eine `h2`: die Seite trägt ihren `h1`
 * im Seitenkopf. Alle drei Icons sind gleich groß.
 */
export const Result = (props: {
    status: ResultStatus
    title: string
    subtitle: string
    extra?: ReactNode
}) => {
    const getIcon = (status: ResultStatus) => {
        switch (status) {
            case 'SUCCESS':
                return <CheckCircle color={'success'} sx={{fontSize: ICON_SIZE}} />
            case 'ERROR':
                return <Error color={'error'} sx={{fontSize: ICON_SIZE}} />
            case 'INFO':
                return <Info color={'info'} sx={{fontSize: ICON_SIZE}} />
        }
    }

    return (
        <Container sx={{height: '100%'}}>
            <Stack alignItems={'center'} spacing={1} p={2} textAlign={'center'}>
                <Box aria-hidden sx={{display: 'flex'}}>
                    {getIcon(props.status)}
                </Box>
                <Typography variant={'h2'}>{props.title}</Typography>
                <Typography variant={'body1'} color={'text.secondary'} sx={{maxWidth: 480}}>
                    {props.subtitle}
                </Typography>
                {props.extra}
            </Stack>
        </Container>
    )
}
