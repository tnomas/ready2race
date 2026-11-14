import {JobDto, PrivilegeDto, Resource} from '@api/types.gen.ts'

const actionOrder: Record<PrivilegeDto['action'], number> = {CREATE: 0, READ: 1, UPDATE: 2, DELETE: 3}
const scopeOrder: Record<PrivilegeDto['scope'], number> = {OWN: 0, GLOBAL: 1}

export type PrivilegeGroup = {resource: Resource; privileges: PrivilegeDto[]}

/** Ressourcen alphabetisch, darin Aktion (Anlegen, Lesen, Ändern, Löschen) und dann Scope (Eigene vor Alle). */
export const groupPrivileges = (privileges: PrivilegeDto[]): PrivilegeGroup[] => {
    const byResource = new Map<Resource, PrivilegeDto[]>()
    for (const p of privileges) {
        byResource.set(p.resource, [...(byResource.get(p.resource) ?? []), p])
    }
    return [...byResource.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([resource, list]) => ({
            resource,
            privileges: [...list].sort(
                (a, b) => actionOrder[a.action] - actionOrder[b.action] || scopeOrder[a.scope] - scopeOrder[b.scope],
            ),
        }))
}

/** Was eine Rolle gegenüber ihrem Job zusätzlich hat und was ihr fehlt. */
export const deviationOf = (selected: string[], job: JobDto | undefined): {added: string[]; missing: string[]} => {
    if (!job) return {added: [], missing: []}
    const jobIds = new Set(job.privileges.map(p => p.id))
    const sel = new Set(selected)
    return {
        added: selected.filter(id => !jobIds.has(id)),
        missing: job.privileges.map(p => p.id).filter(id => !sel.has(id)),
    }
}
