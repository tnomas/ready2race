import {client} from '@api/sdk.gen.ts'
import {TIMING_DEVICE_TOKEN_HEADER} from '@utils/timing/deviceSession.ts'
import {boardDeviceToken, boardDeviceTokenForEvent} from './deviceToken.ts'

/**
 * Hängt das abgelegte Board-Token als Header an die beiden Board-Abrufe.
 *
 * Getrennt von `deviceToken.ts`, damit die Ablage-Logik in der node-Testumgebung ohne den
 * generierten API-Client importierbar bleibt (wie beim Zeitnahme-Vorbild
 * `timing/deviceTokenInterceptor.ts`). Der Header ist auch bei bestehender Nutzersitzung harmlos:
 * der Server nimmt den Token-Zweig nur, wenn KEINE Sitzung mitkommt — die Sitzung geht also immer
 * vor, das Token ist der Weg für Geräte ohne Anmeldung.
 *
 * Zwei Endpunkte mit ZWEI Strenge-Graden, deshalb zwei Muster statt eines Präfixes:
 * - Board-Ansicht (`/info/board/{boardId}`): nur das Token GENAU dieses Boards. Ein fremdes
 *   mitzuschicken brächte nichts (401) und würde bei angemeldeten Nutzern ohne Not einen
 *   Token-Zweig anbieten.
 * - Kurzliste (`/info/boards`): irgendein Token dieser Veranstaltung — ein geteilter Bildschirm
 *   muss sein Board über die Liste finden können, bevor er dessen Id kennt.
 *
 * `req.url` ist die fertig aufgelöste Adresse (Basis-URL plus eingesetzte Pfad-Parameter), deshalb
 * die Prüfung per regulärem Ausdruck auf ganze Pfad-Segmente statt per `includes` — sonst griffe
 * das Muster der Kurzliste auch auf `/info/board/…` bzw. auf eine andere Veranstaltung.
 */
export function installBoardDeviceTokenInterceptor(): void {
    client.interceptors.request.use(req => {
        const path = new URL(req.url).pathname

        const view = /\/event\/([^/]+)\/info\/board\/([^/]+)$/.exec(path)
        if (view !== null) {
            const token = boardDeviceToken(view[1], view[2])
            if (token !== null) req.headers.set(TIMING_DEVICE_TOKEN_HEADER, token)
            return req
        }

        const list = /\/event\/([^/]+)\/info\/boards$/.exec(path)
        if (list !== null) {
            const token = boardDeviceTokenForEvent(list[1])
            if (token !== null) req.headers.set(TIMING_DEVICE_TOKEN_HEADER, token)
        }

        return req
    })
}
