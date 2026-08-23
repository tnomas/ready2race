package de.lambda9.ready2race.backend.app.timing.entity

/**
 * Wie viele Boote je Startvorgang eines Zeitnahmetyps starten.
 *
 * [EINZEL] = jedes Boot startet für sich (Timetrial); [WELLE] = mehrere Boote gemeinsam. Der
 * Massenstart ist bewusst kein dritter Wert: er ist eine Welle, in der schlicht alle Boote des
 * Laufs stehen - ein eigener Wert würde die Auswertung zwingen, zwei Fälle gleich zu behandeln.
 *
 * Als Text gespeichert und von Hand konvertiert, wie die übrigen Enums des Timing-Moduls
 * (TimingStationType, SequenceMode): es gibt keinen jOOQ-Converter in diesem Projekt.
 */
enum class TimingStartGrouping { EINZEL, WELLE }
