/**
 * Shared guards for the timing board's global keyboard shortcuts (Space for an unassigned capture,
 * digits 1-6 and letters A-F for a boat position of the focused match).
 *
 * These are deliberately DOM checks rather than React state: the shortcuts are registered on `window`,
 * so they fire no matter what has focus, and the only reliable way to know whether the keystroke was
 * meant for something else is to look at what is actually focused/open right now.
 *
 * Die Entscheidungen selbst sind reine Funktionen über die Merkmale des fokussierten Elements
 * (`elementIsTypingTarget`, `controlOwnsSpace`); die `is…`-Wrapper lesen nur `document`.
 */

/** Merkmale eines fokussierten Elements, so weit die Tipp-Erkennung sie braucht. */
export interface TypingTargetFacts {
    tagName: string | undefined
    isContentEditable: boolean
}

/** Ob ein Element mit diesen Merkmalen Tastatureingaben entgegennimmt. */
export function elementIsTypingTarget(facts: TypingTargetFacts): boolean {
    const tag = facts.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
    return facts.isContentEditable
}

/**
 * True while the keystroke belongs to *typing*, not to the board: a form field or contenteditable has
 * focus, or a modal dialog is open on top of the board (the assignment/confirmation/dead-letter
 * dialogs all render as `role="dialog"`).
 *
 * Blocks **every** board shortcut — a digit typed into the assignment dialog's search box must never
 * also capture a time.
 */
export function isTypingContext(): boolean {
    const active = document.activeElement
    if (
        elementIsTypingTarget({
            tagName: active?.tagName,
            isContentEditable: active instanceof HTMLElement && active.isContentEditable,
        })
    ) {
        return true
    }
    return document.querySelector('[role="dialog"]') !== null
}

/** Merkmale eines fokussierten Elements, so weit der Leertasten-Wächter sie braucht. */
export interface SpaceOwnerFacts {
    tagName: string | undefined
    role: string | null
}

const SPACE_OWNING_TAGS = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'])
const SPACE_OWNING_ROLES = new Set(['button', 'menuitem', 'tab', 'switch', 'checkbox'])

/**
 * Ob ein fokussiertes Element mit diesen Merkmalen die Leertaste selbst beansprucht. Native
 * Bedienelemente und alles mit einer Bedien-Rolle werden von der Leertaste aktiviert — unabhängig
 * davon, wo auf dem Board sie stehen. Ohne Fokus (`null`) gehört die Taste dem Board.
 */
export function controlOwnsSpace(facts: SpaceOwnerFacts | null): boolean {
    if (facts === null) return false
    if (facts.tagName !== undefined && SPACE_OWNING_TAGS.has(facts.tagName)) return true
    return facts.role !== null && SPACE_OWNING_ROLES.has(facts.role)
}

/**
 * True while the focused control owns the Space key itself, i.e. Space must activate that control
 * rather than record a time mark: any button, link, form field or element with a control role
 * (`button`, `menuitem`, `tab`, `switch`, `checkbox`). An operator who tabs to "Sequenz starten",
 * the view toggle or any other button and presses space must activate that button, not silently
 * bank a time — wherever on the board that button sits.
 *
 * Scoped to Space **only**. Applying it to the digit/letter shortcuts would be an actual regression:
 * a click leaves the pressed button focused, and the boat-key shortcuts have to keep working
 * immediately afterwards without the operator first clicking somewhere else.
 */
export function isSpaceOwnedByFocusedControl(): boolean {
    const active = document.activeElement
    if (active === null || active === document.body) return false
    return controlOwnsSpace({tagName: active.tagName, role: active.getAttribute('role')})
}
