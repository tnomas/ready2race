import "@typespec/http";
import "@typespec/rest";

using TypeSpec.Http;
using TypeSpec.Rest;

namespace Ready2Race;

// ============================================================================
// Models
// ============================================================================

model CompetitionRegistrationDto {
  // Competition registration information
}

model CompetitionRegistrationTeamDto {
  // Team information
}

model CompetitionRegistrationTeamUpsertDto {
  // Team upsert data
}

model CompetitionRegistrationRequestProperties {
  // Request properties
}

// ============================================================================
// Routes
// ============================================================================

@route("/competitionRegistration")
@tag("CompetitionRegistration")
interface CompetitionRegistrationRoutes {
  // Get paginated competition registrations
  @get
  @route("")
  listRegistrations(
    @query competitionId: string, // UUID - from pathParam
    // Pagination parameters
  ): CompetitionRegistrationDto[];

  // Create competition registration
  @post
  @route("")
  createRegistration(
    @query competitionId: string, // UUID - from pathParam
    @query eventId: string, // UUID - from pathParam
    @query registrationType?: string, // RegistrationInvoiceType enum
    @body request: CompetitionRegistrationTeamUpsertDto,
  ): CompetitionRegistrationDto;

  // Update competition registration
  @put
  @route("/{competitionRegistrationId}")
  updateRegistration(
    @path competitionRegistrationId: string, // UUID
    @query competitionId: string, // UUID - from pathParam
    @query eventId: string, // UUID - from pathParam
    @query registrationType?: string, // RegistrationInvoiceType enum
    @body request: CompetitionRegistrationTeamUpsertDto,
  ): CompetitionRegistrationDto;

  // Delete competition registration. Hängt daran eine aktive Materialanfrage, gilt das wie ein
  // Rückzug: mit OWN (Verein) bei geschlossener Vergabe 409 MATERIAL_REMOVAL_REQUESTS_CLOSED, mit
  // GLOBAL (Veranstalter) erlaubt; eine bestätigte Anfrage löst die Rückzugs-Mail an den Anbieter aus.
  // Dasselbe gilt für Meldungen, die das Speichern der Anmeldung (POST /event/{eventId}/register)
  // entfernt, und für das Löschen der ganzen Anmeldung durch den Veranstalter (dort ohne Sperre).
  @delete
  @route("/{competitionRegistrationId}")
  deleteRegistration(
    @path competitionRegistrationId: string, // UUID
    @query competitionId: string, // UUID - from pathParam
    @query eventId: string, // UUID - from pathParam
  ): void;
}
