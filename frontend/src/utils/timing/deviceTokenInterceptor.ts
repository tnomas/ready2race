import {client} from '@api/sdk.gen.ts'
import {readDeviceSession, TIMING_DEVICE_TOKEN_HEADER} from './deviceSession.ts'

/**
 * Hängt das abgelegte Geräte-Token als Header an alle Timing-Aufrufe seiner Veranstaltung.
 *
 * Getrennt von `deviceSession.ts`, damit die Ablage-Logik in der node-Testumgebung ohne den
 * generierten API-Client importierbar bleibt. Der Header ist auch bei bestehender Nutzersitzung
 * harmlos: der Server nimmt den Token-Zweig nur, wenn KEINE Sitzung mitkommt (timing.kt).
 */
export function installTimingDeviceTokenInterceptor(): void {
    client.interceptors.request.use(req => {
        const session = readDeviceSession()
        if (session !== null && req.url.includes(`/event/${session.event}/timing`)) {
            req.headers.set(TIMING_DEVICE_TOKEN_HEADER, session.token)
        }
        return req
    })
}
