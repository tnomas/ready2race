import {createContext} from 'react'
import {Theme} from '@mui/material/styles'

/** Das Mandanten-Theme unterhalb von AdminThemeScope – für LegacyThemeScope. */
export const OuterThemeContext = createContext<Theme | null>(null)
