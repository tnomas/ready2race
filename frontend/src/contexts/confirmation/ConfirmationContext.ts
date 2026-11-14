import {createContext, ReactNode, useContext, useMemo} from 'react'
import {SxProps, Theme, useTheme} from '@mui/material'

export type Confirmation = {
    confirmAction: (action: () => void, options?: ConfirmationOptions) => void
}

export const ConfirmationContext = createContext<Confirmation | null>(null)

/**
 * Wie `useConfirmation`, aber ohne Provider `null` statt eines Fehlers (Tests, eingebettete
 * Ansichten).
 *
 * Der Provider liegt über dem Router und damit außerhalb jedes Theme-Bereichs der Seiten. Damit
 * die Rückfrage im Theme des Aufrufers erscheint (Verwaltung: Verwaltungs-Theme mit Kontrast und
 * Fokusring; Posten, Regie, Helfer-App: ihr eigenes), gibt der Hook das Theme an der Aufrufstelle
 * mit, und der Provider rendert den Dialog darin.
 */
export const useOptionalConfirmation = (): Confirmation | null => {
    const confirmation = useContext(ConfirmationContext)
    const theme = useTheme()
    return useMemo(
        () =>
            confirmation === null
                ? null
                : {
                      confirmAction: (action, options) =>
                          confirmation.confirmAction(action, {theme, ...options}),
                  },
        [confirmation, theme],
    )
}

export const useConfirmation = (): Confirmation => {
    const confirmation = useOptionalConfirmation()
    if (confirmation === null) {
        throw Error('Confirmation context not initialized')
    }
    return confirmation
}

export type ConfirmationOptions = {
    title?: string
    content?: ReactNode
    cancelText?: string
    okText?: string
    cancelAction?: () => void
    buttonsSX?: SxProps<Theme>
    /**
     * Unumkehrbare Aktion (Löschen, Änderungen verwerfen): Der Bestätigen-Knopf erscheint in der
     * Fehlerfarbe. Den Knopftext („Löschen") über `okText` setzen; Standard bleibt „Ok".
     */
    destructive?: boolean
    /** Theme, in dem der Dialog erscheint. Setzt `useConfirmation` selbst (Theme des Aufrufers). */
    theme?: Theme
}
