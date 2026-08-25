import {TimingCaptureMode, TimingStationDto, TimingStationType} from '@api/types.gen.ts'

/**
 * Darf dieser Posten gerade mit Zuordnung erfassen?
 *
 * Eine Zeile, aber sie wird an vier Stellen gebraucht (Boots-Knöpfe, Boots-Tasten, Leertaste,
 * Warnbalken). Viermal dieselbe Bedingung von Hand ist die Art Fehler, bei der später genau eine
 * davon vergessen wird — und ein Schlupfloch in einer Sicherung ist schlimmer als keine Sicherung.
 *
 * Gilt NICHT für den großen Erfassungsknopf: Der bankt eine Zeit ohne Zuordnung und ist die
 * Notlösung für den vergessenen Scharfschalter. Er wird nie gesperrt.
 */
export const captureAllowed = (mode: TimingCaptureMode, armed: boolean): boolean =>
    mode === 'ONETOUCH' || armed

/**
 * Greift die Scharfschaltung an diesem Posten überhaupt?
 *
 * Zwei Typen sind ausgenommen, und beide aus demselben Grund: Dort gibt es keine Erfassung MIT
 * Zuordnung, die die Sperre verhindern könnte.
 *
 * - **START**: Der Startposten trägt weder Boots-Raster noch Boots-Tasten. Gesperrt bliebe genau
 *   ein Weg, die Leertaste, und die ist dort der Kurzweg zum manuellen Stempel. Er verlöre einen
 *   Bedienweg und gewänne keinen Schutz. Die Startsequenz gehört laut Entwurf ohnehin nicht dazu.
 * - **ANZEIGE**: Erfasst nie — ein Anzeige-Bildschirm hat gar keine Auslösefläche.
 *
 * Dieselbe Bedingung braucht der Postenbildschirm (Schalter, Warnbalken, Sperren) und der
 * Leitstand (Abzeichen). Zweimal von Hand ist die Art Fehler, bei der die beiden Seiten
 * auseinanderlaufen und der Leitstand eine Sperre meldet, die es gar nicht gibt.
 */
export const armedGateApplies = (type: TimingStationType, mode: TimingCaptureMode): boolean =>
    mode === 'ARMED' && type !== 'START' && type !== 'ANZEIGE'

/** Was das Abzeichen eines Postens im Leitstand sagt. */
export type StationArmedBadge = 'ARMED' | 'DISARMED' | 'ONETOUCH'

/**
 * Das Abzeichen dieses Postens — `null` heißt: kein Abzeichen.
 *
 * Der Leitstand beantwortet damit genau eine Frage: **Kann dieser Posten gerade erfassen?** Nicht,
 * wie er konfiguriert ist. Deshalb steht `ONETOUCH` auch an einem Posten, dessen Betriebsart
 * `ARMED` ist, an dem die Sperre aber gar nicht greift (siehe [armedGateApplies]) — die Antwort
 * lautet dort schlicht „ja, immer". Ein „entschärft" wäre an so einem Posten ein blinder Alarm,
 * und die Regattaleitung riefe wegen einer Sperre an, die niemanden aufhält.
 *
 * Ein ANZEIGE-Posten bekommt gar kein Abzeichen: Er erfasst nie, und „Onetouch" wäre dort eine
 * Aussage über eine Erfassung, die es nicht gibt.
 */
export const stationArmedBadge = (station: TimingStationDto): StationArmedBadge | null => {
    if (station.type === 'ANZEIGE') return null
    if (!armedGateApplies(station.type, station.captureMode)) return 'ONETOUCH'
    return station.armed ? 'ARMED' : 'DISARMED'
}
