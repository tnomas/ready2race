package de.lambda9.ready2race.backend.app.timing.entity

/**
 * Why a team has no time, or [NONE] when it has one.
 *
 * A status other than [NONE] supersedes every measured time: the final time becomes null, and the
 * push writes the results flow's existing no-result representation
 * (`competition_match_team.failed` + `failed_reason`) instead of a `timecode`.
 *
 * Stored in the very column referees and the file import already write - there is no separate status
 * column for timing. `failed_reason` is free text there, and only a LEADING token counts as a
 * status, so "DNF Steg gerammt" is a DNF with a note. The parser below is the backend twin of the
 * frontend's `utils/matchResultStatus.ts` (same aliases, same leading-token rule) - it has to read
 * what a referee typed, while [name] is what timing writes back: always the canonical `DSQ`, never
 * the `DQ` alias.
 */
enum class TimingResultStatus {
    NONE,
    DNS,
    DNF,
    DSQ;

    companion object {

        private val LEADING_TOKEN = Regex("""^(DNS|DNF|DISQ|DSQ|DQ)\b""", RegexOption.IGNORE_CASE)

        /**
         * The status a stored `failed_reason` expresses, or [NONE] when it carries none.
         *
         * A reason without a recognizable leading token (a referee's free-text remark) is
         * deliberately NOT a status: timing must not reinterpret it, and re-saving the team from the
         * Leitstand must not silently turn it into one.
         */
        fun fromFailedReason(failedReason: String?): TimingResultStatus {
            val reason = failedReason?.trim().orEmpty()
            val token = LEADING_TOKEN.find(reason)?.groupValues?.get(1)?.uppercase() ?: return NONE
            return when (token) {
                "DNS" -> DNS
                "DNF" -> DNF
                else -> DSQ
            }
        }
    }
}
