import {ComponentType, lazy, useEffect} from 'react'
import {
    createRootRouteWithContext,
    createRoute,
    createRouter,
    lazyRouteComponent,
    ParsedLocation,
    redirect,
    SearchSchemaInput,
    useNavigate,
} from '@tanstack/react-router'
import {AuthenticatedUser, User} from './contexts/user/UserContext.ts'
import {Action, Privilege, Resource, Scope} from './api'
import {
    readInvoiceGlobal,
    readAdministrationConfigGlobal,
    readEventGlobal,
    readRoleGlobal,
    readUserGlobal,
    updateAppTimingGlobal,
    updateEventGlobal,
    readLiveDashboardGlobal,
    readStreamGlobal,
} from './authorization/privileges.ts'
import {
    deviceSessionForEvent,
    deviceSessionForStation,
    readTokenFromLocation,
    writeDeviceSession,
} from './utils/timing/deviceSession.ts'
import {writeBoardDeviceToken} from './utils/board/deviceToken.ts'
import {writeStreamSceneDeviceToken} from './utils/stream/sceneToken.ts'
import {
    validateAdministrationSearch,
    validateEventIndexSearch,
} from './utils/navigation/searchParams.ts'
import {validateCompetitionSearch} from './pages/event/competitionPageLogic.ts'
import type {ClubTab} from './pages/club/ClubsPage.tsx'
import {validateConfigurationSearch} from './pages/configurationPageLogic.ts'
import {readRememberedEvent} from './components/qrApp/appMemory.ts'
import {scanRightsOf} from './components/qrApp/appAccess.ts'
import {parseResultsTabSearch} from './pages/results/resultsTab.ts'
import {Outlet} from '@tanstack/react-router'
import {i18nReady} from './i18n/config.ts'
import {loadChunk} from './utils/chunkReload.ts'
import NotFoundPage from './pages/NotFoundPage.tsx'
import RouteErrorPage, {
    DisplayRouteError,
    RoutePending,
    SilentRouteError,
} from './pages/RouteErrorPage.tsx'

// --- Code-Splitting ---------------------------------------------------------------------------
//
// Jede Seite und jedes Layout ist ein eigenes Stück, das erst geladen wird, wenn seine Route
// gebraucht wird: Eine OBS-Quelle oder ein Board lädt so nicht die Verwaltung mit, und pdf.js,
// Kalender, dnd-kit und QR-Scanner landen nur in den Stücken der Seiten, die sie verwenden. Der
// Router lädt die Stücke aller getroffenen Routen parallel zu `beforeLoad`/`loader`; bis dahin
// zeigt er `RoutePending`. Nach einem Deployment fehlende alte Stücke fängt `loadChunk` ab
// (einmaliges Neuladen mit Schleifenschutz, siehe utils/chunkReload.ts).

const lazyPage = <T extends {default: unknown}>(importer: () => Promise<T>) =>
    lazyRouteComponent(() => loadChunk(importer))

// Seiten, die eine Routen-Hülle mit Props versorgt (Parameter, Rückwege): React.lazy plus
// `preload`. `withPreload` reicht das an die Hülle weiter, damit der Router das Stück trotzdem
// schon während `beforeLoad` holt statt erst beim Rendern.
type Preloadable = {preload: () => Promise<unknown>}

const lazyWithPreload = <P extends object>(
    importer: () => Promise<{default: ComponentType<P>}>,
) => {
    const load = () => loadChunk(importer)
    return Object.assign(lazy(load), {preload: load})
}

const withPreload = <C extends object>(page: Preloadable, component: C) =>
    Object.assign(component, {preload: () => page.preload().then(() => undefined)})

// Die Konstanten unten sind Komponenten in einer Datei, die auch Routen exportiert. Fast Refresh
// lädt routes.tsx deshalb ohnehin komplett neu; die Seiten selbst bleiben HMR-fähig.
/* eslint-disable react-refresh/only-export-components */
const RootLayout = lazyPage(() => import('./layouts/RootLayout.tsx'))
const LoginPage = lazyPage(() => import('./pages/user/LoginPage.tsx'))
const UsersPage = lazyPage(() => import('./pages/user/UsersPage.tsx'))
const UserPage = lazyPage(() => import('./pages/user/UserPage.tsx'))
const RolesPage = lazyPage(() => import('./pages/user/RolesPage.tsx'))
const EventsPage = lazyPage(() => import('./pages/event/EventsPage.tsx'))
const EventPage = lazyPage(() => import('./pages/event/EventPage.tsx'))
const CompetitionPage = lazyPage(() => import('./pages/event/CompetitionPage.tsx'))
const EventDayPage = lazyPage(() => import('./pages/event/EventDayPage.tsx'))
const EventInfoPage = lazyPage(() => import('./pages/event/EventInfoPage.tsx'))
const EventStreamScenesPage = lazyPage(() => import('./pages/event/EventStreamScenesPage.tsx'))
const AthleteBoardPage = lazyPage(() => import('./pages/event/AthleteBoardPage.tsx'))
const BoardDisplayPage = lazyPage(() => import('./pages/event/BoardDisplayPage.tsx'))
const StreamScenePage = lazyPage(() => import('./pages/event/StreamScenePage.tsx'))
const StreamDirectorPage = lazyWithPreload(() => import('./pages/event/StreamDirectorPage.tsx'))
const LiveDashboardPage = lazyWithPreload(() => import('./pages/event/LiveDashboardPage.tsx'))
const RegistrationPage = lazyPage(() => import('./pages/user/RegistrationPage.tsx'))
const ResetPasswordPage = lazyPage(() => import('./pages/user/resetPassword/ResetPasswordPage.tsx'))
const InitResetPasswordPage = lazyPage(
    () => import('./pages/user/resetPassword/InitResetPasswordPage.tsx'),
)
const VerifyRegistrationPage = lazyPage(() => import('./pages/user/VerifyRegistrationPage.tsx'))
const ClubsPage = lazyPage(() => import('./pages/club/ClubsPage.tsx'))
const ClubPage = lazyPage(() => import('./pages/club/ClubPage.tsx'))
const EventRegistrationCreatePage = lazyPage(
    () => import('./pages/eventRegistration/EventRegistrationCreatePage.tsx'),
)
const ConfigurationPage = lazyPage(() => import('./pages/ConfigurationPage.tsx'))
const AcceptInvitationPage = lazyPage(() => import('./pages/user/AcceptInvitationPage.tsx'))
const Dashboard = lazyPage(() => import('./pages/Dashboard.tsx'))
const LandingPage = lazyPage(() => import('./pages/LandingPage.tsx'))
const AppLayout = lazyPage(() => import('./layouts/AppLayout.tsx'))
const AppLoginPage = lazyPage(() => import('./pages/app/AppLoginPage.tsx'))
const AppEntryPage = lazyPage(() => import('./pages/app/AppEntryPage.tsx'))
const EventChoicePage = lazyPage(() => import('./pages/app/EventChoicePage.tsx'))
const WorldsPage = lazyPage(() => import('./pages/app/WorldsPage.tsx'))
const ScanPage = lazyPage(() => import('./pages/app/ScanPage.tsx'))
const ScanResultPage = lazyPage(() => import('./pages/app/ScanResultPage.tsx'))
const SettingsPage = lazyPage(() => import('./pages/app/SettingsPage.tsx'))
const ForbiddenPage = lazyPage(() => import('./pages/app/ForbiddenPage.tsx'))
const AppDashboardPage = lazyPage(() => import('./pages/app/AppDashboardPage.tsx'))
const EventRegistrationPage = lazyPage(
    () => import('./pages/eventRegistration/EventRegistrationPage.tsx'),
)
const InvoicesPage = lazyPage(() => import('./pages/InvoicePage.tsx'))
const ResultsPage = lazyPage(() => import('./pages/results/ResultsPage.tsx'))
const SelectResultsEventPage = lazyPage(() => import('./pages/results/SelectResultsEventPage.tsx'))
const ResultsQrCodePage = lazyPage(() => import('./pages/results/ResultsQrCodePage.tsx'))
const ResultsLayout = lazyPage(() => import('./layouts/ResultsLayout.tsx'))
const AdministrationPage = lazyPage(() => import('./pages/AdministrationPage.tsx'))
const ChallengePage = lazyPage(() => import('./pages/challenge/ChallengePage.tsx'))
const TimingStationSelectPage = lazyPage(() => import('./pages/app/TimingStationSelectPage.tsx'))
const TimingBoardPage = lazyWithPreload(() => import('./pages/app/TimingBoardPage.tsx'))
const TimingLeitstandPage = lazyWithPreload(() => import('./pages/app/TimingLeitstandPage.tsx'))
const TimingStartDisplayPage = lazyWithPreload(
    () => import('./pages/app/TimingStartDisplayPage.tsx'),
)
const SpeakerBoardPage = lazyPage(() => import('./pages/speaker/SpeakerBoardPage.tsx'))
const SelectSpeakerEventPage = lazyPage(() => import('./pages/speaker/SelectSpeakerEventPage.tsx'))
/* eslint-enable react-refresh/only-export-components */

const checkAuth = (context: User, location: ParsedLocation, privilege?: Privilege) => {
    if (!context.loggedIn) {
        throw redirect({to: '/login', search: {redirect: location.href}})
    }
    if (privilege && !context.checkPrivilege(privilege)) {
        throw redirect({to: '/dashboard'})
    }
}

const checkAuthWith = (
    context: User,
    location: ParsedLocation,
    action: Action,
    resource: Resource,
    f: (authenticated: AuthenticatedUser, scope: Scope) => boolean,
) => {
    if (!context.loggedIn) {
        throw redirect({to: '/login', search: {redirect: location.href}})
    }
    const scope = context.getPrivilegeScope(action, resource)
    if (!scope || !f(context, scope)) {
        throw redirect({to: '/dashboard'})
    }
}

const checkAuthApp = (context: User) => {
    if (!context.loggedIn) {
        throw redirect({to: '/app/login'})
    }
}

// Vollbild-Anzeigen ohne Bedienung (Boards, Stream-Bühne, Sprecher, Zeitnahme-Bildschirme):
// `RoutePending` zeigt dort keinen Kreisel, Fehler laufen über `DisplayRouteError` bzw. auf der
// Bühne über `SilentRouteError` - nie eine Fehlerbox im Bild, stattdessen ein stiller Neuversuch.
const displayRoute = {
    staticData: {quietDisplay: true},
    errorComponent: DisplayRouteError,
} as const

export const rootRoute = createRootRouteWithContext<User>()({
    // Die Startsprache kommt als eigenes Stück (siehe i18n/config.ts). Bis sie da ist, rendert
    // keine Seite - sonst blitzte jede deutsche Sitzung kurz englisch auf. Die Seiten-Stücke lädt
    // der Router währenddessen parallel.
    loader: () => i18nReady.then(() => undefined),
    staleTime: Infinity,
})

export const mainLayoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: 'main-layout',
    component: RootLayout,
})

export const mobileRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: 'mobile',
    component: ResultsLayout,
})

export const indexRoute = createRoute({
    getParentRoute: () => mainLayoutRoute,
    path: '/',
    component: LandingPage,
    beforeLoad: ({context}) => {
        if (context.loggedIn) {
            throw redirect({to: '/dashboard'})
        }
    },
})

type LoginSearch = {
    redirect?: string
}

// TODO: @Type-Safety: page-specific instead of typed like this? because in Links it just builds a union containing all different TabTypes this way (which is still better than just 'string')
type TabSearch<TabType extends string> = {
    tab?: TabType
}

const validateTabSearch = <TabType extends string>(
    search: TabSearch<TabType>,
): TabSearch<TabType> => {
    return {
        tab: search.tab,
    }
}

export const loginRoute = createRoute({
    getParentRoute: () => mainLayoutRoute,
    path: 'login',
    component: LoginPage,
    validateSearch: ({redirect}: {redirect?: string} & SearchSchemaInput): LoginSearch => ({
        redirect,
    }),
})

export const invitationTokenRoute = createRoute({
    getParentRoute: () => mainLayoutRoute,
    path: 'invitation/$invitationToken',
    component: AcceptInvitationPage,
})

export const registrationRoute = createRoute({
    getParentRoute: () => mainLayoutRoute,
    path: 'registration',
})

export const registrationIndexRoute = createRoute({
    getParentRoute: () => registrationRoute,
    path: '/',
    component: RegistrationPage,
})

export const registrationTokenRoute = createRoute({
    getParentRoute: () => registrationRoute,
    path: '$registrationToken',
    component: VerifyRegistrationPage,
})

export const resetPasswordRoute = createRoute({
    getParentRoute: () => mainLayoutRoute,
    path: 'resetPassword',
})

export const resetPasswordIndexRoute = createRoute({
    getParentRoute: () => resetPasswordRoute,
    path: '/',
    component: InitResetPasswordPage,
})

export const resetPasswordTokenRoute = createRoute({
    getParentRoute: () => resetPasswordRoute,
    path: '$passwordResetToken',
    component: ResetPasswordPage,
})

export const dashboardRoute = createRoute({
    getParentRoute: () => mainLayoutRoute,
    path: 'dashboard',
    component: Dashboard,
    beforeLoad: ({context, location}) => {
        checkAuth(context, location)
    },
})

export const usersRoute = createRoute({
    getParentRoute: () => mainLayoutRoute,
    path: 'user',
})

export const usersIndexRoute = createRoute({
    getParentRoute: () => usersRoute,
    path: '/',
    component: UsersPage,
    beforeLoad: ({context, location}) => {
        checkAuth(context, location, readUserGlobal)
    },
})

export const userRoute = createRoute({
    getParentRoute: () => usersRoute,
    path: '$userId',
})

export const userIndexRoute = createRoute({
    getParentRoute: () => userRoute,
    path: '/',
    component: UserPage,
    beforeLoad: ({context, location, params}) => {
        checkAuthWith(
            context,
            location,
            'READ',
            'USER',
            (user, scope) => scope === 'GLOBAL' || params.userId === user.id,
        )
    },
})

export const rolesRoute = createRoute({
    getParentRoute: () => mainLayoutRoute,
    path: 'role',
})

export const rolesIndexRoute = createRoute({
    getParentRoute: () => rolesRoute,
    path: '/',
    component: RolesPage,
    beforeLoad: ({context, location}) => {
        checkAuth(context, location, readRoleGlobal)
    },
})

export const configurationRoute = createRoute({
    getParentRoute: () => mainLayoutRoute,
    path: 'config',
})

export const configurationIndexRoute = createRoute({
    getParentRoute: () => configurationRoute,
    path: '/',
    component: ConfigurationPage,
    beforeLoad: ({context, location}) => {
        checkAuth(context, location, updateEventGlobal)
    },
    validateSearch: validateConfigurationSearch,
})

export const eventsRoute = createRoute({
    getParentRoute: () => mainLayoutRoute,
    path: 'event',
})

export const eventsIndexRoute = createRoute({
    getParentRoute: () => eventsRoute,
    path: '/',
    component: EventsPage,
})

export const eventRoute = createRoute({
    getParentRoute: () => eventsRoute,
    path: '$eventId',
})

export const eventIndexRoute = createRoute({
    getParentRoute: () => eventRoute,
    path: '/',
    component: EventPage,
    // Bereich (`tab`) und Zeitplan-Tag (`day`); unbekannte Werte fallen weg, ob ein Bereich
    // sichtbar ist, entscheidet die Seite (`resolveEventTab`).
    validateSearch: validateEventIndexSearch,
})

export const eventRegisterRoute = createRoute({
    getParentRoute: () => eventRoute,
    path: '/register',
})

export const eventRegisterIndexRoute = createRoute({
    getParentRoute: () => eventRegisterRoute,
    path: '/',
    component: EventRegistrationCreatePage,
    beforeLoad: ({context, location}) => {
        checkAuth(context, location)
        if (context.loggedIn && context.clubId == undefined) {
            throw redirect({to: '..'})
        }
    },
})

export const eventRegistrationRoute = createRoute({
    getParentRoute: () => eventRoute,
    path: 'registration/$eventRegistrationId',
    component: EventRegistrationPage,
    // Die Meldung und ihre Rechnungen verlangen serverseitig eine Anmeldung. Ohne Wächter zeigte
    // die Seite Abgemeldeten nur eine Fehlermeldung über einer leeren Fläche.
    beforeLoad: ({context, location}) => {
        checkAuth(context, location)
    },
})

export const eventInfoRoute = createRoute({
    getParentRoute: () => eventRoute,
    path: 'info',
    component: EventInfoPage,
})

// Die Szenen-VERWALTUNG des Livestreams — bis zum 31.08.2026 wohnte sie mit den Boards zusammen
// auf `eventInfoRoute`, jetzt getrennt (siehe EventStreamScenesPage). Dieselbe Rechte-Tür wie
// das Kontroll-Panel darunter: READ STREAM ODER READ EVENT, von Hand geprüft, weil `checkAuth`
// nur ein einzelnes Privileg kennt. Zum Nicht-Konflikt mit der öffentlichen Bühnen-Route
// (`event/$eventId/stream/$sceneId`) siehe den Kommentar an `eventStreamPanelRoute`.
export const eventStreamScenesRoute = createRoute({
    getParentRoute: () => eventRoute,
    path: 'streamScenes',
    component: EventStreamScenesPage,
    beforeLoad: ({context, location}) => {
        checkAuth(context, location)
        if (!context.checkPrivilege(readStreamGlobal) && !context.checkPrivilege(readEventGlobal)) {
            throw redirect({to: '/dashboard'})
        }
    },
})

export const eventLiveDashboardRoute = createRoute({
    getParentRoute: () => eventRoute,
    path: 'liveDashboard',
    component: withPreload(LiveDashboardPage, function EventLiveDashboard() {
        const {eventId} = eventLiveDashboardRoute.useParams()
        const navigate = useNavigate()
        // Zurück führt zum fachlichen Elternteil, dem Betrieb der Veranstaltung — wer das
        // Dashboard sehen darf, sieht dort auch dessen Kachel.
        return (
            <LiveDashboardPage
                eventId={eventId}
                onBack={() =>
                    navigate({to: '/event/$eventId', params: {eventId}, search: {tab: 'betrieb'}})
                }
            />
        )
    }),
    beforeLoad: ({context, location}) => {
        checkAuth(context, location, readLiveDashboardGlobal)
    },
})

// Das Regie-Board des Livestreams (seit 02.09.2026 ein Vollbild-Arbeitsplatz statt des alten
// Kontroll-Panels, Adresse unverändert). Wie `eventStreamScenesRoute` braucht es
// eines der beiden Leserechte, READ STREAM ODER READ EVENT — `checkAuth` kennt nur ein einzelnes
// Privileg, deshalb hier von Hand wie bei `eventTimingStartDisplayRoute`. Diese Route liegt
// bewusst unter `eventRoute` (angemeldete Veranstaltungsverwaltung) und trägt NUR das Segment
// `streamPanel` — sie kollidiert nicht mit der öffentlichen Bühnen-Route `streamSceneRoute`
// weiter unten (`event/$eventId/stream/$sceneId`, ein eigener Zweig direkt unter `rootRoute`
// mit einem ZUSÄTZLICHEN `$sceneId`-Segment): „streamPanel" ist kein Präfix von „stream" und
// umgekehrt, beide Pfade bleiben in jeder Reihenfolge eindeutig unterscheidbar.
export const eventStreamPanelRoute = createRoute({
    getParentRoute: () => eventRoute,
    path: 'streamPanel',
    // Regie-Arbeitsplatz im Vollbild: dezenter Hinweis statt Fehlerbox, Kreisel beim Laden bleibt.
    errorComponent: DisplayRouteError,
    component: withPreload(StreamDirectorPage, function EventStreamPanel() {
        const {eventId} = eventRoute.useParams()
        return <StreamDirectorPage eventId={eventId} />
    }),
    beforeLoad: ({context, location}) => {
        checkAuth(context, location)
        if (!context.checkPrivilege(readStreamGlobal) && !context.checkPrivilege(readEventGlobal)) {
            throw redirect({to: '/dashboard'})
        }
    },
})

// --- Zeitnahme unter der Veranstaltung -------------------------------------------------------
//
// Die Zeitnahme ist Teil einer Veranstaltung, also sind das hier die kanonischen Adressen
// (Betrieb-Reiter, geteilte Posten-Links, QR-Codes):
//
//   /event/$eventId/timing/leitstand            Leitstand (Laptop der Zeitnahme-Leitung)
//   /event/$eventId/timing/$stationId           Erfassungsboard eines Postens
//   /event/$eventId/timing/$stationId/anzeige   Startbildschirm (Zeitnahme) eines START-Postens
//
// Die /app/timing-Welt bleibt daneben bestehen (Geräte-Wahlseiten, PWA); ihre Überarbeitung
// kommt separat, neue Links zeigen aber nur noch hierher. Die Board-/Leitstand-Seiten selbst
// sind route-unabhängig und werden von beiden Welten mit Props gemountet.
//
// Erfassung und Startbildschirm akzeptieren zusätzlich zur Nutzersitzung ein Geräte-Token aus
// der URL (ausgestellt und widerrufbar über den Leitstand-Geräte-Reiter): geteilte Handys und
// Anzeige-Bildschirme am Posten haben keine Anmeldung. Das Token reist im Fragment (`#token=…`),
// das der Browser nie mitschickt — es landet weder in Server- und Proxy-Protokollen noch im
// Referer; ältere Links tragen es noch als `?token=` und bleiben gültig (`readTokenFromLocation`).
// Beim ersten Aufruf wird es clientseitig abgelegt und per replace-Redirect aus der Adresszeile
// entfernt, damit es nicht in Screenshots hängen bleibt. Aus dem Browserverlauf verschwindet es
// dadurch nicht zuverlässig — deshalb sind Tokens widerrufbar und befristet.

type TimingTokenSearch = {
    token?: string
}

const validateTimingTokenSearch = ({
    token,
}: {token?: string} & SearchSchemaInput): TimingTokenSearch => ({
    token: typeof token === 'string' && token !== '' ? token : undefined,
})

export const eventTimingRoute = createRoute({
    getParentRoute: () => eventRoute,
    path: 'timing',
})

export const eventTimingLeitstandRoute = createRoute({
    getParentRoute: () => eventTimingRoute,
    path: 'leitstand',
    component: withPreload(TimingLeitstandPage, function EventTimingLeitstand() {
        const {eventId} = eventRoute.useParams()
        const navigate = useNavigate()
        return (
            <TimingLeitstandPage
                eventId={eventId}
                onBack={() =>
                    void navigate({
                        to: '/event/$eventId',
                        params: {eventId},
                        search: {tab: 'betrieb'},
                    })
                }
            />
        )
    }),
    beforeLoad: ({context, location}) => {
        // Wie die Seite selbst: alles hier schreibt in die Ergebnisse der Veranstaltung.
        checkAuth(context, location, updateEventGlobal)
    },
})

// Vor `eventTimingStationRoute` deklariert: das statische Suffix `anzeige` muss gegen die reine
// `$stationId`-Route gewinnen.
export const eventTimingStartDisplayRoute = createRoute({
    getParentRoute: () => eventTimingRoute,
    path: '$stationId/anzeige',
    ...displayRoute,
    validateSearch: validateTimingTokenSearch,
    component: withPreload(TimingStartDisplayPage, function EventTimingStartDisplay() {
        const {eventId} = eventRoute.useParams()
        const {stationId} = eventTimingStartDisplayRoute.useParams()
        return <TimingStartDisplayPage eventId={eventId} stationId={stationId} />
    }),
    beforeLoad: ({context, location, params, search}) => {
        const token = readTokenFromLocation(location.hash, search.token)
        if (token !== null) {
            writeDeviceSession({
                token,
                event: params.eventId,
                station: params.stationId,
            })
            throw redirect({
                to: '/event/$eventId/timing/$stationId/anzeige',
                params,
                search: {},
                hash: '',
                replace: true,
            })
        }
        // Anzeige ist rein lesend, deshalb reicht die Veranstaltungs-Bindung des Tokens.
        if (deviceSessionForEvent(params.eventId) !== null) return
        checkAuth(context, location)
        if (
            !context.checkPrivilege(updateAppTimingGlobal) &&
            !context.checkPrivilege(updateEventGlobal) &&
            !context.checkPrivilege(readEventGlobal)
        ) {
            throw redirect({to: '/dashboard'})
        }
    },
})

export const eventTimingStationRoute = createRoute({
    getParentRoute: () => eventTimingRoute,
    path: '$stationId',
    ...displayRoute,
    validateSearch: validateTimingTokenSearch,
    component: withPreload(TimingBoardPage, function EventTimingStation() {
        const {eventId} = eventRoute.useParams()
        const {stationId} = eventTimingStationRoute.useParams()
        return <TimingBoardPage eventId={eventId} stationId={stationId} />
    }),
    beforeLoad: ({context, location, params, search}) => {
        const token = readTokenFromLocation(location.hash, search.token)
        if (token !== null) {
            writeDeviceSession({
                token,
                event: params.eventId,
                station: params.stationId,
            })
            throw redirect({
                to: '/event/$eventId/timing/$stationId',
                params,
                search: {},
                hash: '',
                replace: true,
            })
        }
        // Erfassung verlangt die Posten-Bindung: der Zeitmarken-POST geht serverseitig ohnehin
        // nur für den Posten des Tokens durch, ein Board am falschen Posten erfasste ins Leere.
        if (deviceSessionForStation(params.eventId, params.stationId) !== null) return
        checkAuth(context, location)
        if (
            !context.checkPrivilege(updateAppTimingGlobal) &&
            !context.checkPrivilege(updateEventGlobal)
        ) {
            throw redirect({to: '/dashboard'})
        }
    },
})

export const eventDayRoute = createRoute({
    getParentRoute: () => eventRoute,
    path: 'eventDay/$eventDayId',
})

export const eventDayIndexRoute = createRoute({
    getParentRoute: () => eventDayRoute,
    path: '/',
    component: EventDayPage,
})

export const competitionRoute = createRoute({
    getParentRoute: () => eventRoute,
    path: 'competition/$competitionId',
})

export const competitionIndexRoute = createRoute({
    getParentRoute: () => competitionRoute,
    path: '/',
    component: CompetitionPage,
    validateSearch: validateCompetitionSearch,
})

export const clubRoute = createRoute({
    getParentRoute: () => clubsRoute,
    path: '$clubId',
})

export const clubIndexRoute = createRoute({
    getParentRoute: () => clubRoute,
    path: '/',
    component: ClubPage,
    beforeLoad: ({context, location, params}) => {
        checkAuthWith(
            context,
            location,
            'READ',
            'CLUB',
            (user, scope) => scope === 'GLOBAL' || params.clubId === user.clubId,
        )
    },
})

export const clubsRoute = createRoute({
    getParentRoute: () => mainLayoutRoute,
    path: 'club',
})

export const clubsIndexRoute = createRoute({
    getParentRoute: () => clubsRoute,
    path: '/',
    component: ClubsPage,
    beforeLoad: ({context, location}) => {
        checkAuth(context, location)
    },
    validateSearch: validateTabSearch<ClubTab>,
})

export const administrationRoute = createRoute({
    getParentRoute: () => mainLayoutRoute,
    path: 'administration',
})

export const administrationIndexRoute = createRoute({
    getParentRoute: () => administrationRoute,
    path: '/',
    component: AdministrationPage,
    beforeLoad: ({context, location}) => {
        checkAuth(context, location, readAdministrationConfigGlobal)
    },
    validateSearch: validateAdministrationSearch,
})

// --- Helfer-App -------------------------------------------------------------------------------
//
// Der Ablauf beginnt mit dem Scanner; die Weiche `/app` entscheidet aus Rechten und Bestand, wohin
// es geht. Die Veranstaltung steht nicht in der Adresse, sondern im Gedächtnis der App
// (localStorage), deshalb prüfen die Wächter sie dort. Fehlt eine Voraussetzung, geht es zurück
// zur Weiche — sie ist die einzige Stelle, die Umleitungen kennt.

const requireAppEvent = () => {
    if (readRememberedEvent(localStorage) === null) {
        throw redirect({to: '/app'})
    }
}

const requireAppRight = (context: User, allowed: (user: AuthenticatedUser) => boolean) => {
    checkAuthApp(context)
    if (!context.loggedIn || !allowed(context)) {
        throw redirect({to: '/app'})
    }
}

export const appRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'app',
    component: AppLayout,
})

export const appIndexRoute = createRoute({
    getParentRoute: () => appRoute,
    path: '/',
    component: AppEntryPage,
    beforeLoad: ({context}) => checkAuthApp(context),
})

export const appLoginRoute = createRoute({
    getParentRoute: () => appRoute,
    path: 'login',
    component: AppLoginPage,
})

export const appForbiddenRoute = createRoute({
    getParentRoute: () => appRoute,
    path: 'forbidden',
    component: ForbiddenPage,
})

export const appEventChoiceRoute = createRoute({
    getParentRoute: () => appRoute,
    path: 'veranstaltung',
    component: EventChoicePage,
    beforeLoad: ({context}) => checkAuthApp(context),
})

export const appStartRoute = createRoute({
    getParentRoute: () => appRoute,
    path: 'start',
    component: WorldsPage,
    beforeLoad: ({context}) => {
        checkAuthApp(context)
        requireAppEvent()
    },
})

export const appScanRoute = createRoute({
    getParentRoute: () => appRoute,
    path: 'scan',
    component: ScanPage,
    beforeLoad: ({context}) => {
        requireAppRight(context, user => scanRightsOf(user.checkPrivilege).length > 0)
        requireAppEvent()
    },
})

export const appScanResultRoute = createRoute({
    getParentRoute: () => appRoute,
    path: 'scan/$qrCodeId',
    component: ScanResultPage,
    beforeLoad: ({context}) => {
        requireAppRight(context, user => scanRightsOf(user.checkPrivilege).length > 0)
        requireAppEvent()
    },
})

export const appSettingsRoute = createRoute({
    getParentRoute: () => appRoute,
    path: 'einstellungen',
    component: SettingsPage,
    beforeLoad: ({context}) => {
        checkAuthApp(context)
        requireAppEvent()
    },
})

export const appDashboardRoute = createRoute({
    getParentRoute: () => appRoute,
    path: 'dashboard',
    component: AppDashboardPage,
    beforeLoad: ({context}) => {
        requireAppRight(context, user => user.checkPrivilege(readLiveDashboardGlobal))
        requireAppEvent()
    },
})

export const appTimingRoute = createRoute({
    getParentRoute: () => appRoute,
    path: 'timing',
})

export const appTimingIndexRoute = createRoute({
    getParentRoute: () => appTimingRoute,
    path: '/',
    component: TimingStationSelectPage,
    beforeLoad: ({context}) => {
        requireAppRight(context, user => user.checkPrivilege(updateAppTimingGlobal))
        requireAppEvent()
    },
})

// Vor `appTimingStationRoute` deklariert: das statische `leitstand` muss gegen `$stationId`
// gewinnen.
export const appTimingLeitstandRoute = createRoute({
    getParentRoute: () => appTimingRoute,
    path: 'leitstand',
    component: withPreload(TimingLeitstandPage, function AppTimingLeitstand() {
        const navigate = useNavigate()
        const eventId = readRememberedEvent(localStorage)
        // `requireAppEvent` im `beforeLoad` sichert die gemerkte Veranstaltung beim Betreten der
        // Route zu; verschwindet sie danach (siehe `AppSessionProvider`, gegengeprüfte
        // Veranstaltung), bliebe ohne diesen Effekt ein leerer Bildschirm stehen statt zurück zur
        // Weiche zu gehen.
        useEffect(() => {
            if (eventId === null) {
                void navigate({to: '/app', replace: true})
            }
        }, [eventId, navigate])
        if (eventId === null) return null
        return (
            <TimingLeitstandPage
                eventId={eventId}
                onBack={() => void navigate({to: '/app/timing'})}
            />
        )
    }),
    beforeLoad: ({context}) => {
        // Der Leitstand schreibt in die Ergebnisse der Veranstaltung — strenger als die Posten.
        requireAppRight(context, user => user.checkPrivilege(updateEventGlobal))
        requireAppEvent()
    },
})

export const appTimingStationRoute = createRoute({
    getParentRoute: () => appTimingRoute,
    path: '$stationId',
    component: withPreload(TimingBoardPage, function AppTimingStation() {
        const {stationId} = appTimingStationRoute.useParams()
        const navigate = useNavigate()
        const eventId = readRememberedEvent(localStorage)
        // Wie beim Leitstand: `beforeLoad` sichert die gemerkte Veranstaltung beim Betreten zu,
        // verschwindet sie danach, geht es zurück zur Weiche statt auf einen leeren Bildschirm.
        useEffect(() => {
            if (eventId === null) {
                void navigate({to: '/app', replace: true})
            }
        }, [eventId, navigate])
        if (eventId === null) return null
        return (
            <TimingBoardPage
                eventId={eventId}
                stationId={stationId}
                // Nur hier, in der `/app`-Welt: eine unbekannte Postenkennung kann eine alte Adresse
                // sein (siehe `beforeLoad` unten), also zurück zur Postenwahl statt auf einem toten
                // Board zu bleiben. Unter `/event/$eventId/timing/$stationId` gibt es diesen Rückruf
                // bewusst nicht — dort ist eine unbekannte Kennung ein Programmierfehler.
                onUnknownStation={() => void navigate({to: '/app/timing', replace: true})}
            />
        )
    }),
    beforeLoad: ({context, location, params}) => {
        // Alte Adressen aus Verläufen installierter Apps (z. B. „…/timing/<eventId>/leitstand")
        // tragen nach der vermeintlichen Postenkennung noch weitere Segmente. TanStack Router
        // matcht so eine Adresse trotzdem gegen diese Route (die überzähligen Segmente landen im
        // internen Rest-Pfad `**`, der Wert davor wird zur „Postenkennung") — ohne diese Prüfung
        // entstünde ein Board mit einer geratenen, nie existierenden Postenkennung. Zurück zur
        // Weiche, statt das zu versuchen.
        if (!location.pathname.endsWith(`/app/timing/${params.stationId}`)) {
            throw redirect({to: '/app/timing', replace: true})
        }
        requireAppRight(context, user => user.checkPrivilege(updateAppTimingGlobal))
        requireAppEvent()
    },
})

// Alte Adressen aus Verläufen installierter Apps (`/app/scanner`, `/app/function`, ...) landen
// auf der Weiche statt auf einer leeren Seite.
export const appCatchAllRoute = createRoute({
    getParentRoute: () => appRoute,
    path: '$',
    beforeLoad: () => {
        throw redirect({to: '/app', replace: true})
    },
})

export const invoicesRoute = createRoute({
    getParentRoute: () => mainLayoutRoute,
    path: 'invoices',
    component: InvoicesPage,
    beforeLoad: ({context, location}) => {
        checkAuth(context, location, readInvoiceGlobal)
    },
})

export const resultsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'results',
    component: ResultsLayout,
})

export const resultsIndexRoute = createRoute({
    getParentRoute: () => resultsRoute,
    path: '/',
    component: SelectResultsEventPage,
})

export const resultsEventRoute = createRoute({
    getParentRoute: () => resultsRoute,
    path: '/event/$eventId',
    component: ResultsPage,
    // Direkteinstieg für QR-Aushänge: ?tab=live öffnet den Live-Reiter, ?tab=my-event wie
    // bisher „Mein Event", ?tab=results ist das ausgeschriebene Default-Ziel — alles andere
    // fällt auf den Default (siehe resultsTab.ts). ?competition=<id> springt auf dem
    // Ergebnisse-Reiter direkt in einen Wettkampf — für teilbare Links; eine unbekannte Id
    // läuft ins Leere und die Seite startet normal.
    validateSearch: (search: {tab?: string; competition?: string} & SearchSchemaInput) => ({
        tab: parseResultsTabSearch(search.tab),
        competition:
            typeof search.competition === 'string' && search.competition !== ''
                ? search.competition
                : undefined,
    }),
})

export const resultsQRCodeRoute = createRoute({
    getParentRoute: () => resultsRoute,
    path: '$qrCode',
    component: ResultsQrCodePage,
})

export const speakerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'speaker',
    component: () => <Outlet />,
})

export const speakerIndexRoute = createRoute({
    getParentRoute: () => speakerRoute,
    path: '/',
    component: SelectSpeakerEventPage,
})

export const speakerEventRoute = createRoute({
    getParentRoute: () => speakerRoute,
    path: 'event/$eventId',
    ...displayRoute,
    component: SpeakerBoardPage,
})

export const challengeRoute = createRoute({
    getParentRoute: () => mobileRoute,
    path: 'challenge/$accessToken',
    component: ChallengePage,
})

// Route ohne App-Layout: fest montierte Athletenbildschirme und Athleten-Handys brauchen weder
// Kopfleiste noch Seitenleiste. Die Inhalte selbst sind nicht mehr frei zugänglich — beide
// Board-Endpunkte verlangen entweder eine Sitzung (READ BOARD/READ EVENT) oder ein Board-Token.
// Bestands-URL der alten Athleten-Anzeige — leitet auf das erste Board um.
export const athleteBoardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'board/$eventId',
    ...displayRoute,
    component: AthleteBoardPage,
})

// Die Anzeige eines konkreten Boards, ebenfalls ohne App-Layout.
//
// Wie Erfassung und Startbildschirm der Zeitnahme nimmt sie zusätzlich zur Nutzersitzung ein
// Geräte-Token aus der Adresse an (Fragment `#token=…`, ältere Links `?token=…`; erzeugt vom
// „Link teilen" der Board-Verwaltung): ein montierter Bildschirm und eine OBS-Browserquelle
// können sich nicht anmelden. Das Token wird beim ersten Aufruf abgelegt und per replace-Redirect
// sofort aus der Adresszeile entfernt (Schutzwirkung und Grenzen: siehe den Kommentar über
// `TimingTokenSearch`). Anders als dort liegt es je Board (siehe `utils/board/deviceToken.ts`):
// ein Anzeigegerät zeigt der Reihe nach mehrere Boards.
//
// Es bleibt bei `validateTimingTokenSearch` — das Board-Token stammt aus derselben Tabelle und
// reist im selben Fragment bzw. Query-Parameter; eine zweite, identische Prüffunktion wäre nur ein
// zweiter Ort, an dem der leere Token-String vergessen werden kann.
export const boardDisplayRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'board/$eventId/$boardId',
    ...displayRoute,
    validateSearch: validateTimingTokenSearch,
    component: BoardDisplayPage,
    beforeLoad: ({location, params, search}) => {
        const token = readTokenFromLocation(location.hash, search.token)
        if (token !== null) {
            writeBoardDeviceToken(params.eventId, params.boardId, token)
            throw redirect({
                to: '/board/$eventId/$boardId',
                params,
                search: {},
                hash: '',
                replace: true,
            })
        }
        // Bewusst KEIN checkAuth: Die Seite darf auch ohne Sitzung und ohne Token geöffnet werden.
        // Ob es reicht, entscheidet der Server — und die Seite zeigt den 401 als Klartext an, statt
        // den Bildschirm auf die Anmeldung zu werfen, vor der am Regattatag niemand steht.
    },
})

// Die Stream-Bühne einer Szene, ebenfalls ohne App-Layout — wortgetreue Kopie des Musters von
// `boardDisplayRoute` (Geräte-Token aus der Adresse, replace-Redirect ohne Token in der
// Adressleiste), aber unter dem vom Backend vorgegebenen Pfad: `StreamSceneShareLinkDto.path`
// erzeugt genau diesen Link (`/event/{eventId}/stream/{sceneId}#token=…`), die Route MUSS also
// hier liegen, auch wenn `event/$eventId` sonst der angemeldeten Veranstaltungsverwaltung gehört
// (`eventRoute`). Beide Zweige bleiben eindeutig unterscheidbar: Diese Route trägt selbst die
// weiteren Segmente `stream/$sceneId`, die es unter `eventRoute` nicht gibt.
//
// Anders als bei Boards braucht eine Bühne KEIN `checkAuth` und KEINE Fehlermeldung im Klartext
// — sie läuft ungesehen als OBS-/Wirecast-Quelle, jeder sichtbare Text tauchte im Bild auf. Ohne
// Sitzung und ohne (gültiges) Token bleibt die Bühne schlicht leer (siehe `StreamScenePage`).
export const streamSceneRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'event/$eventId/stream/$sceneId',
    staticData: {quietDisplay: true},
    errorComponent: SilentRouteError,
    validateSearch: validateTimingTokenSearch,
    component: StreamScenePage,
    beforeLoad: ({location, params, search}) => {
        const token = readTokenFromLocation(location.hash, search.token)
        if (token !== null) {
            writeStreamSceneDeviceToken(params.eventId, params.sceneId, token)
            throw redirect({
                to: '/event/$eventId/stream/$sceneId',
                params,
                search: {},
                hash: '',
                replace: true,
            })
        }
    },
})

const routeTree = rootRoute.addChildren([
    mainLayoutRoute.addChildren([
        indexRoute,
        loginRoute,
        dashboardRoute,
        configurationRoute.addChildren([configurationIndexRoute]),
        administrationRoute.addChildren([administrationIndexRoute]),
        eventsRoute.addChildren([
            eventsIndexRoute,
            eventRoute.addChildren([
                eventIndexRoute,
                eventRegistrationRoute,
                eventInfoRoute,
                eventStreamScenesRoute,
                eventLiveDashboardRoute,
                eventStreamPanelRoute,
                eventTimingRoute.addChildren([
                    eventTimingLeitstandRoute,
                    eventTimingStartDisplayRoute,
                    eventTimingStationRoute,
                ]),
                eventDayRoute.addChildren([eventDayIndexRoute]),
                competitionRoute.addChildren([competitionIndexRoute]),
                eventRegisterRoute.addChildren([eventRegisterIndexRoute]),
            ]),
        ]),
        usersRoute.addChildren([usersIndexRoute, userRoute.addChildren([userIndexRoute])]),
        rolesRoute.addChildren([rolesIndexRoute]),
        invitationTokenRoute,
        registrationRoute.addChildren([registrationIndexRoute, registrationTokenRoute]),
        resetPasswordRoute.addChildren([resetPasswordIndexRoute, resetPasswordTokenRoute]),
        clubsRoute.addChildren([clubsIndexRoute, clubRoute.addChildren([clubIndexRoute])]),
        invoicesRoute,
    ]),
    appRoute.addChildren([
        appIndexRoute,
        appLoginRoute,
        appForbiddenRoute,
        appEventChoiceRoute,
        appStartRoute,
        appScanRoute,
        appScanResultRoute,
        appSettingsRoute,
        appDashboardRoute,
        appTimingRoute.addChildren([
            appTimingIndexRoute,
            appTimingLeitstandRoute,
            appTimingStationRoute,
        ]),
        appCatchAllRoute,
    ]),
    resultsRoute.addChildren([resultsIndexRoute, resultsQRCodeRoute, resultsEventRoute]),
    speakerRoute.addChildren([speakerIndexRoute, speakerEventRoute]),
    mobileRoute.addChildren([challengeRoute]),
    athleteBoardRoute,
    boardDisplayRoute,
    streamSceneRoute,
])

const basepath = document.getElementById('ready2race-root')!.dataset.basepath

export const router = createRouter({
    routeTree,
    context: undefined!,
    basepath,
    defaultPendingComponent: RoutePending,
    defaultErrorComponent: RouteErrorPage,
    defaultNotFoundComponent: NotFoundPage,
})

declare module '@tanstack/react-router' {
    interface Register {
        router: typeof router
    }
    interface StaticDataRouteOption {
        /** Vollbild-Anzeige ohne Bedienung: kein Lade-Kreisel (siehe `RoutePending`). */
        quietDisplay?: boolean
    }
}
