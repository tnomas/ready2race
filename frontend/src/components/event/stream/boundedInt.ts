/**
 * Liest eine Zahleneingabe eines Formulars als ganze Zahl im Bereich `[min, max]`.
 *
 * Für Felder, die ihren Wert als ROHTEXT halten (Einblenddauer, Zeilenzahl,
 * Sicherheitsabstand): Während des Tippens wird nichts geklemmt oder gerundet — wer „15"
 * eingeben will, tippt erst „1", und ein sofort auf 1 geklemmtes Feld ließe die 5 nicht mehr
 * zu. Erst bei Blur und beim Speichern wird gelesen: Dezimalstellen (Punkt oder Komma) werden
 * gerundet, Ausreißer auf die Grenzen geklemmt.
 *
 * `null` heißt „ungültig": leer oder unlesbar. Leer ist bewusst KEIN Rückfall auf eine
 * Vorgabe — die frühere Fassung behielt dann still den alten Wert, und das Feld zeigte etwas
 * anderes als das, was gespeichert wurde.
 */
export const parseBoundedInt = (raw: string, min: number, max: number): number | null => {
    const trimmed = raw.trim().replace(',', '.')
    if (trimmed === '' || !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(trimmed)) return null
    const value = Number(trimmed)
    if (!Number.isFinite(value)) return null
    return Math.min(max, Math.max(min, Math.round(value)))
}
