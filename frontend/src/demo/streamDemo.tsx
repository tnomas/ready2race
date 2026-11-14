// Galerie der Livestream-Grafiken: rendert die echte Bühne (`StreamStage`) mit festen
// Szenarien über einem simulierten Kamerabild — ohne Backend. Aufruf im Dev-Server:
//   npx vite --port 5181  ->  http://localhost:5181/stream-demo.html?scenario=<id>
// `?chrome=0` blendet die Szenarienliste aus (für Bildschirmfotos), `?bg=none` das Kamerabild.
import {StrictMode, useEffect, useMemo, useState} from 'react'
import {createRoot} from 'react-dom/client'
import {Box, CssBaseline, ThemeProvider} from '@mui/material'
import i18next from 'i18next'
import {locales} from '../i18n/config.ts'
import '../i18n/config'
import {muiTheme} from '../theme/muiTheme.ts'
import StreamStage from '../components/event/stream/StreamStage.tsx'
import {findStreamDemoScenario, STREAM_DEMO_SCENARIOS} from './streamDemoData.ts'
import '@fontsource/roboto/300.css'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'
import '../index.scss'

i18next.changeLanguage('de')

// Dieselbe Voreinstellung wie `ThemeProvider` der App (Förde-Grün), damit die Galerie die
// Grafiken in der echten Akzentfarbe zeigt.
const DEMO_THEME = {
    primary: {main: '#4d9f85', light: '#ecfaf7'},
    textColor: {primary: '#1d1d1d', secondary: '#666666'},
    actionColors: {success: '#cbe694', warning: '#f5d9b0', error: '#da4d4d', info: '#6fb0d4'},
    backgroundColor: '#ffffff',
    customFont: {enabled: false, filename: null},
    customLogo: {enabled: false, filename: null},
}

/** Simuliertes Kamerabild: Himmel, Förde, Sonne — bewusst unruhig genug, um Lesbarkeit zu prüfen. */
const CameraBackdrop = () => (
    <Box
        sx={{
            position: 'absolute',
            inset: 0,
            background:
                'radial-gradient(circle at 72% 28%, rgba(255, 244, 214, 0.9) 0, rgba(255, 244, 214, 0) 18%),' +
                'linear-gradient(180deg, #6fa3c9 0%, #b9d6e8 46%, #dbe7ee 52%, #3f7d9f 53%, #1f4f6b 100%)',
        }}>
        {/* Wellenstreifen und ein paar Boote als helle und dunkle Störungen im Bild. */}
        <Box
            sx={{
                position: 'absolute',
                inset: '54% 0 0 0',
                backgroundImage:
                    'repeating-linear-gradient(175deg, rgba(255,255,255,0.10) 0 2px, transparent 2px 26px),' +
                    'repeating-linear-gradient(185deg, rgba(0,0,0,0.12) 0 1px, transparent 1px 41px)',
            }}
        />
        {[
            {left: '18%', top: '62%', width: '14%'},
            {left: '41%', top: '68%', width: '17%'},
            {left: '66%', top: '60%', width: '12%'},
        ].map((b, index) => (
            <Box
                key={index}
                sx={{
                    position: 'absolute',
                    ...b,
                    height: '2.2%',
                    borderRadius: '0 0 50% 50% / 0 0 100% 100%',
                    background: index === 1 ? '#f4f1e8' : '#e0e6ea',
                    boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
                }}
            />
        ))}
    </Box>
)

const useSearchParam = (name: string) => {
    const [value, setValue] = useState(() => new URLSearchParams(window.location.search).get(name))
    useEffect(() => {
        const onChange = () => setValue(new URLSearchParams(window.location.search).get(name))
        window.addEventListener('popstate', onChange)
        return () => window.removeEventListener('popstate', onChange)
    }, [name])
    return value
}

const StreamDemo = () => {
    const scenarioId = useSearchParam('scenario')
    const chrome = useSearchParam('chrome') !== '0'
    const backdrop = useSearchParam('bg') !== 'none'
    const scenario = useMemo(() => findStreamDemoScenario(scenarioId), [scenarioId])
    const clockOffsetMs = useMemo(() => Date.now() - Date.parse(scenario.view.serverTime), [scenario])

    const select = (id: string) => {
        const url = new URL(window.location.href)
        url.searchParams.set('scenario', id)
        window.history.pushState(null, '', url)
        window.dispatchEvent(new PopStateEvent('popstate'))
    }

    return (
        <Box sx={{position: 'fixed', inset: 0, overflow: 'hidden', bgcolor: '#0b0f14'}}>
            {/* Szenenwechsel bekommt einen neuen Schlüssel: jede Grafik startet frisch, statt
                zwischen zwei Datensätzen zu animieren — so wie ein echter Szenenwechsel. */}
            <StreamStage
                key={scenario.id}
                view={scenario.view}
                clockOffsetMs={clockOffsetMs}
                stale={false}
                backdrop={backdrop ? <CameraBackdrop /> : undefined}
            />
            {chrome && (
                <Box
                    sx={{
                        position: 'absolute',
                        top: 12,
                        left: 12,
                        width: 300,
                        maxHeight: 'calc(100vh - 24px)',
                        overflowY: 'auto',
                        bgcolor: 'rgba(255,255,255,0.94)',
                        borderRadius: 1,
                        boxShadow: 3,
                        fontSize: 13,
                        p: 1.5,
                    }}>
                    <Box sx={{fontWeight: 700, mb: 1}}>Livestream-Grafiken</Box>
                    {STREAM_DEMO_SCENARIOS.map(item => (
                        <Box
                            key={item.id}
                            component="button"
                            onClick={() => select(item.id)}
                            sx={{
                                display: 'block',
                                width: '100%',
                                textAlign: 'left',
                                border: 0,
                                borderRadius: 0.5,
                                px: 1,
                                py: 0.5,
                                cursor: 'pointer',
                                bgcolor: item.id === scenario.id ? '#4d9f85' : 'transparent',
                                color: item.id === scenario.id ? '#fff' : '#1d1d1d',
                                font: 'inherit',
                            }}>
                            {item.title}
                        </Box>
                    ))}
                    <Box sx={{mt: 1.5, color: '#555', lineHeight: 1.4}}>{scenario.note}</Box>
                </Box>
            )}
        </Box>
    )
}

createRoot(document.getElementById('ready2race-root')!).render(
    <StrictMode>
        <ThemeProvider theme={muiTheme(locales.de, DEMO_THEME)}>
            <CssBaseline />
            <StreamDemo />
        </ThemeProvider>
    </StrictMode>,
)
