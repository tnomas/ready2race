package de.lambda9.ready2race.backend.app.paceReference.entity

/**
 * Wie eine Sportart ihr Tempo ausdrückt.
 *
 * [TIME_PER_DISTANCE] beantwortet „wie lange für n Meter" (Rudern: 2:05 /500 m, Laufen: 4:30 /km),
 * [DISTANCE_PER_TIME] „wie weit in einer Stunde" (Radsport: 34,2 km/h). Zwei Ausprägungen statt
 * einer freien Formel: Jede Sportart, die uns einfällt, fällt in eine der beiden — und zwei Fälle
 * lassen sich prüfen, eine Formel, die niemand liest, nicht.
 */
enum class PaceReferenceMode { TIME_PER_DISTANCE, DISTANCE_PER_TIME }
