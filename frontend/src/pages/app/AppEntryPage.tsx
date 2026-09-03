import {useEffect, useMemo} from 'react'
import {useNavigate} from '@tanstack/react-router'
import {Box, Button} from '@mui/material'
import {useTranslation} from 'react-i18next'
import Throbber from '@components/Throbber.tsx'
import {useAppSession} from '@contexts/app/AppSessionContext.tsx'
import {useUser} from '@contexts/user/UserContext.ts'
import {resolveEntry} from '@components/qrApp/appEntry.ts'

/** Die Weiche hinter `/app`: entscheidet und leitet um, zeigt selbst nie etwas außer Warten. */
const AppEntryPage = () => {
    const {worlds, eventId, events, setEventId} = useAppSession()
    const navigate = useNavigate()
    const {t} = useTranslation()
    const user = useUser()
    // Einmal beim Öffnen gelesen, damit die Entscheidung nicht unter dem Finger kippt.
    const now = useMemo(() => new Date(), [])

    const decision = useMemo(
        () => resolveEntry({worlds, eventId, events, now}),
        [worlds, eventId, events, now],
    )

    useEffect(() => {
        switch (decision.kind) {
            case 'WAIT':
                return
            case 'FORBIDDEN':
                void navigate({to: '/app/forbidden', replace: true})
                return
            case 'CHOOSE_EVENT':
                void navigate({to: '/app/veranstaltung', replace: true})
                return
            case 'ADOPT_EVENT':
                // Das Setzen ändert eventId, der nächste Durchlauf landet bei GO.
                setEventId(decision.eventId)
                return
            case 'GO':
                void navigate({to: decision.to, replace: true})
                return
        }
    }, [decision, navigate, setEventId])

    return (
        <Box sx={{flex: 1, width: 1, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
            <Box sx={{flex: 1, width: 1}}>
                <Throbber />
            </Box>
            {/* Ohne Bestand hängt WAIT für immer hier - schlägt getEvents in der installierten App
                fehl, bliebe sonst kein Weg zurück außer dem Beenden der App. */}
            <Button variant="outlined" onClick={() => 'logout' in user && user.logout(true)}>
                {t('user.settings.logout')}
            </Button>
        </Box>
    )
}

export default AppEntryPage
