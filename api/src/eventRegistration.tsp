import "@typespec/http";
import "@typespec/rest";

using TypeSpec.Http;
using TypeSpec.Rest;

namespace Ready2Race;

model EventRegistrationDto {
  // Event registration information
}

// ----------------------------------------------------------------------------
// Materialvermietung im Anmeldeformular (documentation.yaml: EventRegistrationCompetitionDto,
// CompetitionRegistrationTeamUpsertDto, CompetitionRegistrationSingleUpsertDto). Nur die Felder,
// die die Materialvermietung beiträgt; der Rest der Modelle steht nur in der OpenAPI-Datei.
// ----------------------------------------------------------------------------

// Wettkampf im Anmelde-Template: je Materialart des Bedarfs die Angebote der eingeladenen Anbieter
// mit Ampel (GREEN, solange bestätigte plus offene Menge unter planned_count liegt, sonst YELLOW).
// Leer, wenn der Wettkampf keinen Bedarf hat - dann zeigt das Formular keinen Materialabschnitt.
model EventRegistrationCompetitionMaterialPart {
  materialDemands: EventRegistrationMaterialDemandDto[];
}

// Team einer Meldung beim Upsert. Die id kommt vom Formular und bleibt beim erneuten Speichern
// erhalten (Materialanfragen hängen an ihr); zeigt sie auf eine bestehende, gesperrte oder fremde
// Meldung, lehnt der Server mit 409 ab. materialRequests ist nur Lesefeld des Templates und wird
// beim Upsert ignoriert - Anfragen laufen über PUT .../competitionRegistration/{id}/materialRequests,
// das das Formular NACH dem erfolgreichen Speichern je geänderter Meldung aufruft.
model CompetitionRegistrationTeamMaterialPart {
  id?: uuid;
  materialRequests?: MaterialRequestDto[];
}

// Einzelmeldung beim Upsert - dieselbe Regel wie beim Team: stabile id vom Formular,
// materialRequests nur lesend.
model CompetitionRegistrationSingleMaterialPart {
  id?: uuid;
  materialRequests?: MaterialRequestDto[];
}

// Speichern der Anmeldung (POST /event/{eventId}/register): die Anmeldung löscht alle nicht
// gesperrten Meldungen des Vereins (gesperrt = in einem Lauf, mit Ersatzleuten oder abgemeldet)
// und legt sie mit den IDs aus dem Formular neu an. Materialanfragen haben bewusst keinen
// Fremdschlüssel auf die Meldung; der aufgeschobene Trigger A0_material_request_orphan_cleanup
// entfernt beim Commit nur die Anfragen von Meldungen, die danach wirklich fehlen.

@route("/eventRegistration")
@tag("EventRegistration")
interface EventRegistrationRoutes {
  // Event registration routes
}
