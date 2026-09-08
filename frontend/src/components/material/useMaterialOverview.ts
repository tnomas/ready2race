import {useTranslation} from 'react-i18next'
import {getMaterialOverview} from '@api/sdk.gen.ts'
import {useFeedback, useFetch} from '@utils/hooks.ts'

type Props = {
    eventId: string
    providerId: string
}

/**
 * Lädt die Anbieter-Übersicht (Angebote, Flotte, Anfragen, Läufe) für die Reiter Anfragen und
 * Zuteilung. Jeder Reiter ruft dies selbst auf - kein gemeinsamer Kontext, dafür ein eigener
 * Reload-Knopf je Panel nach jeder Änderung.
 */
export const useMaterialOverview = ({eventId, providerId}: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const {
        data: overview,
        pending,
        error,
        reload,
    } = useFetch(signal => getMaterialOverview({signal, path: {eventId, providerId}}), {
        onResponse: ({error}) => {
            if (error) {
                feedback.error(t('common.load.error.single', {entity: t('material.material')}))
            }
        },
        deps: [eventId, providerId],
    })

    return {overview, pending, error, reload}
}
