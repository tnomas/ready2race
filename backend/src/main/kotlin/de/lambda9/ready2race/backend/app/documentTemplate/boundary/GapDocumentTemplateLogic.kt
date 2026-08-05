package de.lambda9.ready2race.backend.app.documentTemplate.boundary

import de.lambda9.ready2race.backend.app.documentTemplate.entity.GapDocumentPlaceholderRequest
import de.lambda9.ready2race.backend.app.documentTemplate.entity.GapDocumentType

object GapDocumentTemplateLogic {

    /**
     * Der Serien-Renderer zeichnet je Urkunde genau eine Seite und berücksichtigt nur Platzhalter
     * mit `page == 1`. Eine Siegerurkunde ist per Definition einseitig, deshalb wird eine Anfrage mit
     * Platzhaltern auf einer höheren Seite abgelehnt. Die Teilnahmeurkunde bleibt unangetastet, weil
     * ihre Vorlage mehrseitig sein darf.
     */
    fun placeholdersFitOnSinglePage(
        type: GapDocumentType,
        placeholders: List<GapDocumentPlaceholderRequest>,
    ): Boolean = type != GapDocumentType.AWARD_CERTIFICATE || placeholders.all { it.page == 1 }
}
