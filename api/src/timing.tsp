import "@typespec/http";
import "@typespec/rest";
import "@typespec/openapi";
import "./common.tsp";

using Http;
using Rest;
using OpenAPI;

namespace Ready2Race;

/**
 * Live timing: stations capture time marks (start/split/finish), which are then assigned to a
 * competition match team to produce a result.
 *
 * In addition to the HTTP routes below, timing state changes are pushed over a websocket channel:
 *
 * - Path: `/api/ws/event/{eventId}/timing` (note the `/api/ws` prefix - this channel lives outside
 *   the regular `/api` REST routes documented in this spec).
 * - Auth: browsers cannot set custom headers on a websocket handshake, so the session token is
 *   passed as the second entry of the `Sec-WebSocket-Protocol` header: connect with
 *   `new WebSocket(url, ["r2r", sessionToken])`. Non-browser clients may instead send the usual
 *   session header/cookie and omit the subprotocol.
 * - Messages are JSON objects discriminated by a `type` field, mirroring `TimingWsMessage`:
 *   - `{ type: "timeMarkCreated", mark: TimeMarkDto }`
 *   - `{ type: "timeMarkRetracted", id: uuid }`
 *   - `{ type: "assignmentChanged", timeMark: uuid, competitionMatchTeam: uuid | null }` -
 *     `competitionMatchTeam` is always present, even when `null` (a detach), so clients can
 *     distinguish "no assignment" from a field that was never sent.
 *   - `{ type: "stationsChanged" }` - stations were added, edited, or removed; refetch
 *     `GET /event/{eventId}/timing/stations` (or `/timing/state`).
 *   - `{ type: "matchesChanged" }` - the set of matches the stations are expected to time changed:
 *     a match was created (round generation, automatic follow-up rounds), dropped (round deleted,
 *     bye), or moved (schedule slot, start time, start numbers), or the timing mode resolved for a
 *     match is now a different one. Like `stationsChanged` a pure trigger without a body; refetch
 *     `GET /event/{eventId}/timing/matches`. Clients should debounce - one round generation emits a
 *     single message, but a schedule shift and the round it completes can arrive back to back.
 *   - `{ type: "sequenceChanged", sequence: TimingSequenceDto }` - a start sequence (see below) was
 *     created, started, aborted, had an entry fire or get skipped, or completed. Boards watching
 *     that sequence's station should replace their local copy with `sequence`.
 *   - `{ type: "falseStart", competitionSetupMatch: uuid }` - an EXPLICIT false start (recall) was
 *     triggered for that match from the start station's capture board
 *     (`POST /event/{eventId}/timing/matches/{matchId}/falseStart`). Athlete displays showing the
 *     match should flash red and show "Fehlstart". Deliberately its own message next to
 *     `attemptRetracted`: that one also fires for silent clean-up ("retract start and restart"
 *     after a botched capture), which must not make a display at the water flash. A false start
 *     emits both, so boards that hang their mark lists and their false-start tone on
 *     `attemptRetracted` keep working unchanged. Emitted even when nothing had to be retracted
 *     (a recall before the first mark) - that is exactly when it matters most. Whether the
 *     trigger is offered at all depends on `TimingModeDto.falseStartEnabled` of the match's
 *     resolved timing mode; the route rejects it with 409 when the mode has it switched off
 *     (rowing time trials answer a false start with a time penalty instead of a recall).
 * - The channel is receive-only: clients should ignore any data they send on it and rely on the
 *   server's ping/pong keepalive.
 * - On (re)connect, clients should always fetch `GET /event/{eventId}/timing/state` first and
 *   only then start applying incoming messages, to cover updates missed while disconnected.
 */

// ==========================================================================
// Models
// ==========================================================================

// ANZEIGE is a read-only display station (start referee / athlete screen): it never captures a
// time mark, it mirrors the start sequences of the START station it is linked to.
enum TimingStationType {
  START;
  SPLIT;
  FINISH;
  ANZEIGE;
}

// How a station reacts to a press. ONETOUCH captures immediately - right at the finish line, where
// every press is intended. ARMED requires the station to be armed first (setTimingStationArmed):
// out on the course the device lies in a boat or a pocket, and an accidental press must not become
// a time mark.
enum TimingCaptureMode {
  ONETOUCH;
  ARMED;
}

model TimingStationDto {
  id: uuid;
  event: uuid;
  name: string;
  type: TimingStationType;
  sorting: int32;

  // Only set on ANZEIGE stations: the START station this display mirrors; absent = every start
  // sequence of the event.
  linkedStation?: uuid;
  captureMode: TimingCaptureMode;

  // Whether the station is currently armed. Only meaningful while `captureMode` is ARMED; flipped
  // through setTimingStationArmed, never through updateTimingStation.
  armed: boolean;
}

model TimingStationRequest {
  name: string;
  type: TimingStationType;
  sorting: int32;

  // Only allowed for type ANZEIGE, and must reference a START station of the same event.
  linkedStation?: uuid;

  // Omit to leave the mode unchanged; on create it then becomes ONETOUCH. Deliberately not
  // defaulted on update: a form that does not know the field must not silently reset it.
  captureMode?: TimingCaptureMode;
}

model TimingStationArmedRequest {
  armed: boolean;
}

model TimeMarkDto {
  id: uuid;
  event: uuid;
  station: uuid;
  timestampMillis: int64;
  source: string; // "APP_USER" | "HARDWARE"
  status: string; // "ACTIVE" | "RETRACTED" - retracted marks stay in the state, never deleted
  createdBy?: uuid;
  assignedTeam?: uuid; // competition_match_team, if this mark has been assigned to a team
}

model CreateTimeMarkRequest {
  // Client-generated id: capturing the same id twice (e.g. an app retrying after a dropped
  // response) is idempotent and creates only one time mark.
  id: uuid;
  station: uuid;
  timestampMillis: int64;
}

model AssignTimeMarkRequest {
  // Omit or set to `null` to detach the time mark from any team.
  competitionMatchTeam?: uuid;
}

model TimingStateDto {
  stations: TimingStationDto[];
  timeMarks: TimeMarkDto[];
}

model ServerTimeResponse {
  serverTimeMillis: int64;
}

model TimingTeamDto {
  competitionMatchTeam: uuid;
  startNumber?: int32;
  teamName?: string;
  clubName?: string;
  participantNames: string[];
  competitionName?: string;
  matchName?: string;
}

enum SequenceMode {
  MASS;
  INTERVAL;
}

enum SequenceState {
  ARMED;
  RUNNING;

  // Angehalten: die Sequenz feuert nichts, bleibt aber die aktive Sequenz ihres Postens und
  // belegt ihn weiter. Nur aus RUNNING erreichbar; von hier aus geht es fortsetzen, zurücksetzen
  // oder abbrechen.
  PAUSED;
  DONE;
  ABORTED;
}

enum SequenceEntryStatus {
  PENDING;
  STARTED;
  SKIPPED;
}

model TimingSequenceEntryDto {
  id: uuid;
  competitionMatchTeam: uuid;
  position: int32;
  status: SequenceEntryStatus;

  // Wall-clock instant (server epoch millis) this entry is scheduled to fire at, or absent while
  // the sequence has not been started yet.
  plannedStartMillis?: int64;
  timeMark?: uuid;
}

model TimingSequenceDto {
  id: uuid;
  event: uuid;
  station: uuid;
  mode: SequenceMode;

  // Only ever set for mode INTERVAL.
  intervalMillis?: int64;

  // Countdown before the first entry fires, in milliseconds, counted from startedAtMillis. Gives
  // clients room to run a countdown (with beeps) before anything actually starts.
  leadInMillis: int64;
  state: SequenceState;
  startedAtMillis?: int64;

  // Beginn der laufenden Pause (Server-Epoch-Millis); nur bei state PAUSED gesetzt. Die bereits
  // aufgelaufene Pausendauer steckt dagegen schon in plannedStartMillis - eine Pause verschiebt
  // die ganze Kette um ihre Dauer nach hinten, der Abstand zwischen zwei Booten bleibt gleich.
  pausedAtMillis?: int64;
  entries: TimingSequenceEntryDto[];
}

model CreateSequenceRequest {
  station: uuid;
  mode: SequenceMode;

  // Required (and must be >= 1000) for mode INTERVAL; ignored for MASS.
  intervalMillis?: int64;

  // Ordered: index in this list becomes the entry position and therefore the start slot.
  teams: uuid[];

  // Countdown before the first entry fires, in milliseconds. When absent, defaults to
  // intervalMillis for mode INTERVAL (one full cadence) or 10000 for MASS. When given, must be
  // between 3000 and 600000.
  leadInMillis?: int64;
}

// A station without an armed or running sequence is the normal case (the board then shows its
// setup form), not a missing resource - hence `sequence` being absent rather than a 404.
//
// `sequence` is not limited to ARMED/RUNNING: if the station has none of those, the most recently
// finished (DONE/ABORTED) sequence is returned instead, as long as it finished within the last 10
// minutes. This lets a client that reconnects (or missed the terminal websocket broadcast) still
// render the outcome of a run that just ended, instead of seeing nothing at all.
model ActiveSequenceDto {
  sequence?: TimingSequenceDto;
}

enum OfficialTimeResultStatus {
  NONE;
  DNS;
  DNF;
  DSQ;
}

// One row of the Leitstand's result table. `startMillis`/`finishMillis` are resolved live from the
// team's currently assigned, non-retracted marks (not stored); `effectiveMillis` is the value a
// push would write - `(overrideMillis ?? computedMillis) + penaltyMillis`, or absent when there is
// no base time or when `resultStatus` is not `NONE`.
model OfficialTimeDto {
  competitionMatchTeam: uuid;
  event: uuid;
  startMillis?: int64;
  finishMillis?: int64;
  computedMillis?: int64;
  overrideMillis?: int64;
  penaltyMillis: int64;
  resultStatus: OfficialTimeResultStatus;
  effectiveMillis?: int64;
  dirty: boolean;
  pushedAt?: dateTime;
  // Der Platz, wie er aktuell am Lauf steht - von der Übernahme aus den Zeiten abgeleitet
  // (Gleichstände teilen sich den Platz) oder von Hand gesetzt; vorläufig, solange der Lauf läuft.
  place?: int32;
}

enum OfficialTimeSkipReason {
  // Marks exist, but none on a START station - the difference cannot be formed.
  NO_START_MARK;
  // Started but not finished yet (or the finish mark was retracted).
  NO_FINISH_MARK;
  // The finish mark lies before the start mark - the marks are wrong, not the team.
  NEGATIVE_DURATION;
  // `teams` named this id explicitly, but it has no marks at all - there is nothing to compute.
  NO_MARKS;
}

model OfficialTimeSkipDto {
  competitionMatchTeam: uuid;
  reason: OfficialTimeSkipReason;
}

model OfficialTimeComputeResultDto {
  computed: OfficialTimeDto[];
  skipped: OfficialTimeSkipDto[];
}

// Which teams to recompute. Absent or omitted recomputes the whole event.
model ComputeOfficialTimesRequest {
  teams?: uuid[];
}

// PUT semantics: every field is replaced - an absent `overrideMillis` clears a previous override,
// an absent `penaltyMillis` resets the penalty to 0, and an absent `resultStatus` resets it to
// `NONE`.
model OfficialTimeOverrideRequest {
  overrideMillis?: int64;
  penaltyMillis?: int64;
  resultStatus?: OfficialTimeResultStatus;
}

enum PushConflictReason {
  // The team's result is already recorded in the results flow (a place was entered, or places
  // were calculated) - overridable with `force`.
  RESULT_FROZEN;
  // Neither a computed nor an overridden time, and no DNS/DNF/DSQ status - nothing to write.
  NO_EFFECTIVE_TIME;
}

model OfficialTimePushConflictDto {
  competitionMatchTeam: uuid;
  reason: PushConflictReason;
}

// `force` only overrides the RESULT_FROZEN conflict; a team without an effective time can never be
// pushed because there is nothing to write. Forcing only replaces the timecode (and failed/
// failedReason) of an already-frozen team - it does NOT recalculate places. After a forced push,
// a referee has to re-save that match's results for the place to reflect the pushed time.
model PushOfficialTimesRequest {
  teams: uuid[];
  force?: boolean;
}

// The ids the explicit "delete times" action physically removed.
model DeletedTimeMarksDto {
  timeMarks: uuid[];
}

// Metadata of a hardware device token. Deliberately carries neither the token nor its hash.
model TimingDeviceTokenDto {
  id: uuid;
  event: uuid;
  station: uuid;
  name: string;
  revoked: boolean;

  // True for tokens issued automatically via the station share-link endpoint (the same link is
  // returned on every click until revoked); false for manually issued hardware tokens.
  autoIssued: boolean;
  createdAt: dateTime;
}

// The shareable station link. Unlike the manual token issue response this is repeatable: the same
// station returns the same link until its token is revoked in the devices tab.
model TimingShareLinkDto {
  deviceToken: TimingDeviceTokenDto;
  token: string;

  // Root-relative frontend path including the token (`/event/{eventId}/timing/{stationId}?token=...`;
  // ANZEIGE stations get the `/anzeige` display route). The client prepends its own origin.
  path: string;
}

// Response of an issue call: the only moment the plaintext `token` exists outside the device. Only
// its hash is stored, so a lost token cannot be recovered - it has to be revoked and reissued.
model TimingDeviceTokenIssuedDto {
  deviceToken: TimingDeviceTokenDto;
  token: string;
}

model TimingDeviceTokenRequest {
  name: string;
  station: uuid;
}

// What the start display (the athlete screen at the start) shows and how large it shows it.
// Until 24.08.2026 this was hard-wired to start number plus club, with the position number
// duplicated on top - which does not carry on the water: a 27" screen on the pontoon needs
// different type sizes than a tablet in the boat, and what identifies a boat differs from regatta
// to regatta. Stored as ONE jsonb object on the event; absent there means "the defaults below".
// No field is nullable - the fallback is the whole block, not a single field. Limits are enforced
// by the service, not the database: the three scales 0.5..3.0, `followingCount` 0..20.
//
// The block reaches boards through the event's timing settings (getTimingSettings, readable with a
// device token, see TimingSettingsDto) and is pushed live on every change via the
// `settingsChanged` websocket message; it is written through the event timing config, which only
// exists in the hand-maintained backend OpenAPI document.
model StartDisplaySettingsDto {
  // The running number in front of a boat (1st, 2nd, 3rd ...). Default false - the screen used to
  // show the position twice, once as a number in the row and once through the order of the list
  // itself. Events with single starts at fixed intervals turn it on.
  showPosition: boolean;
  // Start number of the boat - the usual identifier on the water, default true.
  showStartNumber: boolean;
  // Boat/team name, default true - it is what the announcer calls out.
  showTeamName: boolean;
  // Club(s) of the boat, default true; for composite crews the whole club chain.
  showClubName: boolean;
  // Names of the rowers, default false: an eight is eight lines per boat, which leaves nothing
  // readable on a screen that lists several boats at once.
  showAthleteNames: boolean;
  // Size of the clock in the header as a factor on the built-in size (1.0 = unchanged). A factor
  // rather than a point size because the display already scales relative to the screen width.
  clockScale: float64;
  // Size of the countdown, same factor semantics as `clockScale`.
  countdownScale: float64;
  // Size of the boat list, same factor semantics as `clockScale`.
  listScale: float64;
  // How many of the FOLLOWING boats are listed below the one currently being started. 0 is a
  // legitimate value and means "only the current boat" - the tidiest display for a small screen.
  followingCount: int32;
}

// ==========================================================================
// Models - settings, tones, modes, matches
// ==========================================================================

// INTERN selects the built-in timing module (stations, time marks, start sequences, official
// times); such competitions appear in the station start list (getTimingMatches).
enum TimingSystem {
  RACECLOCKER;
  WEBSCORER;
  INTERN;
}

// Precision of published official times. Raw data stays millisecond-exact; the setting only
// affects what the write-back copies to the match teams and what is displayed. Values are
// truncated, never rounded.
enum TimingPrecision {
  SEKUNDE;
  ZEHNTEL;
  HUNDERTSTEL;
  MILLISEKUNDE;
}

model TimingAutoApplyRequest {
  enabled: boolean;
}

// Waveform of a synthesized timing tone: the four basic shapes of the Web Audio OscillatorNode,
// named like the browser's OscillatorType values (uppercased).
enum ToneWaveform {
  SINE;
  TRIANGLE;
  SQUARE;
  SAWTOOTH;
}

// One tone of a tone sequence: a synthesized beep at a point in time relative to a reference. The
// same shape carries both sequences of the system; only the DIRECTION of offsetMillis differs -
// backwards to the start for the start sequence plan, forwards from the trigger for the false
// start sequence.
model ToneStepDto {
  offsetMillis: int32;
  frequencyHz: int32;
  durationMillis: int32;

  // Absent/null = sine; steps stored without the field keep their sound.
  waveform?: ToneWaveform | null;

  // Selects the tone's ENVELOPE: null = "decaying" (exponential decay across the whole nominal
  // duration); 0..5000 = "held" (full level, then release over this many milliseconds).
  releaseMillis?: int32 | null;
}

// A single configurable tone: the confirmation beep played when a FINISH/SPLIT station captures
// a time. Deliberately a SINGLE tone - it confirms a key press and must be short.
model CaptureToneDto {
  frequencyHz: int32;
  durationMillis: int32;

  // Same semantics as ToneStepDto.waveform.
  waveform?: ToneWaveform | null;

  // Same semantics as ToneStepDto.releaseMillis.
  releaseMillis?: int32 | null;
}

// The tones a board REALLY plays - the result of the resolution (mode's own set, else the event's
// default set, else the built-in defaults) and thus the counterpart of TimingToneSetDto.
model ResolvedToneSetDto {
  // Tone plan of the start sequence, offsets counting BACKWARDS to the start. The only one of the
  // four that stays nullable: its built-in default is derived from the mode's lead-in on the board.
  sequenceTonePlan?: ToneStepDto[] | null;
  splitTone: CaptureToneDto;
  falseStartTone: ToneStepDto[];
  finishTone: CaptureToneDto;

  // Does the capture tone tell the boats apart? Without any set it is off - one tone for all.
  tonePerBoat: boolean;
}

// A named set of the four tones of a timing ("Laut fürs Wasser", "Leise für die Halle") - the
// template any number of timing modes share. All four tone fields are UNRESOLVED here: null keeps
// meaning "built-in default", so the form can still offer "restore default".
model TimingToneSetDto {
  id: uuid;
  name: string;

  // The event's default set: timing modes without a pick of their own inherit it. Exactly one per
  // event.
  isDefault: boolean;
  sequenceTonePlan?: ToneStepDto[] | null;
  splitTone?: CaptureToneDto | null;
  falseStartTone?: ToneStepDto[] | null;
  finishTone?: CaptureToneDto | null;

  // Position 1 plays the finish tone, the other five a pentatonic scale above it.
  tonePerBoat: boolean;
}

model TimingToneSetRequest {
  name: string;

  // True takes the mark off the previous default in the same transaction; false on the current
  // default is refused (409) while other sets exist.
  isDefault?: boolean;

  // Null restores the built-in default in each of the four fields.
  sequenceTonePlan?: ToneStepDto[] | null;
  splitTone?: CaptureToneDto | null;
  falseStartTone?: ToneStepDto[] | null;
  finishTone?: CaptureToneDto | null;

  // Omitted means true.
  tonePerBoat?: boolean;
}

// How many boats start per start action: EINZEL = one boat at a time (time trial), WELLE =
// several together. A mass start is a WELLE containing every boat of the match, not a third value.
enum TimingStartGrouping {
  EINZEL;
  WELLE;
}

// A timing mode of the event - the template for how a match is started ("Timetrial 30s",
// "Wellenstart", "Massenstart"). How a match is measured is not part of it.
model TimingModeDto {
  id: uuid;
  event: uuid;
  name: string;

  // The tone set this mode picked, or null - then it inherits the event's default tone set.
  toneSet?: uuid | null;

  // Does the app start matches of this mode at all? A race started by a judge on the pontoon has
  // no countdown window.
  startSequenceEnabled: boolean;

  // The keys the finish station uses to hit the boats, in position order.
  boatKeysPrimary: string;

  // Optional second row of keys; null means there is none.
  boatKeysSecondary?: string | null;

  // Whether the start board may trigger an explicit false start (recall) for matches of this
  // mode. Rowing time trials answer a false start with a time penalty instead.
  falseStartEnabled: boolean;
  startGrouping: TimingStartGrouping;

  // Set: starts follow automatically at this fixed interval (time trial). Null: every start is
  // triggered by hand.
  intervalSeconds?: int32 | null;

  // Countdown before the (first) start; feeds the start sequences' lead-in.
  leadInSeconds: int32;

  // The four tones a match of this mode actually makes, resolved.
  resolvedToneSet: ResolvedToneSetDto;
}

model TimingModeRequest {
  name: string;
  startGrouping: TimingStartGrouping;
  intervalSeconds?: int32 | null;
  leadInSeconds: int32;

  // Null (the default) means it inherits the event's default tone set.
  toneSet?: uuid | null;

  // Omitted means true.
  startSequenceEnabled?: boolean;

  // First row of finish keys, in position order. No key twice within a row nor across the two
  // rows (case-insensitively), no whitespace, at most 6 keys.
  boatKeysPrimary?: string;

  // Optional second row; null means there is none. An empty string is rejected.
  boatKeysSecondary?: string | null;

  // Omitted means true.
  falseStartEnabled?: boolean;
}

// The event's timing settings as one read. Writes stay separate - the switch via
// setTimingAutoApply, the precision via the event timing config.
model TimingSettingsDto {
  autoApply: boolean;
  precision: TimingPrecision;

  // Whether the capture board of a START station shows the manual capture button.
  showManualCapture: boolean;
  startDisplay: StartDisplaySettingsDto;

  // The event's DEFAULT tone set, resolved - the fallback for everything that belongs to no match.
  defaultToneSet: ResolvedToneSetDto;
}

// The team's match as the boards need it: ACTIVE = called up or on the water, OPEN = still ahead,
// DONE = finished. Deliberately coarser than the match state of the referee dashboard.
enum TimingMatchPhase {
  ACTIVE;
  OPEN;
  DONE;
}

// Where a match stands on its way from call-up to the finish line, derived (not stored): OPEN =
// nothing happened yet, STARTING = an armed or running start sequence contains teams of this
// match, STARTED = at least one team has a start mark, FINISHED = every team has a finish mark.
enum TimingMatchProgress {
  OPEN;
  STARTING;
  STARTED;
  FINISHED;
}

model TimingMatchTeamDto {
  competitionMatchTeam: uuid;

  // The team's position in the match (its "lane").
  startNumber: int32;
  teamName?: string | null;
  clubName?: string | null;

  // The team has an assigned ACTIVE mark on a START station.
  started: boolean;

  // The team has an assigned ACTIVE mark on a FINISH station.
  finished: boolean;
}

// One match of the internally timed competitions, delivered in start order (planned start time
// first; matches without a time follow in setup order - race number, round chain, execution
// order).
model TimingMatchDto {
  // Key of the match (competition_match carries the setup match id as its primary key).
  competitionSetupMatch: uuid;
  matchName?: string | null;
  competition: uuid;
  competitionName?: string | null;

  // The race number.
  competitionIdentifier?: string | null;

  // Short name of the competition (e.g. "CM 4x+") - the compact label of the day schedule.
  competitionShortName?: string | null;
  round: uuid;
  roundName?: string | null;

  // Planned start time from the schedule.
  startTime?: dateTime | null;

  // Real start (referee action or timing).
  startedAt?: dateTime | null;
  finishedAt?: dateTime | null;
  phase: TimingMatchPhase;
  progress: TimingMatchProgress;

  // The resolved timing mode (round entry beats competition entry); absent = not configured.
  timingMode?: TimingModeDto;
  teams: TimingMatchTeamDto[];
}

// A timing station on THIS competition's course. The station belongs to the event; only the metre
// belongs to the competition, because the same station sits at 3000 m for the long distance and
// at 250 m for the sprint.
model CompetitionTimingStationDto {
  timingStation: uuid;
  name: string;
  type: TimingStationType;

  // The start is at 0, the finish at the total distance. Split times are ordered by this value.
  distanceMeters: int32;
}

model CompetitionTimingStationEntry {
  timingStation: uuid;
  distanceMeters: int32;
}

model CompetitionTimingStationsRequest {
  // The complete list; anything missing here is deleted.
  stations: CompetitionTimingStationEntry[];
}

// ==========================================================================
// Routes - event-scoped
// ==========================================================================
// GET /state, GET /stations, GET /teams: require UpdateAppTimingGlobal OR ReadEventGlobal
//   These reads (and GET /sequences/active plus the websocket) alternatively accept an
//   `X-Timing-Device-Token` header instead of a session: shared station links (capture board,
//   start display) carry the device token in their URL and read the whole event's timing state.
//   Event-bound only (`validateForEvent`) - the station binding stays a write-side concern of
//   POST /timeMarks. The branch is only taken when the header is present AND no session exists.
// POST /stations, PUT /stations/{id}, DELETE /stations/{id}: require UpdateEventGlobal
// POST /timeMarks, PUT /timeMarks/{id}/retract, PUT /timeMarks/{id}/assignment: require UpdateAppTimingGlobal OR UpdateEventGlobal
//   POST /timeMarks alternatively accepts an `X-Timing-Device-Token` header instead of a session -
//   see createTimeMark below. That branch is only taken when the header is present AND no session
//   exists; a logged-in user's request always takes the ordinary privilege-checked path.
// DELETE /timeMarks/retracted: require UpdateEventGlobal
// GET /sequences/active: require UpdateAppTimingGlobal OR UpdateEventGlobal OR ReadEventGlobal (or device token, see above)
// POST /sequences, POST /sequences/{id}/start|abort|pause|resume|rewind, POST /sequences/{id}/entries/{id}/skip: require UpdateAppTimingGlobal OR UpdateEventGlobal
// GET /officialTimes: require UpdateAppTimingGlobal OR ReadEventGlobal
// POST /officialTimes/compute, PUT /officialTimes/{id}, POST /officialTimes/push: require UpdateEventGlobal
// GET /deviceTokens, POST /deviceTokens, DELETE /deviceTokens/{id}: require UpdateEventGlobal
// PUT /stations/{id}/armed: session with UpdateAppTimingGlobal OR UpdateEventGlobal, or the station's OWN device token
// POST /stations/{id}/share-link: require UpdateEventGlobal
// GET /matches: like GET /state (session or device token)
// POST /matches/{id}/retractAttempt, POST /matches/{id}/falseStart: require UpdateAppTimingGlobal OR UpdateEventGlobal
// PUT /timeMarks/{id}/reactivate: require UpdateAppTimingGlobal OR UpdateEventGlobal (session only, no device token)
// GET /settings: like GET /officialTimes (session or device token); PUT /autoApply: require UpdateEventGlobal
// GET /modes, GET /tone-sets: require ReadEventGlobal; POST/PUT/DELETE of both: require UpdateEventGlobal

@route("/event/{eventId}/timing")
@tag("Timing")
interface TimingRoutes {

  @get
  @route("/state")
  @operationId("getTimingState")
  getTimingState(@path eventId: uuid): TimingStateDto;

  @get
  @route("/stations")
  @operationId("getTimingStations")
  listTimingStations(@path eventId: uuid): TimingStationDto[];

  @get
  @route("/teams")
  @operationId("getTimingTeams")
  listTimingTeams(@path eventId: uuid): TimingTeamDto[];

  @post
  @route("/stations")
  @operationId("createTimingStation")
  createTimingStation(
    @path eventId: uuid,
    @body request: TimingStationRequest,
  ): Created;

  @put
  @route("/stations/{stationId}")
  @operationId("updateTimingStation")
  updateTimingStation(
    @path eventId: uuid,
    @path stationId: uuid,
    @body request: TimingStationRequest,
  ): void;

  // 409 TIMING_STATION_HAS_SEQUENCES while start sequences still reference the station.
  @delete
  @route("/stations/{stationId}")
  @operationId("deleteTimingStation")
  deleteTimingStation(
    @path eventId: uuid,
    @path stationId: uuid,
  ): void;

  // Arms or disarms the station. Only meaningful while its `captureMode` is ARMED: in ONETOUCH
  // mode every press captures and this state lies idle. Deliberately separate from
  // updateTimingStation: the capture mode belongs to the organizers and is set once, this state
  // is flipped by the timekeeper many times a day. A device token may only flip its OWN station.
  @put
  @route("/stations/{stationId}/armed")
  @operationId("setTimingStationArmed")
  setTimingStationArmed(
    @path eventId: uuid,
    @path stationId: uuid,
    @body request: TimingStationArmedRequest,
  ): void;

  // Issues a device token for the station automatically and returns the finished link. Reuse
  // instead of inflation: as long as an automatically issued, unrevoked token exists for the
  // station, every call returns the SAME link; revoking it makes the next call issue a fresh one.
  @post
  @route("/stations/{stationId}/share-link")
  @operationId("createTimingStationShareLink")
  createTimingStationShareLink(
    @path eventId: uuid,
    @path stationId: uuid,
  ): TimingShareLinkDto;

  // The station start list: every materialized match of the event's internally timed
  // competitions, in start order, each with its resolved timing mode, teams and derived progress.
  // Bye matches are excluded unless the bye must race. Pass `station` to narrow the list to the
  // matches that station is expected to time (its competitions' courses).
  @get
  @route("/matches")
  @operationId("getTimingMatches")
  getTimingMatches(
    @path eventId: uuid,
    @query station?: uuid,
  ): TimingMatchDto[];

  // Bulk retraction behind the start board's "retract start and restart" action: every ACTIVE
  // time mark assigned to a team of this match - start, finish and lap marks alike - is set to
  // RETRACTED in one call. Finish marks must go with the start marks, because stale finish times
  // of a discarded attempt would otherwise instantly recombine with the new start marks into
  // wrong official times through the automatic write-back.
  @post
  @route("/matches/{matchId}/retractAttempt")
  @operationId("retractMatchAttempt")
  retractMatchAttempt(
    @path eventId: uuid,
    @path matchId: uuid,
  ): void;

  // The explicit false start ("recall") of a match, triggered from the start station's capture
  // board: the active start sequences holding boats of this match are aborted first, then the
  // whole attempt is retracted like retractMatchAttempt, and the `falseStart` websocket message
  // is emitted. 409 when the match's resolved timing mode has `falseStartEnabled` switched off.
  @post
  @route("/matches/{matchId}/falseStart")
  @operationId("falseStartMatch")
  falseStartMatch(
    @path eventId: uuid,
    @path matchId: uuid,
  ): void;

  // Accepts either a normal session with UpdateAppTimingGlobal or UpdateEventGlobal, OR an
  // `X-Timing-Device-Token` header identifying a hardware timing device that cannot hold a
  // session (see the header note in the auth matrix above). A device token binds the capture to
  // its own station: it can never write marks for a different station than the one it was issued
  // for. Marks captured this way are recorded with `source: "HARDWARE"` and no `createdBy`.
  @post
  @route("/timeMarks")
  @operationId("createTimeMark")
  createTimeMark(
    @path eventId: uuid,
    @body request: CreateTimeMarkRequest,
  ): Created;

  @put
  @route("/timeMarks/{timeMarkId}/retract")
  @operationId("retractTimeMark")
  retractTimeMark(
    @path eventId: uuid,
    @path timeMarkId: uuid,
  ): void;

  @put
  @route("/timeMarks/{timeMarkId}/assignment")
  @operationId("assignTimeMark")
  assignTimeMark(
    @path eventId: uuid,
    @path timeMarkId: uuid,
    @body request: AssignTimeMarkRequest,
  ): void;

  // The counterpart to retracting: sets a RETRACTED time mark back to ACTIVE. The mark's former
  // team assignment was never detached, so it simply applies again, and the official time of the
  // affected team is recomputed and written back immediately. Idempotent. Requires a user session;
  // device tokens cannot reactivate.
  @put
  @route("/timeMarks/{timeMarkId}/reactivate")
  @operationId("reactivateTimeMark")
  reactivateTimeMark(
    @path eventId: uuid,
    @path timeMarkId: uuid,
  ): void;

  @post
  @route("/sequences")
  @operationId("createTimingSequence")
  createTimingSequence(
    @path eventId: uuid,
    @body request: CreateSequenceRequest,
  ): Created;

  @get
  @route("/sequences/active")
  @operationId("getActiveTimingSequence")
  getActiveTimingSequence(
    @path eventId: uuid,
    @query stationId: uuid,
  ): ActiveSequenceDto;

  @post
  @route("/sequences/{sequenceId}/start")
  @operationId("startTimingSequence")
  startTimingSequence(
    @path eventId: uuid,
    @path sequenceId: uuid,
  ): void;

  @post
  @route("/sequences/{sequenceId}/abort")
  @operationId("abortTimingSequence")
  abortTimingSequence(
    @path eventId: uuid,
    @path sequenceId: uuid,
  ): void;

  // Anhalten statt abbrechen: der Kulanz-Griff am Start, wenn ein Boot unverschuldet zu spät
  // kommt. Nur aus RUNNING, sonst 409.
  @post
  @route("/sequences/{sequenceId}/pause")
  @operationId("pauseTimingSequence")
  pauseTimingSequence(
    @path eventId: uuid,
    @path sequenceId: uuid,
  ): void;

  // Fortsetzen: die geplanten Startzeiten aller noch anstehenden Einträge rücken um die
  // Pausendauer nach hinten, das Intervall zwischen den Booten bleibt gleich. Nur aus PAUSED.
  @post
  @route("/sequences/{sequenceId}/resume")
  @operationId("resumeTimingSequence")
  resumeTimingSequence(
    @path eventId: uuid,
    @path sequenceId: uuid,
  ): void;

  // Einen Schritt zurück: der zuletzt GESTARTETE Eintrag wird wieder zu einem anstehenden Start
  // und seine Startmarke geht zurück (RETRACTED). Nur aus PAUSED und nur, wenn es überhaupt einen
  // gestarteten Eintrag gibt - sonst 409.
  @post
  @route("/sequences/{sequenceId}/rewind")
  @operationId("rewindTimingSequence")
  rewindTimingSequence(
    @path eventId: uuid,
    @path sequenceId: uuid,
  ): void;

  @post
  @route("/sequences/{sequenceId}/entries/{entryId}/skip")
  @operationId("skipTimingSequenceEntry")
  skipTimingSequenceEntry(
    @path eventId: uuid,
    @path sequenceId: uuid,
    @path entryId: uuid,
  ): void;

  @delete
  @route("/timeMarks/retracted")
  @operationId("deleteRetractedTimeMarks")
  deleteRetractedTimeMarks(
    @path eventId: uuid,
    @query station?: uuid,
  ): DeletedTimeMarksDto;

  @get
  @route("/officialTimes")
  @operationId("getOfficialTimes")
  getOfficialTimes(@path eventId: uuid): OfficialTimeDto[];

  @post
  @route("/officialTimes/compute")
  @operationId("computeOfficialTimes")
  computeOfficialTimes(
    @path eventId: uuid,
    @body request: ComputeOfficialTimesRequest,
  ): OfficialTimeComputeResultDto;

  @put
  @route("/officialTimes/{competitionMatchTeamId}")
  @operationId("setOfficialTimeOverride")
  setOfficialTimeOverride(
    @path eventId: uuid,
    @path competitionMatchTeamId: uuid,
    @body request: OfficialTimeOverrideRequest,
  ): void;

  // See PushOfficialTimesRequest.force: a forced push never recalculates places, only the
  // timecode snapshot - a referee must re-save the match's results afterwards for the place to
  // reflect the pushed time.
  @post
  @route("/officialTimes/push")
  @operationId("pushOfficialTimes")
  pushOfficialTimes(
    @path eventId: uuid,
    @body request: PushOfficialTimesRequest,
  ): void;

  @get
  @route("/deviceTokens")
  @operationId("listTimingDeviceTokens")
  listTimingDeviceTokens(@path eventId: uuid): TimingDeviceTokenDto[];

  @post
  @route("/deviceTokens")
  @operationId("issueTimingDeviceToken")
  issueTimingDeviceToken(
    @path eventId: uuid,
    @body request: TimingDeviceTokenRequest,
  ): TimingDeviceTokenIssuedDto;

  @delete
  @route("/deviceTokens/{tokenId}")
  @operationId("revokeTimingDeviceToken")
  revokeTimingDeviceToken(
    @path eventId: uuid,
    @path tokenId: uuid,
  ): void;

  // The event's timing settings in one fetch. Readable with a device token like
  // getOfficialTimes, since the station boards need the precision to render official times.
  @get
  @route("/settings")
  @operationId("getTimingSettings")
  getTimingSettings(@path eventId: uuid): TimingSettingsDto;

  // Persists the automatic write-back switch. Enabling it catches up once: every team with marks
  // or an official-time row is recomputed and written back (frozen or foreign results are skipped
  // and stay flagged dirty). Disabling only stops future writes.
  @put
  @route("/autoApply")
  @operationId("setTimingAutoApply")
  setTimingAutoApply(
    @path eventId: uuid,
    @body request: TimingAutoApplyRequest,
  ): void;

  @get
  @route("/modes")
  @operationId("getTimingModes")
  getTimingModes(@path eventId: uuid): TimingModeDto[];

  // 409 when a mode of that name exists in the event.
  @post
  @route("/modes")
  @operationId("addTimingMode")
  addTimingMode(
    @path eventId: uuid,
    @body request: TimingModeRequest,
  ): Created;

  @put
  @route("/modes/{modeId}")
  @operationId("updateTimingMode")
  updateTimingMode(
    @path eventId: uuid,
    @path modeId: uuid,
    @body request: TimingModeRequest,
  ): void;

  // Refused with 409 while the mode is still assigned to competitions or rounds - clear the
  // assignments first, nothing is unconfigured silently.
  @delete
  @route("/modes/{modeId}")
  @operationId("deleteTimingMode")
  deleteTimingMode(
    @path eventId: uuid,
    @path modeId: uuid,
  ): void;

  // The named tone sets of the event, default first, then alphabetically.
  @get
  @route("/tone-sets")
  @operationId("getTimingToneSets")
  getTimingToneSets(@path eventId: uuid): TimingToneSetDto[];

  // The FIRST tone set of an event always becomes the default, whatever the body asks for.
  // Asking for isDefault on a later set moves the mark off the previous default.
  @post
  @route("/tone-sets")
  @operationId("addTimingToneSet")
  addTimingToneSet(
    @path eventId: uuid,
    @body request: TimingToneSetRequest,
  ): Created;

  // 409 when it would leave an event that still has other tone sets without a default.
  @put
  @route("/tone-sets/{toneSetId}")
  @operationId("updateTimingToneSet")
  updateTimingToneSet(
    @path eventId: uuid,
    @path toneSetId: uuid,
    @body request: TimingToneSetRequest,
  ): void;

  // Timing modes pointing at the deleted set fall back to the default. The default itself may
  // only go as the LAST tone set of the event (409 otherwise).
  @delete
  @route("/tone-sets/{toneSetId}")
  @operationId("deleteTimingToneSet")
  deleteTimingToneSet(
    @path eventId: uuid,
    @path toneSetId: uuid,
  ): void;
}

// ==========================================================================
// Routes - the stations on a competition's course
// ==========================================================================
// GET: require ReadEventGlobal; PUT: require UpdateEventGlobal

@route("/event/{eventId}/competition/{competitionId}/timing-stations")
@tag("Timing")
interface CompetitionTimingStationRoutes {

  // Ordered by distance.
  @get
  @operationId("getCompetitionTimingStations")
  getCompetitionTimingStations(
    @path eventId: uuid,
    @path competitionId: uuid,
  ): CompetitionTimingStationDto[];

  // Replaces the WHOLE list: anything missing from the body is deleted, everything in it is
  // created or moved to its new metre; an empty list clears the competition. 404 if the
  // competition or a station does not belong to this event, 409 if the same station is listed
  // twice, 400 for ANZEIGE stations (they never capture a time mark).
  @put
  @operationId("setCompetitionTimingStations")
  setCompetitionTimingStations(
    @path eventId: uuid,
    @path competitionId: uuid,
    @body request: CompetitionTimingStationsRequest,
  ): void;
}

// ==========================================================================
// Routes - global, unauthenticated
// ==========================================================================

@route("/timing/serverTime")
@tag("Timing")
interface TimingGlobalRoutes {

  // Used by clients to measure and correct their local clock's offset against the server
  // before capturing time marks. Deliberately unauthenticated - it is safe to expose and
  // needs to be reachable before a session even exists.
  @post
  @operationId("getServerTime")
  getServerTime(): ServerTimeResponse;
}
