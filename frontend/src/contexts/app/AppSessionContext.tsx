import React, {
    createContext,
    PropsWithChildren,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react'
import {useTranslation} from 'react-i18next'
import {useNavigate} from '@tanstack/react-router'
import {EventDto} from '@api/types.gen.ts'
import {getEvents} from '@api/sdk.gen.ts'
import {useUser} from '@contexts/user/UserContext.ts'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import {readCachedRead, writeCachedRead} from '@pwa/readCache.ts'
import {AppWorld, ScanMode, scanRightsOf, worldsOf} from '@components/qrApp/appAccess.ts'
import {
    forgetLegacyAppFunction,
    readRememberedEvent,
    readScanMode,
    writeRememberedEvent,
    writeScanMode,
} from '@components/qrApp/appMemory.ts'

/**
 * Das Gedächtnis der Helfer-App: Veranstaltung, Modus, Veranstaltungsliste und die daraus
 * abgeleiteten Rechte. Kein Navigationszustand mehr — die Adresse trägt, wo man ist, und die
 * Band-ID reist in der Adresse.
 */
export type AppSession = {
    eventId: string | null
    /** Die gemerkte Veranstaltung aus der Liste; fehlt, solange die Liste nicht geladen ist. */
    event: EventDto | undefined
    events: EventDto[] | undefined
    setEventId: (eventId: string) => void
    scanRights: ScanMode[]
    worlds: AppWorld[]
    scanMode: ScanMode | null
    setScanMode: (mode: ScanMode) => void
}

const AppSessionContext = createContext<AppSession | undefined>(undefined)

export const AppSessionProvider: React.FC<PropsWithChildren> = ({children}) => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const user = useUser()
    const navigate = useNavigate()

    const [eventId, setEventIdState] = useState<string | null>(() =>
        readRememberedEvent(localStorage),
    )
    const [events, setEvents] = useState<EventDto[]>()
    // Der Modus liegt im Speicher; dieser Zähler sorgt nur dafür, dass ein Schreiben neu liest.
    const [modeVersion, setModeVersion] = useState(0)

    useEffect(() => {
        forgetLegacyAppFunction(localStorage)
    }, [])

    const userId = user.loggedIn ? user.id : ''
    const scanRights = useMemo(() => scanRightsOf(user.checkPrivilege), [user])
    const worlds = useMemo(() => worldsOf(user.checkPrivilege), [user])

    // Die Veranstaltungsliste kommt beim Start aus dem Bestand, damit die Auswahl ohne Netz nicht
    // leer bleibt. Sie wird überschrieben, sobald ein echter Abruf durchkommt.
    useEffect(() => {
        if (!userId) return
        const cached = readCachedRead<EventDto[]>('events', userId, 'alle')
        if (cached) {
            setEvents(prev => prev ?? cached.payload)
        }
    }, [userId])

    useFetch(signal => getEvents({signal}), {
        onResponse: response => {
            if (response.data) {
                setEvents(response.data.data)
                if (userId) {
                    writeCachedRead('events', userId, 'alle', response.data.data)
                }
            }
            if (response.error) {
                feedback.error(t('common.load.error.multiple.short', {entity: t('event.event')}))
            }
        },
        preCondition: () => user.loggedIn,
        deps: [user.loggedIn],
    })

    const setEventId = useCallback((id: string) => {
        writeRememberedEvent(id, localStorage)
        setEventIdState(id)
    }, [])

    const scanMode = useMemo(
        () => (userId && eventId ? readScanMode(userId, eventId, scanRights, localStorage) : null),
        // modeVersion ist absichtlich dabei: es ist der einzige Anstoß nach einem Schreiben.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [userId, eventId, scanRights, modeVersion],
    )

    const setScanMode = useCallback(
        (mode: ScanMode) => {
            if (!userId || !eventId) return
            writeScanMode(userId, eventId, mode, localStorage)
            setModeVersion(v => v + 1)
        },
        [userId, eventId],
    )

    const event = useMemo(() => events?.find(e => e.id === eventId), [events, eventId])

    // `appEntry.ts` (die Weiche) behandelt „Liste geladen, gemerkte Veranstaltung fehlt darin"
    // schon richtig — aber nur dort, beim erneuten Aufruf der Weiche. Auf jeder anderen Seite
    // navigiert man mit der gemerkten Veranstaltung sofort weg von `/app`, während `events` noch
    // `undefined` ist; kommt die Liste danach an, entscheidet niemand mehr neu. Eine gelöschte
    // oder nicht mehr sichtbare Veranstaltung darf den Helfer nicht in einem Scanner
    // zurücklassen, an dem jedes Band mit „Falsche Veranstaltung" antwortet — deshalb hier, einmal
    // zentral für die ganze App-Welt, zurück zur Weiche, die dann neu entscheidet. Strikt auf
    // `events !== undefined` geprüft: der Offline-Start mit gemerkter Veranstaltung bleibt unberührt.
    useEffect(() => {
        if (events !== undefined && eventId !== null && !events.some(e => e.id === eventId)) {
            void navigate({to: '/app', replace: true})
        }
    }, [events, eventId, navigate])

    return (
        <AppSessionContext.Provider
            value={{eventId, event, events, setEventId, scanRights, worlds, scanMode, setScanMode}}>
            {children}
        </AppSessionContext.Provider>
    )
}

export const useAppSession = (): AppSession => {
    const ctx = useContext(AppSessionContext)
    if (!ctx) throw new Error('AppSessionContext not found')
    return ctx
}
