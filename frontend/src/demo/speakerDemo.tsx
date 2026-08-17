// Entry point of the standalone speaker board preview, built via
// `npm run build:demo` (see vite.demo.config.ts). It renders the real board
// components but answers the API from generated demo data, so the result is a
// single HTML file that runs without a backend.
import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {CssBaseline, ThemeProvider} from '@mui/material'
import {SnackbarProvider} from 'notistack'
import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    Outlet,
    RouterProvider,
} from '@tanstack/react-router'
import i18next from 'i18next'
import SpeakerBoardPage from '../pages/speaker/SpeakerBoardPage.tsx'
import SelectSpeakerEventPage from '../pages/speaker/SelectSpeakerEventPage.tsx'
import {buildDemoResponse, DEMO_EVENT_ID} from './speakerDemoData.ts'
import {locales} from '../i18n/config.ts'
import '../i18n/config'
import {muiTheme} from '../theme.ts'
import '@fontsource/roboto/300.css'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'
import '../index.scss'

// Answer the board's requests locally; anything unknown falls through to the network.
const passThrough = window.fetch.bind(window)
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const pathname = new URL(url, window.location.origin).pathname.replace(/\/+$/, '')
    const body = buildDemoResponse(pathname)
    if (body !== null) {
        return new Response(JSON.stringify(body), {
            status: 200,
            headers: {'Content-Type': 'application/json'},
        })
    }
    return passThrough(input, init)
}) as typeof window.fetch

i18next.changeLanguage('de')

// A minimal router carrying just the speaker routes, on memory history so the
// page works from any URL (including file://).
const rootRoute = createRootRoute()

const speakerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'speaker',
    component: () => <Outlet />,
})

const speakerIndexRoute = createRoute({
    getParentRoute: () => speakerRoute,
    path: '/',
    component: () => <SelectSpeakerEventPage />,
})

const speakerEventRoute = createRoute({
    getParentRoute: () => speakerRoute,
    path: 'event/$eventId',
    component: () => <SpeakerBoardPage />,
})

const demoRouter = createRouter({
    routeTree: rootRoute.addChildren([
        speakerRoute.addChildren([speakerIndexRoute, speakerEventRoute]),
    ]),
    history: createMemoryHistory({initialEntries: [`/speaker/event/${DEMO_EVENT_ID}`]}),
    context: undefined!,
})

createRoot(document.getElementById('ready2race-root')!).render(
    <StrictMode>
        <ThemeProvider theme={muiTheme(locales.de, null)}>
            <CssBaseline />
            <SnackbarProvider maxSnack={1}>
                {/* The demo router is not the app router this project registers globally. */}
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <RouterProvider router={demoRouter as any} context={{} as any} />
            </SnackbarProvider>
        </ThemeProvider>
    </StrictMode>,
)
