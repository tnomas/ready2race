/**
 * Entscheidungen des Blocks „Meldungen fixieren" rund um den Schalter „Meldungsnummern nach
 * Bootsnummern vergeben" (ADR-0111). Jede Fixierung schreibt den Schalter an die Veranstaltung;
 * deshalb darf die Oberfläche ihn nie still abschalten - gesendet wird, was der Nutzer sieht.
 */

/** Stand der Anbieterliste der Veranstaltung: lädt noch, Fehler, oder Anzahl der Anbieter. */
export type ProviderListState =
    | {kind: 'pending'}
    | {kind: 'error'}
    | {kind: 'loaded'; count: number}

export type FinalizeSwitchState = {
    /** Haken sichtbar: bei Anbietern immer, ohne Anbieter nur, solange der Schalter gespeichert an ist. */
    visible: boolean
    /** Fixieren gesperrt, bis die Anbieterliste da ist; bei einem Fehler bleibt es gesperrt. */
    blockedBy: 'pending' | 'error' | null
    /** Der Wert, den die Fixierung sendet. */
    send: boolean
}

/**
 * @param stored gespeicherter Stand an der Veranstaltung (`EventDto.teamNumbersAsStartNumbers`)
 * @param selected Stand des Hakens; vorbelegt mit [stored], änderbar nur über den sichtbaren Haken
 */
export const finalizeSwitchState = (
    stored: boolean,
    selected: boolean,
    providers: ProviderListState,
): FinalizeSwitchState => {
    const hasProviders = providers.kind === 'loaded' && providers.count > 0
    // Ohne Anbieter (oder ohne geladene Liste) bleibt ein gespeichertes "an" sichtbar, damit es
    // nur bewusst abgeschaltet werden kann.
    const visible = hasProviders || stored
    const blockedBy = providers.kind === 'loaded' ? null : providers.kind
    // Unsichtbar heißt: gespeichert aus und kein Anbieter - dann ist auch der Haken aus (vorbelegt
    // mit dem gespeicherten Stand). Sichtbar zählt, was angehakt ist.
    const send = visible ? selected : stored
    return {visible, blockedBy, send}
}

/** Welche Erklärung der Dialog zeigt: nur den Fall, der mit dem aktuellen Haken eintritt. */
export const numbersExplanationKey = (selected: boolean): 'numbersOn' | 'numbersOff' =>
    selected ? 'numbersOn' : 'numbersOff'

/**
 * Der Hinweis auf schon angelegte Läufe (Meldungen darin behalten ihre Nummer, Läufe ihre Regel,
 * Angleichen nur über Runde löschen/neu anlegen) steht nur, wenn es Läufe gibt. Solange deren
 * Anzahl nicht geladen ist, steht er vorsichtshalber da.
 */
export const showExistingMatchesHint = (matchCount: number | null): boolean =>
    matchCount === null || matchCount > 0
