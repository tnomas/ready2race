package de.lambda9.ready2race.backend.app.timingConfig.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.app.event.control.EventRepo
import de.lambda9.ready2race.backend.app.event.entity.EventError
import de.lambda9.ready2race.backend.app.timing.boundary.TimingOfficialTimeService
import de.lambda9.ready2race.backend.app.timing.control.toJsonb
import de.lambda9.ready2race.backend.app.timing.control.toStartDisplaySettings
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
                    // NOT NULL mit Vorgabe (V202608242000), jOOQ typisiert dennoch nullable -
                    // dasselbe Muster wie bei den Abruf-Takten weiter oben.
                    showManualCapture = event.timingShowManualCapture!!,
                    startDisplay = event.timingStartDisplay.toStartDisplaySettings(),
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

        // VOR dem Schreiben festhalten, ob sich die Genauigkeit ändert - danach ist der alte Stand
        // weg. Fehlender Wert = Datenbank-Vorgabe, dieselbe Rückfalllinie wie beim Lesen.
        val precisionBefore = event.timingPrecision?.let { TimingPrecision.valueOf(it) }
            ?: TimingPrecision.ZEHNTEL
        // Die beiden Anzeige-Entscheidungen (Stempel am START-Board, Startbildschirm): gerechnet
        // wird nichts, aber jedes verbundene Board muss den neuen Stand sofort sehen - ein
        // Bildschirm am Steg soll einer Umstellung folgen, ohne dass jemand hinläuft und neu lädt.
        val displayChanged = event.timingShowManualCapture != request.showManualCapture ||
            event.timingStartDisplay.toStartDisplaySettings() != request.startDisplay

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
            timingShowManualCapture = request.showManualCapture
            timingStartDisplay = request.startDisplay?.toJsonb()
            updatedBy = userId
            updatedAt = LocalDateTime.now()
        }.orDie()

        // Eine geänderte Genauigkeit rechnet alle eigenen Ergebnisse sofort auf die neue Stufe um
        // - der Fingerabdruck trägt den abgeschnittenen Wert, deshalb erkennt die Übernahme ihre
        // Zeilen wieder und missdeutet sie nicht als fremd. Zusätzlich erfahren alle verbundenen
        // Leitstände und Boards den neuen Stand live (settingsChanged), damit die Anzeige ohne
        // Neuladen folgt. Geänderte Anzeige-Einstellungen brauchen nur den Broadcast - die Boards
        // zeichnen den Startbildschirm neu, gerechnet wird dafür nichts.
        if (request.timingPrecision != precisionBefore) {
            !TimingOfficialTimeService.recomputeApplyEvent(eventId, userId)
            !TimingOfficialTimeService.broadcastSettingsAsync(eventId)
        } else if (displayChanged) {
            !TimingOfficialTimeService.broadcastSettingsAsync(eventId)
        }

        noData
    }
}
