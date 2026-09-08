import {MaterialForTeamDto} from '@api/types.gen.ts'

/**
 * "deviationsOnly": nur eine Abweichung ist der Rede wert (Wandanzeige, wo Platz knapp ist).
 * "always": auch die Regelfälle stehen da, inklusive des eigenen Boots (Mein Event, wo jede
 * Zeile ohnehin genau eine Sportlerin betrifft).
 */
export type MaterialLabelMode = 'deviationsOnly' | 'always'

/**
 * Darstellungsregel für ein Materialstück je Lauf (Spec Abschnitt 11). Kategorie OTHER (Riemen,
 * Steuerausrüstung, ...) erscheint hier nie - das ist Sache des Materialblocks der Meldung
 * (`MyEventMaterial`), nicht der einzelnen Laufzeile. Ohne bestätigte Anfrage rudert das Team
 * sein eigenes Boot; das ist im Modus "always" eine eigene Zeile ("eigenes Boot"), im Modus
 * "deviationsOnly" schlicht nichts, weil es keine Abweichung von irgendetwas ist.
 */
export const materialLabel = (
    material: MaterialForTeamDto | null | undefined,
    mode: MaterialLabelMode,
): {text: string; deviates: boolean} | 'own' | null => {
    if (material == null) {
        return mode === 'always' ? 'own' : null
    }
    if (material.category === 'OTHER') {
        return null
    }
    if (!material.deviatesFromStartNumber) {
        return mode === 'always' ? {text: material.label, deviates: false} : null
    }
    return {text: material.label, deviates: true}
}
