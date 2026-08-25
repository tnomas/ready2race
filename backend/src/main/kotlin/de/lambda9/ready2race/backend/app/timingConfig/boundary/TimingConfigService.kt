package de.lambda9.ready2race.backend.app.timingConfig.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.app.event.control.EventRepo
import de.lambda9.ready2race.backend.app.event.entity.EventError
import de.lambda9.ready2race.backend.app.timing.boundary.TimingOfficialTimeService
import de.lambda9.ready2race.backend.app.timing.control.toCaptureTone
import de.lambda9.ready2race.backend.app.timing.control.toJsonb
import de.lambda9.ready2race.backend.app.timing.control.toToneSequence
import de.lambda9.ready2race.backend.app.timingConfig.entity.EventTimingConfigDto
import de.lambda9.ready2race.backend.app.timingConfig.entity.EventTimingConfigRequest
import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingPrecision
import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingSystem
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.calls.responses.ApiResponse.Companion.noData
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.onNullFail
import de.lambda9.tailwind.core.extensions.kio.orDie
import java.time.LocalDateTime
import java.util.UUID

object TimingConfigService {

    fun getEventTimingConfig(
        eventId: UUID,
    ): App<ServiceError, ApiResponse.Dto<EventTimingConfigDto>> = KIO.comprehension {

        val event = !EventRepo.get(eventId).orDie()
            .onNullFail { EventError.NotFound }

        KIO.ok(
            ApiResponse.Dto(
                EventTimingConfigDto(
                    timingSystem = event.timingSystem?.let { TimingSystem.valueOf(it) },
                    startlistConfig = event.startlistConfig,
                    resultImportConfig = event.resultImportConfig,
                    // Spalten sind in der Datenbank NOT NULL (Migration V202608071600); jOOQ generiert
                    // Record-Felder dennoch nullable - dasselbe Muster wie bei den übrigen
                    // Nicht-Null-Spalten des Events (siehe Conversions.kt).
                    autoPull = event.raceclockerAutoPull!!,
                    intervalActiveSeconds = event.raceclockerIntervalActiveSeconds!!,
                    intervalUpcomingSeconds = event.raceclockerIntervalUpcomingSeconds!!,
                    watchBeforeMinutes = event.raceclockerWatchBeforeMinutes!!,
                    watchAfterMinutes = event.raceclockerWatchAfterMinutes!!,
                    timingPrecision = event.timingPrecision?.let { TimingPrecision.valueOf(it) }
                        ?: TimingPrecision.ZEHNTEL,
                    // Unaufgelöst (null = Standard): das Formular braucht den Unterschied für
                    // "Standard wiederherstellen" - aufgelöst liefert erst GET /timing/settings.
                    finishTone = event.timingFinishTone.toCaptureTone(),
                    splitTone = event.timingSplitTone.toCaptureTone(),
                    falseStartTone = event.timingFalseStartTone.toToneSequence(),
                )
            )
        )
    }

    fun updateEventTimingConfig(
        eventId: UUID,
        userId: UUID,
        request: EventTimingConfigRequest,
    ): App<ServiceError, ApiResponse.NoData> = KIO.comprehension {

        val event = !EventRepo.get(eventId).orDie()
            .onNullFail { EventError.NotFound }

        // VOR dem Schreiben festhalten, ob sich Genauigkeit oder Erfassungstöne ändern - danach
        // ist der alte Stand weg. Fehlender Wert = Datenbank-Vorgabe, dieselbe Rückfalllinie wie
        // beim Lesen.
        val precisionBefore = event.timingPrecision?.let { TimingPrecision.valueOf(it) }
            ?: TimingPrecision.ZEHNTEL
        val tonesChanged = event.timingFinishTone.toCaptureTone() != request.finishTone ||
            event.timingSplitTone.toCaptureTone() != request.splitTone ||
            event.timingFalseStartTone.toToneSequence() != request.falseStartTone

        !EventRepo.update(event) {
            timingSystem = request.timingSystem?.name
            startlistConfig = request.startlistConfig
            resultImportConfig = request.resultImportConfig
            raceclockerAutoPull = request.autoPull
            raceclockerIntervalActiveSeconds = request.intervalActiveSeconds
            raceclockerIntervalUpcomingSeconds = request.intervalUpcomingSeconds
            raceclockerWatchBeforeMinutes = request.watchBeforeMinutes
            raceclockerWatchAfterMinutes = request.watchAfterMinutes
            timingPrecision = request.timingPrecision.name
            timingFinishTone = request.finishTone?.toJsonb()
            timingSplitTone = request.splitTone?.toJsonb()
            timingFalseStartTone = request.falseStartTone?.toJsonb()
            updatedBy = userId
            updatedAt = LocalDateTime.now()
        }.orDie()

        // Eine geänderte Genauigkeit rechnet alle eigenen Ergebnisse sofort auf die neue Stufe um
        // - der Fingerabdruck trägt den abgeschnittenen Wert, deshalb erkennt die Übernahme ihre
        // Zeilen wieder und missdeutet sie nicht als fremd. Zusätzlich erfahren alle verbundenen
        // Leitstände und Boards den neuen Stand live (settingsChanged), damit die Anzeige ohne
        // Neuladen folgt. Geänderte Erfassungstöne brauchen nur den Broadcast - die Boards
        // spielen ab der nächsten Erfassung den neuen Ton, gerechnet wird dafür nichts.
        if (request.timingPrecision != precisionBefore) {
            !TimingOfficialTimeService.recomputeApplyEvent(eventId, userId)
            !TimingOfficialTimeService.broadcastSettingsAsync(eventId)
        } else if (tonesChanged) {
            !TimingOfficialTimeService.broadcastSettingsAsync(eventId)
        }

        noData
    }
}
