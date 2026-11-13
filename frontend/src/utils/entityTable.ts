import type {MobileColumnMode} from './types.ts'

/**
 * Reine Regeln der generischen Tabelle (`EntityTable`, `EntityCardList`, `EntityCard`). Hier
 * stehen sie, damit sie ohne DataGrid testbar sind.
 */

export type PageModel = {page: number; pageSize: number}

/**
 * Neue Suche oder neue Sortierung beginnt auf der ersten Seite. Sonst rechnet der Abruf den
 * Versatz mit der alten Seite: Seite 4, Suche mit einem Treffer → leere Seite (mobil „keine
 * Einträge", auf dem Desktop ein zweiter Abruf, sobald das Grid die Seite nachklemmt).
 * Steht die Seite schon auf 0, bleibt das Objekt dasselbe (kein zusätzlicher Abruf).
 */
export const firstPage = <M extends PageModel>(model: M): M =>
    model.page === 0 ? model : {...model, page: 0}

/**
 * Seite nach dem Eintreffen der Gesamtzahl gültig halten: Wer die letzte Zeile der letzten Seite
 * löscht, stünde sonst auf einer leeren Seite hinter dem Ende. Liefert dasselbe Objekt, wenn die
 * Seite gültig ist.
 */
export const clampPage = <M extends PageModel>(model: M, total: number): M => {
    if (model.pageSize <= 0) return model
    const lastPage = Math.max(0, Math.ceil(total / model.pageSize) - 1)
    return model.page > lastPage ? {...model, page: lastPage} : model
}

/** Höchstzahl Zeilenaktionen, die direkt als Icon-Knopf in der Zeile stehen. */
export const MAX_INLINE_ROW_ACTIONS = 2

export type RowActionsLayout = 'auto' | 'menu'

/**
 * Wohin die Zeilenaktionen gehören: bis zu zwei direkt in die Zeile, ab drei alle ins ⋮-Menü
 * (gemischte Anordnung würde je Zeile springen, wenn eine Aktion nur manchmal erlaubt ist).
 * `'menu'` erzwingt das frühere Verhalten (alles im Menü).
 */
export const rowActionsInline = (count: number, layout: RowActionsLayout = 'auto'): boolean =>
    layout === 'auto' && count > 0 && count <= MAX_INLINE_ROW_ACTIONS

/**
 * Lesbarer Name eines Datensatzes für die Lösch-Bestätigung („„Kiel-Regatta“ wird endgültig
 * gelöscht"). Nimmt `name`, sonst Vor- und Nachname, sonst `identifier`; sonst `undefined`
 * (die Bestätigung spricht dann allgemein vom Eintrag).
 */
export const entityDisplayName = (entity: unknown): string | undefined => {
    if (typeof entity !== 'object' || entity === null) return undefined
    const record = entity as Record<string, unknown>
    const text = (key: string): string | undefined => {
        const value = record[key]
        return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
    }
    const name = text('name')
    if (name) return name
    const person = [text('firstname'), text('lastname')].filter(Boolean).join(' ')
    if (person) return person
    return text('identifier')
}

/** Felder je Karte, die ohne Aufklappen sichtbar sind (ohne Titel). */
export const MAX_CARD_FIELDS = 4

export type CardFieldPlan<C> = {
    title?: C
    visible: C[]
    more: C[]
}

/**
 * Aufteilung der Spalten auf eine mobile Karte: eine Titelspalte (die mit `mobile: 'title'`,
 * sonst die erste), danach höchstens `max` Felder; der Rest liegt hinter „Weitere Angaben".
 * `mobile: 'show'` steht immer sichtbar, `mobile: 'hide'` nie. Die Spalte `actions` zählt nicht.
 */
export const planCardFields = <C extends {field: string; mobile?: MobileColumnMode}>(
    columns: readonly C[],
    max: number = MAX_CARD_FIELDS,
): CardFieldPlan<C> => {
    const candidates = columns.filter(c => c.field !== 'actions' && c.mobile !== 'hide')
    const title = candidates.find(c => c.mobile === 'title') ?? candidates[0]
    const rest = candidates.filter(c => c !== title)
    const pinned = rest.filter(c => c.mobile === 'show')
    const optional = rest.filter(c => c.mobile !== 'show')
    const free = Math.max(0, max - pinned.length)
    const shown = new Set<C>([...pinned, ...optional.slice(0, free)])
    return {
        title,
        visible: rest.filter(c => shown.has(c)),
        more: rest.filter(c => !shown.has(c)),
    }
}
