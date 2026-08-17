import "@typespec/http";
import "@typespec/rest";

using TypeSpec.Http;
using TypeSpec.Rest;

namespace Ready2Race;

model ParticipantDto {
  // Participant information
}

// Single competition a participant registers for during self-registration
model ParticipantRegisterCompetitionRequest {
  competitionId: uuid;
  optionalFees?: uuid[];
  ratingCategory?: uuid;
}

@route("/participant")
@tag("Participant")
interface ParticipantRoutes {
  // Participant routes
}
