import {useEffect} from 'react'
import {Box, Button, CircularProgress, Stack, Typography} from '@mui/material'
import {keyframes} from '@emotion/react'
import {ErrorComponentProps, useNavigate, useRouter, useRouterState} from '@tanstack/react-router'
import {useTranslation} from 'react-i18next'
import {isChunkLoadError, tryChunkReload} from '@utils/chunkReload.ts'

const useInApp = () =>
    useRouterState({
        select: s => s.location.pathname === '/app' || s.location.pathname.startsWith('/app/'),
    })

/**
 * Fehlerseite der Verwaltungs-, Ergebnis- und App-Seiten (`defaultErrorComponent`). Ersetzt TanStacks
 * Entwickler-Fehlerbox. Ist ein Code-Stück nach einem Deployment verschwunden, sagt die Seite das
 * und lädt beim Klick die ganze Seite neu; sonst wertet „Neu laden" nur die Route neu aus.
 */
const RouteErrorPage = ({error}: ErrorComponentProps) => {
    const {t} = useTranslation()
    const router = useRouter()
    const navigate = useNavigate()
    const inApp = useInApp()
    const chunkError = isChunkLoadError(error)

    useEffect(() => {
        console.error(error)
    }, [error])

    const retry = () => {
        if (chunkError) {
            window.location.reload()
        } else {
            void router.invalidate()
        }
    }

    return (
        <Stack
            spacing={2}
            alignItems="center"
            justifyContent="center"
            p={4}
            sx={{minHeight: '50vh'}}>
            <Typography variant="h4" component="h2" textAlign="center">
                {chunkError ? t('routeError.chunkTitle') : t('routeError.title')}
            </Typography>
            <Typography textAlign="center" sx={{maxWidth: 560}}>
                {chunkError ? t('routeError.chunkDescription') : t('routeError.description')}
            </Typography>
            {import.meta.env.DEV && error instanceof Error && (
                <Typography
                    component="pre"
                    variant="caption"
                    color="text.secondary"
                    sx={{maxWidth: '100%', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'}}>
                    {error.message}
                </Typography>
            )}
            <Stack direction="row" spacing={2}>
                <Button variant="contained" onClick={retry}>
                    {t('routeError.reload')}
                </Button>
                <Button onClick={() => void navigate({to: inApp ? '/app' : '/'})}>
                    {inApp ? t('notFound.appHome') : t('routeError.home')}
                </Button>
            </Stack>
        </Stack>
    )
}

export default RouteErrorPage

/** Abstand der stillen Neuversuche auf Vollbild-Anzeigen. */
const DISPLAY_RETRY_MS = 10_000

/**
 * Neuversuch ohne Zutun: alle zehn Sekunden die Route neu auswerten. Fehlt ein Code-Stück, hilft
 * nur ein Neuladen der ganzen Seite (der gescheiterte Import bleibt sonst gemerkt) - das übernimmt
 * `tryChunkReload` mit seiner Sperre gegen Schleifen und der Prüfung, ob der Server antwortet.
 */
const useDisplayRetry = (error: unknown) => {
    const router = useRouter()
    useEffect(() => {
        console.error(error)
        let cancelled = false
        let timer: number | undefined
        const schedule = () => {
            timer = window.setTimeout(async () => {
                if (isChunkLoadError(error) && (await tryChunkReload())) return
                if (cancelled) return
                void router.invalidate()
                schedule()
            }, DISPLAY_RETRY_MS)
        }
        schedule()
        return () => {
            cancelled = true
            window.clearTimeout(timer)
        }
    }, [error, router])
}

/**
 * Fehler auf einer unbeaufsichtigten Anzeige (Board, Sprecher, Regie, Zeitnahme-Bildschirm): kein
 * Fehlerkasten, nur ein dezenter Hinweis in der Ecke, und nach zehn Sekunden ein neuer Versuch.
 */
export const DisplayRouteError = ({error}: ErrorComponentProps) => {
    const {t} = useTranslation()
    useDisplayRetry(error)
    return (
        <Box
            role="status"
            sx={{
                position: 'fixed',
                right: 12,
                bottom: 8,
                fontSize: 12,
                color: 'text.disabled',
                opacity: 0.7,
                pointerEvents: 'none',
            }}>
            {t('routeError.displayRetrying')}
        </Box>
    )
}

/**
 * Fehler auf der Stream-Bühne: Sie läuft als OBS-/Wirecast-Browserquelle, jeder sichtbare Text
 * stünde im Livebild. Deshalb bleibt die Bühne leer und transparent, bis der Neuversuch gelingt.
 */
export const SilentRouteError = ({error}: ErrorComponentProps) => {
    useDisplayRetry(error)
    return null
}

const fadeIn = keyframes`
    from { opacity: 0; }
    to { opacity: 1; }
`

/**
 * Ladezustand beim Seitenwechsel (`defaultPendingComponent`). Der Kreisel erscheint erst nach
 * einer kurzen Verzögerung, damit schnelle Wechsel nicht flackern. Auf Vollbild-Anzeigen
 * (`staticData.quietDisplay`, siehe routes.tsx) bleibt es leer - ein Kreisel im Livebild oder auf
 * dem Board-Bildschirm wäre schlimmer als ein kurzer leerer Moment.
 */
export const RoutePending = () => {
    const quiet = useRouterState({
        select: s =>
            [...s.matches, ...(s.pendingMatches ?? [])].some(
                m => m.staticData?.quietDisplay === true,
            ),
    })
    if (quiet) return null
    return (
        <Box
            sx={{
                display: 'flex',
                minHeight: 120,
                height: 1,
                opacity: 0,
                animation: `${fadeIn} 200ms ease-in 400ms forwards`,
            }}>
            <CircularProgress size={32} sx={{m: 'auto'}} />
        </Box>
    )
}
