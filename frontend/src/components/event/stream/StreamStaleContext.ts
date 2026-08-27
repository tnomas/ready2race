import {createContext, useContext} from 'react'

/**
 * Die Naht, über die `GraphicFrame` an `isStreamStale` der Bühne herankommt, ohne dass jede
 * einzelne Grafik das Flag als eigenes Prop durchreichen müsste (`StreamScenePage` setzt den
 * Wert einmal für alle Slots). Voreinstellung `false`: eine Grafik außerhalb der Bühne — etwa
 * in einer künftigen Kontroll-Panel-Vorschau — blendet ohne Provider ganz normal ein, statt
 * durch eine fehlende Bühne blockiert zu werden.
 */
export const StreamStaleContext = createContext(false)

export const useStreamStale = (): boolean => useContext(StreamStaleContext)
