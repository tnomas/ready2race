package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.database.generated.tables.records.TimingStartSequenceEntryRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingStartSequenceRecord
import java.util.UUID

/**
 * Ein Eintrag einer AKTIVEN Startsequenz (scharf, laufend, pausiert) samt seiner Sequenz und der
 * Partie, zu der sein Boot gehört - die Zeile, die
 * [de.lambda9.ready2race.backend.app.timing.control.TimingSequenceEntryRepo.getActiveEntriesByEvent]
 * liefert.
 *
 * Die Sequenz reist als ganzer Datensatz mit, nicht als Auszug: der geplante Startzeitpunkt eines
 * Eintrags ist eine Rechnung über Modus, Vorlauf, Intervall und Pausenverschiebung
 * (`plannedStartMillis` in Conversions.kt), und die soll an genau einer Stelle stehen.
 */
data class ActiveSequenceEntry(
    val sequence: TimingStartSequenceRecord,
    val entry: TimingStartSequenceEntryRecord,
    /** `competition_match_team.competition_match` - zeigt auf den SETUP-Lauf (siehe TimingMatchRepo). */
    val setupMatchId: UUID,
)
