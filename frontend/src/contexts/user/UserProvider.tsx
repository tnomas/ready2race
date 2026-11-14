import React, {PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {AnonymousUser, AuthenticatedUser, User, UserContext} from './UserContext.ts'
import {router} from '@routes'
import {useFetch} from '@utils/hooks.ts'
import {i18nLanguage, scopeLevel} from '@utils/helpers.ts'
import {Action, LoginDto, Privilege, Resource, Scope} from '@api/types.gen.ts'
import {checkUserLogin, client, userLogout} from '@api/sdk.gen.ts'
import i18next from 'i18next'
import {Language} from '@i18n/config.ts'
import PanicPage from '../../pages/PanicPage.tsx'
import Throbber from '@components/Throbber.tsx'
import {Box} from '@mui/material'
import {
    clearSessionToken,
    readSessionToken,
    readSessionUser,
    touchSessionToken,
    writeSessionToken,
    writeSessionUser,
} from './sessionToken.ts'
import {clearCachedReads} from '@pwa/readCache.ts'
import {
    LEGACY_APP_FUNCTION_KEY,
    REQUIREMENT_COMPETITION_KEY,
    SCAN_MODE_KEY,
} from '@components/qrApp/appMemory.ts'
import {
    classifyLoginCheck,
    isDisplayPath,
    isLoginPath,
    isSessionRejection,
    loginRetryDelayMs,
} from './sessionPolicy.ts'

type Session = {
    token: string
}

type UserData =
    | {
          userInfo: LoginDto
          token: string
          isInApp: boolean
          authStatus: 'authenticated'
      }
    | {
          userInfo: LoginDto | undefined
          token: string
          isInApp: boolean
          authStatus: 'pending'
      }
    | {
          userInfo: undefined
          token: null
          isInApp: boolean
          authStatus: 'pending' | 'anonymous'
      }
    | {
          // Anzeige-Route, Backend beim Start nicht erreichbar: Die Seite läuft anonym weiter,
          // der Token bleibt für den nächsten Anmeldecheck (und als Header) aufbewahrt.
          userInfo: undefined
          token: string
          isInApp: boolean
          authStatus: 'anonymous'
      }
    | {
          userInfo: undefined
          token: string | null
          isInApp: boolean
          authStatus: 'initial'
      }

const UserProvider = ({children}: PropsWithChildren) => {
    const [language, setLanguage] = useState(i18nLanguage())
    const initialIsInApp = router.state.resolvedLocation.pathname.startsWith('/app')
    const [userData, setUserData] = useState<UserData>({
        userInfo: undefined,
        token: readSessionToken(initialIsInApp),
        isInApp: initialIsInApp,
        authStatus: 'initial',
    })
    // Der Anmeldecheck beim Start hat das Backend nicht erreicht (Netzfehler, 5xx). Solange das so
    // ist, wird mit wachsendem Abstand erneut gefragt; `attempt` zählt die Fehlschläge.
    const [connection, setConnection] = useState<{attempt: number; detail: string} | null>(null)
    const [slowStart, setSlowStart] = useState(false)

    // Für Rückrufe, die einmal registriert werden (Interceptor) oder stabil bleiben sollen
    // (Kontextwert): Sie lesen den Zustand über Refs statt aus der Closure ihres ersten Renders.
    const userDataRef = useRef(userData)
    userDataRef.current = userData
    // Mehrere parallele Anfragen liefern beim Ablauf der Sitzung gleichzeitig 401.
    const loggingOutRef = useRef(false)
    // Navigiert wird nur bei einem An- oder Abmelden, das der Nutzer selbst ausgelöst hat. Ein
    // vom System erkannter Wechsel (abgelaufene Sitzung, Backend wieder da) lässt die Seite
    // stehen: Die Guards der Routen entscheiden beim Neuaufbau, ob sie zur Anmeldung muss —
    // Board-, Stream-, Sprecher- und Zeitnahme-Anzeigen springen so nicht auf die Startseite.
    const userInitiatedRef = useRef(false)

    const navigate = router.navigate

    useEffect(() => {
        const f = async (res: Response, req: Request) => {
            // Der Zustand kommt aus der Ref: Die Closure dieses einmal registrierten Interceptors
            // sah sonst für immer den Stand des ersten Renders ('initial'), und eine abgelaufene
            // Sitzung wurde nie abgemeldet.
            if (isSessionRejection(res.status, req.headers)) {
                const current = userDataRef.current
                if (current.authStatus === 'authenticated' && !loggingOutRef.current) {
                    loggingOutRef.current = true
                    void logoutRef.current(current.isInApp)
                }
            } else if (res.ok) {
                // Beide Sitzungen liegen inzwischen mit Gleitfrist in localStorage, also schiebt
                // jede erfolgreiche Antwort beide Fristen nach vorn - auch die der jeweils
                // anderen Oberfläche im selben Browserprofil. Deren Frist kann dadurch dem
                // Server vorauslaufen; das kostet aber nur den 401-Umweg, den die Frist sonst
                // spart: Über die Gültigkeit entscheidet weiterhin allein der Server.
                touchSessionToken()
            }
            return res
        }

        client.interceptors.response.use(f)
        return () => client.interceptors.response.eject(f)
    }, [])

    useEffect(() => {
        if (userData.authStatus !== 'authenticated') {
            loggingOutRef.current = false
        }
    }, [userData.authStatus])

    const prevAuthStatus = React.useRef<'initial' | 'anonymous' | 'authenticated'>('initial')

    useEffect(() => {
        if (userData.authStatus !== 'initial') {
            if (userData.authStatus !== 'pending') {
                const authenticated = userData.authStatus === 'authenticated'
                const onLoginPage = isLoginPath(
                    router.state.resolvedLocation.pathname,
                    router.basepath,
                )
                if (
                    prevAuthStatus.current !== 'initial' &&
                    (authenticated || prevAuthStatus.current === 'authenticated') &&
                    (userInitiatedRef.current || (authenticated && onLoginPage))
                ) {
                    if (userData.isInApp) {
                        navigate({to: authenticated ? '/app' : '/app/login'})
                    } else {
                        const redirect = router.state.resolvedLocation.search.redirect
                        navigate({to: authenticated ? (redirect ? redirect : '/dashboard') : '/'})
                    }
                }
                userInitiatedRef.current = false
                prevAuthStatus.current = userData.authStatus
            } else {
                if (userData.userInfo && userData.token) {
                    setUserData({
                        userInfo: userData.userInfo,
                        token: userData.token,
                        isInApp: userData.isInApp,
                        authStatus: 'authenticated',
                    })
                } else if (!userData.userInfo && !userData.token) {
                    setUserData(prevState => ({
                        userInfo: undefined,
                        token: null,
                        isInApp: prevState.isInApp,
                        authStatus: 'anonymous',
                    }))
                }
            }
        }
        if (userData.token) {
            const f = async (req: Request) => {
                req.headers.set('X-Api-Session', JSON.stringify({token: userData.token}))
                return req
            }

            client.interceptors.request.use(f)
            return () => client.interceptors.request.eject(f)
        }
    }, [userData])

    const connectionFailed = (detail: string) => {
        setConnection(prev => ({attempt: prev === null ? 0 : prev.attempt + 1, detail}))
        // Anzeige-Routen zeigen keine Panikseite (bei OBS stünde sie im Stream), sondern laufen
        // anonym weiter; viele authentifizieren sich ohnehin per Geräte-Token. Kommt das Backend
        // zurück, meldet der nächste Versuch die Sitzung wieder an.
        if (isDisplayPath(router.state.resolvedLocation.pathname, router.basepath)) {
            setUserData(prev =>
                prev.authStatus === 'initial'
                    ? prev.token === null
                        ? {
                              userInfo: undefined,
                              token: null,
                              isInApp: prev.isInApp,
                              authStatus: 'anonymous',
                          }
                        : {
                              userInfo: undefined,
                              token: prev.token,
                              isInApp: prev.isInApp,
                              authStatus: 'anonymous',
                          }
                    : prev,
            )
        }
    }

    const loginCheck = useFetch(signal => checkUserLogin({signal}), {
        onResponse: ({data, response}) => {
            const outcome = classifyLoginCheck(response.status, data !== undefined)
            if (outcome === 'authenticated' && data !== undefined) {
                setConnection(null)
                setAuth(data, undefined, userDataRef.current.isInApp)
            } else if (outcome === 'anonymous') {
                // Nur hier darf der Token vom Gerät: Der Server kennt die Sitzung nicht. Ein 502
                // während eines Backend-Neustarts sagt darüber nichts (siehe `classifyLoginCheck`).
                setConnection(null)
                clearSessionToken(userDataRef.current.isInApp)
                setUserData(prevState =>
                    prevState.authStatus === 'anonymous'
                        ? {
                              userInfo: undefined,
                              token: null,
                              isInApp: prevState.isInApp,
                              authStatus: 'anonymous',
                          }
                        : {
                              userInfo: undefined,
                              token: null,
                              isInApp: prevState.isInApp,
                              authStatus: 'pending',
                          },
                )
            } else {
                connectionFailed(`HTTP ${response.status}`)
            }
        },
        onPanic: error => {
            // Kaltstart ohne Netz: Der Aufruf wirft, bevor eine Antwort kommt. Mit gültigem
            // Token und abgelegten Nutzerangaben läuft die App aus dem Bestand weiter, statt
            // die Panikseite zu zeigen - am Steg ist das der Unterschied zwischen brauchbar und
            // unbrauchbar.
            //
            // Nur bei einem TypeError: So und nicht anders meldet fetch einen Fehlschlag auf
            // der Netzebene. Ein Server, der mit Status 200 etwas Kaputtes liefert, wirft einen
            // SyntaxError; der soll nicht vom Bestand aus dem Gerät verdeckt werden. Alles, was
            // hier nicht aus dem Bestand weiterläuft, versucht es mit wachsendem Abstand erneut
            // (siehe `connectionFailed`), statt für immer auf der Panikseite zu stehen.
            const current = userDataRef.current
            const offlineError = error instanceof TypeError
            const offlineUser = offlineError && current.isInApp ? readSessionUser(true) : null
            if (offlineUser !== null && current.token) {
                setConnection(null)
                setUserData({
                    userInfo: offlineUser,
                    token: current.token,
                    isInApp: true,
                    authStatus: 'pending',
                })
                return
            }
            connectionFailed(`${error}`)
        },
    })

    const reloadLoginCheck = loginCheck.reload
    useEffect(() => {
        if (connection === null) return
        const timer = setTimeout(reloadLoginCheck, loginRetryDelayMs(connection.attempt))
        return () => clearTimeout(timer)
    }, [connection, reloadLoginCheck])

    // Kurzer Start ohne Anzeige, langsamer Start mit Ladekreis statt weißer Fläche. Auf
    // Anzeige-Routen bleibt es leer: Bei einer OBS-Quelle stünde der Kreis sonst im Bild.
    useEffect(() => {
        if (userData.authStatus !== 'initial') return
        const timer = setTimeout(() => setSlowStart(true), 400)
        return () => clearTimeout(timer)
    }, [userData.authStatus])

    const setAuth = useCallback((data: LoginDto, headers?: Headers, isInApp: boolean = false) => {
        let token = userDataRef.current.token

        if (headers) {
            const sessionHeader = headers.get('X-Api-Session')
            if (sessionHeader === null) {
                throw Error('Missing header on login response')
            }
            token = (JSON.parse(sessionHeader) as Session).token
            writeSessionToken(token, isInApp)
        }
        if (!token) {
            throw Error('Missing session token on login')
        }
        writeSessionUser(data, isInApp)
        setUserData({
            userInfo: data,
            token,
            isInApp,
            authStatus: 'pending',
        })
    }, [])

    const logout = useCallback(async (isInApp: boolean = false) => {
        // Erst das Gerät räumen, dann den Server benachrichtigen. Ohne Netz wirft `userLogout`,
        // und in der umgekehrten Reihenfolge bliebe auf einem geteilten Tablet alles liegen:
        // ein sechs Stunden gültiger Token, der ganze Privilegiensatz und bis zu zwölf Stunden
        // Dashboard-Daten mit Klarnamen. Ein Abmelden im Funkloch am Steg ist genau der Fall,
        // in dem das passiert.
        clearSessionToken(isInApp)
        clearCachedReads()
        if (isInApp) {
            // Auswahl der Veranstaltung und der Aufgabe liegen seit dem Kaltstart-Fix ebenfalls
            // dauerhaft auf dem Gerät. Auf einem geteilten Tablet soll der Nächste nicht die
            // Auswahl des Vorherigen vorfinden.
            localStorage.removeItem('eventId')
            localStorage.removeItem(LEGACY_APP_FUNCTION_KEY)
            localStorage.removeItem(SCAN_MODE_KEY)
            // Der zuletzt gewählte Wettkampf an der Bedingungs-Station (siehe
            // `ParticipantRequirements`) ist ebenso personenbezogen wie Veranstaltung und Modus.
            localStorage.removeItem(REQUIREMENT_COMPETITION_KEY)
        }
        try {
            await userLogout()
        } catch {
            // Die Sitzung läuft serverseitig von selbst ab. Auf dem Gerät ist sie schon weg.
        }
        setUserData({
            userInfo: undefined,
            isInApp,
            token: null,
            authStatus: 'pending',
        })
    }, [])
    const logoutRef = useRef(logout)
    logoutRef.current = logout

    const changeLanguage = useCallback(async (language: Language) => {
        await i18next.changeLanguage(language)
        setLanguage(language)
    }, [])

    // Was Nutzer selbst auslösen, navigiert anschließend (Dashboard bzw. Startseite).
    const userLogin = useCallback(
        (data: LoginDto, headers?: Headers, isInApp: boolean = false) => {
            userInitiatedRef.current = true
            setAuth(data, headers, isInApp)
        },
        [setAuth],
    )
    const userLogoutAction = useCallback(
        (isInApp: boolean = false) => {
            userInitiatedRef.current = true
            return logout(isInApp)
        },
        [logout],
    )

    // Ein neues Objekt nur, wenn sich wirklich etwas ändert: Jeder `useUser()`-Konsument und der
    // Router-Kontext hängen daran.
    const userValue = useMemo((): User => {
        if (userData.authStatus !== 'authenticated') {
            return {
                language,
                changeLanguage,
                loggedIn: false,
                login: userLogin,
                checkPrivilege: () => false,
                getPrivilegeScope: () => undefined,
            } satisfies AnonymousUser
        }
        const privileges = userData.userInfo.privileges

        const checkPrivilege = (privilege: Privilege): boolean =>
            privileges.some(
                p =>
                    p.action === privilege.action &&
                    p.resource === privilege.resource &&
                    scopeLevel[p.scope] >= scopeLevel[privilege.scope],
            )

        const getPrivilegeScope = (action: Action, resource: Resource): Scope | undefined =>
            privileges
                .filter(p => p.action === action && p.resource === resource)
                .reduce<Scope | undefined>((scope, privilege) => {
                    if (scope === undefined) {
                        return privilege.scope
                    } else {
                        return scopeLevel[scope] >= scopeLevel[privilege.scope]
                            ? scope
                            : privilege.scope
                    }
                }, undefined)

        return {
            language,
            changeLanguage,
            loggedIn: true,
            id: userData.userInfo.id,
            clubId: userData.userInfo.clubId,
            materialProviderId: userData.userInfo.materialProviderId,
            login: userLogin,
            logout: userLogoutAction,
            checkPrivilege,
            getPrivilegeScope,
        } satisfies AuthenticatedUser
    }, [userData, language, changeLanguage, userLogin, userLogoutAction])

    const onDisplayRoute = isDisplayPath(router.state.resolvedLocation.pathname, router.basepath)

    let content: React.ReactNode
    if (connection !== null && userData.authStatus === 'initial') {
        content = (
            <PanicPage retrying onRetry={reloadLoginCheck} retryPending={loginCheck.pending} />
        )
    } else if (userData.authStatus === 'initial') {
        content =
            slowStart && !onDisplayRoute ? (
                <Box sx={{height: '100vh'}}>
                    <Throbber size={40} />
                </Box>
            ) : null
    } else if (userData.authStatus === 'pending') {
        content = null
    } else {
        content = children
    }

    return <UserContext.Provider value={userValue}>{content}</UserContext.Provider>
}

export default UserProvider
