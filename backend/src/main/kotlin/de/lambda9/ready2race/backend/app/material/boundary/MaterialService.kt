package de.lambda9.ready2race.backend.app.material.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.club.control.ClubRepo
import de.lambda9.ready2race.backend.app.competition.control.CompetitionRepo
import de.lambda9.ready2race.backend.app.email.boundary.EmailService
import de.lambda9.ready2race.backend.app.email.entity.EmailLanguage
import de.lambda9.ready2race.backend.app.email.entity.EmailTemplateKey
import de.lambda9.ready2race.backend.app.email.entity.EmailTemplatePlaceholder
import de.lambda9.ready2race.backend.app.event.control.EventRepo
import de.lambda9.ready2race.backend.app.material.control.EventHasMaterialProviderRepo
import de.lambda9.ready2race.backend.app.material.control.MaterialItemRepo
import de.lambda9.ready2race.backend.app.material.control.MaterialOfferRepo
import de.lambda9.ready2race.backend.app.material.control.MaterialProviderRepo
import de.lambda9.ready2race.backend.app.material.control.MaterialRequestRepo
import de.lambda9.ready2race.backend.app.material.control.MaterialTypeRepo
import de.lambda9.ready2race.backend.app.material.control.toDto
import de.lambda9.ready2race.backend.app.material.control.toRecord
import de.lambda9.ready2race.backend.app.material.entity.EventMaterialProviderDto
import de.lambda9.ready2race.backend.app.material.entity.MaterialCapacityLevel
import de.lambda9.ready2race.backend.app.material.entity.MaterialError
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemDto
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemSort
import de.lambda9.ready2race.backend.app.material.entity.MaterialOfferDto
import de.lambda9.ready2race.backend.app.material.entity.MaterialOfferRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialProviderDto
import de.lambda9.ready2race.backend.app.material.entity.MaterialProviderEventDto
import de.lambda9.ready2race.backend.app.material.entity.MaterialProviderRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialProviderSort
import de.lambda9.ready2race.backend.app.material.entity.MaterialRequestStatus
import de.lambda9.ready2race.backend.app.material.entity.MaterialTypeDto
import de.lambda9.ready2race.backend.app.material.entity.MaterialTypeRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialTypeSort
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.calls.responses.ApiResponse.Companion.noData
import de.lambda9.ready2race.backend.calls.responses.createdResponse
import de.lambda9.ready2race.backend.calls.responses.pageResponse
import de.lambda9.ready2race.backend.database.generated.tables.records.EventHasMaterialProviderRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.MaterialRequestRecord
import de.lambda9.ready2race.backend.kio.onFalseFail
import de.lambda9.ready2race.backend.pagination.PaginationParameters
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.onNullFail
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.tailwind.core.extensions.kio.traverse
import java.time.LocalDateTime
import java.util.UUID

/**
 * Anbieter, Materialarten und die Stücke im Bestand eines Anbieters - der Stamm der
 * Materialvermietung. Angebote, Anfragen und Schäden folgen in späteren Aufgaben.
 */
object MaterialService {

    // -------------------------------------------------------------------
    // Anbieter
    // -------------------------------------------------------------------

    fun addProvider(
        request: MaterialProviderRequest,
        userId: UUID,
    ): App<MaterialError, ApiResponse.Created> = KIO.comprehension {
        val nameTaken = !MaterialProviderRepo.existsByName(request.name).orDie()
        !KIO.failOn(nameTaken) { MaterialError.ProviderNameTaken }

        val record = !request.toRecord(userId)
        MaterialProviderRepo.create(record).orDie().createdResponse()
    }

    fun pageProviders(
        params: PaginationParameters<MaterialProviderSort>,
    ): App<Nothing, ApiResponse.Page<MaterialProviderDto, MaterialProviderSort>> = KIO.comprehension {
        MaterialProviderRepo.page(params).orDie().pageResponse { !it.toDto() }
    }

    fun getProvider(
        id: UUID,
    ): App<MaterialError, ApiResponse.Dto<MaterialProviderDto>> = KIO.comprehension {
        val record = !MaterialProviderRepo.get(id).orDie().onNullFail { MaterialError.ProviderNotFound }
        record.toDto().map { ApiResponse.Dto(it) }
    }

    fun updateProvider(
        id: UUID,
        request: MaterialProviderRequest,
        userId: UUID,
    ): App<MaterialError, ApiResponse.NoData> = KIO.comprehension {
        val nameTaken = !MaterialProviderRepo.existsByName(request.name, excludingId = id).orDie()
        !KIO.failOn(nameTaken) { MaterialError.ProviderNameTaken }

        !MaterialProviderRepo.update(id) {
            name = request.name
            contactName = request.contactName
            contactEmail = request.contactEmail
            contactPhone = request.contactPhone
            note = request.note
            updatedAt = LocalDateTime.now()
            updatedBy = userId
        }.orDie().onNullFail { MaterialError.ProviderNotFound }
        noData
    }

    fun deleteProvider(
        id: UUID,
    ): App<MaterialError, ApiResponse.NoData> = KIO.comprehension {
        val hasItems = !MaterialProviderRepo.hasItems(id).orDie()
        !KIO.failOn(hasItems) { MaterialError.ProviderInUse }
        val hasInvitations = !MaterialProviderRepo.hasEventInvitations(id).orDie()
        !KIO.failOn(hasInvitations) { MaterialError.ProviderInUse }

        val deleted = !MaterialProviderRepo.delete(id).orDie()
        if (deleted < 1) {
            KIO.fail(MaterialError.ProviderNotFound)
        } else {
            noData
        }
    }

    // -------------------------------------------------------------------
    // Materialarten
    // -------------------------------------------------------------------

    fun addType(
        request: MaterialTypeRequest,
        userId: UUID,
    ): App<MaterialError, ApiResponse.Created> = KIO.comprehension {
        val nameTaken = !MaterialTypeRepo.existsByName(request.name).orDie()
        !KIO.failOn(nameTaken) { MaterialError.TypeNameTaken }

        val record = !request.toRecord(userId)
        MaterialTypeRepo.create(record).orDie().createdResponse()
    }

    fun pageTypes(
        params: PaginationParameters<MaterialTypeSort>,
    ): App<Nothing, ApiResponse.Page<MaterialTypeDto, MaterialTypeSort>> = KIO.comprehension {
        MaterialTypeRepo.page(params).orDie().pageResponse { !it.toDto() }
    }

    fun updateType(
        id: UUID,
        request: MaterialTypeRequest,
        userId: UUID,
    ): App<MaterialError, ApiResponse.NoData> = KIO.comprehension {
        val nameTaken = !MaterialTypeRepo.existsByName(request.name, excludingId = id).orDie()
        !KIO.failOn(nameTaken) { MaterialError.TypeNameTaken }

        !MaterialTypeRepo.update(id) {
            name = request.name
            category = request.category.name
            description = request.description
            updatedAt = LocalDateTime.now()
            updatedBy = userId
        }.orDie().onNullFail { MaterialError.TypeNotFound }
        noData
    }

    fun deleteType(
        id: UUID,
    ): App<MaterialError, ApiResponse.NoData> = KIO.comprehension {
        val hasItems = !MaterialTypeRepo.hasItems(id).orDie()
        !KIO.failOn(hasItems) { MaterialError.TypeInUse }
        val hasDemand = !MaterialTypeRepo.hasCompetitionDemand(id).orDie()
        !KIO.failOn(hasDemand) { MaterialError.TypeInUse }
        val hasOffers = !MaterialTypeRepo.hasOffers(id).orDie()
        !KIO.failOn(hasOffers) { MaterialError.TypeInUse }

        val deleted = !MaterialTypeRepo.delete(id).orDie()
        if (deleted < 1) {
            KIO.fail(MaterialError.TypeNotFound)
        } else {
            noData
        }
    }

    // -------------------------------------------------------------------
    // Materialstücke
    // -------------------------------------------------------------------

    fun addItem(
        providerId: UUID,
        request: MaterialItemRequest,
        userId: UUID,
    ): App<MaterialError, ApiResponse.Created> = KIO.comprehension {
        if (request.number != null) {
            val numberTaken = !MaterialItemRepo.existsByNumber(providerId, request.materialType, request.number).orDie()
            !KIO.failOn(numberTaken) { MaterialError.ItemNumberTaken }
        }

        val record = !request.toRecord(providerId, userId)
        MaterialItemRepo.create(record).orDie().createdResponse()
    }

    fun pageItems(
        providerId: UUID,
        params: PaginationParameters<MaterialItemSort>,
    ): App<Nothing, ApiResponse.Page<MaterialItemDto, MaterialItemSort>> = KIO.comprehension {
        MaterialItemRepo.page(providerId, params).orDie().pageResponse { !it.toDto() }
    }

    fun updateItem(
        providerId: UUID,
        itemId: UUID,
        request: MaterialItemRequest,
        userId: UUID,
    ): App<MaterialError, ApiResponse.NoData> = KIO.comprehension {
        val item = !MaterialItemRepo.get(itemId).orDie().onNullFail { MaterialError.ItemNotFound }
        !KIO.ok(item.materialProvider == providerId).onFalseFail { MaterialError.ItemNotFound }

        if (request.number != null) {
            val numberTaken = !MaterialItemRepo.existsByNumber(
                providerId,
                request.materialType,
                request.number,
                excludingId = itemId,
            ).orDie()
            !KIO.failOn(numberTaken) { MaterialError.ItemNumberTaken }
        }

        !MaterialItemRepo.update(itemId) {
            materialType = request.materialType
            number = request.number
            label = request.label
            note = request.note
            status = request.status.name
            updatedAt = LocalDateTime.now()
            updatedBy = userId
        }.orDie().onNullFail { MaterialError.ItemNotFound }
        noData
    }

    fun deleteItem(
        providerId: UUID,
        itemId: UUID,
    ): App<MaterialError, ApiResponse.NoData> = KIO.comprehension {
        val item = !MaterialItemRepo.get(itemId).orDie().onNullFail { MaterialError.ItemNotFound }
        !KIO.ok(item.materialProvider == providerId).onFalseFail { MaterialError.ItemNotFound }

        val hasAssignments = !MaterialItemRepo.hasAssignments(itemId).orDie()
        !KIO.failOn(hasAssignments) { MaterialError.ItemInUse }

        val deleted = !MaterialItemRepo.delete(itemId).orDie()
        if (deleted < 1) {
            KIO.fail(MaterialError.ItemNotFound)
        } else {
            noData
        }
    }

    // -------------------------------------------------------------------
    // Einladung je Veranstaltung
    // -------------------------------------------------------------------

    private fun checkEventExisting(eventId: UUID): App<MaterialError, Unit> =
        EventRepo.exists(eventId).orDie().onFalseFail { MaterialError.EventNotFound }

    /** Einladen ist idempotent - ein zweites Mal einladen ändert nichts. */
    fun inviteProvider(
        eventId: UUID,
        providerId: UUID,
        userId: UUID,
    ): App<MaterialError, ApiResponse.NoData> = KIO.comprehension {
        !checkEventExisting(eventId)

        val alreadyInvited = !EventHasMaterialProviderRepo.exists(eventId, providerId).orDie()
        if (!alreadyInvited) {
            val now = LocalDateTime.now()
            !EventHasMaterialProviderRepo.create(
                EventHasMaterialProviderRecord(
                    event = eventId,
                    materialProvider = providerId,
                    requestsClosed = false,
                    createdAt = now,
                    createdBy = userId,
                    updatedAt = now,
                    updatedBy = userId,
                )
            ).orDie()
        }
        noData
    }

    /**
     * Löscht die Einladung, die Angebote fallen per Kaskade. Bestehende Anfragen sind fachliche
     * Daten, keine reine Referenz - die werden geschützt statt stillschweigend mitgelöscht.
     */
    fun uninviteProvider(
        eventId: UUID,
        providerId: UUID,
    ): App<MaterialError, ApiResponse.NoData> = KIO.comprehension {
        val hasRequests = !EventHasMaterialProviderRepo.hasRequests(eventId, providerId).orDie()
        !KIO.failOn(hasRequests) { MaterialError.ProviderInUse }

        !EventHasMaterialProviderRepo.delete(eventId, providerId).orDie()
        noData
    }

    fun getEventProviders(
        eventId: UUID,
    ): App<MaterialError, ApiResponse.ListDto<EventMaterialProviderDto>> = KIO.comprehension {
        !checkEventExisting(eventId)
        EventHasMaterialProviderRepo.listForEvent(eventId).orDie().map { ApiResponse.ListDto(it) }
    }

    fun getProviderEvents(
        providerId: UUID,
    ): App<Nothing, ApiResponse.ListDto<MaterialProviderEventDto>> = KIO.comprehension {
        EventHasMaterialProviderRepo.listForProvider(providerId).orDie().map { ApiResponse.ListDto(it) }
    }

    fun setRequestsClosed(
        eventId: UUID,
        providerId: UUID,
        closed: Boolean,
        userId: UUID,
    ): App<MaterialError, ApiResponse.NoData> = KIO.comprehension {
        !EventHasMaterialProviderRepo.update(eventId, providerId) {
            requestsClosed = closed
            updatedAt = LocalDateTime.now()
            updatedBy = userId
        }.orDie().onNullFail { MaterialError.NotInvited }
        noData
    }

    // -------------------------------------------------------------------
    // Angebote
    // -------------------------------------------------------------------

    fun listOffers(
        eventId: UUID,
        providerId: UUID,
    ): App<MaterialError, ApiResponse.ListDto<MaterialOfferDto>> = KIO.comprehension {
        MaterialOfferRepo.listForEventAndProvider(eventId, providerId).orDie().map { ApiResponse.ListDto(it) }
    }

    fun addOffer(
        eventId: UUID,
        providerId: UUID,
        request: MaterialOfferRequest,
        userId: UUID,
    ): App<MaterialError, ApiResponse.Created> = KIO.comprehension {
        val invited = !EventHasMaterialProviderRepo.exists(eventId, providerId).orDie()
        !KIO.failOn(!invited) { MaterialError.NotInvited }

        val typeTaken = !MaterialOfferRepo.existsByType(eventId, providerId, request.materialType).orDie()
        !KIO.failOn(typeTaken) { MaterialError.OfferTypeTaken }

        val record = !request.toRecord(eventId, providerId, userId)
        MaterialOfferRepo.create(record).orDie().createdResponse()
    }

    fun updateOffer(
        eventId: UUID,
        providerId: UUID,
        offerId: UUID,
        request: MaterialOfferRequest,
        userId: UUID,
    ): App<MaterialError, ApiResponse.NoData> = KIO.comprehension {
        val offer = !MaterialOfferRepo.get(offerId).orDie().onNullFail { MaterialError.OfferNotFound }
        !KIO.ok(offer.event == eventId && offer.materialProvider == providerId).onFalseFail { MaterialError.OfferNotFound }

        val typeTaken = !MaterialOfferRepo.existsByType(eventId, providerId, request.materialType, excludingId = offerId).orDie()
        !KIO.failOn(typeTaken) { MaterialError.OfferTypeTaken }

        !MaterialOfferRepo.update(offerId) {
            materialType = request.materialType
            priceText = request.priceText
            plannedCount = request.plannedCount
            changeoverMinutes = request.changeoverMinutes
            updatedAt = LocalDateTime.now()
            updatedBy = userId
        }.orDie().onNullFail { MaterialError.OfferNotFound }
        noData
    }

    fun deleteOffer(
        eventId: UUID,
        providerId: UUID,
        offerId: UUID,
    ): App<MaterialError, ApiResponse.NoData> = KIO.comprehension {
        val offer = !MaterialOfferRepo.get(offerId).orDie().onNullFail { MaterialError.OfferNotFound }
        !KIO.ok(offer.event == eventId && offer.materialProvider == providerId).onFalseFail { MaterialError.OfferNotFound }

        val hasRequests = !MaterialOfferRepo.hasRequests(offerId).orDie()
        !KIO.failOn(hasRequests) { MaterialError.OfferInUse }

        val deleted = !MaterialOfferRepo.delete(offerId).orDie()
        if (deleted < 1) {
            KIO.fail(MaterialError.OfferNotFound)
        } else {
            noData
        }
    }

    // -------------------------------------------------------------------
    // Anfragen
    // -------------------------------------------------------------------

    /**
     * Ersetzt die Anfragen einer Meldung durch die übergebene Wunschliste (Spec Abschnitt 7):
     * bestehende Anfragen zu weiterhin gewünschten Angeboten bleiben unverändert (auch bestätigte),
     * nicht mehr genannte werden zurückgezogen. Ein zurückgezogenes oder abgelehntes Angebot, das
     * wieder genannt wird, gilt als neue Anfrage (siehe [MaterialRequestRepo.reactivate]) - eine
     * echte zweite Zeile lässt der Unique-Index (competition_registration, material_offer) ohnehin
     * nicht zu.
     */
    fun setRequestsForRegistration(
        eventId: UUID,
        competitionRegistrationId: UUID,
        clubScope: Pair<Privilege.Scope, UUID?>,
        offerIds: List<UUID>,
        userId: UUID,
    ): App<MaterialError, ApiResponse.NoData> = KIO.comprehension {
        val (scope, club) = clubScope

        val ref = !MaterialRequestRepo.registrationRef(competitionRegistrationId).orDie()
            .onNullFail { MaterialError.RegistrationNotFound }
        !KIO.failOn(ref.event != eventId) { MaterialError.RegistrationNotFound }
        !KIO.failOn(scope == Privilege.Scope.OWN && ref.club != club) { MaterialError.RegistrationNotFound }

        val demand = !MaterialRequestRepo.demandForRegistration(competitionRegistrationId).orDie()
        val existing = !MaterialRequestRepo.forRegistration(competitionRegistrationId).orDie()
        val existingByOffer = existing.associateBy { it.materialOffer }

        // Erst validieren, dann schreiben - eine ungültige Zeile in der Liste darf die anderen
        // nicht halb anwenden.
        val offers = !offerIds.distinct().traverse { offerId ->
            KIO.comprehension {
                val offer = !MaterialOfferRepo.get(offerId).orDie().onNullFail { MaterialError.OfferNotFound }
                !KIO.failOn(offer.event != eventId) { MaterialError.OfferNotFound }
                !KIO.failOn(!demand.containsKey(offer.materialType)) { MaterialError.TypeNotDemanded }
                KIO.ok(offer)
            }
        }

        val duplicateType = offers.groupBy { it.materialType }.values.any { it.size > 1 }
        !KIO.failOn(duplicateType) { MaterialError.DuplicateTypeForRegistration }

        val now = LocalDateTime.now()

        // requests_closed gilt nur für wirklich neue Anfragen. Eine Zeile zählt auch dann als neu,
        // wenn es sie schon einmal gab, aber zurückgezogen oder abgelehnt wurde - nur eine weiterhin
        // aktive Anfrage (REQUESTED/CONFIRMED/WAITLISTED) für dasselbe Angebot ist keine neue.
        !offers.filter {
            val previousStatus = existingByOffer[it.id]?.status
            previousStatus == null ||
                previousStatus == MaterialRequestStatus.WITHDRAWN.name ||
                previousStatus == MaterialRequestStatus.DECLINED.name
        }.traverse { offer ->
            KIO.comprehension {
                val invitation = !EventHasMaterialProviderRepo.get(eventId, offer.materialProvider).orDie()
                !KIO.failOn(invitation?.requestsClosed == true) { MaterialError.RequestsClosed }

                val previous = existingByOffer[offer.id]
                if (previous == null) {
                    !MaterialRequestRepo.create(
                        MaterialRequestRecord(
                            id = UUID.randomUUID(),
                            competitionRegistration = competitionRegistrationId,
                            materialOffer = offer.id,
                            count = demand.getValue(offer.materialType),
                            status = MaterialRequestStatus.REQUESTED.name,
                            requestedAt = now,
                            createdAt = now,
                            createdBy = userId,
                            updatedAt = now,
                            updatedBy = userId,
                        )
                    ).orDie()
                } else {
                    // Zurückgezogen oder abgelehnt und jetzt erneut genannt: dieselbe Zeile wird
                    // reaktiviert statt neu angelegt (Unique-Index lässt keine zweite Zeile zum
                    // selben Angebot zu), damit ein Verein nach einem Rückzug erneut anfragen kann.
                    !MaterialRequestRepo.reactivate(previous.id, now, userId).orDie()
                }

                KIO.unit
            }
        }

        val wantedOfferIds = offers.map { it.id }.toSet()
        val toWithdraw = existing.filter {
            it.materialOffer !in wantedOfferIds && it.status != MaterialRequestStatus.WITHDRAWN.name
        }

        !toWithdraw.traverse { request ->
            if (request.status == MaterialRequestStatus.CONFIRMED.name) {
                notifyProviderOfWithdrawal(ref.competition, ref.club, eventId, request)
            } else {
                KIO.unit
            }
        }

        if (toWithdraw.isNotEmpty()) {
            !MaterialRequestRepo.withdraw(toWithdraw.map { it.id }, now).orDie()
        }

        noData
    }

    /** GREEN wenn (CONFIRMED+REQUESTED Mengen) < planned_count, sonst YELLOW. */
    fun capacityLevels(eventId: UUID): App<Nothing, Map<UUID, MaterialCapacityLevel>> = KIO.comprehension {
        val offers = !MaterialOfferRepo.forEvent(eventId).orDie()
        val requested = !MaterialRequestRepo.capacityForOffers(eventId).orDie()

        KIO.ok(
            offers.associate { offer ->
                val sum = requested[offer.id!!] ?: 0
                offer.id!! to if (sum < offer.plannedCount!!) MaterialCapacityLevel.GREEN else MaterialCapacityLevel.YELLOW
            }
        )
    }

    /**
     * Anbieter haben kein eigenes Sprachfeld (anders als App-Nutzer über `app_user.language`) -
     * Deutsch ist die einzige Sprache, die für sie bislang vorgesehen ist.
     */
    private fun notifyProviderOfWithdrawal(
        competitionId: UUID,
        clubId: UUID,
        eventId: UUID,
        request: MaterialRequestRecord,
    ): App<Nothing, Unit> = KIO.comprehension {
        val offer = !MaterialOfferRepo.get(request.materialOffer).orDie()

        if (offer == null) {
            KIO.unit
        } else {
            val provider = !MaterialProviderRepo.get(offer.materialProvider).orDie()
            val email = provider?.contactEmail

            if (email == null) {
                KIO.unit
            } else {
                val type = !MaterialTypeRepo.get(offer.materialType).orDie()
                val club = !ClubRepo.getName(clubId).orDie()
                val event = !EventRepo.get(eventId).orDie()
                val competition = !CompetitionRepo.getById(competitionId).orDie()

                // TODO: fest auf Deutsch, weil material_provider noch kein Sprachfeld hat.
                val content = !EmailService.getTemplate(
                    EmailTemplateKey.MATERIAL_REQUEST_WITHDRAWN,
                    EmailLanguage.DE,
                ).map { template ->
                    template.toContent(
                        EmailTemplatePlaceholder.CLUB to (club ?: "-"),
                        EmailTemplatePlaceholder.EVENT to (event?.name ?: "-"),
                        // Kein eigener Platzhalter für die Materialart - der Name kommt mit in
                        // COMPETITIONS, wie "C4x+ (JM4x)".
                        EmailTemplatePlaceholder.COMPETITIONS to "${type?.name ?: "?"} (${competition?.name ?: "?"})",
                    )
                }

                EmailService.enqueue(recipient = email, content = content).map { }
            }
        }
    }
}
