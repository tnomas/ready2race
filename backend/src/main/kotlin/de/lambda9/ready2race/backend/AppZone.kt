package de.lambda9.ready2race.backend

import java.time.ZoneId
import java.util.TimeZone

/**
 * Die eine Zeitzone der App - die Wanduhr, in der Veranstaltungen geplant und Zeiten angezeigt
 * werden (`timestamp` ohne Zone in der Datenbank, Zeitplan-Slots, Ist-Starts, Ablaufzeiten).
 *
 * Bis Ende 2026 war sie nirgends gesetzt: jedes `LocalDateTime.now()`, jede Umrechnung über
 * `ZoneId.systemDefault()` und die Sitzungszeitzone, die der Postgres-Treiber beim Verbinden aus
 * der JVM übernimmt, folgten der Zone des Hosts. Auf einem Rechner in Berlin passte das; in einem
 * Container ohne `TZ` (UTC) liefen Ist-Starts, Countdown-Anker, Ablaufzeiten und Board-Zeiten um
 * ein bis zwei Stunden neben den Zeitplan-Slots.
 *
 * [install] setzt deshalb beim Start die JVM-Vorgabe, bevor Verbindungen aufgebaut werden. Damit
 * gelten alle bestehenden impliziten Stellen weiter, aber mit einer festen Zone statt der des
 * Hosts. Auf einem Host in Europe/Berlin ändert sich nichts.
 */
object AppZone {

    /** Vorgabe, wenn `APP_TIMEZONE` nicht gesetzt ist. */
    const val DEFAULT_ID = "Europe/Berlin"

    @Volatile
    var zone: ZoneId = ZoneId.of(DEFAULT_ID)
        private set

    /**
     * Setzt die Zone der App als JVM-Vorgabe. Muss vor dem Aufbau des Verbindungspools laufen:
     * der Postgres-Treiber gibt die JVM-Zone als Sitzungszeitzone weiter (`localtimestamp` &
     * Co. in SQL).
     */
    fun install(zoneId: ZoneId?): ZoneId {
        val effective = zoneId ?: ZoneId.of(DEFAULT_ID)
        TimeZone.setDefault(TimeZone.getTimeZone(effective))
        zone = effective
        return effective
    }
}
