import {useMemo} from 'react'
import {Stack, Typography} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {useNavigate} from '@tanstack/react-router'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import TimerIcon from '@mui/icons-material/Timer'
import SportsScoreIcon from '@mui/icons-material/SportsScore'
import TvIcon from '@mui/icons-material/Tv'
import SpaceDashboardIcon from '@mui/icons-material/SpaceDashboard'
import HowToRegIcon from '@mui/icons-material/HowToReg'
import PlaceIcon from '@mui/icons-material/Place'
import {TimingStationDto, TimingStationType} from '@api/types.gen.ts'
import {getTimingStations} from '@api/sdk.gen.ts'
import {useFetch} from '@utils/hooks.ts'
import {useUser} from '@contexts/user/UserContext.ts'
import {useAppSession} from '@contexts/app/AppSessionContext.tsx'
import {updateAppCompetitionCheckGlobal, updateEventGlobal} from '@authorization/privileges.ts'
import {EmptyState, ErrorState} from '@components/ui'
import Throbber from '@components/Throbber.tsx'
import AppEntryCard from './AppEntryCard.tsx'
import {readLastStation, splitStationEntries, writeLastStation} from './timingStationEntries.ts'

const TYPE_ICONS: Record<TimingStationType, typeof TimerIcon> = {
    START: PlayArrowIcon,
    SPLIT: TimerIcon,
    FINISH: SportsScoreIcon,
    ANZEIGE: TvIcon,
}

/** Überschrift einer Gruppe in der Postenliste. */
export const AppListHeading = ({children}: {children: string}) => (
    <Typography variant="overline" color="text.secondary" component="h2" sx={{lineHeight: 2}}>
        {children}
    </Typography>
)

type Props = {
    /** Überschrift über den Erfassungsposten; ohne sie stehen die Posten direkt da. */
    heading?: string
}

/**
 * Die Posten der Veranstaltung als Arbeitsplätze der Helfer-App: erst die Erfassungsposten (Start,
 * Zwischenzeit, Ziel), dann alles, was kein Posten zum Erfassen ist (Anzeigen, Leitstand,
 * Boote an- und abmelden). Steht auf der Postenwahl und – damit der eigene Posten mit einem Tipp
 * erreichbar ist – direkt auf der Startseite der App.
 *
 * Der zuletzt an diesem Gerät gewählte Posten ist hervorgehoben, wird aber nie von selbst geöffnet.
 */
const TimingStationList = ({heading}: Props) => {
    const {t} = useTranslation()
    const user = useUser()
    const navigate = useNavigate()
    const {eventId, setScanMode} = useAppSession()

    const {data, pending, error, reload} = useFetch(
        signal => getTimingStations({signal, path: {eventId: eventId ?? ''}}),
        {preCondition: () => eventId !== null, deps: [eventId]},
    )

    const lastStation = useMemo(
        () => (eventId !== null ? readLastStation(eventId, localStorage) : null),
        [eventId],
    )
    const {capture, displays} = useMemo(() => splitStationEntries(data ?? []), [data])

    const mayLeitstand = user.checkPrivilege(updateEventGlobal)
    const mayReferee = user.checkPrivilege(updateAppCompetitionCheckGlobal)

    const openStation = (station: TimingStationDto) => {
        if (eventId !== null) writeLastStation(eventId, station.id, localStorage)
        void navigate({to: '/app/timing/$stationId', params: {stationId: station.id}})
    }

    const stationCard = (station: TimingStationDto) => {
        const Icon = TYPE_ICONS[station.type] ?? PlaceIcon
        const last = station.id === lastStation
        return (
            <AppEntryCard
                key={station.id}
                icon={<Icon />}
                title={station.name}
                description={t(`timing.station.types.${station.type}`)}
                badge={last ? t('app.stations.lastUsed') : undefined}
                highlighted={last}
                onClick={() => openStation(station)}
            />
        )
    }

    const loaded = data !== null && data !== undefined
    const showOther = displays.length > 0 || mayLeitstand || mayReferee

    return (
        <Stack spacing={1.5} sx={{width: 1}}>
            {heading && <AppListHeading>{heading}</AppListHeading>}
            {!loaded && pending && <Throbber />}
            {!loaded && !pending && error && (
                <ErrorState message={t('app.stations.loadError')} onRetry={reload} dense />
            )}
            {loaded && capture.length === 0 && displays.length === 0 && (
                <EmptyState
                    icon={<PlaceIcon />}
                    title={t('app.stations.empty')}
                    description={t('app.stations.emptyHint')}
                    dense
                />
            )}
            {capture.map(stationCard)}

            {showOther && (
                <>
                    <AppListHeading>{t('timing.sections.other')}</AppListHeading>
                    {displays.map(stationCard)}
                    {/* Der Leitstand ist kein Posten: Er ist der Schreibtisch über allen und
                        schreibt in die Ergebnisse der Veranstaltung — daher das strengere Recht als
                        bei den Erfassungsposten. */}
                    {mayLeitstand && (
                        <AppEntryCard
                            icon={<SpaceDashboardIcon />}
                            title={t('timing.leitstand.title')}
                            description={t('timing.leitstand.entryHint')}
                            onClick={() => void navigate({to: '/app/timing/leitstand'})}
                        />
                    )}
                    {/* Schiedsrichter ist ebenfalls kein Posten: Der Eintrag setzt den
                        Stationsmodus auf das An- und Abmelden der Boote und wechselt in die
                        Scan-Welt. */}
                    {mayReferee && (
                        <AppEntryCard
                            icon={<HowToRegIcon />}
                            title={t('timing.referee.title')}
                            description={t('app.mode.APP_COMPETITION_CHECK')}
                            onClick={() => {
                                setScanMode('APP_COMPETITION_CHECK')
                                void navigate({to: '/app/scan'})
                            }}
                        />
                    )}
                </>
            )}
        </Stack>
    )
}

export default TimingStationList
