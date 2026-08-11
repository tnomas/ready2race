import {Alert, Box, Button, Divider, Stack, Typography} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {useAppSession} from '@contexts/app/AppSessionContext'
import {getUserAppRights} from '@components/qrApp/common.ts'
import LogoutIcon from '@mui/icons-material/Logout'
import {useUser} from '@contexts/user/UserContext.ts'
import {useEffect, useMemo, useRef, useState} from 'react'
import {EventDto} from '@api/types.gen.ts'
import {parseEventDay, splitEventsByOperation} from '@components/qrApp/eventOperations.ts'

/**
 * Die Wahl der Veranstaltung — der erste Schritt in der Helfer-App.
 *
 * Bis zum 11.08.2026 standen hier alle jemals angelegten Veranstaltungen als gleich aussehende
 * Knöpfe, nur mit dem Namen. Prompt wurde bei der Bandvergabe die Regatta von 2025 erwischt, und
 * weil die Wahl danach in der App-Sitzung sitzt, galt sie für jede weitere Zuordnung mit. Deshalb
 * steht oben nur noch, was gerade im Betrieb ist; alles Übrige liegt hinter einem zweiten Griff.
 */
const QrEventsPage = () => {
    const {t} = useTranslation()
    const {events, eventId, setEventId, navigateTo, setAppFunction} = useAppSession()
    const user = useUser()
    const availableAppFunctions = getUserAppRights(user)

    const [showAll, setShowAll] = useState(false)

    // Die Uhr wird einmal beim Öffnen gelesen und nicht bei jedem Rendern: Sonst könnte die Liste
    // unter dem Finger umspringen, während jemand zielt.
    const now = useMemo(() => new Date(), [])
    const {operating, others} = useMemo(
        () => splitEventsByOperation(events ?? [], now),
        [events, now],
    )

    // Ob beim Öffnen schon eine Veranstaltung gewählt war, wird einmal festgehalten: `setEventId`
    // unten ändert den Wert sofort, und ohne diesen Merker hinge das Überspringen an seiner
    // eigenen Wirkung.
    const hadEvent = useRef(eventId !== '')

    // Das automatische Weiterspringen darf genau einmal greifen. Ohne diese Sperre trüge ein
    // erneutes Rendern (etwa nach dem Nachladen der Liste) die Person ein zweites Mal weiter.
    const skipped = useRef(false)

    useEffect(() => {
        // Nur bei genau einer laufenden Veranstaltung überspringen — früher genügte dafür eine
        // einzige Veranstaltung überhaupt, und dann landete man auch in einer längst vergangenen.
        //
        // Und nur beim allerersten Mal: Wer über "Event wechseln" hierherkommt, hat bereits eine
        // Veranstaltung und will genau diese Liste sehen. Ohne diese Bedingung spränge die Seite
        // ihm sofort wieder vor der Nase weg, und die vollständige Liste wäre unerreichbar.
        if (!skipped.current && !hadEvent.current && operating.length === 1) {
            skipped.current = true
            setEventId(operating[0].id)
            goForward(true)
        }
    }, [operating])

    function goForward(replace: boolean = false) {
        if (availableAppFunctions.length === 1) {
            setAppFunction(availableAppFunctions[0])
            navigateTo('APP_Scanner', replace)
        } else {
            navigateTo('APP_Function_Select', replace)
        }
    }

    const dateRange = (event: EventDto) => {
        const from = event.firstEventDay ? parseEventDay(event.firstEventDay) : null
        if (from === null) return t('qrEvents.noDays')
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
                goForward()
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

    if (!events) return null

    // Läuft nichts, ist die volle Liste der einzige Weg — dann aber als bewusster Griff mit
    // Hinweis, damit niemand ahnungslos in eine alte Regatta tippt.
    const showList = showAll || operating.length === 0

    return (
        <Box sx={{width: 1, maxWidth: 600}}>
            <Stack spacing={2} sx={{width: 1}}>
                <Typography variant="h4" textAlign="center" gutterBottom>
                    {t('qrEvents.title')}
                </Typography>

                {operating.length > 0 && (
                    <>
                        <Typography variant="overline" color="text.secondary">
                            {t('qrEvents.operating')}
                        </Typography>
                        {operating.map(event => eventButton(event, true))}
                    </>
                )}

                {operating.length === 0 && (
                    <Alert severity="info">
                        {t('qrEvents.none')}
                        <br />
                        {t('qrEvents.noneHint')}
                    </Alert>
                )}

                {!showList && (
                    <Button onClick={() => setShowAll(true)} variant="text" fullWidth>
                        {t('qrEvents.showAll')}
                    </Button>
                )}

                {showList && others.length > 0 && (
                    <>
                        <Divider />
                        <Typography variant="overline" color="text.secondary">
                            {t('qrEvents.all')}
                        </Typography>
                        {others.map(event => eventButton(event, false))}
                    </>
                )}

                <Button
                    onClick={() => 'logout' in user && user.logout(true)}
                    variant="outlined"
                    startIcon={<LogoutIcon />}
                    fullWidth
                    sx={{mt: 4}}>
                    {t('user.settings.logout')}
                </Button>
            </Stack>
        </Box>
    )
}

export default QrEventsPage
