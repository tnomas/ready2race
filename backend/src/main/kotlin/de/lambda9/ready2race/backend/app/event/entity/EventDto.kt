package de.lambda9.ready2race.backend.app.event.entity

import java.time.LocalDate
import java.time.LocalDateTime
import java.util.*

data class EventDto(
    val id: UUID,
    val name: String,
    val description: String?,
    val location: String?,
    val registrationAvailableFrom: LocalDateTime?,
    val registrationAvailableTo: LocalDateTime?,
    val lateRegistrationAvailableTo: LocalDateTime?,
    val hasLateRegistrations: Boolean,
    val invoicePrefix: String?,
    val published: Boolean,
    val invoicesProduced: LocalDateTime?,
    val lateInvoicesProduced: LocalDateTime?,
    val paymentDueBy: LocalDate?,
    val latePaymentDueBy: LocalDate?,
    val registrationCount: Int?,
    val registrationsFinalized: Boolean,
    val mixedTeamTerm: String?,
    val challengeEvent: Boolean,
    val challengeResultType: MatchResultType?,
    val allowSelfSubmission: Boolean,
    val submissionNeedsVerification: Boolean,
    val allowParticipantSelfRegistration: Boolean,
    /** Steuert, wer Läufe beenden/aktivieren darf und ob die Kette dabei automatisch weiterzieht. */
    val chainProgressionMode: ChainProgressionMode,
    /** Voreinstellung für die Folgerunden-Automatik; Wettkämpfe können sie einzeln übersteuern. */
    val autoCreateFollowingRounds: Boolean,
    /** Zeigt Pausen/Programmpunkte aus dem Zeitplan auch auf Kiosk und Athleten-Anzeige. */
    val showBreaksOnPublicBoards: Boolean,
    /** Ab welchem Zustand ein Lauf als Ergebnis auf den öffentlichen Ansichten erscheint. */
    val publicResultsVisibility: PublicResultsVisibility,
    /** Ob die Durchführungsseite ihren Stand im Hintergrund nachzieht. */
    val executionAutoRefresh: Boolean,
    /** Takt dieses Abgleichs in Sekunden; nur wirksam, wenn [executionAutoRefresh] gesetzt ist. */
    val executionAutoRefreshSeconds: Int,
    val challengesFinished: Boolean?,
    /**
     * Ab wann an dieser Veranstaltung vor Ort gearbeitet wird — das Minimum über alle
     * Veranstaltungstage, mit Rückfall auf den Tagesbeginn, wo nichts gepflegt ist.
     *
     * Zusammen mit [lastEventDay] das Fenster, in dem die Helfer-App die Veranstaltung zur Wahl
     * stellt. Bewusst als Datum und nicht als fertiges „läuft gerade": Die App speichert ihre
     * Veranstaltungsliste für den Offline-Betrieb zwischen, und ein berechnetes Kennzeichen wäre
     * am nächsten Morgen falsch. Ein Datum altert nicht.
     *
     * Null nur bei einer Veranstaltung ganz ohne Tage.
     */
    val operationsStartsAt: LocalDateTime?,
    /**
     * Der erste Veranstaltungstag — allein für die Anzeige.
     *
     * Nicht [operationsStartsAt] dafür verwenden: Der Betrieb beginnt oft am Vorabend, und
     * „ab 13.08." als Datum einer Regatta, die am 14.08. anfängt, wäre schlicht falsch.
     */
    val firstEventDay: LocalDate?,
    /** Der letzte Veranstaltungstag; das Fenster schließt mit dessen Ablauf. */
    val lastEventDay: LocalDate?,
)