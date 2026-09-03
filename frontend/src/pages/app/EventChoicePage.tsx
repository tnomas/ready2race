import {Alert, Button, Divider, Stack, Typography} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {useMemo, useState} from 'react'
import {useNavigate} from '@tanstack/react-router'
import LogoutIcon from '@mui/icons-material/Logout'
import {EventDto} from '@api/types.gen.ts'
import {useUser} from '@contexts/user/UserContext.ts'
import {useAppSession} from '@contexts/app/AppSessionContext.tsx'
import AppHeader from '@components/qrApp/AppHeader.tsx'
import AppColumn from '@components/qrApp/AppColumn.tsx'
import {parseEventDay, splitEventsByOperation} from '@components/qrApp/eventOperations.ts'
import Throbber from '@components/Throbber.tsx'

/**
 * Die Wahl der Veranstaltung.
 *
 * Bis zum 11.08.2026 standen hier alle jemals angelegten Veranstaltungen als gleich aussehende
 * Knöpfe, nur mit dem Namen. Prompt wurde bei der Bandvergabe die Regatta von 2025 erwischt, und
 * weil die Wahl danach im Gedächtnis der App sitzt, galt sie für jede weitere Zuordnung mit.
 * Deshalb steht oben nur noch, was gerade im Betrieb ist; alles Übrige liegt hinter einem zweiten
 * Griff.
 */
const EventChoicePage = () => {
    const {t} = useTranslation()
    const {events, eventId, setEventId} = useAppSession()
    const user = useUser()
    const navigate = useNavigate()

    const [showAll, setShowAll] = useState(false)

    // Die Uhr wird einmal beim Öffnen gelesen und nicht bei jedem Rendern: Sonst könnte die Liste
    // unter dem Finger umspringen, während jemand zielt.
    const now = useMemo(() => new Date(), [])
    const {operating, others} = useMemo(
        () => splitEventsByOperation(events ?? [], now),
        [events, now],
    )

    const dateRange = (event: EventDto) => {
        const from = event.firstEventDay ? parseEventDay(event.firstEventDay) : null
        if (from === null) return t('app.event.noDays')
        const to = event.lastEventDay ? parseEventDay(event.lastEventDay) : null
        const short = (d: Date) =>
            d.toLocaleDateString(undefined, {day: '2-digit', month: '2-digit'})
        // Das Jahr steht immer am Ende — es ist der Unterschied, um den es hier geht.
        const full = (d: Date) =>
            d.toLocaleDateString(undefined, {day: '2-digit', month: '2-digit', year: 'numeric'})
        return to && to.getTime() !== from.getTime() ? `${short(from)} – ${full(to)}` : full(from)
    }

    const eventButton = (event: EventDto, highlighted: boolean) => (
        <Button
            key={event.id}
            onClick={() => {
                setEventId(event.id)
                void navigate({to: '/app', replace: true})
            }}
            fullWidth
            variant={highlighted ? 'contained' : 'outlined'}
            color="primary"
            sx={{flexDirection: 'column', alignItems: 'stretch', py: 1.25, textTransform: 'none'}}>
            <Typography sx={{fontWeight: 700}}>{event.name}</Typography>
            {/* Das Datum ist der einzige Unterschied zwischen "Coastal-Regatta 2025" und
                "Coastal-Regatta 2026" — es gehört an jeden Knopf, nicht nur in die volle Liste. */}
            <Typography variant="body2" sx={{opacity: 0.85}}>
                {dateRange(event)}
            </Typography>
        </Button>
    )

    // Läuft nichts, ist die volle Liste der einzige Weg — dann aber als bewusster Griff mit
    // Hinweis, damit niemand ahnungslos in eine alte Regatta tippt.
    const showList = showAll || operating.length === 0

    return (
        <AppColumn>
            <AppHeader
                title={t('app.event.title')}
                onBack={eventId ? () => void navigate({to: '/app'}) : undefined}
            />
            <Stack spacing={2} sx={{width: 1}}>
                {/* Nur die Liste wartet, nicht die ganze Seite: Scheitert der Abruf, bleibt
                    `events` für immer leer — und ohne Kopfzeile und Abmelden-Knopf käme man aus
                    der installierten App (keine Browser-Leiste) nur noch durch Beenden heraus. */}
                {!events && <Throbber />}

                {events && operating.length > 0 && (
                    <>
                        <Typography variant="overline" color="text.secondary">
                            {t('qrEvents.operating')}
                        </Typography>
                        {operating.map(event => eventButton(event, true))}
                    </>
                )}

                {events && operating.length === 0 && (
                    <Alert severity="info">
                        {t('qrEvents.none')}
                        <br />
                        {t('qrEvents.noneHint')}
                    </Alert>
                )}

                {events && !showList && (
                    <Button onClick={() => setShowAll(true)} variant="text" fullWidth>
                        {t('qrEvents.showAll')}
                    </Button>
                )}

                {events && showList && others.length > 0 && (
                    <>
                        <Divider />
                        <Typography variant="overline" color="text.secondary">
                            {t('qrEvents.all')}
                        </Typography>
                        {others.map(event => eventButton(event, false))}
                    </>
                )}

                {/* Der Abmelden-Knopf bleibt hier: Ohne Veranstaltung sind die Einstellungen
                    nicht erreichbar, und dann gäbe es keinen Weg aus einem falschen Konto. */}
                <Button
                    onClick={() => 'logout' in user && user.logout(true)}
                    variant="outlined"
                    startIcon={<LogoutIcon />}
                    fullWidth
                    sx={{mt: 4}}>
                    {t('user.settings.logout')}
                </Button>
            </Stack>
        </AppColumn>
    )
}

export default EventChoicePage
