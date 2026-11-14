import {TFunction} from 'i18next'
import {RoleDto} from '@api/types.gen.ts'

/**
 * Name eines Jobs in der Sprache des Nutzers, mit dem Job-Schlüssel als Rückfallebene,
 * falls keine Übersetzung existiert.
 */
export const jobName = (jobKey: string, t: TFunction): string => {
    const key = `job.${jobKey}.name`
    const translated = t(key as never)
    return translated === key ? jobKey : translated
}

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

/**
 * Beschreibung einer Rolle: bei Jobkopien die Jobbeschreibung, sonst die in der Datenbank
 * hinterlegte Beschreibung. Fehlt beides, bleibt das Feld leer.
 */
export const roleDescription = (role: Pick<RoleDto, 'description' | 'job'>, t: TFunction): string => {
    if (role.job) {
        const key = `job.${role.job}.description`
        const translated = t(key as never)
        if (translated !== key) return translated
    }
    return role.description ?? ''
}
