import {describe, expect, it} from 'vitest'
import {
    providerAssignmentBlock,
    providerAssignmentErrorKey,
    SYSTEM_USER_ID,
} from './materialProviderAssignment.ts'

describe('providerAssignmentBlock', () => {
    const base = {requesterId: 'me', targetId: 'other', targetJobs: [], mayUpdateSystem: false}

    it('lässt fremde, normale Konten zu', () => {
        expect(providerAssignmentBlock(base)).toBeNull()
    })

    it('sperrt das eigene Konto und das Systemkonto', () => {
        expect(providerAssignmentBlock({...base, targetId: 'me'})).toBe('self')
        expect(providerAssignmentBlock({...base, targetId: SYSTEM_USER_ID})).toBe('system')
    })

    it('sperrt Superadmin-Konten ohne Systemrecht', () => {
        expect(providerAssignmentBlock({...base, targetJobs: ['ADMIN', 'SUPERADMIN']})).toBe(
            'superadmin',
        )
        expect(
            providerAssignmentBlock({...base, targetJobs: ['SUPERADMIN'], mayUpdateSystem: true}),
        ).toBeNull()
    })
})

describe('providerAssignmentErrorKey', () => {
    it('unterscheidet Netz, eigene Zuordnung, fehlendes Recht und Teilmengenregel', () => {
        expect(providerAssignmentErrorKey({kind: 'network'})).toBe('common.error.network')
        expect(
            providerAssignmentErrorKey({status: {value: 403}, errorCode: 'SELF_ASSIGNMENT'}),
        ).toBe('role.error.selfAssignment')
        expect(providerAssignmentErrorKey({status: {value: 403}})).toBe(
            'user.materialProviderError.forbidden',
        )
        expect(
            providerAssignmentErrorKey({status: {value: 409}, errorCode: 'CANNOT_ASSIGN_ROLES'}),
        ).toBe('user.materialProviderError.cannotAssign')
        expect(providerAssignmentErrorKey({status: {value: 404}})).toBe(
            'user.materialProviderError.notFound',
        )
        expect(providerAssignmentErrorKey({status: {value: 500}})).toBe(
            'user.materialProviderError.generic',
        )
    })
})
