import {useCallback, useEffect, useState} from 'react'
import {getBoardView} from '@api/sdk.gen'
import {BoardViewDto} from '@api/types.gen'
import {usePolledEndpoint, PolledState} from '@utils/usePolledEndpoint.ts'
import {boardNeedsRealtime} from './boardViewPush.ts'
import {useBoardViewSocket} from './useBoardViewSocket.ts'

const FALLBACK_INTERVAL_SECONDS = 15
// Früher als bei „Mein Event": Vor dem Board steht niemand, der von sich aus nachlädt, und ein
// fest montierter Bildschirm mit altem Stand ist im Rennbetrieb teurer als eine Warnung zuviel.
const STALE_AFTER_MISSED_INTERVALS = 2

export type BoardViewState = PolledState<BoardViewDto>

/**
 * Der Stand eines Boards — gepusht, wo es darauf ankommt, und getaktet als Sicherheitsnetz.
 *
 * Zwei Quellen speisen denselben Zustand:
 *  * Der BOARD-KANAL (`useBoardViewSocket`) schickt die FERTIGE Ansicht. Sie wird direkt
 *    eingesetzt — kein HTTP-Nachschlag, keine Entprellung, kein Warten. Das ist der Grund für
 *    den ganzen Umbau: das Livestream-Overlay soll im selben Moment umspringen wie das Bild.
 *  * Der TAKT ([usePolledEndpoint]) bleibt als Sicherheitsnetz und streckt sich, solange der
 *    Kanal steht (`stretchedPollMs`). Ganz abschalten wäre billiger, fienge aber genau die
 *    Fälle nicht mehr ab, für die er da ist: eine Verbindung, die ein Proxy offenhält, obwohl
 *    niemand mehr zuhört.
 *
 * Der Kanal wird nur geöffnet, wenn das Board mindestens eine Kachel mit Echtzeitbezug hat
 * (`boardNeedsRealtime`). Ein reines Uhr-/Text-Board braucht keine offene Verbindung: die Uhr
 * läuft ohnehin lokal gegen die Serverzeit, und ein fester Text ändert sich nur mit der
 * Konfiguration. Entschieden wird das an der geladenen Konfiguration, also erst nach dem ersten
 * Abruf — bis dahin trägt der Takt allein, und das ist genau ein Takt lang.
 *
 * Die drei Eigenschaften, die [usePolledEndpoint] ausdrücklich schützt, gelten unverändert und
 * werden von der Zusammenführung unten bewusst NICHT aufgeweicht:
 *  * Der letzte gute Stand überlebt einen Netzabbruch — weder ein abgerissener Abruf noch ein
 *    abgerissener Kanal setzt `data` zurück.
 *  * „Nie geladen" bleibt von „geladen, aber leer" unterscheidbar: `initialLoad` fällt erst,
 *    wenn eine der beiden Quellen wirklich etwas geliefert hat (sonst behauptete die Anzeige
 *    fälschlich, es sei kein Lauf in der Arena).
 *  * Im Hintergrund wird nicht geladen — und auch ein gepushter Stand wird dort nur vorgemerkt
 *    und beim Zurückkehren angewendet (`useBoardViewSocket`).
 */
export const useBoardViewData = (eventId: string, boardId: string): BoardViewState => {
    // Der zuletzt gepushte Stand samt Empfangszeit. Die Zeit ist kein Beiwerk: an ihr entscheidet
    // sich unten, welche der beiden Quellen die jüngere ist.
    const [pushed, setPushed] = useState<{view: BoardViewDto; at: Date} | null>(null)
    // Steht der Kanal? Über den Zustand statt direkt weitergereicht, weil der Takt-Hook vor dem
    // Kanal-Hook läuft (der Kanal braucht die geladene Konfiguration, um überhaupt zu wissen, ob
    // er sich lohnt) — ein Renderdurchlauf Verzögerung, mehr ist das nicht.
    const [pushConnected, setPushConnected] = useState(false)

    const polled = usePolledEndpoint<BoardViewDto>(
        signal => getBoardView({signal, path: {eventId, boardId}}),
        data =>
            data.refreshIntervalSeconds > 0
                ? data.refreshIntervalSeconds
                : FALLBACK_INTERVAL_SECONDS,
        [eventId, boardId],
        {
            staleAfterMissedIntervals: STALE_AFTER_MISSED_INTERVALS,
            externalPushConnected: pushConnected,
        },
    )

    // Ein Wechsel der Anzeige (oder der Veranstaltung) macht den gepushten Stand wertlos — er
    // gehört zum vorigen Board und darf nicht eine Sekunde lang darüberliegen.
    useEffect(() => {
        setPushed(null)
    }, [eventId, boardId])

    const onView = useCallback(
        (view: BoardViewDto) => {
            // Fremde Nutzlast verwerfen statt anzeigen: der Kanal ist je Board eigen, aber ein
            // Wechsel des Boards und ein noch fliegender Rahmen können sich überholen.
            if (view.boardId !== boardId) return
            setPushed({view, at: new Date()})
        },
        [boardId],
    )

    // Die jüngere der beiden Quellen gewinnt. Nicht „Push schlägt Takt": nach einem
    // Kanalabbruch ist der zuletzt getaktete Abruf der aktuellere, und dann muss er auch
    // angezeigt werden.
    const pushIsNewer =
        pushed !== null && (polled.lastUpdated === null || pushed.at > polled.lastUpdated)

    const data = pushIsNewer ? pushed.view : polled.data
    const lastUpdated = pushIsNewer ? pushed.at : polled.lastUpdated

    // Der Kanal lohnt sich nur für Boards mit Echtzeitbezug — und erst, wenn die Konfiguration
    // da ist (sie kommt mit der Ansicht).
    const realtime = boardNeedsRealtime(data?.config)
    const {connected} = useBoardViewSocket(realtime ? eventId : null, boardId, onView)
    useEffect(() => {
        setPushConnected(connected)
    }, [connected])

    return {
        data,
        lastUpdated,
        notFound: polled.notFound,
        // Beide bleiben Sache des HTTP-Abrufs: nur er sieht einen Statuscode. Der Kanal kennt
        // dafür kein Gegenstück — eine abgewiesene Verbindung schließt der Server schlicht, und
        // was das für die Anzeige heißt, sagt ihr der (angehaltene) Takt.
        unauthorized: polled.unauthorized,
        // „Nie geladen" endet mit der ersten Nutzlast, egal aus welcher Quelle sie kam.
        initialLoad: polled.initialLoad && pushed === null,
        // Ein stehender Kanal, der zuletzt einen frischeren Stand geliefert hat als der letzte
        // erfolgreiche Abruf, ist der Beleg dafür, dass die Anzeige aktuell IST — dann wäre eine
        // Stand-von-Warnung schlicht falsch. Der Kanal muss dafür beides sein, jünger UND
        // verbunden: stirbt er, kippt `connected` binnen einer halben Minute (die Ktor-Pings
        // laufen alle 15 s, Zeitüberschreitung nach 30 s), und die Warnungen des Taktes gelten
        // wieder. In jedem Zweifelsfall zeigt die Anzeige lieber eine Warnung zuviel.
        loadFailed: polled.loadFailed && !(pushConnected && pushIsNewer),
        stale: polled.stale && !(pushConnected && pushIsNewer),
    }
}
