import {useContext} from 'react'
import {Theme, useTheme} from '@mui/material/styles'
import {OuterThemeContext} from './outerThemeContext.ts'

/**
 * Das Mandanten-Theme ohne Verwaltungs-Schicht (oder das aktuelle, falls keine Schicht aktiv ist) –
 * z. B. für eine Vorschau, die zeigen soll, wie ein Board mit den Mandantenfarben aussieht.
 */
export const useOuterTheme = (): Theme => {
    const outer = useContext(OuterThemeContext)
    const current = useTheme()
    return outer ?? current
}
