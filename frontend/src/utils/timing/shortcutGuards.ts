/**
 * Shared guards for the timing board's global keyboard shortcuts (Space for an unassigned capture,
 * digits 1-6 and letters A-F for a boat position of the focused match).
 *
 * These are deliberately DOM checks rather than React state: the shortcuts are registered on `window`,
 * so they fire no matter what has focus, and the only reliable way to know whether the keystroke was
 * meant for something else is to look at what is actually focused/open right now.
 */

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
    const tag = active?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
    if (active instanceof HTMLElement && active.isContentEditable) return true
    return document.querySelector('[role="dialog"]') !== null
}

/**
 * True while the focused control owns the Space key itself, i.e. Space must activate that control
 * rather than record a time mark. One carve-out today, marked in the DOM by a data attribute on the
 * container:
 *
 * - `[data-sequence-panel]` — an operator who tabs to "Sequenz starten" (or the start board's big
 *   start button / the sequence bar's abort) and presses space must activate that button, not
 *   silently bank a time.
 *
 * Scoped to Space **only**. Applying it to the digit/letter shortcuts would be an actual regression:
 * a click leaves the pressed button focused, and the boat-key shortcuts have to keep working
 * immediately afterwards without the operator first clicking somewhere else.
 */
export function isSpaceOwnedByFocusedControl(): boolean {
    const active = document.activeElement
    const tag = active?.tagName
    if (tag !== 'BUTTON' && tag !== 'INPUT' && tag !== 'A') return false
    if (!(active instanceof HTMLElement)) return false
    return active.closest('[data-sequence-panel]') !== null
}
