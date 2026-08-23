package de.lambda9.ready2race.backend.app.timingConfig.entity

/**
 * Genauigkeit der veroeffentlichten offiziellen Zeiten einer Veranstaltung (Spalte
 * `event.timing_precision`, Vorgabe [ZEHNTEL]).
 *
 * Die Einstellung wirkt NICHT auf die Rohdaten -- Zeitmarken und `timing_official_time` bleiben
 * millisekundengenau. Sie bestimmt allein, was als offizielle Zeit an den Lauf uebernommen und
 * angezeigt wird: die Uebernahme schneidet den Timecode vor dem Schreiben auf diese Stufe ab
 * (TimingPrecisionLogic), die Anzeige zeigt genau so viele Nachkommastellen.
 *
 * Als Text gespeichert und von Hand konvertiert, wie [TimingSystem]: es gibt keinen jOOQ-Converter
 * in diesem Projekt.
 */
enum class TimingPrecision {
    SEKUNDE,
    ZEHNTEL,
    HUNDERTSTEL,
    MILLISEKUNDE,
}
