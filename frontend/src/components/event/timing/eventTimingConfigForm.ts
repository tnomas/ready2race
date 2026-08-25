import {
    EventTimingConfigDto,
    EventTimingConfigRequest,
    StartDisplaySettingsDto,
    TimingPrecision,
    TimingSystem,
} from '@api/types.gen.ts'
import {AutocompleteOption} from '@utils/types.ts'
import {DEFAULT_START_DISPLAY, isDefaultStartDisplay} from '@utils/timing/startDisplay.ts'

/** Wie im Wettkampf-Formular: „nicht gesetzt" ist im Radio ein Wert, im Request null. */
export type EventTimingFormSystem = TimingSystem | 'NONE'

export type EventTimingForm = {
    timingSystem: EventTimingFormSystem
    /**
     * Startlisten-Export und Rennergebnisse-Import. Sie stehen nur hier, weil alle Wettkämpfe
     * einer Regatta dieselben Spalten brauchen; eine Übersteuerung je Wettkampf gibt es nicht.
     * Seit dem 11.08.2026 gibt es nur noch EIN Startlisten-Preset — RaceClocker kennt keine
     * Startarten mehr, also braucht die Qualifikation kein eigenes. WELCHES Rennen eine Ebene
     * fährt, steht im Zeitnahmeprofil-Baum (TimingProfileTree) und nicht hier.
     */
    startlistConfig: AutocompleteOption
    resultImportConfig: AutocompleteOption
    /**
     * Der automatische Abruf. Nur bei RaceClocker sichtbar und speicherbar — Webscorer hat keinen
     * Ergebnis-Feed, den ein Job abholen könnte.
     */
    autoPull: boolean
    intervalActiveSeconds: number
    intervalUpcomingSeconds: number
    watchBeforeMinutes: number
    watchAfterMinutes: number
    /**
     * Genauigkeit der veröffentlichten offiziellen Zeiten (interne Zeitnahme). Nur bei INTERN
     * sichtbar, aber wie die Takte immer im Request: die Spalte hat eine Vorgabe, und ein
     * Systemwechsel soll den eingestellten Wert nicht verlieren.
     */
    timingPrecision: TimingPrecision
    /**
     * Ob das START-Board den manuellen Stempel zeigt. Wie die Genauigkeit nur bei INTERN sichtbar,
     * aber immer im Request: die Spalte hat eine Vorgabe, und ein Systemwechsel soll die
     * Entscheidung nicht verlieren.
     */
    showManualCapture: boolean
    /**
     * Der Anzeige-Block des Startbildschirms — im Formular IMMER vollständig (nie null), auch wenn
     * die Veranstaltung noch nichts gespeichert hat: Schalter und Zahlenfelder brauchen einen
     * konkreten Anfangswert, sonst stünden sie beim ersten Öffnen leer. Ob daraus beim Speichern
     * ein eigener Wert oder wieder `null` („Standard") wird, entscheidet erst
     * [mapEventTimingFormToRequest].
     */
    startDisplay: StartDisplaySettingsDto
}

export const emptyEventTimingForm: EventTimingForm = {
    timingSystem: 'NONE',
    startlistConfig: null,
    resultImportConfig: null,
    autoPull: false,
    intervalActiveSeconds: 5,
    intervalUpcomingSeconds: 60,
    watchBeforeMinutes: 15,
    watchAfterMinutes: 120,
    timingPrecision: 'ZEHNTEL',
    showManualCapture: false,
    startDisplay: {...DEFAULT_START_DISPLAY},
}

export const mapDtoToEventTimingForm = (dto: EventTimingConfigDto): EventTimingForm => ({
    timingSystem: dto.timingSystem ?? 'NONE',
    // Wie im Wettkampf-Formular: nur die ID, das Label füllt die Komponente aus den geladenen Listen.
    startlistConfig: dto.startlistConfig ? {id: dto.startlistConfig, label: ''} : null,
    resultImportConfig: dto.resultImportConfig ? {id: dto.resultImportConfig, label: ''} : null,
    autoPull: dto.autoPull,
    intervalActiveSeconds: dto.intervalActiveSeconds,
    intervalUpcomingSeconds: dto.intervalUpcomingSeconds,
    watchBeforeMinutes: dto.watchBeforeMinutes,
    watchAfterMinutes: dto.watchAfterMinutes,
    timingPrecision: dto.timingPrecision,
    showManualCapture: dto.showManualCapture,
    // null vom Server heisst „noch nichts gespeichert" — im Formular wird daraus der eingebaute
    // Standard, damit die Schalter zeigen, was der Bildschirm tatsächlich anzeigt. Der Unterschied
    // geht dabei nicht verloren: unverändert gespeichert wird daraus beim Zurückschreiben wieder
    // null (siehe [mapEventTimingFormToRequest]).
    startDisplay: dto.startDisplay ?? {...DEFAULT_START_DISPLAY},
})

/**
 * Verwirft, was für das gewählte System nicht sichtbar ist — dieselbe Regel wie im Wettkampf: eine
 * unsichtbare Voreinstellung, die stillschweigend an alle Wettkämpfe vererbt wird, wäre die
 * unangenehmste Variante einer vergessenen Einstellung.
 */
export const mapEventTimingFormToRequest = (form: EventTimingForm): EventTimingConfigRequest => {
    const raceClocker = form.timingSystem === 'RACECLOCKER'
    // Nur die Fremdsysteme exportieren Startlisten und importieren Ergebnisse — die hauseigene
    // Zeitnahme (INTERN) hat keine Dateiformate, ihre Presets werden wie bei NONE verworfen.
    const configured = form.timingSystem === 'RACECLOCKER' || form.timingSystem === 'WEBSCORER'

    return {
        timingSystem: form.timingSystem === 'NONE' ? null : form.timingSystem,
        startlistConfig: configured ? (form.startlistConfig?.id ?? null) : null,
        resultImportConfig: configured ? (form.resultImportConfig?.id ?? null) : null,
        // Die Takte werden immer mitgeschickt: Sie haben in der Datenbank eine Vorgabe, und ein
        // Abschalten des Systems soll die eingestellten Werte nicht verlieren.
        autoPull: raceClocker && form.autoPull,
        intervalActiveSeconds: form.intervalActiveSeconds,
        intervalUpcomingSeconds: form.intervalUpcomingSeconds,
        watchBeforeMinutes: form.watchBeforeMinutes,
        watchAfterMinutes: form.watchAfterMinutes,
        // Wie die Takte immer mitgeschickt (nicht verworfen wie die Presets): der Wert hat in der
        // Datenbank eine Vorgabe, und ein Systemwechsel soll ihn nicht zurücksetzen.
        timingPrecision: form.timingPrecision,
        // Beide Anzeige-Entscheidungen reisen wie die Genauigkeit immer mit: Sie beschreiben
        // Bildschirme, die auch nach einem Systemwechsel dieselben bleiben.
        showManualCapture: form.showManualCapture,
        // Ein unangetasteter Block wird wieder zu `null` — so bleibt die Veranstaltung an den
        // eingebauten Vorgaben HÄNGEN statt sie einzufrieren: Wird der Standard später einmal
        // verändert (etwa weil sich am Wasser zeigt, dass fünf folgende Boote zu viele sind),
        // folgen alle Regatten, die nie etwas eingestellt haben, automatisch mit. Genau dieselbe
        // Überlegung wie bei den Tönen.
        startDisplay: isDefaultStartDisplay(form.startDisplay) ? null : form.startDisplay,
    }
}
