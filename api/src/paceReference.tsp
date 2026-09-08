import "@typespec/http";
import "@typespec/rest";
import "@typespec/openapi";
import "./common.tsp";

using Http;
using Rest;
using OpenAPI;

namespace Ready2Race;

/**
 * Pace references: how a sport expresses pace. A competition points at one of them so split
 * times can be turned into a pace per section ("2:05 / 500 m" in rowing, "38.4 km/h" in cycling).
 */

// TIME_PER_DISTANCE is "how long for n metres" (rowing, running), DISTANCE_PER_TIME is "how far
// in one hour" (cycling).
enum PaceReferenceMode {
  TIME_PER_DISTANCE;
  DISTANCE_PER_TIME;
}

model PaceReferenceDto {
  id: uuid;
  name: string;
  mode: PaceReferenceMode;
  referenceMeters: int32;
}

model PaceReferenceRequest {
  name: string;
  mode: PaceReferenceMode;

  // Reference distance in metres - the distance the pace is calculated on (500 in rowing) or the
  // unit of the output (1000 = km/h). Must be greater than zero.
  referenceMeters: int32;
}

model PaceReferencePageDto {
  data: PaceReferenceDto[];
  pagination: Pagination;
}

// ==========================================================================
// Routes
// ==========================================================================
// GET: require ReadEventGlobal; POST/PUT/DELETE: require UpdateEventGlobal

@route("/pace-reference")
@tag("PaceReference")
interface PaceReferenceRoutes {

  // 409 PACE_REFERENCE_NAME_TAKEN when a reference of that name exists.
  @post
  @operationId("addPaceReference")
  addPaceReference(@body request: PaceReferenceRequest): Created;

  @get
  @operationId("getPaceReferences")
  getPaceReferences(...UrlPaginationParameters): PaceReferencePageDto;

  @put
  @route("/{paceReferenceId}")
  @operationId("updatePaceReference")
  updatePaceReference(
    @path paceReferenceId: uuid,
    @body request: PaceReferenceRequest,
  ): void;

  @delete
  @route("/{paceReferenceId}")
  @operationId("deletePaceReference")
  deletePaceReference(@path paceReferenceId: uuid): void;
}
