/**
 * Reine Regeln des generischen Formulardialogs (`EntityDialog`).
 */

/**
 * Wann `onOpen` (setzt das Formular zurück) bei schon offenem Dialog erneut läuft, wenn sich
 * seine Identität ändert:
 * - `'pristine'` (Standard): nur solange niemand etwas geändert hat. Nachgeladene Daten (etwa
 *   die Teilnehmenden im Freigabe-Dialog) füllen das Formular noch, aber ein Abgleich im
 *   Hintergrund (Zeitplan alle 30 s) wirft keine Eingaben mehr weg.
 * - `'always'`: früheres Verhalten, jede neue `onOpen`-Identität setzt zurück.
 * - `'never'`: nur beim Öffnen.
 */
export type DialogRefreshMode = 'pristine' | 'always' | 'never'

export type DialogOpenState = {
    open: boolean
    wasOpen: boolean
    onOpenChanged: boolean
    entityChanged: boolean
    dirty: boolean
}

export const shouldRunOnOpen = (
    {open, wasOpen, onOpenChanged, entityChanged, dirty}: DialogOpenState,
    mode: DialogRefreshMode = 'pristine',
): boolean => {
    if (!open) return false
    // Gerade geöffnet oder auf einen anderen Datensatz umgestellt: immer neu befüllen.
    if (!wasOpen || entityChanged) return true
    if (!onOpenChanged) return false
    switch (mode) {
        case 'always':
            return true
        case 'never':
            return false
        case 'pristine':
            return !dirty
    }
}

/** Schließen fragt nach, wenn ungespeicherte Änderungen verloren gingen. */
export const shouldConfirmDiscard = ({
    enabled,
    dirty,
    submitting,
}: {
    enabled: boolean
    dirty: boolean
    submitting: boolean
}): boolean => enabled && dirty && !submitting

/**
 * Ob das Verlassen einer Seite mit ungespeicherten Eingaben nachfragen soll. Ohne Sitzung nie:
 * Das Abmelden räumt die Sitzung VOR der Navigation ab. Eine Rückfrage käme dann zu spät -
 * „Bleiben" ließe die Person abgemeldet auf einer Seite sitzen, deren Eingaben sie nicht mehr
 * absenden kann.
 */
export const shouldConfirmLeaving = ({
    unsavedChanges,
    signedIn,
}: {
    unsavedChanges: boolean
    signedIn: boolean
}): boolean => unsavedChanges && signedIn
