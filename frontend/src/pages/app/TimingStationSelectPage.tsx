import {useEffect} from 'react'
import {useTranslation} from 'react-i18next'
import {useNavigate} from '@tanstack/react-router'
import AppHeader from '@components/qrApp/AppHeader.tsx'
import AppColumn from '@components/qrApp/AppColumn.tsx'
import TimingStationList from '@components/qrApp/TimingStationList.tsx'
import {useAppSession} from '@contexts/app/AppSessionContext.tsx'

/**
 * Die Postenwahl der Zeitnahme-Welt. Die Liste selbst (Posten, Anzeigen, Leitstand, Boote an- und
 * abmelden) steht in `TimingStationList`, weil dieselbe Liste auch auf der Startseite der App
 * steht.
 */
const TimingStationSelectPage = () => {
    const {t} = useTranslation()
    const navigate = useNavigate()
    const {eventId, event, worlds} = useAppSession()

    // `requireAppEvent` im `beforeLoad` der Route sichert die gemerkte Veranstaltung normalerweise
    // schon zu; verschwindet sie danach (siehe `AppSessionProvider`, gegengeprüfte Veranstaltung),
    // bliebe ohne diesen Effekt ein leerer Bildschirm stehen statt zurück zur Weiche zu gehen.
    useEffect(() => {
        if (!eventId) {
            void navigate({to: '/app', replace: true})
        }
    }, [eventId, navigate])
    if (!eventId) return null

    return (
        <AppColumn>
            <AppHeader
                title={t('timing.selectStation')}
                subtitle={event?.name}
                onBack={worlds.length > 1 ? () => void navigate({to: '/app/start'}) : undefined}
                settings
            />
            <TimingStationList heading={t('timing.sections.timing')} />
        </AppColumn>
    )
}

export default TimingStationSelectPage
