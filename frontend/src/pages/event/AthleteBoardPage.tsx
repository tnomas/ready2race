import {useEffect} from 'react'
import {Box, CircularProgress, Stack, Typography} from '@mui/material'
import {useNavigate} from '@tanstack/react-router'
import {useTranslation} from 'react-i18next'
import {useFetch} from '@utils/hooks'
import {getPublicBoards} from '@api/sdk.gen'
import {athleteBoardRoute} from '@routes'

/**
 * Bestands-URL der alten Athleten-Anzeige (/board/{eventId}), auf die fest montierte
 * Bildschirme zeigen. Sie bleibt bestehen und leitet auf das erste Board des Events um
 * — die Migration hat dafür je Event mit Athleten-Anzeige ein Default-Board angelegt,
 * das der alten Bühne entspricht.
 *
 * Auch die Kurzliste dahinter ist nicht mehr frei zugänglich: Sie nimmt jede Sitzung mit READ
 * BOARD/READ EVENT und JEDES Board-Token dieser Veranstaltung (der Interceptor hängt es an, siehe
 * `utils/board/deviceTokenInterceptor.ts`). Ein Gerät, das noch nie einen geteilten Board-Link
 * geöffnet hat, landet hier folglich im 401 — und bekommt denselben Klartext wie die Board-Anzeige
 * statt eines Ladekringels, der nie aufhört.
 */
const AthleteBoardPage = () => {
    const {t} = useTranslation()
    const {eventId} = athleteBoardRoute.useParams()
    const navigate = useNavigate()

    const {data: boards, error} = useFetch(signal => getPublicBoards({signal, path: {eventId}}), {
        deps: [eventId],
    })

    const unauthorized = error?.status === 401 || error?.status === 403

    useEffect(() => {
        const first = boards?.[0]
        if (first) {
            void navigate({
                to: '/board/$eventId/$boardId',
                params: {eventId, boardId: first.id},
                replace: true,
            })
        }
    }, [boards, eventId, navigate])

    return (
        <Box
            sx={{
                display: 'flex',
                height: '100dvh',
                alignItems: 'center',
                justifyContent: 'center',
                p: 3,
            }}>
            {unauthorized ? (
                <Stack spacing={1} alignItems="center" sx={{maxWidth: 700, textAlign: 'center'}}>
                    <Typography variant="h5" color="text.secondary">
                        {t('event.boards.display.unauthorized.title')}
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        {t('event.boards.display.unauthorized.hint')}
                    </Typography>
                </Stack>
            ) : boards && boards.length === 0 ? (
                <Typography variant="h5" color="text.secondary">
                    {t('event.boards.none')}
                </Typography>
            ) : (
                <CircularProgress />
            )}
        </Box>
    )
}

export default AthleteBoardPage
