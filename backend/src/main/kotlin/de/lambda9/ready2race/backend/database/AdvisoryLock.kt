package de.lambda9.ready2race.backend.database

import de.lambda9.tailwind.jooq.JIO
import de.lambda9.tailwind.jooq.Jooq
import org.jooq.impl.DSL
import java.util.*

/**
 * Transaktionsgebundene Sperren in Postgres (`pg_advisory_xact_lock`) für Check-then-act-Wege,
 * die keine natürliche Zeile zum Sperren haben oder bei denen eine Zeilensperre fremde
 * Schreiber (Fremdschlüssel-Prüfungen, Statusupdates) mitblockieren würde.
 *
 * Die Sperre gilt über alle Backend-Instanzen hinweg (sie lebt in der Datenbank) und fällt mit
 * Commit oder Rollback der Transaktion. Außerhalb einer Transaktion (Autocommit) fiele sie sofort
 * wieder - Aufrufer müssen also innerhalb von `.transact()` laufen.
 *
 * Der Schlüssel ist ein 64-Bit-Hash aus Namensraum und Kennung; eine Hash-Kollision serialisiert
 * nur zwei fremde Vorgänge, sie verfälscht nichts. Mehrere Kennungen werden in fester (sortierter)
 * Reihenfolge gesperrt, damit sich zwei Vorgänge über dieselben Kennungen nicht verklemmen.
 */
object AdvisoryLock {

    fun lock(namespace: String, ids: Collection<UUID>): JIO<Unit> = Jooq.query {
        ids.distinct().sorted().forEach { id ->
            select(
                DSL.field(
                    "pg_advisory_xact_lock(hashtextextended({0}, 0))",
                    Any::class.java,
                    DSL.inline("$namespace:$id"),
                )
            ).fetch()
        }
    }

    fun lock(namespace: String, id: UUID): JIO<Unit> = lock(namespace, listOf(id))
}
