import {TFunction} from 'i18next'
import {RoleDto} from '@api/types.gen.ts'

/**
 * Statische Rollen sind Jobs und heißen in der Sprache des Nutzers; Kopien tragen den Namen,
 * den der Betreiber ihnen gegeben hat. Fehlt eine Übersetzung, bleibt der Datenbankname.
 */
export const roleLabel = (role: Pick<RoleDto, 'name' | 'job' | 'static'>, t: TFunction): string => {
    if (role.static && role.job) {
        const key = `job.${role.job}.name`
        const translated = t(key as never)
        return translated === key ? role.name : translated
    }
    return role.name
}
