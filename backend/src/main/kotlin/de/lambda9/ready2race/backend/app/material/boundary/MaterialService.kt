package de.lambda9.ready2race.backend.app.material.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.appuser.control.AppUserRepo
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.club.control.ClubRepo
import de.lambda9.ready2race.backend.app.competition.control.CompetitionRepo
import de.lambda9.ready2race.backend.app.email.boundary.EmailService
import de.lambda9.ready2race.backend.app.email.entity.EmailLanguage
import de.lambda9.ready2race.backend.app.email.entity.EmailTemplateKey
import de.lambda9.ready2race.backend.app.email.entity.EmailTemplatePlaceholder
import de.lambda9.ready2race.backend.app.event.control.EventRepo
import de.lambda9.ready2race.backend.app.eventInfo.boundary.EventChangeMarker
import de.lambda9.ready2race.backend.app.material.control.EventHasMaterialProviderRepo
import de.lambda9.ready2race.backend.app.material.control.MaterialAssignmentRepo
import de.lambda9.ready2race.backend.app.material.control.MaterialDamagePhotoDataRepo
import de.lambda9.ready2race.backend.app.material.control.MaterialDamagePhotoRepo
import de.lambda9.ready2race.backend.app.material.control.MaterialDamageRepo
import de.lambda9.ready2race.backend.app.material.control.MaterialItemRepo
import de.lambda9.ready2race.backend.app.material.control.MaterialOfferRepo
import de.lambda9.ready2race.backend.app.material.control.MaterialOverviewRepo
import de.lambda9.ready2race.backend.app.material.control.MaterialProviderRepo
import de.lambda9.ready2race.backend.app.material.control.MaterialRequestRepo
import de.lambda9.ready2race.backend.app.material.control.MaterialTypeRepo
import de.lambda9.ready2race.backend.app.material.control.toDto
import de.lambda9.ready2race.backend.app.material.control.toRecord
import de.lambda9.ready2race.backend.app.material.entity.EventMaterialProviderDto
import de.lambda9.ready2race.backend.app.material.entity.MaterialAssignmentsRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialCapacityLevel
import de.lambda9.ready2race.backend.app.material.entity.MaterialDamageDto
import de.lambda9.ready2race.backend.app.material.entity.MaterialDamageRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialDamageSort
import de.lambda9.ready2race.backend.app.material.entity.MaterialDamageStatus
import de.lambda9.ready2race.backend.app.material.entity.MaterialDecisionRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialError
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemDto
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemSort
import de.lambda9.ready2race.backend.app.material.entity.MaterialOfferDto
import de.lambda9.ready2race.backend.app.material.entity.MaterialOfferRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialOverviewDto
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
import de.lambda9.ready2race.backend.csv.CSV
import de.lambda9.ready2race.backend.database.generated.tables.records.EventHasMaterialProviderRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.MaterialAssignmentRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.MaterialDamagePhotoDataRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.MaterialDamagePhotoRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.MaterialDamageRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.MaterialDamageViewRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.MaterialRequestRecord
import de.lambda9.ready2race.backend.file.File
import de.lambda9.ready2race.backend.kio.onFalseFail
import de.lambda9.ready2race.backend.pagination.PaginationParameters
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.onNullFail
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.tailwind.core.extensions.kio.traverse
import java.io.ByteArrayOutputStream
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.UUID

/** Maximale Größe je hochgeladenem Schadensfoto (Spec Abschnitt 10). */
const val MATERIAL_PHOTO_MAX_BYTES = 10L * 1024 * 1024

/** Höchstzahl Fotos je Upload-Anfrage - der Schadensdialog lädt mehrere auf einmal hoch. */
const val MATERIAL_PHOTOS_PER_UPLOAD = 20

/**
 * Die Materialvermietung: Anbieter, Materialarten, Bestand, Einladungen und Angebote je
 * Veranstaltung, Anfragen der Vereine, Entscheidung und Zuteilung, Schadensakte.
 *
 * **Änderungsmarker.** Die öffentlichen Anzeigen (Boards, Mein Event, Live-Läufe, Startliste,
 * Stream, Sprecher, Schiedsrichter-Dashboard) lesen das wirksame Boot je Lauf-Team aus
 * `effective_material_for_match_team`, Mein Event zusätzlich Status, Art und Anbieter der
 * Anfragen. Jede Mutation, die eines davon ändert, ruft [EventChangeMarker.bump] für die
 * betroffenen Veranstaltungen (wirkt nach dem Commit). Bewusst ohne Bump: Anlegen und Löschen
 * von Anbietern, Arten, Stücken und Angeboten (Löschen ist bei Verwendung gesperrt, Neues hat
 * noch keine Anfrage), Einladen/Ausladen (Ausladen ist bei Anfragen gesperrt), der Schalter
 * „Vergabe geschlossen" und die ganze Schadensakte samt Fotos - keine Anzeige liest
 * `material_damage`; ein Ersatz wegen Schadens wirkt erst über die Ausnahme je Lauf
 * ([setAssignments]), und die bumpt.
 */
object MaterialService {

    private fun bumpAll(eventIds: Collection<UUID>) = eventIds.distinct().forEach { EventChangeMarker.bump(it) }

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

        // Der Anbietername steht in Mein Event an jeder Anfrage.
        bumpAll(!EventHasMaterialProviderRepo.eventIdsForProvider(id).orDie())
        noData
    }

    fun deleteProvider(
        id: UUID,
    ): App<MaterialError, ApiResponse.NoData> = KIO.comprehension {
        val hasItems = !MaterialProviderRepo.hasItems(id).orDie()
        !KIO.failOn(hasItems) { MaterialError.ProviderInUse }
        val hasInvitations = !MaterialProviderRepo.hasEventInvitations(id).orDie()
        !KIO.failOn(hasInvitations) { MaterialError.ProviderInUse }
        // Abweisen statt die Rolle hier zu entziehen: die Zuordnung (und damit die Rolle) ändert
        // nur die Nutzerverwaltung, wo die Vergaberegeln greifen (UPDATE STAFF GLOBAL usw.) -
        // dieses Löschen verlangt nur UPDATE MATERIAL GLOBAL.
        val hasUsers = !MaterialProviderRepo.hasUsers(id).orDie()
        !KIO.failOn(hasUsers) { MaterialError.ProviderHasUsers }

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

        // Name (Mein Event) und Kategorie (BOAT erreicht die Anzeigen, OTHER nicht).
        bumpAll(!MaterialOfferRepo.eventIdsForType(id).orDie())
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

        // Nummer und Bezeichnung eines zugeteilten Stücks stehen auf den Anzeigen.
        bumpAll(!MaterialAssignmentRepo.eventIdsForItem(itemId).orDie())
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
        // Sonst schlägt erst der Fremdschlüssel zu - als 500 statt als 404.
        !MaterialProviderRepo.get(providerId).orDie().onNullFail { MaterialError.ProviderNotFound }

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

        // Die Art eines Angebots mit Anfragen kann wechseln - Mein Event zeigt sie, die
        // Anzeigen filtern nach ihrer Kategorie.
        EventChangeMarker.bump(eventId)
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
        val newOrReactivated = offers.filter {
            val previousStatus = existingByOffer[it.id]?.status
            previousStatus == null ||
                previousStatus == MaterialRequestStatus.WITHDRAWN.name ||
                previousStatus == MaterialRequestStatus.DECLINED.name
        }
        !newOrReactivated.traverse { offer ->
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

        // requests_closed sperrt nach Spec Abschnitt 4/7 nicht nur neue Anfragen, sondern auch
        // den Rückzug bestehender - sonst storniert ein Verein nach dem Stichtag eine bereits
        // bestätigte Buchung, gegen die der Anbieter nach eigener Planung keine Handhabe mehr hat.
        !toWithdraw.traverse { request ->
            KIO.comprehension {
                val offer = !MaterialOfferRepo.get(request.materialOffer).orDie()
                    .onNullFail { MaterialError.OfferNotFound }
                val invitation = !EventHasMaterialProviderRepo.get(eventId, offer.materialProvider).orDie()
                !KIO.failOn(invitation?.requestsClosed == true) { MaterialError.RequestsClosed }
                KIO.unit
            }
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

        // Mein Event zeigt die Anfragen; ein Rückzug einer bestätigten Anfrage nimmt zudem das
        // Boot von allen Anzeigen. Ein unveränderter Aufruf bumpt nicht.
        if (newOrReactivated.isNotEmpty() || toWithdraw.isNotEmpty()) {
            EventChangeMarker.bump(eventId)
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
     * Die Mail geht an die Kontaktadresse des Anbieters. Der Anbieter selbst hat kein Sprachfeld;
     * gehört die Adresse aber zu einem Konto, gilt dessen Sprache (`app_user.language`, wie bei
     * allen anderen Mails), sonst Deutsch als Vorgabe ([EmailLanguage.fromStored]).
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

                val recipientAccount = !AppUserRepo.getByEmail(email).orDie()
                val content = !EmailService.getTemplate(
                    EmailTemplateKey.MATERIAL_REQUEST_WITHDRAWN,
                    EmailLanguage.fromStored(recipientAccount?.language),
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

    // -------------------------------------------------------------------
    // Übersicht, Entscheidung, Zuteilung
    // -------------------------------------------------------------------

    /**
     * Alles für ein Dashboard-Laden (Spec Abschnitt 9): Angebote, Flotte, Anfragen und die Läufe
     * dazu. Der Anbieter muss zur Veranstaltung eingeladen sein - sonst gäbe es auch keine
     * `requests_closed`, die die Oberfläche braucht.
     */
    fun getOverview(
        eventId: UUID,
        providerId: UUID,
    ): App<MaterialError, ApiResponse.Dto<MaterialOverviewDto>> = KIO.comprehension {
        val invitation = !EventHasMaterialProviderRepo.get(eventId, providerId).orDie().onNullFail { MaterialError.NotInvited }
        val offers = !MaterialOfferRepo.listForEventAndProvider(eventId, providerId).orDie()
        val items = !MaterialOverviewRepo.itemsForProvider(providerId).orDie()
        val requests = !MaterialOverviewRepo.requestsForEventAndProvider(eventId, providerId).orDie()
        val matches = !MaterialOverviewRepo.matchesForEventAndProvider(eventId, providerId).orDie()

        KIO.ok(
            ApiResponse.Dto(
                MaterialOverviewDto(
                    requestsClosed = invitation.requestsClosed!!,
                    offers = offers,
                    items = items,
                    requests = requests,
                    matches = matches,
                )
            )
        )
    }

    /**
     * Lädt die Anfrage, sofern sie zu einem Angebot dieses Anbieters an dieser Veranstaltung
     * gehört. Eine zurückgezogene Anfrage gilt als nicht gefunden - WITHDRAWN ist ein Endzustand,
     * den weder Entscheidung noch Zuteilung mehr ändern dürfen.
     */
    private fun requestOfProvider(
        eventId: UUID,
        providerId: UUID,
        requestId: UUID,
    ): App<MaterialError, MaterialRequestRecord> = KIO.comprehension {
        val request = !MaterialRequestRepo.get(requestId).orDie().onNullFail { MaterialError.RequestNotFound }
        val offer = !MaterialOfferRepo.get(request.materialOffer).orDie().onNullFail { MaterialError.RequestNotFound }
        !KIO.ok(offer.event == eventId && offer.materialProvider == providerId).onFalseFail { MaterialError.RequestNotFound }
        !KIO.failOn(request.status == MaterialRequestStatus.WITHDRAWN.name) { MaterialError.RequestNotFound }
        KIO.ok(request)
    }

    /** Bestätigen, Warteliste oder Ablehnen mit Notiz (Spec Abschnitt 9). */
    fun decideRequest(
        eventId: UUID,
        providerId: UUID,
        requestId: UUID,
        request: MaterialDecisionRequest,
        userId: UUID,
    ): App<MaterialError, ApiResponse.NoData> = KIO.comprehension {
        !requestOfProvider(eventId, providerId, requestId)

        val now = LocalDateTime.now()
        !MaterialRequestRepo.update(requestId) {
            status = request.status.name
            decisionNote = request.decisionNote
            decidedAt = now
            updatedAt = now
            updatedBy = userId
        }.orDie().onNullFail { MaterialError.RequestNotFound }

        // Mein Event zeigt den Status; die Rücknahme einer Bestätigung nimmt das Boot von allen
        // Anzeigen, eine Bestätigung mit bestehender Zuteilung bringt es zurück.
        EventChangeMarker.bump(eventId)
        noData
    }

    /**
     * Ersetzt die Zuteilungen einer Anfrage vollständig (Spec Abschnitt 9). Harte Prüfungen vor
     * jeder Schreibaktion, damit eine ungültige Zeile die anderen nicht halb anwendet: die Anfrage
     * muss bestätigt sein, jedes Stück muss dem Anbieter gehören und die Art des Angebots tragen,
     * ein genannter Lauf muss die Meldung wirklich enthalten.
     */
    fun setAssignments(
        eventId: UUID,
        providerId: UUID,
        requestId: UUID,
        request: MaterialAssignmentsRequest,
        userId: UUID,
    ): App<MaterialError, ApiResponse.NoData> = KIO.comprehension {
        val materialRequest = !requestOfProvider(eventId, providerId, requestId)
        !KIO.failOn(materialRequest.status != MaterialRequestStatus.CONFIRMED.name) { MaterialError.RequestNotConfirmed }

        val offer = !MaterialOfferRepo.get(materialRequest.materialOffer).orDie().onNullFail { MaterialError.RequestNotFound }

        !request.assignments.traverse { entry ->
            KIO.comprehension {
                val item = !MaterialItemRepo.get(entry.materialItem).orDie().onNullFail { MaterialError.ItemNotOfProvider }
                !KIO.failOn(item.materialProvider != providerId) { MaterialError.ItemNotOfProvider }
                !KIO.failOn(item.materialType != offer.materialType) { MaterialError.WrongItemType }

                if (entry.competitionMatch != null) {
                    val inMatch =
                        !MaterialAssignmentRepo.matchContainsRegistration(entry.competitionMatch, materialRequest.competitionRegistration)
                            .orDie()
                    !KIO.failOn(!inMatch) { MaterialError.MatchNotOfRegistration }
                }

                KIO.unit
            }
        }

        !MaterialAssignmentRepo.deleteForRequest(requestId).orDie()

        if (request.assignments.isNotEmpty()) {
            val now = LocalDateTime.now()
            !MaterialAssignmentRepo.create(
                request.assignments.map { entry ->
                    MaterialAssignmentRecord(
                        id = UUID.randomUUID(),
                        materialRequest = requestId,
                        materialItem = entry.materialItem,
                        competitionMatch = entry.competitionMatch,
                        createdAt = now,
                        createdBy = userId,
                        updatedAt = now,
                        updatedBy = userId,
                    )
                }
            ).orDie()
        }

        // Grundzuteilung, Ausnahme je Lauf und Ersatzwahl nach einem Schaden - das wirksame Boot.
        EventChangeMarker.bump(eventId)
        noData
    }

    /**
     * Bootsnummern je Meldung mit bestätigtem Mietboot - Grundlage für [TeamNumberAlignment] bei
     * der Fixierung (Task 4.2, Spec Abschnitt 8).
     */
    fun boatNumbersForRegistrations(eventId: UUID): App<Nothing, Map<UUID, List<Int>>> =
        MaterialRequestRepo.boatNumbersForRegistrations(eventId).orDie()

    // -------------------------------------------------------------------
    // Schadensakte
    // -------------------------------------------------------------------

    /** Lädt die Schadensakte, sofern das betroffene Stück diesem Anbieter gehört. */
    private fun damageOfProvider(
        providerId: UUID,
        damageId: UUID,
    ): App<MaterialError, MaterialDamageViewRecord> =
        KIO.comprehension {
            val view = !MaterialDamageRepo.getView(damageId).orDie().onNullFail { MaterialError.DamageNotFound }
            !KIO.ok(view.materialProvider == providerId).onFalseFail { MaterialError.DamageNotFound }
            KIO.ok(view)
        }

    /** Lädt ein Foto, sofern dessen Schadensakte diesem Anbieter gehört. */
    private fun photoOfProvider(
        providerId: UUID,
        photoId: UUID,
    ): App<MaterialError, MaterialDamagePhotoRecord> = KIO.comprehension {
        val photo = !MaterialDamagePhotoRepo.get(photoId).orDie().onNullFail { MaterialError.PhotoNotFound }
        val damage = !MaterialDamageRepo.getView(photo.materialDamage).orDie().onNullFail { MaterialError.PhotoNotFound }
        !KIO.ok(damage.materialProvider == providerId).onFalseFail { MaterialError.PhotoNotFound }
        KIO.ok(photo)
    }

    /** Ausfallende darf nicht vor Ausfallbeginn liegen (Spec Abschnitt 10). */
    private fun checkOutageWindow(from: LocalDateTime?, until: LocalDateTime?): App<MaterialError, Unit> =
        KIO.failOn(from != null && until != null && until.isBefore(from)) { MaterialError.InvalidOutageWindow }

    /**
     * `REPAIRED` mit offenem oder noch später liegendem Ausfallende schließt das Fenster mit dem
     * Reparaturdatum (Spec Abschnitt 10) - ein bereits früher gesetztes Ende bleibt unangetastet.
     */
    private fun effectiveOutOfServiceUntil(
        status: MaterialDamageStatus,
        until: LocalDateTime?,
        repairedAt: LocalDateTime?,
    ): LocalDateTime? =
        if (status == MaterialDamageStatus.REPAIRED && repairedAt != null && (until == null || until.isAfter(repairedAt))) {
            repairedAt
        } else {
            until
        }

    /**
     * Löst `causedByRegistration` zum Verursacher-Schnappschuss auf (Ruling Task 5.1): Team,
     * Verein und Wettkampf kommen direkt aus der Meldung, nicht aus einem Fremdschlüssel - die
     * Akte ist historisch und soll den Verursacher behalten, auch wenn die Meldung später
     * verschwindet oder neu angelegt wird. Die Meldung muss zu einer Veranstaltung gehören, zu der
     * dieser Anbieter eingeladen ist - sonst wie eine unbekannte Meldung behandelt.
     */
    private fun resolveCausedBy(
        providerId: UUID,
        registrationId: UUID?,
    ): App<MaterialError, Triple<String?, String, String>?> = KIO.comprehension {
        if (registrationId == null) {
            KIO.ok(null)
        } else {
            val ref = !MaterialDamageRepo.causedByRef(registrationId).orDie().onNullFail { MaterialError.RegistrationNotFound }
            val invited = !EventHasMaterialProviderRepo.exists(ref.event, providerId).orDie()
            !KIO.failOn(!invited) { MaterialError.RegistrationNotFound }
            KIO.ok(Triple(ref.team, ref.club, ref.competition))
        }
    }

    fun addDamage(
        providerId: UUID,
        request: MaterialDamageRequest,
        userId: UUID,
    ): App<MaterialError, ApiResponse.Created> = KIO.comprehension {
        val item = !MaterialItemRepo.get(request.materialItem).orDie().onNullFail { MaterialError.ItemNotFound }
        !KIO.ok(item.materialProvider == providerId).onFalseFail { MaterialError.ItemNotFound }

        val effectiveUntil = effectiveOutOfServiceUntil(request.status, request.outOfServiceUntil, request.repairedAt)
        !checkOutageWindow(request.outOfServiceFrom, effectiveUntil)

        val causedBy = !resolveCausedBy(providerId, request.causedByRegistration)

        val now = LocalDateTime.now()
        MaterialDamageRepo.create(
            MaterialDamageRecord(
                id = UUID.randomUUID(),
                materialItem = request.materialItem,
                reportedAt = request.reportedAt,
                reportedBy = userId,
                description = request.description,
                severity = request.severity.name,
                status = request.status.name,
                causedByRegistration = request.causedByRegistration,
                causedByTeam = causedBy?.first,
                causedByClub = causedBy?.second,
                causedByCompetition = causedBy?.third,
                outOfServiceFrom = request.outOfServiceFrom,
                outOfServiceUntil = effectiveUntil,
                repairedAt = request.repairedAt,
                createdAt = now,
                createdBy = userId,
                updatedAt = now,
                updatedBy = userId,
            )
        ).orDie().createdResponse()
    }

    fun pageDamages(
        providerId: UUID,
        params: PaginationParameters<MaterialDamageSort>,
        eventId: UUID? = null,
        itemId: UUID? = null,
    ): App<Nothing, ApiResponse.Page<MaterialDamageDto, MaterialDamageSort>> = KIO.comprehension {
        val page = !MaterialDamageRepo.page(providerId, params, eventId, itemId).orDie()
        val photos = !MaterialDamagePhotoRepo.listForDamages(page.data.mapNotNull { it.id }).orDie()

        KIO.ok(
            ApiResponse.Page(
                data = page.data.map { it.toDto(photos[it.id] ?: emptyList()) },
                pagination = page.pagination,
            )
        )
    }

    fun getDamage(
        providerId: UUID,
        damageId: UUID,
    ): App<MaterialError, ApiResponse.Dto<MaterialDamageDto>> = KIO.comprehension {
        val view = !damageOfProvider(providerId, damageId)
        val photos = !MaterialDamagePhotoRepo.listForDamage(damageId).orDie()
        KIO.ok(ApiResponse.Dto(view.toDto(photos)))
    }

    fun updateDamage(
        providerId: UUID,
        damageId: UUID,
        request: MaterialDamageRequest,
        userId: UUID,
    ): App<MaterialError, ApiResponse.NoData> = KIO.comprehension {
        !damageOfProvider(providerId, damageId)

        val item = !MaterialItemRepo.get(request.materialItem).orDie().onNullFail { MaterialError.ItemNotFound }
        !KIO.ok(item.materialProvider == providerId).onFalseFail { MaterialError.ItemNotFound }

        val effectiveUntil = effectiveOutOfServiceUntil(request.status, request.outOfServiceUntil, request.repairedAt)
        !checkOutageWindow(request.outOfServiceFrom, effectiveUntil)

        val causedBy = !resolveCausedBy(providerId, request.causedByRegistration)

        !MaterialDamageRepo.update(damageId) {
            materialItem = request.materialItem
            reportedAt = request.reportedAt
            description = request.description
            severity = request.severity.name
            status = request.status.name
            causedByRegistration = request.causedByRegistration
            causedByTeam = causedBy?.first
            causedByClub = causedBy?.second
            causedByCompetition = causedBy?.third
            outOfServiceFrom = request.outOfServiceFrom
            outOfServiceUntil = effectiveUntil
            repairedAt = request.repairedAt
            updatedAt = LocalDateTime.now()
            updatedBy = userId
        }.orDie().onNullFail { MaterialError.DamageNotFound }
        noData
    }

    /**
     * Jede Datei einzeln gegen [MATERIAL_PHOTO_MAX_BYTES] und auf ein erlaubtes Bildformat
     * ([MaterialPhotoType], an den Bytes erkannt) geprüft, bevor überhaupt geschrieben wird. Die
     * Fotos liegen als Bytes in `material_damage_photo_data` und gehen nur über [getPhoto] wieder
     * hinaus - mit derselben OWN-Prüfung wie die Schadensakte und als Anhang, nie eingebettet.
     */
    fun addPhotos(
        providerId: UUID,
        damageId: UUID,
        uploads: List<File>,
    ): App<MaterialError, ApiResponse.NoData> = KIO.comprehension {
        !damageOfProvider(providerId, damageId)

        !uploads.traverse { upload -> KIO.failOn(upload.bytes.size.toLong() > MATERIAL_PHOTO_MAX_BYTES) { MaterialError.PhotoTooLarge } }
        val typed = !uploads.traverse { upload ->
            KIO.failOnNull(MaterialPhotoType.detect(upload.bytes)) { MaterialError.PhotoInvalidType }.map { upload to it }
        }

        val now = LocalDateTime.now()
        !typed.traverse { (upload, contentType) ->
            KIO.comprehension {
                val id = UUID.randomUUID()
                !MaterialDamagePhotoRepo.create(
                    MaterialDamagePhotoRecord(
                        id = id,
                        materialDamage = damageId,
                        name = MaterialPhotoType.normalizedName(upload.name, contentType),
                        contentType = contentType,
                        createdAt = now,
                    )
                ).orDie()
                MaterialDamagePhotoDataRepo.create(
                    MaterialDamagePhotoDataRecord(materialDamagePhoto = id, data = upload.bytes)
                ).orDie()
            }
        }
        noData
    }

    fun getPhoto(
        providerId: UUID,
        photoId: UUID,
    ): App<MaterialError, ApiResponse.File> = KIO.comprehension {
        val photo = !photoOfProvider(providerId, photoId)
        val data = !MaterialDamagePhotoDataRepo.get(photoId).orDie().onNullFail { MaterialError.PhotoNotFound }
        KIO.ok(ApiResponse.File(name = photo.name, bytes = data.data))
    }

    fun deletePhoto(
        providerId: UUID,
        photoId: UUID,
    ): App<MaterialError, ApiResponse.NoData> = KIO.comprehension {
        !photoOfProvider(providerId, photoId)
        !MaterialDamagePhotoRepo.delete(photoId).orDie()
        noData
    }

    /** Schäden dieser Veranstaltung als CSV - dasselbe Kriterium wie [pageDamages] (Ruling Task 5.1). */
    fun damagesCsv(
        eventId: UUID,
        providerId: UUID,
    ): App<MaterialError, ApiResponse.File> = KIO.comprehension {
        !checkEventExisting(eventId)
        val invited = !EventHasMaterialProviderRepo.exists(eventId, providerId).orDie()
        !KIO.failOn(!invited) { MaterialError.NotInvited }

        val event = !EventRepo.get(eventId).orDie()
        val damages = !MaterialDamageRepo.listForCsv(providerId, eventId).orDie()

        val bytes = buildDamagesCsv(damages)
        val fileNameDate = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd_HH-mm-ss"))

        KIO.ok(ApiResponse.File(name = "${fileNameDate}-Schaeden-${event?.name ?: eventId}.csv", bytes = bytes))
    }

    private fun buildDamagesCsv(
        damages: List<MaterialDamageViewRecord>,
    ): ByteArray {
        val dateTimeFormatter = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm")
        val out = ByteArrayOutputStream()
        CSV.write(out, damages) {
            column("Stück") { itemLabel ?: "" }
            column("Nummer") { itemNumber?.toString() ?: "" }
            column("Materialart") { materialTypeName ?: "" }
            column("Gemeldet am") { reportedAt?.format(dateTimeFormatter) ?: "" }
            column("Schwere") { severity ?: "" }
            column("Status") { status ?: "" }
            column("Beschreibung") { description ?: "" }
            column("Verursacher Team") { causedByTeam ?: "" }
            column("Verein") { causedByClub ?: "" }
            column("Wettkampf") { causedByCompetition ?: "" }
            column("Ausfall von") { outOfServiceFrom?.format(dateTimeFormatter) ?: "" }
            column("Ausfall bis") { outOfServiceUntil?.format(dateTimeFormatter) ?: "" }
            column("Repariert am") { repairedAt?.format(dateTimeFormatter) ?: "" }
        }
        return out.toByteArray()
    }
}
