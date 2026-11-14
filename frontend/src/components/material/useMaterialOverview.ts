import {getMaterialOverview} from '@api/sdk.gen.ts'
import {useFetch} from '@utils/hooks.ts'

type Props = {
    eventId: string
    /** Ohne Anbieter wird nichts geladen (Konto ohne Zuordnung, noch kein `?provider=`). */
    providerId: string | undefined
}

/**
 * Lädt die Anbieter-Übersicht (Angebote, Flotte, Anfragen, Läufe, Vergabeschluss) EINMAL je
 * Dashboard. Die Seite reicht sie an alle Reiter weiter, damit die Zähler im Reiterkopf und die
 * Listen denselben Stand zeigen und ein Neuladen alle Reiter erfasst. Ladefehler zeigt die Seite
 * als `ErrorState` an der Stelle des Inhalts, nicht als Snackbar.
 */
export const useMaterialOverview = ({eventId, providerId}: Props) => {
    const {
        data: overview,
        pending,
        error,
        reload,
    } = useFetch(
        signal => getMaterialOverview({signal, path: {eventId, providerId: providerId ?? ''}}),
        {
            preCondition: () => providerId !== undefined,
            deps: [eventId, providerId],
        },
    )

    return {overview: overview ?? undefined, pending, error, reload}
}

export type MaterialOverviewState = ReturnType<typeof useMaterialOverview>
