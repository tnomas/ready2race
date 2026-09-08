/** Was von einem der drei Info-Feeds hier gebraucht wird: liegt etwas vor, ist etwas gescheitert. */
export type SpeakerFeedState = {
    data: unknown
    error: unknown
}

/**
 * Der Ladezustand des Boards aus den drei Feeds (anstehend, laufend, Ergebnisse). Geladen heißt:
 * mindestens ein Feed hat Daten - oder alle sind gescheitert, denn dann hilft kein Wartekreis
 * mehr, sondern nur die Meldung, was fehlt. `failed` zählt die gescheiterten Feeds für den Banner.
 */
export const summarizeFeeds = (
    feeds: readonly SpeakerFeedState[],
): {loaded: boolean; failed: number} => {
    const failed = feeds.filter(feed => feed.error != null).length
    const anyData = feeds.some(feed => feed.data != null)
    return {loaded: anyData || (feeds.length > 0 && failed === feeds.length), failed}
}
