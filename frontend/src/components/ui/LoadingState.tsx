import {useEffect, useState} from 'react'
import {Box, CircularProgress, Skeleton, Stack} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {visuallyHiddenSx} from './visuallyHidden.ts'

export type LoadingStateProps = {
    /**
     * - `page`: Skelett einer ganzen Seite (Titelbalken, Reiterleiste, zwei Kartenblöcke)
     * - `section` (Standard): drei Textzeilen für einen Abschnitt oder eine Karte
     * - `inline`: kleiner Spinner, z. B. in einer Zeile oder neben einem Knopf
     */
    variant?: 'page' | 'section' | 'inline'
    /** Vorgelesener Text; Standard „Wird geladen …" (`ui.loading`). */
    label?: string
    /** Erst nach dieser Zeit sichtbar (kein Flackern bei schnellen Antworten). Standard 200 ms. */
    delayMs?: number
}

/** Ob die Verzögerung abgelaufen ist; bei `delayMs <= 0` sofort. */
const useDelayElapsed = (delayMs: number): boolean => {
    const [elapsed, setElapsed] = useState(delayMs <= 0)
    useEffect(() => {
        if (delayMs <= 0) return
        const timer = window.setTimeout(() => setElapsed(true), delayMs)
        return () => window.clearTimeout(timer)
    }, [delayMs])
    return elapsed
}

/**
 * Ladezustand in einheitlichem Look: Skelett statt springender Spinner für Seiten und
 * Abschnitte, Spinner nur `inline`. Erscheint erst nach `delayMs` und meldet sich per
 * `role="status"` mit unsichtbarem Text bei Screenreadern.
 *
 * Für Tabellen `TableSkeleton` verwenden.
 *
 * @example
 * if (pending && !data) return <LoadingState variant="page" />
 */
export const LoadingState = ({variant = 'section', label, delayMs = 200}: LoadingStateProps) => {
    const {t} = useTranslation()
    const visible = useDelayElapsed(delayMs)
    const text = label ?? t('ui.loading')

    if (variant === 'inline') {
        return (
            <Box
                role={'status'}
                component={'span'}
                sx={{display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle'}}>
                {visible && <CircularProgress size={20} aria-hidden />}
                <Box component={'span'} sx={visuallyHiddenSx}>
                    {text}
                </Box>
            </Box>
        )
    }

    return (
        <Box role={'status'} aria-busy sx={{width: '100%'}}>
            <Box component={'span'} sx={visuallyHiddenSx}>
                {text}
            </Box>
            {visible &&
                (variant === 'page' ? (
                    <Stack spacing={3} aria-hidden>
                        <Stack spacing={1}>
                            <Skeleton variant={'text'} width={'25%'} sx={{fontSize: '0.875rem'}} />
                            <Skeleton variant={'text'} width={'40%'} sx={{fontSize: '1.75rem'}} />
                        </Stack>
                        <Skeleton variant={'rounded'} height={44} />
                        <Skeleton variant={'rounded'} height={160} />
                        <Skeleton variant={'rounded'} height={240} />
                    </Stack>
                ) : (
                    <Stack spacing={1} aria-hidden>
                        <Skeleton variant={'text'} width={'60%'} />
                        <Skeleton variant={'text'} width={'90%'} />
                        <Skeleton variant={'text'} width={'75%'} />
                    </Stack>
                ))}
        </Box>
    )
}

export default LoadingState
