package de.lambda9.ready2race.backend.app.timingConfig.entity

import de.lambda9.ready2race.backend.app.timing.entity.StartDisplaySettings
import java.util.UUID

/**
 * Die Zeitnahme-Einstellungen einer Veranstaltung: System, Startlisten-Export und
 * Rennergebnisse-Import gelten für ALLE ihre Wettkämpfe. Eine Abweichung je Wettkampf gibt es
 * nicht mehr — zwei Zeitnahme-Softwares in einer Regatta kommen nicht vor, und alle Wettkämpfe
 * exportieren und importieren dieselben Spalten (die Wettkampf-Spalten sind mit V202608242110
 * gefallen).
 *
 * Welches Profil eine einzelne Partie stoppt — bei RaceClocker das Rennen, bei interner Zeitnahme
 * der Zeitnahmetyp — steht dagegen nicht hier, sondern im Zeitnahmeprofil-Baum
 * (`TimingProfileService`), der über vier Ebenen vererbt.
 *
 * Die Töne stehen ebenfalls nicht mehr hier: Zwischen-, Fehlstart- und Zielton lagen bis zum
 * 26.08.2026 als drei Spalten an der Veranstaltung und galten stur für alle Läufe. Sie gehören zum
 * Zeitnahmetyp — ein Zeitfahren muss nicht klingen wie ein Massenstart — und liegen seither in den
 * Ton-Sätzen (`TimingToneSetService`); die drei Spalten sind mit V202608261210 gefallen.
 */
data class EventTimingConfigDto(
    val timingSystem: TimingSystem?,
    val startlistConfig: UUID?,
    val resultImportConfig: UUID?,
    val autoPull: Boolean,
    val intervalActiveSeconds: Int,
    val intervalUpcomingSeconds: Int,
    val watchBeforeMinutes: Int,
    val watchAfterMinutes: Int,
    /**
     * Genauigkeit der veroeffentlichten offiziellen Zeiten der internen Zeitnahme (sichtbar bei
     * System INTERN). Nie null: die Spalte hat eine Vorgabe (ZEHNTEL, Migration V202608211450).
     */
    val timingPrecision: TimingPrecision,
    /**
     * Ob das Erfassungs-Board am START-Posten den manuellen Stempel zeigt. Nie null: die Spalte
     * hat eine Vorgabe (`false`, Migration V202608242000) - der Stempel ist standardmäßig
     * verborgen, weil er sonst als zweite grüne „Start"-Fläche direkt unter dem Sequenz-Knopf
     * stünde.
     */
    val showManualCapture: Boolean,
    /**
     * Anzeige-Block des Startbildschirms (was gezeigt wird, wie groß, wie viele folgende Boote).
     * Unaufgelöst: null heißt „eingebaute Vorgaben" ([TimingStartDisplayLimits.DEFAULT]) - das
     * Formular braucht den Unterschied für „Standard wiederherstellen"; aufgelöst liefert erst
     * GET /timing/settings.
     */
    val startDisplay: StartDisplaySettings?,
)
