package de.lambda9.ready2race.backend.app.timing.entity

/**
 * Wie ein Posten auf einen Druck reagiert.
 *
 * [ONETOUCH] erfasst sofort - richtig an der Ziellinie, wo jeder Druck gewollt ist. [ARMED]
 * verlangt, dass der Posten sich vorher scharf schaltet: unterwegs auf der Strecke liegt das
 * Gerät zwischen zwei Booten minutenlang herum, und ein Ärmel über der Tastatur hängt sonst eine
 * Zeit an ein Boot, die niemand genommen hat.
 *
 * Die Art gehört der Regattaleitung (Veranstaltungs-Einstellungen), der Zustand `armed` dem
 * Zeitnehmer am Tag - deshalb zwei Spalten und nicht ein gemeinsamer Zustand.
 */
enum class TimingCaptureMode { ONETOUCH, ARMED }
