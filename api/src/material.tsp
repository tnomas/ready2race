import "@typespec/http";
import "@typespec/openapi";

using Http;
using OpenAPI;
namespace Ready2Race;

enum MaterialCategory {
  BOAT,
  OTHER,
}

enum MaterialItemStatus {
  ACTIVE,
  RETIRED,
}

enum MaterialRequestStatus {
  REQUESTED,
  CONFIRMED,
  WAITLISTED,
  DECLINED,
  WITHDRAWN,
}

enum MaterialCapacityLevel {
  GREEN,
  YELLOW,
}

// Wirksames Materialstück eines Lauf-Teams (Sicht effective_material_for_match_team, Task 6.1) -
// eine Ausnahme je Lauf schlägt die Grundzuteilung. Nur bestätigte BOAT-Anfragen erreichen die
// Team-DTOs der Anzeigen (LiveDashboardTeamDto, UpcomingMatchTeamInfo, RunningMatchTeamInfo,
// MatchResultTeamInfo, AthleteBoardTeam, AthleteBoardResultTeam, MyEventMatchDto,
// CompetitionMatchTeamDto der Durchführung).
model MaterialForTeamDto {
  number?: int32;
  label: string;
  category: MaterialCategory;
  deviatesFromStartNumber: boolean;
}

model MaterialProviderDto {
  id: uuid;
  name: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  note?: string;
}

model MaterialProviderRequest {
  name: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  note?: string;
}

model MaterialTypeDto {
  id: uuid;
  name: string;
  category: MaterialCategory;
  description?: string;
}

model MaterialTypeRequest {
  name: string;
  category: MaterialCategory;
  description?: string;
}

model MaterialItemDto {
  id: uuid;
  materialProvider: uuid;
  materialProviderName: string;
  materialType: uuid;
  materialTypeName: string;
  category: MaterialCategory;
  number?: int32;
  label: string;
  note?: string;
  status: MaterialItemStatus;
  openDamages: int32;
}

model MaterialItemRequest {
  materialType: uuid;
  number?: int32;
  label: string;
  note?: string;
  status: MaterialItemStatus;
}

// Bedarf einer Materialart am Wettkampf (oder an der Vorlage) - Gegenstück zu FeeForCompetitionDto/RequestDto.
model MaterialDemandDto {
  materialType: uuid;
  name: string;
  category: MaterialCategory;
  count: int32;
}

model MaterialDemandRequestDto {
  materialType: uuid;
  count: int32;
}

// Ein zur Veranstaltung eingeladener Anbieter, aus Sicht des Veranstalters.
model EventMaterialProviderDto {
  materialProvider: uuid;
  name: string;
  requestsClosed: boolean;
  openRequests: int32;
  openDamages: int32;
}

// Eine Veranstaltung, zu der der eigene Anbieter eingeladen ist - Veranstaltungswahl des Anbieters.
model MaterialProviderEventDto {
  event: uuid;
  eventName: string;
  requestsClosed: boolean;
}

model SetRequestsClosedRequest {
  requestsClosed: boolean;
}

model MaterialOfferDto {
  id: uuid;
  event: uuid;
  materialProvider: uuid;
  materialType: uuid;
  materialTypeName: string;
  category: MaterialCategory;
  priceText?: string;
  plannedCount: int32;
  changeoverMinutes: int32;
}

model MaterialOfferRequest {
  materialType: uuid;
  priceText?: string;
  plannedCount: int32;
  changeoverMinutes: int32;
}

// Eine Materialanfrage je Meldung und Angebot, mit aufgelöstem Namen und Anbieter.
model MaterialRequestDto {
  id: uuid;
  competitionRegistration: uuid;
  materialOffer: uuid;
  materialType: uuid;
  materialTypeName: string;
  category: MaterialCategory;
  providerId: uuid;
  providerName: string;
  count: int32;
  status: MaterialRequestStatus;
  decisionNote?: string;
  requestedAt: utcDateTime;
  decidedAt?: utcDateTime;
}

// Vollständige Liste der gewünschten Angebote einer Meldung - kein Delta.
model MaterialRequestsUpsertRequest {
  offerIds: uuid[];
}

// Ein Angebot zu einer Materialart im Anmelde-Template, mit der Ampel für die Auslastung.
model EventRegistrationMaterialOfferDto {
  offerId: uuid;
  providerId: uuid;
  providerName: string;
  priceText?: string;
  capacity: MaterialCapacityLevel;
  requestsClosed: boolean;
}

// Bedarf einer Materialart am Wettkampf im Anmelde-Template, mit den Angeboten dazu.
model EventRegistrationMaterialDemandDto {
  materialType: uuid;
  name: string;
  category: MaterialCategory;
  count: int32;
  offers: EventRegistrationMaterialOfferDto[];
}

// Ausfallfenster eines Schadens (status REPORTED, out_of_service_from gesetzt).
model MaterialOutageDto {
  damageId: uuid;
  from: utcDateTime;
  until?: utcDateTime;
}

// Ein Materialstück in der Anbieter-Übersicht, mit seinen offenen Ausfallfenstern.
model MaterialOverviewItemDto {
  id: uuid;
  materialType: uuid;
  materialTypeName: string;
  category: MaterialCategory;
  number?: int32;
  label: string;
  status: MaterialItemStatus;
  outages: MaterialOutageDto[];
}

model MaterialAssignmentDto {
  id: uuid;
  materialItem: uuid;
  competitionMatch?: uuid;
}

// Eine Anfrage in der Anbieter-Übersicht - Team, Verein, Wettkampf und die Zuteilungen, keine Teilnehmerdaten.
model MaterialOverviewRequestDto {
  id: uuid;
  materialOffer: uuid;
  materialType: uuid;
  materialTypeName: string;
  category: MaterialCategory;
  count: int32;
  status: MaterialRequestStatus;
  decisionNote?: string;
  requestedAt: utcDateTime;
  decidedAt?: utcDateTime;
  competitionRegistration: uuid;
  competition: uuid;
  competitionIdentifier: string;
  competitionName: string;
  teamName?: string;
  // Meldungsnummer aus der Fixierung - ordnet die Setzliste der ersten Runde.
  teamNumber?: int32;
  // Startnummer des Teams in seinem ersten Lauf (frühester Lauf nach Startzeit), ohne Lauf die
  // Meldungsnummer. Gegen diese Zahl markieren die Anzeigen eine Abweichung des Boots
  // (effective_material_for_match_team vergleicht je Lauf mit competition_match_team.start_number);
  // "Nach Startnummer zuteilen" richtet sich danach.
  startNumber?: int32;
  clubId: uuid;
  clubName: string;
  // Kontakt = E-Mail des Nutzers, der die Anmeldung angelegt hat.
  clubContactEmail?: string;
  assignments: MaterialAssignmentDto[];
}

// Ein Lauf, in dem eine Anfrage dieses Anbieters steht. id ist competition_match.competition_setup_match.
model MaterialOverviewMatchDto {
  id: uuid;
  competition: uuid;
  name?: string;
  roundName?: string;
  startTime?: utcDateTime;
  endTime?: utcDateTime;
  registrationIds: uuid[];
}

// Alles für ein Dashboard-Laden - Angebote, Flotte, Anfragen mit Zuteilungen und die Läufe dazu.
model MaterialOverviewDto {
  requestsClosed: boolean;
  offers: MaterialOfferDto[];
  items: MaterialOverviewItemDto[];
  requests: MaterialOverviewRequestDto[];
  matches: MaterialOverviewMatchDto[];
}

// Entscheidung des Anbieters über eine Anfrage - status ist CONFIRMED, WAITLISTED oder DECLINED.
model MaterialDecisionRequest {
  status: MaterialRequestStatus;
  decisionNote?: string;
}

model MaterialAssignmentEntry {
  materialItem: uuid;
  competitionMatch?: uuid;
}

// Vollständige Zuteilung einer Anfrage - kein Delta.
model MaterialAssignmentsRequest {
  assignments: MaterialAssignmentEntry[];
}

enum MaterialDamageSeverity {
  MINOR,
  MAJOR,
  TOTAL,
  OUTAGE_ONLY,
}

enum MaterialDamageStatus {
  REPORTED,
  REPAIRED,
}

// Metadaten eines Schadensfotos - die Bytes gibt es nur einzeln über den Download.
model MaterialDamagePhotoDto {
  id: uuid;
  name: string;
  contentType: string;
  createdAt: utcDateTime;
}

// Eine Zeile der Schadensakte - Stück und Materialart aufgelöst, Verursacher als Momentaufnahme der Meldung.
model MaterialDamageDto {
  id: uuid;
  materialItem: uuid;
  itemLabel: string;
  itemNumber?: int32;
  materialTypeName: string;
  reportedAt: utcDateTime;
  reportedByName?: string;
  description: string;
  severity: MaterialDamageSeverity;
  status: MaterialDamageStatus;
  causedByRegistration?: uuid;
  causedByTeam?: string;
  causedByClub?: string;
  causedByCompetition?: string;
  outOfServiceFrom?: utcDateTime;
  outOfServiceUntil?: utcDateTime;
  repairedAt?: utcDateTime;
  photos: MaterialDamagePhotoDto[];
}

model MaterialDamageRequest {
  materialItem: uuid;
  reportedAt: utcDateTime;
  description: string;
  severity: MaterialDamageSeverity;
  status: MaterialDamageStatus;
  causedByRegistration?: uuid;
  outOfServiceFrom?: utcDateTime;
  outOfServiceUntil?: utcDateTime;
  repairedAt?: utcDateTime;
}

@route("/materialProvider")
@tag("Material")
interface MaterialRoutes {
  // Get paginated material providers
  @get
  @operationId("")
  getMaterialProviders(
    // Pagination parameters
  ): MaterialProviderDto[];

  // Add material provider
  @post
  @operationId("")
  addMaterialProvider(
    @body request: MaterialProviderRequest,
  ): uuid;

  // Get material provider by ID
  @get
  @route("/{providerId}")
  @operationId("")
  getMaterialProvider(
    @path providerId: string, // UUID
  ): MaterialProviderDto;

  // Update material provider
  @put
  @route("/{providerId}")
  @operationId("")
  updateMaterialProvider(
    @path providerId: string, // UUID
    @body request: MaterialProviderRequest,
  ): void;

  // Delete material provider. Abgewiesen (409), solange der Anbieter Stücke oder Einladungen hat,
  // und (409, MATERIAL_PROVIDER_HAS_USERS) solange ihm Konten zugeordnet sind - die Zuordnung samt
  // Materialanbieter-Rolle löst nur die Nutzerverwaltung, wo die Vergaberegeln greifen.
  @delete
  @route("/{providerId}")
  @operationId("")
  deleteMaterialProvider(
    @path providerId: string, // UUID
  ): void;

  // Get paginated material items of a provider
  @get
  @route("/{providerId}/item")
  @operationId("")
  getMaterialItems(
    @path providerId: string, // UUID
    // Pagination parameters
  ): MaterialItemDto[];

  // Add material item to a provider
  @post
  @route("/{providerId}/item")
  @operationId("")
  addMaterialItem(
    @path providerId: string, // UUID
    @body request: MaterialItemRequest,
  ): uuid;

  // Update material item
  @put
  @route("/{providerId}/item/{itemId}")
  @operationId("")
  updateMaterialItem(
    @path providerId: string, // UUID
    @path itemId: string, // UUID
    @body request: MaterialItemRequest,
  ): void;

  // Delete material item
  @delete
  @route("/{providerId}/item/{itemId}")
  @operationId("")
  deleteMaterialItem(
    @path providerId: string, // UUID
    @path itemId: string, // UUID
  ): void;

  // Get paginated damage records of a provider, across events, optionally filtered by event or item
  @get
  @route("/{providerId}/damage")
  @operationId("")
  getMaterialDamages(
    @path providerId: string, // UUID
    @query eventId?: string, // UUID
    @query itemId?: string, // UUID
    // Pagination parameters
  ): MaterialDamageDto[];

  // Add a damage record
  @post
  @route("/{providerId}/damage")
  @operationId("")
  addMaterialDamage(
    @path providerId: string, // UUID
    @body request: MaterialDamageRequest,
  ): uuid;

  // Get a single damage record with its photos
  @get
  @route("/{providerId}/damage/{damageId}")
  @operationId("")
  getMaterialDamage(
    @path providerId: string, // UUID
    @path damageId: string, // UUID
  ): MaterialDamageDto;

  // Update a damage record
  @put
  @route("/{providerId}/damage/{damageId}")
  @operationId("")
  updateMaterialDamage(
    @path providerId: string, // UUID
    @path damageId: string, // UUID
    @body request: MaterialDamageRequest,
  ): void;

  // Upload one or more photos for a damage record (multipart, field "files", höchstens 20 je
  // Anfrage). Gelesen wird erst nach Anmeldung und OWN-Prüfung. Jede Datei einzeln geprüft:
  // höchstens 10 MB (400, MATERIAL_PHOTO_TOO_LARGE) und an den ersten Bytes als JPEG, PNG, WebP,
  // GIF oder HEIC erkannt (415, MATERIAL_PHOTO_INVALID_TYPE); der Dateiname bekommt die passende
  // Endung. Auslieferung nur über getMaterialDamagePhoto, als Anhang.
  @post
  @route("/{providerId}/damage/{damageId}/photo")
  @operationId("")
  addMaterialDamagePhotos(
    @path providerId: string, // UUID
    @path damageId: string, // UUID
  ): void;

  // Download the bytes of a damage photo
  @get
  @route("/{providerId}/photo/{photoId}")
  @operationId("")
  getMaterialDamagePhoto(
    @path providerId: string, // UUID
    @path photoId: string, // UUID
  ): bytes;

  // Delete a damage photo
  @delete
  @route("/{providerId}/photo/{photoId}")
  @operationId("")
  deleteMaterialDamagePhoto(
    @path providerId: string, // UUID
    @path photoId: string, // UUID
  ): void;
}

@route("/materialType")
@tag("Material")
interface MaterialTypeRoutes {
  // Get paginated material types
  @get
  @operationId("")
  getMaterialTypes(
    // Pagination parameters
  ): MaterialTypeDto[];

  // Add material type
  @post
  @operationId("")
  addMaterialType(
    @body request: MaterialTypeRequest,
  ): uuid;

  // Update material type
  @put
  @route("/{typeId}")
  @operationId("")
  updateMaterialType(
    @path typeId: string, // UUID
    @body request: MaterialTypeRequest,
  ): void;

  // Delete material type
  @delete
  @route("/{typeId}")
  @operationId("")
  deleteMaterialType(
    @path typeId: string, // UUID
  ): void;
}

@route("/materialProvider/{providerId}/event")
@tag("Material")
interface MaterialProviderEventRoutes {
  // Veranstaltungen, zu denen der eigene Anbieter eingeladen ist
  @get
  @operationId("")
  getMaterialProviderEvents(
    @path providerId: string, // UUID
  ): MaterialProviderEventDto[];
}

// Einladung, Freigabe und Angebote je Veranstaltung - eingehängt unter /event/{eventId}.
@route("/event/{eventId}/materialProvider")
@tag("Material")
interface EventMaterialRoutes {
  // Zur Veranstaltung eingeladene Anbieter
  @get
  @operationId("")
  getEventMaterialProviders(
    @path eventId: string, // UUID
  ): EventMaterialProviderDto[];

  // Anbieter zur Veranstaltung einladen (idempotent)
  @put
  @route("/{providerId}")
  @operationId("")
  inviteMaterialProvider(
    @path eventId: string, // UUID
    @path providerId: string, // UUID
  ): void;

  // Einladung zurückziehen
  @delete
  @route("/{providerId}")
  @operationId("")
  uninviteMaterialProvider(
    @path eventId: string, // UUID
    @path providerId: string, // UUID
  ): void;

  // Materialanfragen des Anbieters öffnen/schließen
  @put
  @route("/{providerId}/requestsClosed")
  @operationId("")
  setMaterialRequestsClosed(
    @path eventId: string, // UUID
    @path providerId: string, // UUID
    @body request: SetRequestsClosedRequest,
  ): void;

  // Angebote des Anbieters an dieser Veranstaltung
  @get
  @route("/{providerId}/offer")
  @operationId("")
  getMaterialOffers(
    @path eventId: string, // UUID
    @path providerId: string, // UUID
  ): MaterialOfferDto[];

  // Angebot anlegen
  @post
  @route("/{providerId}/offer")
  @operationId("")
  addMaterialOffer(
    @path eventId: string, // UUID
    @path providerId: string, // UUID
    @body request: MaterialOfferRequest,
  ): uuid;

  // Angebot aktualisieren
  @put
  @route("/{providerId}/offer/{offerId}")
  @operationId("")
  updateMaterialOffer(
    @path eventId: string, // UUID
    @path providerId: string, // UUID
    @path offerId: string, // UUID
    @body request: MaterialOfferRequest,
  ): void;

  // Angebot löschen
  @delete
  @route("/{providerId}/offer/{offerId}")
  @operationId("")
  deleteMaterialOffer(
    @path eventId: string, // UUID
    @path providerId: string, // UUID
    @path offerId: string, // UUID
  ): void;

  // Angebote, Flotte, Anfragen mit Zuteilungen und die Läufe dazu in einem Aufruf - das Anbieter-Dashboard.
  @get
  @route("/{providerId}/overview")
  @operationId("")
  getMaterialOverview(
    @path eventId: string, // UUID
    @path providerId: string, // UUID
  ): MaterialOverviewDto;

  // Entscheidet über eine Anfrage (bestätigen, Warteliste, ablehnen). Bumpt den Änderungsmarker der
  // Veranstaltung: Mein Event zeigt den Status, eine zurückgenommene Bestätigung nimmt das Boot
  // von allen Anzeigen.
  @put
  @route("/{providerId}/request/{requestId}/decision")
  @operationId("")
  decideMaterialRequest(
    @path eventId: string, // UUID
    @path providerId: string, // UUID
    @path requestId: string, // UUID
    @body request: MaterialDecisionRequest,
  ): void;

  // Ersetzt die Zuteilung einer bestätigten Anfrage vollständig (Grundzuteilung ohne Lauf,
  // Ausnahme je Lauf, Ersatzwahl nach Schaden). Bumpt den Änderungsmarker der Veranstaltung.
  @put
  @route("/{providerId}/request/{requestId}/assignments")
  @operationId("")
  setMaterialAssignments(
    @path eventId: string, // UUID
    @path providerId: string, // UUID
    @path requestId: string, // UUID
    @body request: MaterialAssignmentsRequest,
  ): void;

  // Schadensakte des Anbieters an dieser Veranstaltung als CSV-Export
  @get
  @route("/{providerId}/damage/csv")
  @operationId("")
  getMaterialDamagesCsv(
    @path eventId: string, // UUID
    @path providerId: string, // UUID
  ): bytes;
}

// Anfragen einer Meldung - OWN meint hier den Verein des Nutzers (wie bei competitionRegistration).
@route("/event/{eventId}/competitionRegistration/{competitionRegistrationId}/materialRequests")
@tag("Material")
interface MaterialRequestRoutes {
  // Ersetzt die gewünschten Angebote einer Meldung. Nicht mehr genannte werden WITHDRAWN (Mail an
  // den Anbieter, wenn sie bestätigt waren; die Sprache folgt dem Konto mit der Kontaktadresse,
  // sonst Deutsch), neue REQUESTED. Bumpt den Änderungsmarker nur, wenn sich etwas geändert hat.
  @put
  @operationId("")
  setMaterialRequests(
    @path eventId: string, // UUID
    @path competitionRegistrationId: string, // UUID
    @body request: MaterialRequestsUpsertRequest,
  ): void;
}
