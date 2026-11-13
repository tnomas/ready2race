import {Outlet} from '@tanstack/react-router'
import {Container, Box} from '@mui/material'
import {useEffect} from 'react'
import {AdminThemeScope} from '../theme/AdminThemeScope.tsx'

const ResultsLayout = () => {
    // Die Ergebnisseite trägt Namen von Teilnehmenden und über "Mein Event" den Zustand
    // persönlicher Bedingungen. Ein Suchmaschinentreffer würde aus "wer den Link hat"
    // ein "wer den Namen sucht" machen. Der Schutz hängt bewusst am Layout und nicht an
    // der Reiter-Logik, damit er beim Umbau der Reiter nicht verloren geht.
    useEffect(() => {
        const meta = document.createElement('meta')
        meta.name = 'robots'
        meta.content = 'noindex, nofollow'
        document.head.appendChild(meta)
        return () => {
            // remove() statt head.removeChild(): wirkungsgleich, wirft aber nicht, falls der
            // Knoten von außen (Erweiterung, Hot Reload) schon entfernt wurde.
            meta.remove()
        }
    }, [])

    // Gleiche Designsprache wie die Verwaltung (Typo, Radien, Rahmen statt Schatten, Fokusring,
    // lesbare Statusfarben). `.mobile-optimized-layout` behält die großen Touch-Knöpfe unter sm.
    // Ruhige Arbeitsfläche (`canvas`) über die ganze Breite, Inhalte als weiße Karten darauf;
    // die Lesebreite bleibt auf `md` begrenzt, damit Ergebnislisten nicht auseinanderlaufen.
    return (
        <AdminThemeScope>
            <Box sx={{bgcolor: 'canvas', minHeight: '100vh'}}>
                <Container
                    className="mobile-optimized-layout"
                    maxWidth="md"
                    sx={{
                        minHeight: '100vh',
                        display: 'flex',
                        flexDirection: 'column',
                        py: {xs: 1, sm: 3},
                        px: {xs: 2, sm: 3},
                    }}>
                    <Box
                        component="main"
                        sx={{
                            width: '100%',
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                        }}>
                        <Outlet />
                    </Box>
                </Container>
            </Box>
        </AdminThemeScope>
    )
}

export default ResultsLayout
