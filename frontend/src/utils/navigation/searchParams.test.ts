import {describe, expect, it} from 'vitest'
import {validateAdministrationSearch, validateEventIndexSearch} from './searchParams.ts'

describe('validateEventIndexSearch', () => {
    it('übernimmt gültigen Bereich und Tag', () => {
        expect(validateEventIndexSearch({tab: 'schedule', day: '2026-08-14'})).toEqual({
            tab: 'schedule',
            day: '2026-08-14',
        })
        expect(validateEventIndexSearch({tab: 'schedule', day: 'all'})).toEqual({
            tab: 'schedule',
            day: 'all',
        })
    })

    it('verwirft unbekannte Bereiche und kaputte Tage', () => {
        const result = validateEventIndexSearch({tab: 'xyz', day: 'morgen'})
        expect(result.tab).toBeUndefined()
        expect(result.day).toBeUndefined()
    })

    it('kommt ohne Search aus (alte Links)', () => {
        const result = validateEventIndexSearch({})
        expect(result.tab).toBeUndefined()
        expect(result.day).toBeUndefined()
    })

    it('lässt fremde Schlüssel nicht durch', () => {
        expect(Object.keys(validateEventIndexSearch({tab: 'general', foo: 'bar'})).sort()).toEqual([
            'day',
            'tab',
        ])
    })
})

describe('validateAdministrationSearch', () => {
    it('übernimmt bekannte Reiter', () => {
        expect(validateAdministrationSearch({tab: 'smtp'}).tab).toBe('smtp')
        expect(validateAdministrationSearch({tab: 'theme'}).tab).toBe('theme')
        expect(validateAdministrationSearch({tab: 'email-templates'}).tab).toBe('email-templates')
    })

    it('verwirft unbekannte Reiter', () => {
        expect(validateAdministrationSearch({tab: 'emailTemplates'}).tab).toBeUndefined()
        expect(validateAdministrationSearch({tab: 2}).tab).toBeUndefined()
        expect(validateAdministrationSearch({}).tab).toBeUndefined()
    })
})
