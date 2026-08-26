package de.lambda9.ready2race.backend.app.timing.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.app.timing.control.TimingToneSetRepo
import de.lambda9.ready2race.backend.app.timing.control.toDto
import de.lambda9.ready2race.backend.app.timing.control.toJsonb
import de.lambda9.ready2race.backend.app.timing.control.toRecord
import de.lambda9.ready2race.backend.app.timing.entity.TimingError
import de.lambda9.ready2race.backend.app.timing.entity.TimingToneSetDto
import de.lambda9.ready2race.backend.app.timing.entity.TimingToneSetRequest
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.calls.responses.ApiResponse.Companion.noData
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingToneSetRecord
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.onNullFail
import de.lambda9.tailwind.core.extensions.kio.orDie
import java.time.LocalDateTime
import java.util.UUID

/**
 * Ton-Sätze: die benannten Klang-Vorlagen einer Veranstaltung („Laut fürs Wasser", „Leise für die
 * Halle"), von denen sich beliebig viele Zeitnahmetypen einen teilen.
 *
 * Eigene Datei statt eines Anbaus an [TimingService] (767 Zeilen) - dort geht es um Zeitmarken,
 * Zuordnungen und Rücknahmen; hier um eine schlichte Stammdatenpflege. Das Muster sind die
 * Nachbarn [TimingModeService] und [TimingDeviceTokenService], die aus demselben Grund je eine
 * eigene Datei haben.
 *
 * Die eine Regel, die diesen Dienst über eine gewöhnliche CRUD-Pflege hinaushebt: **Eine
 * Veranstaltung mit Ton-Sätzen hat immer genau einen Vorgabesatz.** Zwei verhindert der partielle
 * Unique-Index, keinen verhindern die drei Stellen hier - Anlegen (der erste Satz wird immer
 * Vorgabe), Ändern (die Markierung kann wandern, aber nicht verschwinden) und Löschen (die Vorgabe
 * geht nur als letzter Satz). Ohne Vorgabe fiele jeder erbende Typ still auf die eingebauten Töne
 * zurück, und eine Regatta klänge anders, ohne dass jemand einen Ton verstellt hätte.
 *
 * Kein Broadcast an die Boards: Die Töne erreichen die Posten über die Startliste und die
 * Einstellungen, nicht über einen eigenen Kanal.
 */
object TimingToneSetService {

    fun addToneSet(
        request: TimingToneSetRequest,
        userId: UUID,
        eventId: UUID,
    ): App<TimingError, ApiResponse.Created> = KIO.comprehension {
        val nameTaken = !TimingToneSetRepo.existsByEventAndName(eventId, request.name).orDie()
        !KIO.failOn(nameTaken) { TimingError.ToneSetNameTaken }

        // Der erste Satz einer Veranstaltung wird immer die Vorgabe, auch ungefragt: Ein Satz, den
        // niemand erbt, wäre beim Anlegen schon toter Ballast.
        val existing = !TimingToneSetRepo.countByEvent(eventId).orDie()
        val isFirst = existing == 0

        val id = !TimingToneSetRepo.create(request.toRecord(userId, eventId, isDefault = isFirst)).orDie()

        // Erst danach die Markierung verschieben. Den neuen Satz gleich mit `is_default = true`
        // einzufügen verböte der partielle Unique-Index: Für die Dauer des Einfügens stünden zwei
        // Vorgaben da. setDefault nimmt sie deshalb erst dem alten Satz ab und gibt sie dann dem
        // neuen - beides in derselben Transaktion, siehe TimingToneSetRepo.setDefault.
        if (request.isDefault && !isFirst) {
            !TimingToneSetRepo.setDefault(eventId, id, userId, LocalDateTime.now()).orDie()
        }
        KIO.ok(ApiResponse.Created(id))
    }

    fun getToneSets(
        eventId: UUID,
    ): App<ServiceError, ApiResponse.ListDto<TimingToneSetDto>> = KIO.comprehension {
        val records = !TimingToneSetRepo.getByEvent(eventId).orDie()
        // Die Vorgabe zuerst, danach alphabetisch: In der Auswahl eines Zeitnahmetyps steht damit
        // oben, was „Erbt (Standard)" bedeutet.
        KIO.ok(
            ApiResponse.ListDto(
                records
                    .sortedWith(
                        compareByDescending<TimingToneSetRecord> { it.isDefault ?: false }.thenBy { it.name }
                    )
                    .map { it.toDto() }
            )
        )
    }

    fun updateToneSet(
        request: TimingToneSetRequest,
        userId: UUID,
        toneSetId: UUID,
        eventId: UUID,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        val toneSet = !TimingToneSetRepo.get(toneSetId).orDie().onNullFail { TimingError.ToneSetNotFound }
        !KIO.failOn(toneSet.event != eventId) { TimingError.EventMismatch }

        val nameTaken = !TimingToneSetRepo.existsByEventAndName(eventId, request.name, excludingId = toneSetId).orDie()
        !KIO.failOn(nameTaken) { TimingError.ToneSetNameTaken }

        // Die Vorgabe darf wandern, aber nicht verschwinden: Wer sie diesem Satz nimmt, ohne sie
        // einem anderen zu geben, ließe die Veranstaltung ohne Vorgabe zurück. Nur wenn dieser
        // Satz der einzige ist, ist das harmlos - dann erbt ihn ohnehin niemand mehr als er selbst.
        val isDefault = toneSet.isDefault ?: false
        val existing = !TimingToneSetRepo.countByEvent(eventId).orDie()
        !KIO.failOn(isDefault && !request.isDefault && existing > 1) { TimingError.ToneSetDefaultRequired }

        // Erst die Felder, dann die Markierung: Das Aktualisieren liest den Datensatz frisch und
        // schriebe sonst den Stand von vor dem Vorgabe-Wechsel zurück.
        !TimingToneSetRepo.update(toneSetId) {
            name = request.name
            sequenceTonePlan = request.sequenceTonePlan?.toJsonb()
            splitTone = request.splitTone?.toJsonb()
            falseStartTone = request.falseStartTone?.toJsonb()
            finishTone = request.finishTone?.toJsonb()
            tonePerBoat = request.tonePerBoat
            updatedAt = LocalDateTime.now()
            updatedBy = userId
        }.orDie().onNullFail { TimingError.ToneSetNotFound }

        if (request.isDefault && !isDefault) {
            !TimingToneSetRepo.setDefault(eventId, toneSetId, userId, LocalDateTime.now()).orDie()
        }
        noData
    }

    fun deleteToneSet(
        toneSetId: UUID,
        eventId: UUID,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        val toneSet = !TimingToneSetRepo.get(toneSetId).orDie().onNullFail { TimingError.ToneSetNotFound }
        !KIO.failOn(toneSet.event != eventId) { TimingError.EventMismatch }

        // Der Vorgabesatz geht nur als letzter - siehe [TimingError.ToneSetDefaultRequired]. Jeder
        // andere Satz darf jederzeit gehen: Die Typen, die auf ihn zeigen, fallen per
        // `on delete set null` auf die Vorgabe zurück, statt unbrauchbar zu werden.
        val existing = !TimingToneSetRepo.countByEvent(eventId).orDie()
        !KIO.failOn((toneSet.isDefault ?: false) && existing > 1) { TimingError.ToneSetDefaultRequired }

        !TimingToneSetRepo.delete(toneSetId).orDie()
        noData
    }
}
