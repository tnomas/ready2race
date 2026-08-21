package de.lambda9.ready2race.backend.app.timing.entity

import java.time.LocalDateTime

/**
 * The match phase as the timing boards need it: is this team expected right now?
 *
 * Deliberately coarser than `LiveDashboardLogic.deriveMatchState` - the boards only sort and group
 * by it, so PREPARING/RUNNING collapse into [ACTIVE] and everything not yet activated or finished
 * into [OPEN]. The branch order below mirrors `deriveMatchState` exactly (activation checked before
 * `finished_at`), so the two derivations can never disagree about a match; anything finer than
 * these three would re-derive state the timing module has no use for (skipped slots, per-team
 * settlement).
 */
enum class TimingMatchPhase {
    /** The match is called up or on the water (`activated_at` set) - these teams come first. */
    ACTIVE,

    /** Neither activated nor finished - the match is still ahead. */
    OPEN,

    /** Someone finished the match (`finished_at` set, activation cleared) - late edits only. */
    DONE,

    ;

    companion object {
        fun of(activatedAt: LocalDateTime?, finishedAt: LocalDateTime?): TimingMatchPhase = when {
            activatedAt != null -> ACTIVE
            finishedAt != null -> DONE
            else -> OPEN
        }
    }
}
