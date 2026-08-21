package de.lambda9.ready2race.backend.app.timing.entity

/**
 * Why a team has no time, or `NONE` when it has one.
 *
 * A status other than [NONE] supersedes every time on the official-time row: the effective time
 * becomes null, and pushing the row writes the existing results flow's no-result representation
 * (`competition_match_team.failed` + `failed_reason`) instead of a `timecode`.
 */
enum class OfficialTimeResultStatus {
    NONE,
    DNS,
    DNF,
    DSQ,
}
