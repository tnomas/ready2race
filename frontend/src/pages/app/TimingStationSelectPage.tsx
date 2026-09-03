import {useEffect} from 'react'
import {Card, CardActionArea, Chip, Stack, Typography} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {useNavigate} from '@tanstack/react-router'
import {useUser} from '@contexts/user/UserContext.ts'
import {useFetch} from '@utils/hooks.ts'
import {getTimingStations} from '@api/sdk.gen.ts'
import {updateAppCompetitionCheckGlobal, updateEventGlobal} from '@authorization/privileges.ts'
import Throbber from '@components/Throbber.tsx'
import AppHeader from '@components/qrApp/AppHeader.tsx'
import AppColumn from '@components/qrApp/AppColumn.tsx'
import {useAppSession} from '@contexts/app/AppSessionContext.tsx'

const TimingStationSelectPage = () => {
    const {t} = useTranslation()
    const user = useUser()
    const navigate = useNavigate()
    const {eventId, event, worlds, setScanMode} = useAppSession()

    const {data: stations, pending} = useFetch(
        signal => getTimingStations({signal, path: {eventId: eventId ?? ''}}),
        {preCondition: () => eventId !== null, deps: [eventId]},
    )

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
            <Stack spacing={2} sx={{width: 1}}>
                <Typography variant="subtitle2" color="text.secondary">
                    {t('timing.sections.timing')}
                </Typography>
                {stations?.map(station => (
                    <Card key={station.id} sx={{minHeight: 96, width: 1}}>
                        <CardActionArea
                            onClick={() =>
                                void navigate({
                                    to: '/app/timing/$stationId',
                                    params: {stationId: station.id},
                                })
                            }
                            sx={{
                                height: 1,
                                minHeight: 96,
                                display: 'flex',
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                px: 3,
                                py: 2,
                            }}>
                            <Typography variant="h6">{station.name}</Typography>
                            <Chip
                                label={t(`timing.station.types.${station.type}`)}
                                color="primary"
                            />
                        </CardActionArea>
                    </Card>
                ))}
                {(user.checkPrivilege(updateEventGlobal) ||
                    user.checkPrivilege(updateAppCompetitionCheckGlobal)) && (
                    <Typography variant="subtitle2" color="text.secondary" sx={{mt: 2}}>
                        {t('timing.sections.other')}
                    </Typography>
                )}
                {/* Der Leitstand ist kein Posten: Er ist der Schreibtisch über allen und schreibt in
                    die Ergebnisse der Veranstaltung — daher das strengere Recht als bei den
                    Erfassungsboards darüber. */}
                {user.checkPrivilege(updateEventGlobal) && (
                    <Card sx={{minHeight: 96, width: 1}}>
                        <CardActionArea
                            onClick={() => void navigate({to: '/app/timing/leitstand'})}
                            sx={{
                                height: 1,
                                minHeight: 96,
                                display: 'flex',
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                px: 3,
                                py: 2,
                            }}>
                            <Typography variant="h6">{t('timing.leitstand.title')}</Typography>
                            <Chip label={t('timing.leitstand.entryHint')} color="secondary" />
                        </CardActionArea>
                    </Card>
                )}
                {/* Schiedsrichter ist ebenfalls kein Posten: Die Karte setzt den Stationsmodus auf
                    das An- und Abmelden der Boote und wechselt in die Scan-Welt. */}
                {user.checkPrivilege(updateAppCompetitionCheckGlobal) && (
                    <Card sx={{minHeight: 96, width: 1}}>
                        <CardActionArea
                            onClick={() => {
                                setScanMode('APP_COMPETITION_CHECK')
                                void navigate({to: '/app/scan'})
                            }}
                            sx={{
                                height: 1,
                                minHeight: 96,
                                display: 'flex',
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                px: 3,
                                py: 2,
                            }}>
                            <Typography variant="h6">{t('timing.referee.title')}</Typography>
                            <Chip label={t('app.mode.APP_COMPETITION_CHECK')} color="secondary" />
                        </CardActionArea>
                    </Card>
                )}
                {pending && <Throbber />}
            </Stack>
        </AppColumn>
    )
}

export default TimingStationSelectPage
