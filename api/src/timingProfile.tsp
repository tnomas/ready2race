import "@typespec/http";
import "@typespec/rest";
import "@typespec/openapi";
import "./common.tsp";
import "./timing.tsp";

using Http;
using Rest;
using OpenAPI;

namespace Ready2Race;

/**
 * The timing-profile tree: ONE concept for "which RaceClocker race" (RACE) or "which timing
 * mode" (MODE) applies to a match, inherited over four levels - event root, competition, round,
 * match. Every level carries its own profile (null = inherit) and the one actually in effect.
 * The inheritance rule lives on the server only; the UI is a pure display of the tree.
 */

// ==========================================================================
// Models
// ==========================================================================

// Which kind of profile the event uses. Not freely chosen: RACE goes with timing_system
// RACECLOCKER, MODE with INTERN. With any other system there are no profiles.
enum TimingProfileKind {
  RACE;
  MODE;
}

// A selectable profile - a race for RACE, a timing mode for MODE.
model TimingProfileOptionDto {
  id: uuid;
  name: string;

  // Second line of the select - results URL of the race, start grouping or interval of the mode.
  detail?: string;
}

model TimingProfileMatchDto {
  matchId: uuid;
  name: string;
  ownProfile?: uuid;
  effectiveProfile?: uuid;
}

model TimingProfileRoundDto {
  roundId: uuid;
  name: string;
  ownProfile?: uuid;
  effectiveProfile?: uuid;
  matches: TimingProfileMatchDto[];
}

model TimingProfileCompetitionDto {
  competitionId: uuid;
  identifier: string;
  name: string;
  ownProfile?: uuid;
  effectiveProfile?: uuid;
  rounds: TimingProfileRoundDto[];
}

model TimingProfileTreeDto {
  timingSystem?: TimingSystem;
  kind?: TimingProfileKind;
  options: TimingProfileOptionDto[];

  // The profile of the root; absent means not set (the root inherits from nobody).
  ownProfile?: uuid;
  competitions: TimingProfileCompetitionDto[];
}

// Upsert of one level of the tree: the entry for the given path is created or replaced; a null
// profile removes it and puts the level back on "inherit". All three path fields null address
// the root (the event itself).
model TimingProfileAssignmentRequest {
  competition?: uuid;
  competitionSetupRound?: uuid;
  competitionSetupMatch?: uuid;
  profile?: uuid;
}

// ==========================================================================
// Routes
// ==========================================================================
// GET /tree: require ReadEventGlobal
// PUT /assignment, DELETE /assignments: require UpdateEventGlobal

@route("/event/{eventId}/timing-profile")
@tag("Timing")
interface TimingProfileRoutes {

  @get
  @route("/tree")
  @operationId("getTimingProfileTree")
  getTimingProfileTree(@path eventId: uuid): TimingProfileTreeDto;

  // Upsert over the natural key (competition, round, match). 409 TIMING_PROFILE_KIND_MISMATCH
  // when the profile is of the wrong kind for the event, 422 TIMING_PROFILE_SCOPE_INVALID when
  // the path does not belong to this event.
  @put
  @route("/assignment")
  @operationId("upsertTimingProfileAssignment")
  upsertTimingProfileAssignment(
    @path eventId: uuid,
    @body request: TimingProfileAssignmentRequest,
  ): void;

  // Clears every level BELOW the given one so all of them inherit again: without `competition`
  // the whole event except its root, with it the rounds and matches of that competition (its own
  // entry stays).
  @delete
  @route("/assignments")
  @operationId("resetTimingProfileAssignments")
  resetTimingProfileAssignments(
    @path eventId: uuid,
    @query competition?: uuid,
  ): void;
}
