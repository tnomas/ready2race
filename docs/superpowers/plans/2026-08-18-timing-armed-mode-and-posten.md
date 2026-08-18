# Timing Armed Mode + Posten Consolidation Plan (Plans 2b + 5)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Two tasks, one review gate each.

## Task 2b: Armed mode, digit keys, direct-tap (frontend only)

Per spec "Split/finish board → Keyboard capture": armed slots on the split/finish board (NOT on START stations — those have the sequence panel).

- **Direct-tap team grid**: a second capture view mode toggle on the board ("Zwei-Schritt" / "Teams"): grid of large team buttons (startNumber + short label; teams from the loaded list, sorted by startNumber; already-finished teams — i.e. teams with an ACTIVE assigned mark at THIS station — render disabled/checked). Tap = capture + assign in ONE flow: mark id `crypto.randomUUID()`, `now()`, write-ahead enqueue (extend `PendingTimeMark` with optional `competitionMatchTeam`; the drain and the direct POST path both call assignTimeMark after a successful mark POST — assignment failure → feedback.error, mark stays unassigned = two-step fallback), `applyLocalMark` + optimistic assignment, sound.
- **Armed mode** (within the Teams view): an "Scharfstellen" toggle; tapping team buttons while arming builds an ordered armed list; each armed slot gets a color-coded chip with its key label (A, B, C, D… in arming order; colors from a fixed 8-color palette). Pressing that KEY (or tapping the armed chip) captures+assigns THAT team and removes the slot; un-arm via long-press/x on the chip. Keys only active when the Teams view is shown and no input/dialog focused.
- **Digit keys**: in the Teams view, digits 1-9 capture+assign the team with that startNumber (if unambiguous and not finished); Space still banks an unassigned two-step mark.
- i18n de/en/da; tsc+build green. Commit: `Add armed mode and team capture grid`.

Review gate (named risks): write-ahead queue extension backward compatible with existing queued items (missing field); assign-after-drain ordering + idempotency; key handling collisions (Space vs digits vs armed letters, dialog guards); finished-team detection correctness under WS updates; no regression of START-station board.

## Task 5: Schiedsrichter under the Posten area

Per spec "Posten concept": the existing referee working view (Wettkampf-Check app function, `APP_COMPETITION_CHECK` privilege) is re-homed so the Posten area is the single entry point.

- `TimingStationSelectPage` (the de-facto "Posten wählen" page) additionally shows non-timing Posten cards: **Schiedsrichter** (visible with `updateAppCompetitionCheckGlobal` privilege — navigates to the existing competition-check flow for the SAME event, study how AppFunctionSelectPage/competitionCheck wires eventId — via AppSessionContext; set the session eventId before navigating if that's the mechanism) and the existing **Leitstand** card. Section headers: "Zeitnahme" (stations) / "Weitere Posten".
- `AppFunctionSelectPage`: the timing card stays; the competition-check card stays (unchanged behavior — the Posten page is an ADDITIONAL entry, not a removal; removal would break existing users mid-transition). Document this as the transition state in the code comment.
- Rights: `getUserAppRights` — a user with ONLY competition-check rights should also see the timing/Posten card IF we want single entry… NO: keep gating as-is (timing card needs APP_TIMING); competition-check-only users keep their direct card. v1 consolidation is additive only.
- i18n de/en/da; tsc+build green. Commit: `Add referee entry to posten selection`.

Review gate: eventId handoff correctness into the competition-check flow; privilege gating (no card leaks to unprivileged users); no regression of the QR-area session flow.

## Afterwards

Push branch to origin (fork tnomas/ready2race), open PR against main with a German summary of the whole timing module (NO AI mentions per repo owner's rules).
