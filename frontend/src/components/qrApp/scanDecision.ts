/**
 * Was nach einem Scan passiert — aus Band, Rechten und gemerktem Modus.
 *
 * Ein unbekanntes Band hat nur eine sinnvolle Handlung (zuweisen), deshalb zählt dafür der
 * Modus nicht: Wer Bänder verwalten darf, weist zu, auch wenn er gerade an der Waage steht. Bei
 * bekannten Bändern entscheidet der Modus; fehlt er und gibt es mehr als ein Recht, wird
 * gefragt.
 */
import {QrCodeAppuserResponse, QrCodeParticipantResponse} from '@api/types.gen.ts'
import {ScanMode} from './appAccess.ts'

/**
 * Der Scanner der Helfer-App läuft immer angemeldet; die anonyme Antwortform des Endpunkts
 * kommt hier nicht vor.
 */
export type StaffQrCodeResponse = QrCodeParticipantResponse | QrCodeAppuserResponse

export type BandType = 'UNKNOWN' | 'PARTICIPANT' | 'USER'

export const bandTypeOf = (response: StaffQrCodeResponse | null): BandType => {
    if (response === null) return 'UNKNOWN'
    return response.type === 'User' ? 'USER' : 'PARTICIPANT'
}

export type ScanDecision =
    | {kind: 'ASSIGN'}
    | {kind: 'UNKNOWN_NOT_ALLOWED'}
    | {kind: 'CHOOSE'; options: ScanMode[]}
    | {kind: 'ACT'; mode: ScanMode; canRemove: boolean}

export const decideScan = (input: {
    band: BandType
    rights: ScanMode[]
    mode: ScanMode | null
}): ScanDecision => {
    const {band, rights, mode} = input
    const canRemove = rights.includes('APP_QR_MANAGEMENT')

    if (band === 'UNKNOWN') {
        return canRemove ? {kind: 'ASSIGN'} : {kind: 'UNKNOWN_NOT_ALLOWED'}
    }

    const effective =
        mode !== null && rights.includes(mode) ? mode : rights.length === 1 ? rights[0] : null

    if (effective === null) return {kind: 'CHOOSE', options: rights}
    return {kind: 'ACT', mode: effective, canRemove}
}
