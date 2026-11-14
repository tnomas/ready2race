package de.lambda9.ready2race.backend

import de.lambda9.ready2race.backend.app.timing.boundary.TimingMatchStampLogic
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.util.TimeZone
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Die App rechnet in EINER festen Zone, nicht in der des Hosts: ein Container in UTC darf
 * Ist-Starts, Countdown-Anker und Ablaufzeiten nicht um ein bis zwei Stunden verschieben.
 */
class AppZoneTest {

    private val original: TimeZone = TimeZone.getDefault()

    @AfterTest
    fun restore() {
        TimeZone.setDefault(original)
        AppZone.install(original.toZoneId())
    }

    private val berlin = ZoneId.of("Europe/Berlin")
    // 14.08.2026 10:00 MESZ = 08:00 UTC
    private val instant = Instant.parse("2026-08-14T08:00:00Z")

    @Test
    fun withoutConfigurationTheAppRunsInBerlinEvenOnAUtcHost() {
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"))

        AppZone.install(null)

        assertEquals(berlin, ZoneId.systemDefault(), "JVM-Vorgabe folgt der App-Zone")
        assertEquals(berlin, AppZone.zone)
        assertEquals(
            LocalDateTime.of(2026, 8, 14, 10, 0),
            TimingMatchStampLogic.stampFor(instant.toEpochMilli()),
            "Ist-Start aus der Startmarke in Berliner Wanduhrzeit",
        )
    }

    @Test
    fun configuredZoneWins() {
        TimeZone.setDefault(TimeZone.getTimeZone("Europe/Berlin"))

        AppZone.install(ZoneId.of("UTC"))

        assertEquals(ZoneId.of("UTC"), ZoneId.systemDefault())
        assertEquals(LocalDateTime.of(2026, 8, 14, 8, 0), TimingMatchStampLogic.stampFor(instant.toEpochMilli()))
    }

    // Der Kern der Zusage: auf einem Host in Berlin ändert sich nichts.
    @Test
    fun onABerlinHostNothingChanges() {
        TimeZone.setDefault(TimeZone.getTimeZone("Europe/Berlin"))
        val before = TimingMatchStampLogic.stampFor(instant.toEpochMilli())

        AppZone.install(null)

        assertEquals(before, TimingMatchStampLogic.stampFor(instant.toEpochMilli()))
        assertEquals(berlin, ZoneId.systemDefault())
    }
}
