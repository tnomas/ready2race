import {getEvent} from '@api/sdk.gen.ts'
import {useFetch} from '@utils/hooks.ts'

/**
 * Name einer Veranstaltung für die Breadcrumbs von Unterseiten. Ein Fehler bleibt still: das
 * Glied zeigt dann „…" (`crumbLabel`), die Seite selbst meldet ihre eigenen Ladefehler.
 */
export const useEventName = (eventId: string): string | undefined => {
    const {data} = useFetch(signal => getEvent({signal, path: {eventId}}), {deps: [eventId]})
    return data?.name
}
