import {TimingConfigDto, TimingConfigRequest} from '@api/types.gen.ts'
import {AutocompleteOption} from '@utils/types.ts'

/**
 * 'NONE' ist der Formular-Stellvertreter für „kein Zeitnahme-System gesetzt“ (Spalte null). Ein
 * Radio-Button braucht einen Wert; null lässt sich nicht auswählen.
 *
 * 'INTERN' (die hauseigene Zeitnahme) ist seit dem Zeitnahme-Umbau ein gültiger Backend-Wert und
 * muss hier durchreichbar sein; die Formular-Oberfläche dafür baut die Folge-Session (Phase 2).
 */
export type TimingFormSystem = 'NONE' | 'RACECLOCKER' | 'WEBSCORER' | 'INTERN'

export type TimingForm = {
    timingSystem: TimingFormSystem
    /**
     * Das eine angewählte Rennen dieses Wettkampfs — für Qualifikation und alle übrigen Runden
     * gemeinsam (seit dem 11.08.2026, RaceClocker kennt keine Startarten mehr). null heißt
     * „kein Rennen zugewiesen".
     */
    race: AutocompleteOption
    startlistConfig: AutocompleteOption
    resultImportConfig: AutocompleteOption
    /**
     * Nur mitgeführt: die Zeitnahme-Voreinstellung der Veranstaltung. Wettkämpfe erben System und
     * die beiden Dateiformate von dort, solange die eigenen Felder leer sind — das Rennen dagegen
     * wird pro Wettkampf zugewiesen und nicht geerbt. Die Oberfläche zeigt an, WAS geerbt würde,
     * und die Warnungen rechnen auf den effektiven Werten statt auf den lokalen.
     *
     * Die Formate stehen hier als blanke ID: den Namen schlägt die Komponente in den geladenen
     * Listen nach, damit dieses Modul ohne Netz testbar bleibt.
     */
    eventTimingSystem: TimingFormSystem
    eventStartlistConfig: string
    eventResultImportConfig: string
}

export const emptyTimingForm: TimingForm = {
    timingSystem: 'NONE',
    race: null,
    startlistConfig: null,
    resultImportConfig: null,
    eventTimingSystem: 'NONE',
    eventStartlistConfig: '',
    eventResultImportConfig: '',
}

/** Wettkampf-Wert vor Veranstaltungs-Voreinstellung — dieselbe Regel wie das Backend (coalesce). */
export const effectiveTimingSystem = (form: TimingForm): TimingFormSystem =>
    form.timingSystem !== 'NONE' ? form.timingSystem : form.eventTimingSystem

/**
 * Weicht der Wettkampf von der Veranstaltung ab? Genau dann, wenn er System oder ein Dateiformat
 * selbst gesetzt hat — nur diese erbt er, nur bei diesen gibt es etwas zu überschreiben. Der
 * „Überschreiben"-Schalter im Tab steht danach.
 *
 * Die Rennen-Anwahl steht bewusst NICHT in dieser Liste: sie wird seit dem 11.08.2026 immer pro
 * Wettkampf zugewiesen (im Tab oder umgekehrt am Rennen), eine Voreinstellung der Veranstaltung
 * gibt es nicht. Zählte sie mit, stünde der Schalter bei jedem zugeordneten Wettkampf an, und sein
 * Ausschalten löschte die Zuordnung — genau so verloren am Abend des 11.08.2026 acht Wettkämpfe
 * der Coastal-Regatta ihr Zeitfahren-Rennen.
 */
export const overridesTiming = (form: TimingForm): boolean =>
    form.timingSystem !== 'NONE' ||
    form.startlistConfig !== null ||
    form.resultImportConfig !== null

/**
 * Die Preset-Felder kommen als reine UUID aus dem Backend. Das Label füllt die Komponente nach, sobald
 * die Preset-Listen geladen sind — hier steht nur die ID, damit diese Funktion ohne Netz testbar bleibt.
 */
export const mapDtoToTimingForm = (dto: TimingConfigDto): TimingForm => ({
    timingSystem: dto.timingSystem ?? 'NONE',
    race: dto.race ? {id: dto.race, label: ''} : null,
    startlistConfig: dto.startlistConfig ? {id: dto.startlistConfig, label: ''} : null,
    resultImportConfig: dto.resultImportConfig ? {id: dto.resultImportConfig, label: ''} : null,
    eventTimingSystem: dto.eventTimingSystem ?? 'NONE',
    eventStartlistConfig: dto.eventStartlistConfig ?? '',
    eventResultImportConfig: dto.eventResultImportConfig ?? '',
})

/**
 * Felder, die für das gewählte System nicht sichtbar sind, werden bewusst geleert statt durchgereicht:
 * eine unsichtbare Anwahl oder ein unsichtbares Preset wäre eine Einstellung, die niemand mehr findet.
 */
export const mapTimingFormToRequest = (form: TimingForm): TimingConfigRequest => {
    // Effektiv statt lokal: erbt der Wettkampf RaceClocker von der Veranstaltung, ist die
    // Rennen-Anwahl sichtbar und ihre Eingaben sind gezielte Zuordnungen — die dürfen nicht beim
    // Speichern verschwinden, nur weil das lokale System-Feld auf "NONE" (= erben) steht.
    const effective = effectiveTimingSystem(form)
    const raceClocker = effective === 'RACECLOCKER'
    // Die beiden Dateiformate gehören zu den Fremdsystemen (Startlisten-Export, Ergebnis-Import).
    // Die hauseigene Zeitnahme (INTERN) exportiert und importiert nichts — ihre Presets werden wie
    // bei NONE verworfen, sonst stünde ein unsichtbares Format in der Datenbank.
    const configured = effective === 'RACECLOCKER' || effective === 'WEBSCORER'

    return {
        timingSystem: form.timingSystem === 'NONE' ? null : form.timingSystem,
        race: raceClocker ? (form.race?.id ?? null) : null,
        startlistConfig: configured ? (form.startlistConfig?.id ?? null) : null,
        resultImportConfig: configured ? (form.resultImportConfig?.id ?? null) : null,
    }
}

export type TimingWarning = 'race' | 'startlist'

/**
 * Was fehlt, um die Zeitnahme benutzen zu können.
 *
 * Das Rennen ist nur bei RaceClocker Pflicht (Webscorer hat keinen Feed, den man abrufen könnte);
 * das Startlisten-Preset immer — sonst antwortet der Startlisten-Export mit
 * STARTLIST_CONFIG_NOT_CONFIGURED, und das fällt sonst erst am Renntag auf. Eine
 * Qualifikations-Sonderbehandlung gibt es nicht mehr: Rennen und Preset gelten für alle Runden.
 */
export const timingConfigWarnings = (form: TimingForm): TimingWarning[] => {
    // Auf den effektiven Werten gerechnet: was die Veranstaltung vorbelegt, fehlt nicht.
    const system = effectiveTimingSystem(form)
    if (system === 'NONE') return []
    // Die hauseigene Zeitnahme braucht weder Rennen noch Dateiformate — ihre eigene Lücke
    // (fehlender Zeitnahmetyp) zeigt der Zuordnungs-Abschnitt selbst an.
    if (system === 'INTERN') return []

    // Rennen werden pro Wettkampf zugewiesen, nicht von der Veranstaltung geerbt.
    const race = form.race?.id
    // Das Format kann von der Veranstaltung kommen — dann fehlt es nicht.
    const startlist = form.startlistConfig?.id || form.eventStartlistConfig

    const warnings: TimingWarning[] = []
    if (system === 'RACECLOCKER' && !race) {
        warnings.push('race')
    }
    if (!startlist) {
        warnings.push('startlist')
    }
    return warnings
}
