/**
 * Die Weiche hinter `/app`: Wohin geht es nach der Anmeldung?
 *
 * Reihenfolge der Fragen: Darf die Person überhaupt etwas? Ist eine Veranstaltung klar? Gibt es
 * mehr als eine Welt? Jede Antwort, die sich aus Rechten und Bestand ergibt, wird ohne Nachfrage
 * getroffen — die Seite dahinter führt nur aus.
 *
 * Eine gemerkte Veranstaltung gilt, solange die Liste noch nicht geladen ist: Beim Kaltstart im
 * Funkloch wäre sonst die erste Ansicht eine Auswahl, die das Netz braucht.
 */
import {AppWorld, worldPath, WorldPath} from './appAccess.ts'
import {EventOperationWindow, splitEventsByOperation} from './eventOperations.ts'

export type EntryEvent = EventOperationWindow & {id: string}

export type EntryTarget = '/app/start' | WorldPath

export type EntryDecision =
    | {kind: 'WAIT'}
    | {kind: 'FORBIDDEN'}
    | {kind: 'CHOOSE_EVENT'}
    | {kind: 'ADOPT_EVENT'; eventId: string}
    | {kind: 'GO'; to: EntryTarget}

const goToWorlds = (worlds: AppWorld[]): EntryDecision =>
    worlds.length === 1 ? {kind: 'GO', to: worldPath[worlds[0]]} : {kind: 'GO', to: '/app/start'}

export const resolveEntry = (input: {
    worlds: AppWorld[]
    eventId: string | null
    events: EntryEvent[] | undefined
    now: Date
}): EntryDecision => {
    const {worlds, eventId, events, now} = input

    if (worlds.length === 0) return {kind: 'FORBIDDEN'}

    if (eventId !== null) {
        if (events === undefined) return goToWorlds(worlds)
        if (events.some(event => event.id === eventId)) return goToWorlds(worlds)
    }

    if (events === undefined) return {kind: 'WAIT'}

    const {operating} = splitEventsByOperation(events, now)
    if (operating.length === 1) return {kind: 'ADOPT_EVENT', eventId: operating[0].id}
    return {kind: 'CHOOSE_EVENT'}
}
