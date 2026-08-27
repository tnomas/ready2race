import {CSSProperties} from 'react'
import {StreamPlacement} from '@api/types.gen'

/**
 * Feste Anker der acht Grafikplätze innerhalb der Safe-Area der Bühne (siehe
 * `StreamScenePage`). Jeder Platz ist absolut zur Safe-Area verankert; Tasks 10–12 füllen die
 * Slots mit den eigentlichen Grafiken und lesen dafür dieselbe Zuordnung, damit Bühne und
 * künftige Grafik-Komponenten nie auseinanderlaufen.
 *
 * `Record<StreamPlacement, …>` statt eines Zweigs pro Fall: eine neue Platzierung in der
 * generierten API meldet sich als TypeScript-Fehler hier, statt in der Bühne unbemerkt zu
 * fehlen.
 */
export const STREAM_PLACEMENT_STYLE: Record<StreamPlacement, CSSProperties> = {
    BOTTOM_CENTER: {position: 'absolute', left: '50%', bottom: 0, transform: 'translateX(-50%)'},
    BOTTOM_LEFT: {position: 'absolute', left: 0, bottom: 0},
    BOTTOM_RIGHT: {position: 'absolute', right: 0, bottom: 0},
    TOP_LEFT: {position: 'absolute', left: 0, top: 0},
    TOP_RIGHT: {position: 'absolute', right: 0, top: 0},
    SIDE_LEFT: {position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)'},
    SIDE_RIGHT: {position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)'},
    FULL_CENTER: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
}

/** Alle acht Plätze, in einer stabilen Reihenfolge fürs Rendern der Slots. */
export const STREAM_PLACEMENTS = Object.keys(STREAM_PLACEMENT_STYLE) as StreamPlacement[]
