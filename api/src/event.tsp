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
  // (Auszug) Mit der letzten Fixierung "Meldungsnummern nach Bootsnummern vergeben" gesetzt: Die
  // Rundenanlage übernimmt die Meldungsnummer als Startnummer in jedem Lauf (ADR-0111).
  teamNumbersAsStartNumbers: boolean;
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
  // Bootsnummer sind; überzählige Mietteams Nummern oberhalb des Bestands. Jede Fixierung speichert
  // den Wert von alignMaterialNumbers an der Veranstaltung (EventDto.teamNumbersAsStartNumbers):
  // Gesetzt übernimmt jede spätere Rundenanlage (erste Runde, Folgerunden, Automatik) die
  // Meldungsnummer als Startnummer im Lauf (competition_match_team.start_number), und der
  // RaceClocker-Abgleich schreibt keine Listenpositionen mehr in die Startnummern; ohne ihn ist die
  // Startnummer die Setzposition bzw. der Rang. Schon angelegte Läufe ändert die Fixierung nicht.
  // Bumpt den Änderungsmarker.
  @post
  @route("/{eventId}/finalizeRegistrations")
  finalizeRegistrations(
    @path eventId: string, // UUID
    @query keepNumbers?: boolean,
    @query alignMaterialNumbers?: boolean,
  ): void;
}
