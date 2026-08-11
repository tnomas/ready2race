import {describe, expect, it} from 'vitest'
import {
    EventOperationWindow,
    isOperating,
    parseEventDay,
    splitEventsByOperation,
} from './eventOperations'

/** Eine Veranstaltung, reduziert auf das, was für das Fenster zählt. */
const evt = (
    name: string,
    operationsStartsAt: string | undefined,
    lastEventDay: string | undefined,
): EventOperationWindow & {name: string} => ({name, operationsStartsAt, lastEventDay})

const at = (iso: string) => new Date(iso)

describe('isOperating', () => {
    it('zählt eine Veranstaltung ab dem Betriebsbeginn', () => {
        const e = evt('Regatta', '2026-08-14T07:00:00', '2026-08-16')

        expect(isOperating(e, at('2026-08-14T06:59:00'))).toBe(false)
        expect(isOperating(e, at('2026-08-14T07:00:00'))).toBe(true)
    })

    /** Der Fall, für den das Feld am Tag und nicht an der Veranstaltung hängt. */
    it('lässt einen Betriebsbeginn am Vorabend des ersten Tages gelten', () => {
        const e = evt('Regatta', '2026-08-13T18:00:00', '2026-08-16')

        expect(isOperating(e, at('2026-08-13T19:30:00'))).toBe(true)
    })

    it('hält die Veranstaltung bis zum Ende des letzten Tages offen', () => {
        const e = evt('Regatta', '2026-08-14T07:00:00', '2026-08-16')

        expect(isOperating(e, at('2026-08-16T23:59:00'))).toBe(true)
        expect(isOperating(e, at('2026-08-17T00:00:00'))).toBe(false)
    })

    /**
     * Ein einziges Fenster über die ganze Regatta, kein Fenster je Tag: Wer abends zwischen zwei
     * Renntagen noch Bänder zuordnet, darf nicht ausgesperrt werden.
     */
    it('bleibt zwischen zwei Renntagen nachts offen', () => {
        const e = evt('Regatta', '2026-08-14T07:00:00', '2026-08-16')

        expect(isOperating(e, at('2026-08-15T02:30:00'))).toBe(true)
    })

    it('zählt eine Veranstaltung ohne Tage nie als im Betrieb', () => {
        expect(isOperating(evt('Ohne Tage', undefined, undefined), at('2026-08-14T09:00:00'))).toBe(
            false,
        )
        expect(
            isOperating(evt('Halb', '2026-08-14T07:00:00', undefined), at('2026-08-14T09:00:00')),
        ).toBe(false)
    })

    it('zählt eine vergangene Veranstaltung nicht mehr', () => {
        const e = evt('DM 2025', '2025-08-15T07:00:00', '2025-08-17')

        expect(isOperating(e, at('2026-08-11T09:00:00'))).toBe(false)
    })
})

describe('splitEventsByOperation', () => {
    const laufend = evt('Läuft', '2026-08-10T07:00:00', '2026-08-12')
    const laufendSpaeter = evt('Läuft auch', '2026-08-11T06:00:00', '2026-08-13')
    const alt = evt('DM 2025', '2025-08-15T07:00:00', '2025-08-17')
    const kuenftig = evt('Herbst', '2026-10-01T07:00:00', '2026-10-02')

    it('trennt laufende von den übrigen Veranstaltungen', () => {
        const {operating, others} = splitEventsByOperation(
            [alt, laufend, kuenftig],
            at('2026-08-11T09:00:00'),
        )

        expect(operating.map(e => e.name)).toEqual(['Läuft'])
        expect(others.map(e => e.name)).toEqual(['Herbst', 'DM 2025'])
    })

    it('sortiert die laufenden nach ihrem Beginn', () => {
        const {operating} = splitEventsByOperation(
            [laufendSpaeter, laufend],
            at('2026-08-11T09:00:00'),
        )

        expect(operating.map(e => e.name)).toEqual(['Läuft', 'Läuft auch'])
    })

    /** Die vollständige Liste ist eine Suchliste: Was zuletzt war oder als Nächstes kommt, oben. */
    it('sortiert die übrigen mit dem jüngsten Tag zuerst', () => {
        const {others} = splitEventsByOperation([alt, kuenftig], at('2026-08-11T09:00:00'))

        expect(others.map(e => e.name)).toEqual(['Herbst', 'DM 2025'])
    })

    it('stellt Veranstaltungen ohne Tage ans Ende der übrigen', () => {
        const ohne = evt('Ohne Tage', undefined, undefined)
        const {others} = splitEventsByOperation([ohne, alt], at('2026-08-11T09:00:00'))

        expect(others.map(e => e.name)).toEqual(['DM 2025', 'Ohne Tage'])
    })

    it('lässt die Eingabeliste unangetastet', () => {
        const eingabe = [alt, laufend]
        splitEventsByOperation(eingabe, at('2026-08-11T09:00:00'))

        expect(eingabe.map(e => e.name)).toEqual(['DM 2025', 'Läuft'])
    })
})

describe('parseEventDay', () => {
    it('liest ein Datum in der Zone des Geräts, nicht in UTC', () => {
        const d = parseEventDay('2026-08-14')

        expect(d).not.toBeNull()
        expect(d!.getFullYear()).toBe(2026)
        // Der Monat ist der eigentliche Prüfpunkt: `new Date(2026, 8, 14)` wäre September.
        expect(d!.getMonth()).toBe(7)
        expect(d!.getDate()).toBe(14)
        expect(d!.getHours()).toBe(0)
    })

    it('gibt null für Unbrauchbares zurück', () => {
        expect(parseEventDay('')).toBeNull()
        expect(parseEventDay('kein Datum')).toBeNull()
    })
})
