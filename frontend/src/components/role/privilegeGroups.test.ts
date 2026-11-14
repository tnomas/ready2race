import {describe, expect, it} from 'vitest'
import {deviationOf, groupPrivileges} from './privilegeGroups'
import {PrivilegeDto} from '@api/types.gen.ts'

const p = (id: string, action: PrivilegeDto['action'], resource: PrivilegeDto['resource'], scope: PrivilegeDto['scope']): PrivilegeDto => ({id, action, resource, scope})

describe('groupPrivileges', () => {
    it('gruppiert nach Ressource und ordnet Aktion vor Scope', () => {
        const groups = groupPrivileges([
            p('1', 'UPDATE', 'EVENT', 'GLOBAL'),
            p('2', 'READ', 'EVENT', 'GLOBAL'),
            p('3', 'READ', 'EVENT', 'OWN'),
            p('4', 'READ', 'CLUB', 'GLOBAL'),
        ])
        expect(groups.map(g => g.resource)).toEqual(['CLUB', 'EVENT'])
        expect(groups[1].privileges.map(x => x.id)).toEqual(['3', '2', '1'])
    })
})

describe('deviationOf', () => {
    it('liefert Zusätze und Lücken gegenüber dem Job', () => {
        const job = {key: 'TIMEKEEPER', level: 'EVENT' as const, privileges: [p('a', 'READ', 'EVENT', 'GLOBAL'), p('b', 'UPDATE', 'APP_TIMING', 'GLOBAL')]}
        expect(deviationOf(['a', 'c'], job)).toEqual({added: ['c'], missing: ['b']})
    })
    it('ist ohne Job leer', () => {
        expect(deviationOf(['a'], undefined)).toEqual({added: [], missing: []})
    })
})
