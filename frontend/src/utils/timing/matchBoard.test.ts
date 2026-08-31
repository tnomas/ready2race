import {describe, expect, it} from 'vitest'
import {
    CreateSequenceRequest,
    TimingMatchDto,
    TimingMatchTeamDto,
    TimingModeDto,
} from '@api/types.gen.ts'
import {
    compactScheduleTitle,
    expectedFinishMatches,
    modeChipParts,
    pendingAssignmentMark,
    resolveStartSelection,
    sequenceRequestFromMode,
    startSelectionFor,
    startSequenceOffByMode,
} from './matchBoard.ts'
import {DEFAULT_CAPTURE_TONE, DEFAULT_FALSE_START_SEQUENCE} from './tonePlan.ts'

const eventId = '00000000-0000-0000-0000-00000000000e'

const mode = (overrides: Partial<TimingModeDto> = {}): TimingModeDto => ({
    id: '00000000-0000-0000-0000-0000000000aa',
    event: eventId,
    name: 'Timetrial 30s',
    // Vorgabe wie in der Datenbank: der Fehlstart-Rückruf ist erlaubt, solange er nicht am
    // Zeitnahmetyp abgeschaltet wurde.
    falseStartEnabled: true,
    startGrouping: 'EINZEL',
    intervalSeconds: 30,
    leadInSeconds: 10,
    // Vorgaben wie in der Datenbank: Die App startet den Lauf, und die Boote hängen an 1-6.
    startSequenceEnabled: true,
    boatKeysPrimary: '123456',
    // Der aufgelöste Ton-Satz reist seit dem 26.08.2026 an jedem Typ mit; hier die eingebauten
    // Standardtöne, wie sie eine Veranstaltung ohne eigene Sätze bekommt.
    resolvedToneSet: {
        sequenceTonePlan: null,
        splitTone: {...DEFAULT_CAPTURE_TONE},
        falseStartTone: [...DEFAULT_FALSE_START_SEQUENCE],
        finishTone: {...DEFAULT_CAPTURE_TONE},
        tonePerBoat: true,
    },
    ...overrides,
})

const team = (
    startNumber: number,
    overrides: Partial<TimingMatchTeamDto> = {},
): TimingMatchTeamDto => ({
    competitionMatchTeam: `00000000-0000-0000-0000-0000000000${String(10 + startNumber)}`,
    startNumber,
    teamName: `Boot ${startNumber}`,
    started: false,
    finished: false,
    ...overrides,
})

/**
 * Die Anfrage der Fälle, die eine erwarten: `sequenceRequestFromMode` liefert seit dem
 * Startsequenz-Schalter `undefined`, wenn der Typ die Sequenz abschaltet — die übrigen Prüfungen
 * sollen daran nicht vorbeilaufen, sondern scheitern.
 */
const requireRequest = (
    stationId: string,
    timingMode: TimingModeDto,
    teams: TimingMatchTeamDto[],
): CreateSequenceRequest => {
    const request = sequenceRequestFromMode(stationId, timingMode, teams)
    if (request === undefined) throw new Error('erwartete eine Sequenz-Anfrage')
    return request
}

const match = (
    id: string,
    progress: TimingMatchDto['progress'],
    overrides: Partial<TimingMatchDto> = {},
): TimingMatchDto => ({
    competitionSetupMatch: id,
    competition: '00000000-0000-0000-0000-0000000000c1',
    round: '00000000-0000-0000-0000-0000000000d1',
    phase: 'OPEN',
    progress,
    teams: [team(1), team(2)],
    ...overrides,
})

describe('sequenceRequestFromMode', () => {
    const station = '00000000-0000-0000-0000-0000000000f1'

    it('leitet aus einem Intervall-Typ eine INTERVAL-Sequenz mit Millisekunden ab', () => {
        const request = requireRequest(station, mode({intervalSeconds: 30}), [team(1), team(2)])

        expect(request.mode).toBe('INTERVAL')
        expect(request.intervalMillis).toBe(30000)
    })

    it('leitet aus einem Typ ohne Intervall (Start von Hand) eine MASS-Sequenz ab', () => {
        const request = requireRequest(station, mode({intervalSeconds: null}), [team(1)])

        expect(request.mode).toBe('MASS')
        expect(request.intervalMillis).toBeUndefined()
    })

    it('übersetzt den Countdown-Vorlauf in Millisekunden', () => {
        const request = requireRequest(station, mode({leadInSeconds: 45}), [team(1)])

        expect(request.leadInMillis).toBe(45000)
    })

    it('ordnet die Teams nach Startnummer, egal wie sie geliefert wurden', () => {
        const request = requireRequest(station, mode(), [team(3), team(1), team(2)])

        expect(request.teams).toEqual([
            team(1).competitionMatchTeam,
            team(2).competitionMatchTeam,
            team(3).competitionMatchTeam,
        ])
    })

    it('trägt den Posten in die Anfrage ein', () => {
        const request = requireRequest(station, mode(), [team(1)])

        expect(request.station).toBe(station)
    })

    it('lässt Teams weg, die bereits gestartet sind', () => {
        // Nachzügler-Fall: eine Partie wurde teilweise gestartet (Sequenz abgebrochen), der
        // zweite Griff darf die schon gestarteten Boote nicht erneut in den Countdown stellen.
        const request = requireRequest(station, mode(), [team(1, {started: true}), team(2)])

        expect(request.teams).toEqual([team(2).competitionMatchTeam])
    })

    it('liefert für einen Typ ohne Startsequenz gar keine Anfrage', () => {
        // Der Schalter am Zeitnahmetyp: Diese Läufe werden am Steg von Hand losgeschickt, ein
        // Countdown-Fenster gibt es für sie nicht. Die Regel sitzt hier, weil dies der einzige Weg
        // ist, aus einem Typ eine Sequenz-Anfrage zu machen — der gesperrte Knopf des Start-Boards
        // ist Bedienhilfe, nicht die Regel.
        expect(
            sequenceRequestFromMode(station, mode({startSequenceEnabled: false}), [
                team(1),
                team(2),
            ]),
        ).toBeUndefined()
    })
})

describe('startSequenceOffByMode', () => {
    it('sperrt einen Typ, der die Startsequenz abschaltet', () => {
        expect(startSequenceOffByMode(mode({startSequenceEnabled: false}))).toBe(true)
    })

    it('lässt einen Typ mit eingeschalteter Startsequenz durch', () => {
        expect(startSequenceOffByMode(mode({startSequenceEnabled: true}))).toBe(false)
    })

    it('sperrt ohne Zeitnahmetyp nicht', () => {
        // Kein Typ heißt nicht „gesperrt": Die Vorgabe ist „Startsequenz an", also hat niemand
        // etwas verboten — dieselbe Randentscheidung wie auf dem Server.
        expect(startSequenceOffByMode(null)).toBe(false)
        expect(startSequenceOffByMode(undefined)).toBe(false)
    })
})

describe('resolveStartSelection', () => {
    const matches = [
        match('m1', 'FINISHED'),
        match('m2', 'STARTED'),
        match('m3', 'OPEN'),
        match('m4', 'OPEN'),
    ]

    it('wählt ohne Vorauswahl die erste offene Partie', () => {
        expect(resolveStartSelection(matches, undefined)).toBe('m3')
    })

    it('behält eine von Hand gewählte Partie, solange sie offen ist', () => {
        expect(resolveStartSelection(matches, {matchId: 'm4', pinned: false})).toBe('m4')
    })

    it('rückt vor, sobald die gewählte Partie nicht mehr offen ist', () => {
        // Das ist das Vorrücken nach einem Start: m3 wird STARTING/STARTED, die Auswahl
        // springt auf die nächste offene Partie.
        const advanced = [
            match('m1', 'FINISHED'),
            match('m2', 'STARTED'),
            match('m3', 'STARTING'),
            match('m4', 'OPEN'),
        ]
        expect(resolveStartSelection(advanced, {matchId: 'm3', pinned: false})).toBe('m4')
    })

    it('hält eine angepinnte (zum Ansehen angeklickte) gestartete Partie im Fokus', () => {
        // Der Bugfall vom Wasser: Sequenz gestartet, der Posten klickt den laufenden Lauf an —
        // vorher verpuffte der Klick, weil die Auswahl nur OPEN durchließ.
        expect(resolveStartSelection(matches, {matchId: 'm2', pinned: true})).toBe('m2')
    })

    it('hält auch eine angepinnte fertige Partie im Fokus', () => {
        expect(resolveStartSelection(matches, {matchId: 'm1', pinned: true})).toBe('m1')
    })

    it('fällt auf die erste offene Partie zurück, wenn die angepinnte verschwindet', () => {
        expect(resolveStartSelection(matches, {matchId: 'weg', pinned: true})).toBe('m3')
    })

    it('liefert undefined, wenn keine Partie mehr offen ist', () => {
        const done = [match('m1', 'FINISHED'), match('m2', 'STARTED')]
        expect(resolveStartSelection(done, {matchId: 'm1', pinned: false})).toBeUndefined()
    })

    it('liefert undefined für eine leere Liste', () => {
        expect(resolveStartSelection([], undefined)).toBeUndefined()
    })
})

describe('startSelectionFor', () => {
    const matches = [match('m1', 'STARTED'), match('m2', 'OPEN')]

    it('klick auf eine offene Partie ist die Absicht „starten" (nicht angepinnt)', () => {
        expect(startSelectionFor(matches, 'm2')).toEqual({matchId: 'm2', pinned: false})
    })

    it('klick auf eine gestartete Partie ist die Absicht „ansehen" (angepinnt)', () => {
        expect(startSelectionFor(matches, 'm1')).toEqual({matchId: 'm1', pinned: true})
    })

    it('liefert undefined für eine unbekannte Partie', () => {
        expect(startSelectionFor(matches, 'weg')).toBeUndefined()
    })
})

describe('expectedFinishMatches', () => {
    it('liefert Partien auf dem Wasser (gestartet oder im Startvorgang)', () => {
        const result = expectedFinishMatches([
            match('m1', 'FINISHED'),
            match('m2', 'STARTED'),
            match('m3', 'STARTING'),
            match('m4', 'OPEN'),
        ])

        expect(result.current.map(m => m.competitionSetupMatch)).toEqual(['m2', 'm3'])
    })

    it('zeigt als Vorschau die nächste offene Partie, wenn nichts auf dem Wasser ist', () => {
        const result = expectedFinishMatches([match('m1', 'FINISHED'), match('m2', 'OPEN')])

        expect(result.current).toEqual([])
        expect(result.upcoming?.competitionSetupMatch).toBe('m2')
    })

    it('nennt keine Vorschau, solange Partien auf dem Wasser sind', () => {
        const result = expectedFinishMatches([match('m1', 'STARTED'), match('m2', 'OPEN')])

        expect(result.upcoming).toBeUndefined()
    })

    it('nimmt die fokussierte Partie zusätzlich auf, auch wenn sie nicht auf dem Wasser ist', () => {
        // Zielzeiten ohne Start: eine per Klick fokussierte offene Partie muss in der
        // Arbeitsfläche erscheinen, damit ihre Boots-Knöpfe und Tasten bedienbar sind.
        const result = expectedFinishMatches(
            [match('m1', 'STARTED'), match('m2', 'OPEN'), match('m3', 'OPEN')],
            'm2',
        )

        expect(result.current.map(m => m.competitionSetupMatch)).toEqual(['m1', 'm2'])
        expect(result.upcoming).toBeUndefined()
    })

    it('dupliziert die fokussierte Partie nicht, wenn sie ohnehin auf dem Wasser ist', () => {
        const result = expectedFinishMatches([match('m1', 'STARTED'), match('m2', 'OPEN')], 'm1')

        expect(result.current.map(m => m.competitionSetupMatch)).toEqual(['m1'])
    })

    it('zeigt eine fokussierte offene Partie statt der Vorschau', () => {
        // Die fokussierte Partie IST die Arbeitsfläche — eine zusätzliche Vorschau daneben
        // würde nur um Aufmerksamkeit konkurrieren.
        const result = expectedFinishMatches([match('m1', 'FINISHED'), match('m2', 'OPEN')], 'm2')

        expect(result.current.map(m => m.competitionSetupMatch)).toEqual(['m2'])
        expect(result.upcoming).toBeUndefined()
    })
})

describe('compactScheduleTitle', () => {
    it('nutzt Kennung und Kürzel, wenn das Kürzel gepflegt ist', () => {
        expect(
            compactScheduleTitle({
                competitionIdentifier: '17',
                competitionShortName: 'CM 4x+',
                competitionName: 'Coastal Mixed Doppelvierer mit Steuermann',
                roundName: 'Finale',
                matchName: 'A',
            }),
        ).toBe('17 CM 4x+ · Finale A')
    })

    it('fällt ohne Kürzel auf den vollen Wettkampfnamen zurück', () => {
        expect(
            compactScheduleTitle({
                competitionIdentifier: '17',
                competitionShortName: null,
                competitionName: 'Coastal Mixed Doppelvierer',
                roundName: 'Finale',
            }),
        ).toBe('17 Coastal Mixed Doppelvierer · Finale')
    })

    it('lässt fehlende Teile weg, statt leere Trenner zu zeigen', () => {
        expect(
            compactScheduleTitle({
                competitionShortName: 'JM 2x',
                matchName: 'Lauf 3',
            }),
        ).toBe('JM 2x · Lauf 3')
        expect(compactScheduleTitle({competitionIdentifier: '4'})).toBe('4')
    })
})

describe('pendingAssignmentMark', () => {
    const mark = (
        id: string,
        timestampMillis: number,
        overrides: Partial<Parameters<typeof pendingAssignmentMark>[0][number]> = {},
    ) => ({
        id,
        event: eventId,
        station: '00000000-0000-0000-0000-0000000000f2',
        timestampMillis,
        source: 'APP_USER' as const,
        status: 'ACTIVE' as const,
        ...overrides,
    })

    it('wählt die älteste unzugeordnete Marke — Boote laufen in Reihenfolge ein', () => {
        const result = pendingAssignmentMark(
            [mark('a', 3000), mark('b', 1000), mark('c', 2000)],
            new Set(),
        )

        expect(result?.id).toBe('b')
    })

    it('übergeht zugeordnete, zurückgezogene und noch nicht gespeicherte Marken', () => {
        const result = pendingAssignmentMark(
            [
                mark('assigned', 1000, {assignedTeam: 'team-1'}),
                mark('retracted', 2000, {status: 'RETRACTED'}),
                mark('pending', 3000, {pending: true}),
                mark('failed', 4000, {failed: true}),
                mark('free', 5000),
            ],
            new Set(),
        )

        expect(result?.id).toBe('free')
    })

    it('übergeht beiseitegelegte Marken', () => {
        // Der Bediener hat die Zuordnung dieser Zeit bewusst vertagt (z.B. unbekanntes Boot);
        // sie bleibt in der Liste, drängt sich aber nicht mehr als „jetzt zuordnen" auf.
        const result = pendingAssignmentMark([mark('a', 1000), mark('b', 2000)], new Set(['a']))

        expect(result?.id).toBe('b')
    })

    it('liefert undefined, wenn nichts zuzuordnen ist', () => {
        expect(pendingAssignmentMark([], new Set())).toBeUndefined()
    })
})

describe('modeChipParts', () => {
    it('nennt Name und Intervall eines Timetrial-Typs', () => {
        expect(modeChipParts(mode({name: 'Timetrial', intervalSeconds: 30}))).toEqual({
            name: 'Timetrial',
            intervalSeconds: 30,
            startGrouping: 'EINZEL',
        })
    })

    it('kennzeichnet einen Typ ohne Intervall als Handstart', () => {
        expect(modeChipParts(mode({intervalSeconds: null})).intervalSeconds).toBeNull()
    })
})
