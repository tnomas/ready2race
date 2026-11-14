import {RequestResult} from '@hey-api/client-fetch'
import {DependencyList, useCallback, useEffect, useLayoutEffect, useMemo, useState} from 'react'
import {SnackbarKey, useSnackbar} from 'notistack'
import {GridValidRowModel} from '@mui/x-data-grid'
import {useTranslation} from 'react-i18next'
import {ApiError, CaptchaDto} from '@api/types.gen.ts'
import {newCaptcha} from '@api/sdk.gen.ts'

type UseFetchOptions<T, E, R> = {
    mapData?: (data: T) => R
    onResponse?: (result: Awaited<RequestResult<T, E, false>>) => void
    preCondition?: () => boolean
    onPanic?: (error: unknown) => void
    autoReloadInterval?: number
    deps?: DependencyList
}

/**
 * Fehlerzustand von `useFetch`.
 *
 * `status` ist der HTTP-Status der Antwort. **`status === 0` heißt Netzfehler**: Es kam gar keine
 * Antwort (Funkloch, Backend weg, DNS); `error` trägt dann statt eines `E` die Marke
 * `NETWORK_ERROR`. Zuvor blieb in diesem Fall `pending` für immer `true`.
 */
export type FetchError<E> =
    | {
          status: number
          error: E
      }
    | {
          status: typeof NETWORK_ERROR_STATUS
          error: NetworkError
      }

export const NETWORK_ERROR_STATUS = 0

export type NetworkError = {
    kind: 'network'
    cause: unknown
}

export const isNetworkError = <E>(
    error: FetchError<E> | null | undefined,
): error is {status: typeof NETWORK_ERROR_STATUS; error: NetworkError} =>
    error != null &&
    error.status === NETWORK_ERROR_STATUS &&
    typeof error.error === 'object' &&
    error.error !== null &&
    'kind' in error.error &&
    error.error.kind === 'network'

export type UseFetchReturn<T, E> = {
    reload: () => void
    pending: boolean
} & (
    | {
          error: null
          data: null
      }
    | {
          error: FetchError<E>
          data: null
      }
    | {
          error: null
          data: T
      }
)

export const useFetch = <T, E, R = T>(
    req: (abortSignal: AbortSignal) => RequestResult<T, E, false>,
    options?: UseFetchOptions<T, E, R>,
): UseFetchReturn<R, E> => {
    // Ein Zähler statt `Date.now()`: Zwei `reload()` in derselben Millisekunde (oder unter
    // eingefrorener Uhr) ergaben denselben Wert, und der zweite Abruf fiel still aus.
    const [lastTry, setLastTry] = useState(0)
    const reload = useCallback(() => setLastTry(n => n + 1), [])

    const fetchInit: UseFetchReturn<R, E> = {
        reload,
        pending: false,
        error: null,
        data: null,
    }

    const [result, setResult] = useState<UseFetchReturn<R, E>>(fetchInit)

    useEffect(() => {
        if (options?.preCondition?.() == false) {
            // Ohne Vorbedingung kein Stand: Was hier noch stünde, gehörte zur vorigen Lage (etwa
            // zum abgemeldeten Nutzer). Ein abgebrochener Vorgänger hinterließe sonst auch ein
            // ewiges `pending`.
            setResult(prev =>
                prev.pending || prev.data !== null || prev.error !== null ? fetchInit : prev,
            )
            return
        }

        const controller = new AbortController()
        let timer: ReturnType<typeof setTimeout> | null = null
        let settled = false
        const autoReloadInterval = options?.autoReloadInterval
        const watchVisibility = autoReloadInterval !== undefined && typeof document !== 'undefined'

        setResult(prev => ({...prev, pending: true}))
        ;(async () => {
            try {
                const result = await req(controller.signal)
                // Abgelöst (andere deps, Seitenwechsel), aber die Antwort war schon da: Sie
                // gehört zum vorigen Parameter und darf den neueren Stand nicht überschreiben.
                if (controller.signal.aborted) return
                const {data, error, response} = result
                options?.onResponse?.(result)
                if (data !== undefined) {
                    setResult({
                        reload,
                        pending: false,
                        error: null,
                        data: options?.mapData ? options.mapData(data) : (data as R),
                    })
                } else if (error !== undefined) {
                    setResult({
                        reload,
                        pending: false,
                        error: {
                            status: response.status,
                            error,
                        },
                        data: null,
                    })
                } else {
                    setResult(prev => ({...prev, pending: false}))
                }
            } catch (error) {
                if (controller.signal.aborted) return
                if (options?.onPanic) {
                    options.onPanic(error)
                    setResult(prev => ({...prev, pending: false}))
                } else {
                    // Früher wurde hier weitergeworfen: eine unbehandelte Rejection, und `pending`
                    // blieb für immer wahr. Ein schon geladener Stand bleibt stehen (ein Aussetzer
                    // im Funkloch soll keine Liste leeren); ohne Stand gibt es den Netzfehler als
                    // Fehlerzustand mit Status 0.
                    setResult(prev =>
                        prev.data !== null
                            ? {...prev, pending: false}
                            : {
                                  reload,
                                  pending: false,
                                  error: {
                                      status: NETWORK_ERROR_STATUS,
                                      error: {kind: 'network', cause: error},
                                  },
                                  data: null,
                              },
                    )
                }
            } finally {
                // Der nächste Takt zählt ab der Antwort, nicht ab dem Absenden. Beides hält
                // Anfragen davon ab, sich zu überlappen — aber ein Wecker, der beim Absenden
                // gestellt wird, bricht auf einer langsamen Verbindung jede Anfrage ab, bevor
                // sie ankommt: Die Seite holt dann nie wieder etwas und merkt es nicht einmal,
                // weil ein Abbruch kein Fehler ist. So wartet der Takt auf die Antwort.
                //
                // Nach einem Abbruch (Seitenwechsel, geänderte deps) wird kein Wecker mehr
                // gestellt: Der Nachfolger dieses Effekts stellt seinen eigenen. Im verdeckten
                // Tab auch nicht: Die Rückkehr lädt sofort (siehe unten).
                if (!controller.signal.aborted) {
                    settled = true
                    if (autoReloadInterval !== undefined && !(watchVisibility && document.hidden)) {
                        timer = setTimeout(reload, autoReloadInterval)
                    }
                }
            }
        })()

        // Wie `usePolledEndpoint`: Im Hintergrund wird nicht getaktet, beim Zurückkehren sofort
        // einmal geladen. Nur für Aufrufer mit Takt; einmalige Abrufe bleiben unberührt.
        const onVisibilityChange = () => {
            if (document.hidden) {
                if (timer !== null) {
                    clearTimeout(timer)
                    timer = null
                }
            } else if (settled && timer === null) {
                reload()
            }
        }
        if (watchVisibility) {
            document.addEventListener('visibilitychange', onVisibilityChange)
        }

        return () => {
            controller.abort()
            if (timer !== null) {
                clearTimeout(timer)
            }
            if (watchVisibility) {
                document.removeEventListener('visibilitychange', onVisibilityChange)
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lastTry, ...(options?.deps ?? [])])

    return result
}

export type UseParamDialogStateReturn<T> = [
    boolean,
    (params?: T) => void,
    () => void,
    props: T | undefined,
]

export const useParamDialogState = <T>(defaultOpen: boolean): UseParamDialogStateReturn<T> => {
    const [dialogOpen, setDialogOpen] = useState(defaultOpen)
    const [props, setProps] = useState<T>()

    return [
        dialogOpen,
        (props?: T) => {
            setDialogOpen(true)
            setProps(props)
        },
        () => setDialogOpen(false),
        props,
    ]
}

export type UseEntityAdministrationOptions = {
    entityCreate?: boolean
    entityUpdate?: boolean
    entityDelete?: boolean
}

export type UseEntityAdministrationReturn<T> = {
    table: {
        entityName: string
        lastRequested: number
        reloadData: () => void
        openDialog: (entity?: T) => void
        options: UseEntityAdministrationOptions
    }
    dialog: {
        entityName: string
        dialogIsOpen: boolean
        closeDialog: () => void
        reloadData: () => void
        entity?: T
    }
}

export const useEntityAdministration = <T extends GridValidRowModel | undefined = undefined>(
    entityName: string,
    {
        entityCreate = true,
        entityUpdate = true,
        entityDelete = true,
    }: UseEntityAdministrationOptions = {},
): UseEntityAdministrationReturn<T> => {
    const [dialogIsOpen, openDialog, closeDialog, entity] = useParamDialogState<T>(false)

    const [lastRequested, setLastRequested] = useState(Date.now())

    const reloadData = () => setLastRequested(Date.now())

    const options: UseEntityAdministrationOptions = {
        entityCreate,
        entityUpdate,
        entityDelete,
    }

    return {
        table: {
            entityName,
            lastRequested,
            reloadData,
            openDialog,
            options,
        },
        dialog: {
            entityName,
            dialogIsOpen,
            closeDialog,
            reloadData,
            entity,
        },
    }
}

export type Feedback = {
    success: (msg: string) => SnackbarKey
    warning: (msg: string) => SnackbarKey
    error: (msg: string) => SnackbarKey
    info: (msg: string) => SnackbarKey
}

/**
 * Snackbar-Meldungen. Das Aussehen je Variante (success/warning/error/info) steckt im Theme-Stil
 * `feedbackSnackbarComponents` (`utils/feedbackSnackbars.tsx`), den `App.tsx` dem
 * `SnackbarProvider` übergibt – hier steht kein Inline-Stil mehr.
 *
 * Das Objekt ist über Renderdurchläufe stabil (solange der Snackbar-Kontext gleich bleibt):
 * Viele Aufrufer führen `feedback` in den Abhängigkeiten von `useCallback`/`useEffect`, und ein
 * neues Objekt je Render machte die alle wirkungslos.
 */
export const useFeedback = (): Feedback => {
    const {enqueueSnackbar} = useSnackbar()

    return useMemo(() => {
        const show =
            (variant: 'success' | 'warning' | 'error' | 'info') =>
            (msg: string): SnackbarKey =>
                enqueueSnackbar(msg, {variant})
        return {
            success: show('success'),
            warning: show('warning'),
            error: show('error'),
            info: show('info'),
        }
    }, [enqueueSnackbar])
}

export const useDebounce = <T>(value: T, delay?: number) => {
    const [debounced, setDebounced] = useState<T>(value)

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay ?? 500)

        return () => {
            clearTimeout(timer)
        }
    }, [value, delay])

    return debounced
}

export const useWindowSize = (delay?: number) => {
    const [size, setSize] = useState<[number, number]>([window.innerWidth, window.innerHeight])

    useLayoutEffect(() => {
        let timer: ReturnType<typeof setTimeout>
        const updateSize = () => {
            clearTimeout(timer)
            timer = setTimeout(() => setSize([window.innerWidth, window.innerHeight]), delay ?? 500)
        }
        window.addEventListener('resize', updateSize)
        return () => {
            clearTimeout(timer)
            window.removeEventListener('resize', updateSize)
        }
    }, [delay])
    return size
}

type CaptchaFetchProps = {
    captcha: UseFetchReturn<CaptchaDto, ApiError>
    onReloadCaptcha: () => void
}
export const useCaptcha = (
    onSuccess: (captcha: CaptchaDto) => void,
    options?: Omit<UseFetchOptions<CaptchaDto, ApiError, CaptchaDto>, 'onResponse' | 'deps'>,
): CaptchaFetchProps => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const [lastRequested, setLastRequested] = useState(Date.now())

    const captchaData = useFetch(signal => newCaptcha({signal}), {
        ...options,
        onResponse: ({data, error}) => {
            if (error) {
                feedback.error(t('common.error.unexpected'))
            } else {
                onSuccess(data)
            }
        },
        deps: [lastRequested],
    })

    const onReloadCaptcha = useCallback(() => {
        setLastRequested(Date.now())
    }, [])

    return {
        captcha: captchaData,
        onReloadCaptcha,
    }
}
