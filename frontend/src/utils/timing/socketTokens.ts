/**
 * Welche Tokens der Live-Kanal der Zeitnahme anbieten darf — in der Reihenfolge, in der sie
 * probiert werden.
 *
 * Der Browser kann beim WebSocket-Handshake keine Header setzen, also reist genau EIN Token im
 * Slot des Subprotokolls (`new WebSocket(url, ['r2r', token])`). Welches, ist nicht so
 * offensichtlich, wie es klingt: In einem Browserprofil können drei Ablagen gleichzeitig gefüllt
 * sein — die Helfersitzung (`session.app`), die Verwaltungssitzung (`session.admin`) und das
 * Geräte-Token eines geteilten Posten-Links.
 *
 * Maßgeblich ist die Oberfläche, auf der die Seite gerade läuft — dieselbe Regel, nach der auch
 * die HTTP-Aufrufe ihren Token wählen (UserProvider: `pathname.startsWith('/app')`). Vorher nahm
 * der Kanal starr zuerst `session.app`, und das ging auf der Verwaltungsoberfläche regelmäßig
 * schief: Der Leitstand lief mit gültiger Verwaltungssitzung, schickte dem Server aber die längst
 * tote Helfersitzung aus demselben Profil und stand dauerhaft auf „Nicht autorisiert". Tot werden
 * konnte sie unbemerkt, weil `touchSessionToken` bei jeder erfolgreichen Antwort die Frist BEIDER
 * Ablagen vorschiebt — die Helferablage lief also nie ab, obwohl der Server ihre Sitzung längst
 * vergessen hatte.
 *
 * Deshalb eine Liste statt eines einzelnen Tokens: Der Aufrufer probiert der Reihe nach weiter,
 * wenn der Server einen Token abweist (Schließcode 1008). Die Sitzung der eigenen Oberfläche
 * zuerst, die der anderen als Rückfall, das Geräte-Token zuletzt — es ist das schwächste Recht
 * und gehört nur einem geteilten Posten-Gerät.
 */

import {browserStores, readSessionToken, TokenStores} from '@contexts/user/sessionToken.ts'
import {deviceSessionForEvent} from './deviceSession.ts'

/**
 * Die Kandidaten für einen beliebigen Kanal: beide Sitzungen in der Reihenfolge der Oberfläche,
 * dahinter das Geräte-Token, das der jeweilige Kanal kennt (Zeitnahme: Posten-Token; Anzeigen:
 * Board-Token). `null` bedeutet je „liegt nicht vor".
 */
export const socketTokens = (
    isInApp: boolean,
    deviceToken: string | null,
    now: number = Date.now(),
    stores: TokenStores = browserStores(),
): string[] => {
    const ordered = [
        readSessionToken(isInApp, now, stores),
        readSessionToken(!isInApp, now, stores),
        deviceToken,
    ]
    // Doppelte raus: Dieselbe Person kann in beiden Ablagen denselben Token haben (Anmeldung in
    // der Verwaltung, danach die Helferoberfläche im selben Profil geöffnet). Ihn zweimal zu
    // probieren würde nur den zweiten Versuch verschenken.
    return [...new Set(ordered.filter((token): token is string => token !== null))]
}

/** Die Kandidaten des Zeitnahme-Kanals: Sitzungen, dahinter das Posten-Token dieser Veranstaltung. */
export const timingSocketTokens = (
    eventId: string,
    isInApp: boolean,
    now: number = Date.now(),
    stores: TokenStores = browserStores(),
): string[] =>
    socketTokens(
        isInApp,
        deviceSessionForEvent(eventId, stores.local)?.token ?? null,
        now,
        stores,
    )

/** Die Oberfläche, auf der die Seite gerade läuft — gleiche Regel wie im UserProvider. */
export const isInAppSurface = (): boolean => window.location.pathname.startsWith('/app')
