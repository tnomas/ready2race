import "@typespec/http";
import "@typespec/rest";

using TypeSpec.Http;
using TypeSpec.Rest;

namespace Ready2Race;

// ============================================================================
// Models
// ============================================================================

model EventDto {
  // Event information
}

model CreateEventRequest {
  // Event creation data
}

model UpdateEventRequest {
  // Event update data
}

// ============================================================================
// Routes
// ============================================================================

@route("/event")
@tag("Event")
interface EventRoutes {
  // Create event
  @post
  @route("")
  createEvent(
    @body request: CreateEventRequest,
  ): EventDto;

  // Get paginated events
  @get
  @route("")
  listEvents(
    // Pagination parameters
  ): EventDto[];

  // Get public events
  @get
  @route("/public")
  listPublicEvents(
    // Pagination parameters
  ): EventDto[];

  // Get event by ID
  @get
  @route("/{eventId}")
  getEvent(
    @path eventId: string, // UUID
  ): EventDto;

  // Update event
  @put
  @route("/{eventId}")
  updateEvent(
    @path eventId: string, // UUID
    @body request: UpdateEventRequest,
  ): EventDto;

  // Delete event
  @delete
  @route("/{eventId}")
  deleteEvent(
    @path eventId: string, // UUID
  ): void;

  // Fixiert die Meldungen: vergibt je Wettkampf die Meldungsnummern (team_number), aus denen die
  // erste Runde ihre Setzliste ordnet. keepNumbers behält vergebene Nummern. alignMaterialNumbers
  // (Materialvermietung): Teams mit bestätigter Bootsanfrage bekommen zuerst eine Nummer aus dem
  // Bootsbestand ihres Anbieters, Teams mit eigenem Boot danach die übrigen Nummern ab 1, die keine
  // Bootsnummer sind; überzählige Mietteams Nummern oberhalb des Bestands. Achtung: die Startnummer
  // im Lauf (competition_match_team.start_number) ist die Setzposition bzw. der Rang und gleicht der
  // Meldungsnummer nur bei lückenloser Nummerierung ab 1 in einem einzigen Lauf - die Anzeigen
  // markieren eine Abweichung gegen die Startnummer im Lauf. Bumpt den Änderungsmarker.
  @post
  @route("/{eventId}/finalizeRegistrations")
  finalizeRegistrations(
    @path eventId: string, // UUID
    @query keepNumbers?: boolean,
    @query alignMaterialNumbers?: boolean,
  ): void;
}
