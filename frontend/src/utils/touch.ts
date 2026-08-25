import {useMediaQuery} from '@mui/material'

/**
 * Reine Touch-Geräte: grober Zeiger UND kein Hover. Ein Laptop mit Touchscreen (Hover über die
 * Maus) oder ein Tablet mit Trackpad-Tastatur fällt damit heraus und behält z.B. die
 * Tasten-Hinweise der Boards. Eine physische Tastatur selbst ist per Media-Query nicht erkennbar —
 * diese Kombination ist die beste verfügbare Näherung.
 */
export const TOUCH_ONLY_MEDIA = '(hover: none) and (pointer: coarse)'

/** True auf Geräten, die ausschließlich per Touch bedient werden (Telefon, nacktes Tablet). */
export function useTouchOnly(): boolean {
    return useMediaQuery(TOUCH_ONLY_MEDIA)
}

/**
 * Mindestens 44×44 pt Tipp-Fläche auf reinen Touch-Geräten — als sx-Baustein für die kleinen
 * Icon-Knöpfe der Boards (Umhängen, Rücknahme, Menüs), die mit der Maus bewusst kompakt bleiben.
 */
export const touchTargetSx = {
    [`@media ${TOUCH_ONLY_MEDIA}`]: {minWidth: 44, minHeight: 44},
} as const
