package de.lambda9.ready2race.backend.app.stream.entity

import java.util.UUID

/**
 * Antwort des Szenen-Share-Link-Endpunkts — Wort für Wort
 * [BoardShareLinkDto][de.lambda9.ready2race.backend.app.eventInfo.entity.BoardShareLinkDto],
 * nur für das dritte Ziel derselben Token-Infrastruktur (Migration V202608271000): Wirecast kann
 * sich nicht anmelden, bekommt also denselben geteilten Link mit Geräte-Token wie eine Anzeige.
 *
 * [path] ist wurzelrelativ (`/event/{eventId}/stream/{sceneId}?token=...`) - das Backend kennt
 * den öffentlichen Origin nicht.
 */
data class StreamSceneShareLinkDto(
    val deviceTokenId: UUID,
    val scene: UUID,
    val token: String,
    val path: String,
)
