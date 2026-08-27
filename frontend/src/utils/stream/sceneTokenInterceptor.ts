import {client} from '@api/sdk.gen.ts'
import {TIMING_DEVICE_TOKEN_HEADER} from '@utils/timing/deviceSession.ts'
import {streamSceneDeviceToken} from './sceneToken.ts'

/**
 * Hängt das abgelegte Szenen-Token als Header an den Szenen-Ansicht-Abruf
 * (`getStreamSceneView`, `/event/{eventId}/stream/{sceneId}/view`).
 *
 * Getrennt von `sceneToken.ts`, damit die Ablage-Logik in der node-Testumgebung ohne den
 * generierten API-Client importierbar bleibt (Muster: `board/deviceTokenInterceptor.ts`). Der
 * Header ist auch bei bestehender Nutzersitzung harmlos: der Server nimmt den Token-Zweig nur,
 * wenn KEINE Sitzung mitkommt — die Sitzung geht also immer vor, das Token ist der Weg für eine
 * Bühne ohne Anmeldung (OBS/Wirecast).
 */
export function installStreamSceneDeviceTokenInterceptor(): void {
    client.interceptors.request.use(req => {
        const path = new URL(req.url).pathname

        const view = /\/event\/([^/]+)\/stream\/([^/]+)\/view$/.exec(path)
        if (view !== null) {
            const token = streamSceneDeviceToken(view[1], view[2])
            if (token !== null) req.headers.set(TIMING_DEVICE_TOKEN_HEADER, token)
        }

        return req
    })
}
