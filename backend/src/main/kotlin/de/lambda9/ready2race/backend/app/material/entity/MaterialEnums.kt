package de.lambda9.ready2race.backend.app.material.entity

/**
 * Materialart: Boot oder sonstiges Zubehör (Riemen, Skulls, Steuermann-Ausrüstung, ...).
 * Steuert unter anderem, ob eine Stück-Nummer wie eine Bootsnummer/Startnummer gelesen wird.
 */
enum class MaterialCategory { BOAT, OTHER }

/** Aktiv im Bestand oder ausgemustert - ausgemusterte Stücke werden nicht mehr zugeteilt. */
enum class MaterialItemStatus { ACTIVE, RETIRED }

/** Stand einer Materialanfrage je Meldung und Angebot. */
enum class MaterialRequestStatus { REQUESTED, CONFIRMED, WAITLISTED, DECLINED, WITHDRAWN }

/** Schwere eines Schadens; OUTAGE_ONLY meint ein reines Ausfallfenster ohne bleibenden Schaden. */
enum class MaterialDamageSeverity { MINOR, MAJOR, TOTAL, OUTAGE_ONLY }

/** Stand einer Schadensakte. */
enum class MaterialDamageStatus { REPORTED, REPAIRED }

/** Ampel für die Auslastung eines Angebots. */
enum class MaterialCapacityLevel { GREEN, YELLOW }
