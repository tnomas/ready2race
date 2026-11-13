import {PropsWithChildren, useContext, useMemo} from 'react'
import {ThemeProvider, useTheme} from '@mui/material/styles'
import {adminTheme} from './adminTheme.ts'
import {OuterThemeContext} from './outerThemeContext.ts'

/**
 * Legt das Verwaltungs-Theme (`adminTheme`) über das Mandanten-Theme. Nur in `RootLayout` und
 * `ResultsLayout` – alles andere (Boards, Stream-Szenen, Sprecher, Demo, Helfer-App) bleibt
 * beim Mandanten-Theme. Ändert sich das Mandanten-Theme (theme.json, Sprache), wird neu abgeleitet.
 */
export const AdminThemeScope = ({children}: PropsWithChildren) => {
    const outer = useTheme()
    const theme = useMemo(() => adminTheme(outer), [outer])
    return (
        <OuterThemeContext.Provider value={outer}>
            <ThemeProvider theme={theme}>{children}</ThemeProvider>
        </OuterThemeContext.Provider>
    )
}

/**
 * Ausweg für bereits gestaltete Vollbild-Arbeitsplätze unterhalb von `RootLayout` (Regie,
 * Leitstand, Zeitnahme-Posten, Startanzeige, Schiedsrichter-Dashboard; Auswahl der Routen in
 * `RootLayout`): stellt dort wieder das unveränderte
 * Mandanten-Theme her. Außerhalb eines AdminThemeScope ohne Wirkung.
 */
export const LegacyThemeScope = ({children}: PropsWithChildren) => {
    const outer = useContext(OuterThemeContext)
    return outer ? <ThemeProvider theme={outer}>{children}</ThemeProvider> : <>{children}</>
}
