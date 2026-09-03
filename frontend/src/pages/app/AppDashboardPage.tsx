import {useEffect} from 'react'
import {useNavigate} from '@tanstack/react-router'
import {useAppSession} from '@contexts/app/AppSessionContext.tsx'
import LiveDashboardPage from '../event/LiveDashboardPage.tsx'

/**
 * Dasselbe Dashboard wie in der Verwaltungsoberfläche, nur im App-Layout.
 * Die Veranstaltung kommt aus dem Gedächtnis der App statt aus der Route.
 */
const AppDashboardPage = () => {
    const {eventId} = useAppSession()
    const navigate = useNavigate()

    // `requireAppEvent` im `beforeLoad` der Route sichert die gemerkte Veranstaltung normalerweise
    // schon zu; verschwindet sie danach (siehe `AppSessionProvider`, gegengeprüfte Veranstaltung),
    // bliebe ohne diesen Effekt ein leerer Bildschirm stehen statt zurück zur Weiche zu gehen.
    useEffect(() => {
        if (!eventId) {
            void navigate({to: '/app', replace: true})
        }
    }, [eventId, navigate])
    if (!eventId) return null

    // Kein eigener Titel darüber: das Dashboard zeigt seinen Titel selbst, ein zweiter
    // verschwendete nur Platz. Der Zurück-Pfeil wandert per `onBack` in die Dashboard-Kopfzeile —
    // nötig bleibt er, weil in der installierten PWA (standalone, ohne Browser-Leiste) der
    // Browser-Zurück-Knopf fehlt und man sonst im Dashboard festsäße (beobachtet am 10.08.2026).
    // `cacheReads` nur hier: Der zuletzt geladene Stand gehört aufs Telefon am Steg, nicht in den
    // Speicher eines Arbeitsplatzrechners.
    return (
        <LiveDashboardPage
            eventId={eventId}
            cacheReads
            onBack={() => void navigate({to: '/app'})}
        />
    )
}

export default AppDashboardPage
