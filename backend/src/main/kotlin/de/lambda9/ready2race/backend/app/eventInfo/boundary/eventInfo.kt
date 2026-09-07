package de.lambda9.ready2race.backend.app.eventInfo.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.eventInfo.entity.*
import de.lambda9.ready2race.backend.app.timing.boundary.TIMING_DEVICE_TOKEN_HEADER
import de.lambda9.ready2race.backend.app.timing.boundary.TimingDeviceTokenService
import de.lambda9.ready2race.backend.calls.requests.authenticateAny
import de.lambda9.ready2race.backend.calls.requests.optionalQueryParam
import de.lambda9.ready2race.backend.calls.requests.pathParam
import de.lambda9.ready2race.backend.calls.requests.queryParam
import de.lambda9.ready2race.backend.calls.requests.receiveKIO
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.calls.responses.respondComprehension
import de.lambda9.ready2race.backend.parsing.Parser.Companion.boolean
import de.lambda9.ready2race.backend.parsing.Parser.Companion.uuid
import de.lambda9.ready2race.backend.sessions.UserSession
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.recoverDefault
import io.ktor.server.application.*
import io.ktor.server.plugins.ratelimit.*
import io.ktor.server.request.*
import io.ktor.server.routing.*
import io.ktor.server.sessions.*
import java.util.UUID

/**
 * Darf dieser Aufruf die strittigen Läufe bestellen? Ja mit einer Sitzung, die die Anzeigen
 * lesen darf (READ BOARD oder READ EVENT), oder - ohne Sitzung - mit einem gültigen Board-Token
 * dieser Veranstaltung. Ein fehlendes, fremdes oder widerrufenes Token ist hier kein Fehler,
 * sondern schlicht „nein": der Endpunkt antwortet dann wie einem anonymen Aufruf.
 */
private fun ApplicationCall.mayIncludeClarification(eventId: UUID): App<Nothing, Boolean> =
    KIO.comprehension {
        val hasSession = sessions.get<UserSession>()?.token != null
        val deviceToken = request.header(TIMING_DEVICE_TOKEN_HEADER)
        if (!hasSession && deviceToken != null) {
            TimingDeviceTokenService.validateBoardTokenForEvent(deviceToken, eventId)
                .map { true }
                .recoverDefault { false }
        } else {
            authenticateAny(Privilege.ReadBoardGlobal, Privilege.ReadEventGlobal)
                .map { true }
                .recoverDefault { false }
        }
    }

fun Route.eventInfo() {
    // Alle Endpoints in diesem Block sind öffentlich (kein authenticate). Das Rate-Limit
    // ist eine grob dimensionierte Notbremse gegen Hämmern, siehe Requests.kt.
    route("/event/{eventId}/info") {
        rateLimit(RateLimitName("publicInfo")) {

            // Get upcoming competition matches
            get("/upcoming-matches") {
                call.respondComprehension {
                    val eventId = !pathParam("eventId", uuid)
                    val limit = !queryParam("limit", { it.toIntOrNull() ?: 10 })

                    EventInfoService.getUpcomingCompetitionMatches(eventId, limit)
                }
            }

            // Get latest match results. matchId grenzt auf das Feld eines einzelnen Laufs
            // ein ("Mein Event") - die Sichtbarkeitsregel bleibt dieselbe wie ohne Filter.
            get("/latest-match-results") {
                call.respondComprehension {
                    val eventId = !pathParam("eventId", uuid)
                    val limit = !queryParam("limit", { it.toIntOrNull() ?: 10 })
                    val competitionId = !optionalQueryParam("competitionId", uuid)
                    val matchId = !optionalQueryParam("matchId", uuid)

                    EventInfoService.getLatestMatchResults(eventId, limit, competitionId, matchId)
                }
            }

            // Get currently running matches. includeClarification=true (Sprecher-Board) liefert
            // auch die strittigen Läufe mit gesetztem clarification-Flag - der Standardweg lässt
            // sie weiter weg, damit Stream-Uhr und Anzeigen-Cursor nicht an ihnen hängen bleiben.
            // Die Bestellung zählt nur mit Ausweis: einer Sitzung mit Board-Leserecht oder einem
            // Board-Token dieser Veranstaltung (Header wie bei den Board-Endpunkten unten).
            // Anonym bleibt der Parameter wirkungslos - der Endpunkt bleibt öffentlich, aber die
            // strittigen Läufe sind genau das, was die Anzeigen zurückhalten.
            get("/running-matches") {
                call.respondComprehension {
                    val eventId = !pathParam("eventId", uuid)
                    val limit = !queryParam("limit", { it.toIntOrNull() ?: 10 })
                    val requested = !optionalQueryParam("includeClarification", boolean) ?: false
                    val includeClarification = requested && !mayIncludeClarification(eventId)

                    EventInfoService.getRunningMatches(eventId, limit, includeClarification)
                }
            }

            // Der Tab "Live" der öffentlichen Ergebnisanzeige: aktivierte UND anstehende Läufe,
            // jeder mit seinem Zustand. Öffentlich wie die Endpoints darüber.
            get("/live-matches") {
                call.respondComprehension {
                    val eventId = !pathParam("eventId", uuid)
                    val limit = !queryParam("limit", { it.toIntOrNull() ?: 10 })

                    EventInfoService.getLiveMatches(eventId, limit)
                }
            }

            // Der Tab "Zeitplan" der öffentlichen Ergebnisanzeige: das Tagesprogramm aus dem
            // Zeitplan, Slots mit Zustand — ohne Aufstellungen und ohne Ergebnisse.
            get("/program") {
                call.respondComprehension {
                    val eventId = !pathParam("eventId", uuid)

                    BoardService.getProgram(eventId)
                }
            }

            // Persönliches Dashboard, erreichbar über den QR-Code am Teilnehmerband.
            // Öffentlich wie die Anzeigen darüber; welche Felder ein anonymer Aufruf sieht,
            // entscheidet ausschließlich MyEventService.
            get("/my-event/{qrCode}") {
                call.respondComprehension {
                    val eventId = !pathParam("eventId", uuid)
                    val qrCode = !pathParam("qrCode")

                    MyEventService.getMyEvent(eventId, qrCode)
                }
            }
        }
    }

    // Die beiden Board-Endpunkte lagen bis zum 25.08.2026 im öffentlichen Block darüber. Sie
    // liegen bewusst weiter unter /info und behalten ihre Adresse - montierte Bildschirme und
    // Streaming-Rechner tragen sie fest eingestellt -, verlangen jetzt aber eine
    // Authentifizierung. Zwei Wege führen hinein:
    //   * eine Sitzung mit einem der Board-Leserechte - dieselben, die die Verwaltung darunter
    //     liest (READ BOARD oder READ EVENT), damit niemand ein drittes Recht braucht, um seine
    //     eigene Anzeige zu sehen;
    //   * ein Board-Geräte-Token im Header. Ein Bildschirm an der Hallenwand und eine OBS-Quelle
    //     können sich nicht anmelden; sie bekommen einen geteilten Link, genau wie die
    //     Zeitnahme-Posten (POST .../boards/{boardId}/share-link).
    // Ohne beides: 401.
    //
    // Der Header heißt weiterhin X-Timing-Device-Token, obwohl er jetzt weiter trägt als sein
    // Name: es sind produktive Geräte im Feld, die ihn genau so senden, und ein zweiter
    // Header-Name hätte sie mitten in der Regatta stumm geschaltet. Dahinter steht ohnehin
    // dieselbe Tabelle (Migration V202608250900) - nur eben mit zwei Zuschnitten.
    //
    // Wie in der Zeitnahme greift der Token-Zweig nur OHNE Sitzung: ein angemeldeter Nutzer
    // nimmt exakt den bisherigen Weg.
    route("/event/{eventId}/info") {
        rateLimit(RateLimitName("publicInfo")) {

            // Die Kurzliste (nur Kennung und Name) trägt die Umleitung der alten
            // Athleten-Board-URL. Deshalb genügt hier ein Board-Token IRGENDEINES Boards der
            // Veranstaltung: ein geteiltes Gerät muss sein eigenes Board erst finden können,
            // bevor es weiß, welche Kennung es hat.
            get("/boards") {
                call.respondComprehension {
                    val eventId = !pathParam("eventId", uuid)
                    val deviceToken = call.request.header(TIMING_DEVICE_TOKEN_HEADER)
                    if (deviceToken != null && call.sessions.get<UserSession>()?.token == null) {
                        !TimingDeviceTokenService.validateBoardTokenForEvent(deviceToken, eventId)
                    } else {
                        !authenticateAny(Privilege.ReadBoardGlobal, Privilege.ReadEventGlobal)
                    }

                    BoardService.getBoardNames(eventId)
                }
            }

            // Alles, was die Anzeige eines Boards braucht, in einer Antwort. Hier ist der
            // Zuschnitt eng: das Token muss für GENAU DIESES Board ausgestellt sein.
            get("/board/{boardId}") {
                call.respondComprehension {
                    val eventId = !pathParam("eventId", uuid)
                    val boardId = !pathParam("boardId", uuid)
                    val deviceToken = call.request.header(TIMING_DEVICE_TOKEN_HEADER)
                    if (deviceToken != null && call.sessions.get<UserSession>()?.token == null) {
                        !TimingDeviceTokenService.validateForBoard(deviceToken, eventId, boardId)
                    } else {
                        !authenticateAny(Privilege.ReadBoardGlobal, Privilege.ReadEventGlobal)
                    }

                    BoardService.getBoardView(eventId, boardId)
                }
            }
        }
    }

    // Die Board-Verwaltung trägt ein eigenes Rechtepaar (READ/UPDATE BOARD), damit eine
    // Sprecher- oder Streamer-Rolle die Anzeigen pflegen kann, ohne das breite UPDATE EVENT
    // (Wettkämpfe, Gebühren, Urkunden, Zeitnahme) zu bekommen. Die Event-Rechte bleiben
    // gleichwertig zugelassen - bestehende Rollen verlieren dadurch nichts.
    route("/event/{eventId}/boards") {
        // Alle Boards einer Veranstaltung, mit voller Konfiguration (Verwaltungsmaske).
        get {
            call.respondComprehension {
                val user = !authenticateAny(Privilege.ReadBoardGlobal, Privilege.ReadEventGlobal)
                val eventId = !pathParam("eventId", uuid)

                BoardService.getBoards(eventId)
            }
        }

        post {
            call.respondComprehension {
                val user = !authenticateAny(Privilege.UpdateBoardGlobal, Privilege.UpdateEventGlobal)
                val eventId = !pathParam("eventId", uuid)
                val request = !receiveKIO(BoardRequest.example)

                BoardService.createBoard(eventId, request)
            }
        }

        put("/{boardId}") {
            call.respondComprehension {
                val user = !authenticateAny(Privilege.UpdateBoardGlobal, Privilege.UpdateEventGlobal)
                val boardId = !pathParam("boardId", uuid)
                val request = !receiveKIO(BoardRequest.example)

                BoardService.updateBoard(boardId, request)
            }
        }

        delete("/{boardId}") {
            call.respondComprehension {
                val user = !authenticateAny(Privilege.UpdateBoardGlobal, Privilege.UpdateEventGlobal)
                val boardId = !pathParam("boardId", uuid)

                BoardService.deleteBoard(boardId)
            }
        }

        // "Link anklicken = Token ausgestellt": liefert die fertige Anzeigen-Adresse samt
        // Geräte-Token - beim zweiten Klick DENSELBEN Link (Wiederverwendung statt Inflation),
        // erst nach einem Widerruf wieder einen frischen. POST trotz Wiederholbarkeit: der erste
        // Aufruf stellt ein Credential aus. Gespiegelt zum Posten-Link der Zeitnahme, mit den
        // Rechten der übrigen Board-Verwaltung - wer eine Anzeige bauen darf, darf sie auch an
        // einen Bildschirm hängen.
        post("/{boardId}/share-link") {
            call.respondComprehension {
                val user = !authenticateAny(Privilege.UpdateBoardGlobal, Privilege.UpdateEventGlobal)
                val eventId = !pathParam("eventId", uuid)
                val boardId = !pathParam("boardId", uuid)

                TimingDeviceTokenService.shareLinkForBoard(eventId, boardId, user.id!!)
            }
        }
    }
}