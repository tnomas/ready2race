import {useCallback} from 'react'
import {useTranslation} from 'react-i18next'
import {useFeedback} from '@utils/hooks.ts'
import {materialErrorKey} from './materialErrors.ts'

/**
 * `onDeleteError` für die Materialtabellen: Ein Löschen, das an Verwendung scheitert (Stücke,
 * Anfragen, Bedarf, zugeordnete Konten), sagt, was zu tun ist; alles andere bleibt beim
 * allgemeinen „konnte nicht gelöscht werden“. Netzfehler behandelt die Tabelle selbst.
 */
export const useMaterialDeleteError = (entityName: string) => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    return useCallback(
        (error: unknown) => {
            const key = materialErrorKey(error)
            feedback.error(key ? t(key) : t('entity.delete.error', {entity: entityName}))
        },
        [entityName, feedback, t],
    )
}
