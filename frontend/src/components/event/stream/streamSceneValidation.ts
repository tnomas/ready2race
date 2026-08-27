import {StreamBackground} from '@api/types.gen'

/** Hex-Farbe in Kurz- oder Langform — wortgleich mit `StreamSceneRequest.HEX_COLOR` im Backend. */
export const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export type StreamSceneForm = {
    name: string
    background: StreamBackground
    chromaColor: string
    safeAreaPercent: number
}

export type StreamSceneFormErrors = {
    name: boolean
    safeAreaPercent: boolean
    chromaColor: boolean
}

/**
 * Client-seitige Vorprüfung, Feld für Feld wie `StreamSceneRequest.validate()` im Backend
 * (notBlank name, 0..100 safeAreaPercent, chromaColor nur bei CHROMA und dann als Hex-Farbe
 * Pflicht). Der Server bleibt die verbindliche Prüfung — das hier erspart nur die Server-Rundreise
 * für die offensichtlichen Fälle.
 */
export const validateStreamSceneForm = (form: StreamSceneForm): StreamSceneFormErrors => ({
    name: form.name.trim() === '',
    safeAreaPercent:
        !Number.isFinite(form.safeAreaPercent) || form.safeAreaPercent < 0 || form.safeAreaPercent > 100,
    chromaColor: form.background === 'CHROMA' && !HEX_COLOR_REGEX.test(form.chromaColor.trim()),
})

export const hasStreamSceneFormErrors = (errors: StreamSceneFormErrors): boolean =>
    errors.name || errors.safeAreaPercent || errors.chromaColor
