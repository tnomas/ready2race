/**
 * Welche Meldung das Regie-Board zeigt, wenn der Erstabruf des Szenenstands scheitert —
 * statt eines ewigen „Verbinde …": Eine gelöschte Szene (404) ist ein anderer Fall als ein
 * toter Server, und die Regie soll den Unterschied sehen.
 */
export const sceneViewErrorKey = (error: {
    status: number
}): 'event.stream.director.sceneGone' | 'common.error.unexpected' =>
    error.status === 404 ? 'event.stream.director.sceneGone' : 'common.error.unexpected'
