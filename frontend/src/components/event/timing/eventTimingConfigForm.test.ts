import {describe, expect, it} from 'vitest'
import {
    emptyEventTimingForm,
    mapDtoToEventTimingForm,
    mapEventTimingFormToRequest,
} from './eventTimingConfigForm.ts'
import {DEFAULT_START_DISPLAY} from '@utils/timing/startDisplay.ts'

describe('mapDtoToEventTimingForm', () => {
    it('setzt ein fehlendes Zeitnahme-System auf NONE', () => {
        expect(
            mapDtoToEventTimingForm({
                autoPull: false,
                showManualCapture: false,
                intervalActiveSeconds: 5,
                intervalUpcomingSeconds: 60,
                watchBeforeMinutes: 15,
                watchAfterMinutes: 120,
                timingPrecision: 'ZEHNTEL',
            }).timingSystem,
        ).toBe('NONE')
    })

    it('belegt jedes Feld des Formulars, damit reset() keines verwirft', () => {
        const form = mapDtoToEventTimingForm({
            timingSystem: 'RACECLOCKER',
            autoPull: false,
            showManualCapture: false,
            intervalActiveSeconds: 5,
            intervalUpcomingSeconds: 60,
            watchBeforeMinutes: 15,
            watchAfterMinutes: 120,
            timingPrecision: 'ZEHNTEL',
        })

        expect(Object.keys(form).sort()).toEqual(Object.keys(emptyEventTimingForm).sort())
    })

    it('übernimmt die Genauigkeit aus dem Dto', () => {
        const form = mapDtoToEventTimingForm({
            timingSystem: 'INTERN',
            autoPull: false,
            showManualCapture: false,
            intervalActiveSeconds: 5,
            intervalUpcomingSeconds: 60,
            watchBeforeMinutes: 15,
            watchAfterMinutes: 120,
            timingPrecision: 'MILLISEKUNDE',
        })

        expect(form.timingPrecision).toBe('MILLISEKUNDE')
    })
})

describe('mapEventTimingFormToRequest', () => {
    it('schickt NONE als null', () => {
        expect(mapEventTimingFormToRequest(emptyEventTimingForm).timingSystem).toBeNull()
    })

    it('übernimmt das eine Startlisten-Format für jedes gesetzte System', () => {
        // Seit dem 11.08.2026 gibt es nur noch ein Preset — auch bei RaceClocker, das keine
        // Startarten mehr kennt. Webscorer und RaceClocker teilen sich damit dasselbe Feld.
        const request = mapEventTimingFormToRequest({
            ...emptyEventTimingForm,
            timingSystem: 'WEBSCORER',
            startlistConfig: {id: '22222222-2222-2222-2222-222222222222', label: 'R'},
            resultImportConfig: {id: '33333333-3333-3333-3333-333333333333', label: 'I'},
        })

        expect(request.startlistConfig).toBe('22222222-2222-2222-2222-222222222222')
        expect(request.resultImportConfig).toBe('33333333-3333-3333-3333-333333333333')
    })

    it('verwirft die Formate bei der hauseigenen Zeitnahme', () => {
        // INTERN kennt weder Startlisten-Export noch Ergebnis-Import — wie bei NONE darf kein
        // unsichtbares Format gespeichert bleiben.
        const request = mapEventTimingFormToRequest({
            ...emptyEventTimingForm,
            timingSystem: 'INTERN',
            startlistConfig: {id: '22222222-2222-2222-2222-222222222222', label: 'R'},
            resultImportConfig: {id: '33333333-3333-3333-3333-333333333333', label: 'I'},
        })

        expect(request.timingSystem).toBe('INTERN')
        expect(request.startlistConfig).toBeNull()
        expect(request.resultImportConfig).toBeNull()
    })

    it('verwirft die Formate, wenn kein System gesetzt ist', () => {
        const request = mapEventTimingFormToRequest({
            ...emptyEventTimingForm,
            startlistConfig: {id: '22222222-2222-2222-2222-222222222222', label: 'R'},
            resultImportConfig: {id: '33333333-3333-3333-3333-333333333333', label: 'I'},
        })

        expect(request.startlistConfig).toBeNull()
        expect(request.resultImportConfig).toBeNull()
    })
})

describe('automatischer Abruf', () => {
    it('übernimmt die Abruf-Einstellungen aus dem Dto', () => {
        const form = mapDtoToEventTimingForm({
            timingSystem: 'RACECLOCKER',
            startlistConfig: null,
            resultImportConfig: null,
            autoPull: true,
            showManualCapture: false,
            intervalActiveSeconds: 3,
            intervalUpcomingSeconds: 90,
            watchBeforeMinutes: 20,
            watchAfterMinutes: 60,
            timingPrecision: 'ZEHNTEL',
            deviatingCompetitions: [],
        })

        expect(form.autoPull).toBe(true)
        expect(form.intervalActiveSeconds).toBe(3)
        expect(form.intervalUpcomingSeconds).toBe(90)
        expect(form.watchBeforeMinutes).toBe(20)
        expect(form.watchAfterMinutes).toBe(60)
    })

    it('reicht die Abruf-Einstellungen unverändert an den Request weiter', () => {
        const request = mapEventTimingFormToRequest({
            ...emptyEventTimingForm,
            timingSystem: 'RACECLOCKER',
            autoPull: true,
            showManualCapture: false,
            intervalActiveSeconds: 3,
            intervalUpcomingSeconds: 90,
            watchBeforeMinutes: 20,
            watchAfterMinutes: 60,
        })

        expect(request.autoPull).toBe(true)
        expect(request.intervalActiveSeconds).toBe(3)
        expect(request.intervalUpcomingSeconds).toBe(90)
    })

    // Ohne RaceClocker gibt es keinen Feed, den man abrufen könnte - der Schalter darf dann nicht
    // still eingeschaltet gespeichert bleiben, sonst steht in der Datenbank eine Automatik, die
    // die Oberfläche gar nicht mehr anzeigt.
    it('schaltet den Abruf ab, wenn das System nicht RaceClocker ist', () => {
        const request = mapEventTimingFormToRequest({
            ...emptyEventTimingForm,
            timingSystem: 'WEBSCORER',
            autoPull: true,
            showManualCapture: false,
        })

        expect(request.autoPull).toBe(false)
    })
})

describe('Genauigkeit', () => {
    // Anders als die Presets wird die Genauigkeit NICHT verworfen, wenn das System wechselt: sie
    // hat in der Datenbank eine Vorgabe, und ein Ausflug zu RaceClocker und zurück soll den
    // eingestellten Wert nicht zurücksetzen (dasselbe Muster wie die Abruf-Takte).
    it('schickt die Genauigkeit bei jedem System mit', () => {
        for (const timingSystem of ['NONE', 'RACECLOCKER', 'WEBSCORER', 'INTERN'] as const) {
            const request = mapEventTimingFormToRequest({
                ...emptyEventTimingForm,
                timingSystem,
                timingPrecision: 'SEKUNDE',
            })
            expect(request.timingPrecision).toBe('SEKUNDE')
        }
    })

    it('startet mit der Server-Vorgabe ZEHNTEL', () => {
        expect(emptyEventTimingForm.timingPrecision).toBe('ZEHNTEL')
    })
})

describe('Startbildschirm und manueller Stempel', () => {
    // Der Stempel ist der Grund fuer die ganze Einstellung: Ohne sie stehen im Start-Board zwei
    // gruene "Start"-Flaechen uebereinander. Die Vorgabe muss deshalb "verborgen" sein.
    it('startet mit verborgenem Stempel', () => {
        expect(emptyEventTimingForm.showManualCapture).toBe(false)
    })

    it('schickt den Stempel-Schalter bei jedem System mit', () => {
        for (const timingSystem of ['NONE', 'RACECLOCKER', 'WEBSCORER', 'INTERN'] as const) {
            const request = mapEventTimingFormToRequest({
                ...emptyEventTimingForm,
                timingSystem,
                showManualCapture: true,
            })
            expect(request.showManualCapture).toBe(true)
        }
    })

    // null vom Server heisst "noch nichts gespeichert" - das Formular zeigt dann die eingebauten
    // Vorgaben, damit die Schalter das wiedergeben, was der Bildschirm tatsaechlich anzeigt.
    it('fuellt einen fehlenden Anzeige-Block mit den Vorgaben', () => {
        const form = mapDtoToEventTimingForm({
            timingSystem: 'INTERN',
            autoPull: false,
            showManualCapture: false,
            intervalActiveSeconds: 5,
            intervalUpcomingSeconds: 60,
            watchBeforeMinutes: 15,
            watchAfterMinutes: 120,
            timingPrecision: 'ZEHNTEL',
        })

        expect(form.startDisplay).toEqual(DEFAULT_START_DISPLAY)
    })

    // ... und zurueck wird daraus wieder null. Sonst friere ein blosses Oeffnen-und-Speichern die
    // heutigen Vorgaben ein, und eine spaetere Aenderung des Standards erreichte diese Regatta
    // nicht mehr.
    it('speichert einen unangetasteten Anzeige-Block wieder als null', () => {
        const request = mapEventTimingFormToRequest({
            ...emptyEventTimingForm,
            timingSystem: 'INTERN',
        })

        expect(request.startDisplay).toBeNull()
    })

    it('speichert einen geaenderten Anzeige-Block als eigenen Wert', () => {
        const request = mapEventTimingFormToRequest({
            ...emptyEventTimingForm,
            timingSystem: 'INTERN',
            startDisplay: {...DEFAULT_START_DISPLAY, showAthleteNames: true, listScale: 1.5},
        })

        expect(request.startDisplay?.showAthleteNames).toBe(true)
        expect(request.startDisplay?.listScale).toBe(1.5)
    })

    // 0 folgende Boote heisst "nur das aktuelle Boot" und ist eine bewusste Ansage - es darf
    // nicht als "nichts eingestellt" durchfallen und wieder zu null werden.
    it('behaelt null folgende Boote als eigenen Wert', () => {
        const request = mapEventTimingFormToRequest({
            ...emptyEventTimingForm,
            timingSystem: 'INTERN',
            startDisplay: {...DEFAULT_START_DISPLAY, followingCount: 0},
        })

        expect(request.startDisplay?.followingCount).toBe(0)
    })
})
