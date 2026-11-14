/**
 * Regeln der Anbieter-Zuordnung auf der Nutzerseite. Die Zuordnung vergibt und entzieht die
 * systemverwaltete Rolle „Materialanbieter" und folgt denselben Vergaberegeln wie die übrigen
 * Rollen (Backend: `RoleService.checkSystemManagedAssignable`): Personal verwalten (UPDATE STAFF),
 * nie am eigenen Konto, Superadmin-Konten nur mit Systemrecht, das Systemkonto nie.
 */

/** Feste ID des Systemkontos (Backend `SYSTEM_USER`). */
export const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000'

/** Job-Schlüssel, deren Rollen ein eigener Ablauf vergibt – nie die Rollenauswahl. */
export const SYSTEM_MANAGED_JOBS: readonly string[] = [
    'USER',
    'CLUB_REPRESENTATIVE',
    'MATERIAL_PROVIDER',
]

/** Jobs, die der Rollendialog nicht als Kopiervorlage anbietet. */
export const NOT_COPYABLE_JOBS: readonly string[] = ['MATERIAL_PROVIDER']

export type ProviderAssignmentBlock = 'self' | 'system' | 'superadmin'

/**
 * Warum die Zuordnung für dieses Konto gesperrt ist – oder `null`, wenn sie änderbar ist. Die
 * Oberfläche sagt es vorher, statt den Server mit einem pauschalen 403 antworten zu lassen.
 */
export const providerAssignmentBlock = (opts: {
    requesterId: string | undefined
    targetId: string
    targetJobs: readonly (string | undefined | null)[]
    mayUpdateSystem: boolean
}): ProviderAssignmentBlock | null => {
    if (opts.targetId === SYSTEM_USER_ID) return 'system'
    if (opts.requesterId !== undefined && opts.requesterId === opts.targetId) return 'self'
    if (opts.targetJobs.includes('SUPERADMIN') && !opts.mayUpdateSystem) return 'superadmin'
    return null
}

export type ProviderAssignmentErrorKey =
    | 'common.error.network'
    | 'role.error.selfAssignment'
    | 'user.materialProviderError.forbidden'
    | 'user.materialProviderError.cannotAssign'
    | 'user.materialProviderError.notFound'
    | 'user.materialProviderError.generic'

/** Übersetzt die Antwort von `PUT /user/{id}/materialProvider` in einen verständlichen Text. */
export const providerAssignmentErrorKey = (
    error: {kind: 'network'} | {status?: {value?: number}; errorCode?: string},
): ProviderAssignmentErrorKey => {
    if ('kind' in error) return 'common.error.network'
    if (error.status?.value === 403) {
        return error.errorCode === 'SELF_ASSIGNMENT'
            ? 'role.error.selfAssignment'
            : 'user.materialProviderError.forbidden'
    }
    if (error.status?.value === 409 && error.errorCode === 'CANNOT_ASSIGN_ROLES') {
        return 'user.materialProviderError.cannotAssign'
    }
    if (error.status?.value === 404) return 'user.materialProviderError.notFound'
    return 'user.materialProviderError.generic'
}
