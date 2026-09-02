// Feste Szenarien der Livestream-Grafik-Galerie (siehe streamDemo.tsx): jedes Szenario ist ein
// vollständiger Szenenstand (`StreamSceneViewDto`), wie ihn der Server pushen würde — nur mit
// erfundenen Booten. Die Galerie ist der visuelle Testkatalog der Grafiken: kleine und volle
// Felder, lange Vereinsketten, DNF/Strafe/Abmeldung, vorläufige Ergebnisse, laufende und
// pausierte Uhren, und kombinierte Szenen, wie sie auf Sendung nebeneinander liegen.
import {
    AthleteBoardMatch,
    AthleteBoardParticipant,
    AthleteBoardResult,
    AthleteBoardResultTeam,
    AthleteBoardTeam,
    MatchTeamLapDto,
    PaceReferenceDto,
    StreamFinishEntry,
    StreamGraphicSize,
    StreamGraphicViewDto,
    StreamPlacement,
    StreamSceneViewDto,
} from '@api/types.gen'

export interface StreamDemoScenario {
    id: string
    title: string
    /** Was dieses Szenario prüfen soll — steht in der Galerie unter dem Titel. */
    note: string
    view: StreamSceneViewDto
}

// Zeiten wie vom Backend: lokale Zeit ohne Zone. Alles relativ zum Seitenaufruf, damit
// Countdown und Laufuhr bei jedem Öffnen live ticken.
const pad = (n: number) => n.toString().padStart(2, '0')
const localIso = (date: Date) =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
const inSeconds = (seconds: number) => localIso(new Date(Date.now() + seconds * 1000))
const atClock = (hours: number, minutes: number) => {
    const date = new Date()
    date.setHours(hours, minutes, 0, 0)
    return localIso(date)
}

const person = (name: string): AthleteBoardParticipant => ({name, role: null})

interface Boat {
    startNumber: number
    clubsShort: string
    clubsFull: string
    crew: string[]
    teamName?: string
}

const boat = (startNumber: number, clubsShort: string, clubsFull: string, crew: string[], teamName?: string): Boat => ({
    startNumber,
    clubsShort,
    clubsFull,
    crew,
    teamName,
})

// Vereine der Förde und Umgebung — Kurzform / volle Form.
const CLUBS = {
    fle: ['Flensburger RC', 'Flensburger Ruderclub von 1877'],
    kap: ['RV Kappeln', 'Ruderverein Kappeln'],
    kie: ['Kieler RV', 'Kieler Ruderverein von 1862'],
    son: ['Sønderborg RK', 'Sønderborg Roklub'],
    aab: ['Aabenraa RK', 'Aabenraa Roklub'],
    rat: ['Ratzeburger RC', 'Ratzeburger Ruderclub'],
    ham: ['Hamburger RC', 'Hamburger Ruderinnen-Club'],
    lue: ['Lübecker RG', 'Lübecker Ruder-Gesellschaft'],
    bre: ['Bremer RC Hansa', 'Bremer Ruder-Club Hansa'],
    wik: ['RG Wiking', 'Ruder-Gesellschaft Wiking Berlin'],
    teg: ['RC Tegel', 'Ruder-Club Tegel'],
    eck: ['Eckernförder RC', 'Eckernförder Ruderclub'],
    sch: ['Schleswiger RC', 'Schleswiger Ruderclub'],
    ply: ['Plön RC', 'Plöner Ruderclub'],
} as const

type ClubKey = keyof typeof CLUBS

const chain = (keys: ClubKey[]): [string, string] => [
    keys.map(key => CLUBS[key][0]).join(' / '),
    keys.map(key => CLUBS[key][1]).join(' / '),
]

const double = (startNumber: number, keys: ClubKey[], crew: string[], teamName?: string) => {
    const [short, full] = chain(keys)
    return boat(startNumber, short, full, crew, teamName)
}

/** Vier Mixed-Doppelzweier mit zwei Personen — der Normalfall eines Bands. */
const MIXED_DOUBLES: Boat[] = [
    double(1, ['fle'], ['Anna Petersen', 'Jonas Feddersen']),
    double(2, ['kie'], ['Lena Brodersen', 'Hauke Hansen']),
    double(3, ['son'], ['Mia Sørensen', 'Finn Krüger']),
    double(4, ['rat'], ['Ida Clausen', 'Timo Beck']),
]

/** Acht Vierer mit Steuerleuten, lange Vereinsketten und Renngemeinschaften — der harte Fall. */
const COXED_QUADS: Boat[] = [
    double(1, ['fle', 'kap'], ['Anna Petersen', 'Lena Brodersen', 'Mia Sørensen', 'Ida Clausen', 'St. Kim Lorenzen']),
    double(2, ['kie'], ['Eva Matthiesen', 'Maren Voss', 'Greta Lund', 'Nele Hinrichs', 'St. Jan Ohlsen']),
    double(3, ['son', 'aab'], ['Mia Sørensen', 'Freja Nielsen', 'Signe Møller', 'Line Jensen', 'St. Bo Kristensen']),
    double(4, ['ham', 'lue', 'bre'], ['Johanna Schmidt', 'Carla Weber', 'Pia Hoffmann', 'Sara Klein', 'St. Max Braun']),
    double(5, ['rat'], ['Ida Clausen', 'Merle Otto', 'Lotta Beyer', 'Nora Frank', 'St. Leon Wolf'], 'Ratzeburg II'),
    double(6, ['wik', 'teg'], ['Finja Krause', 'Emma Roth', 'Lea Schulz', 'Zoe Winter', 'St. Ben Koch']),
    double(7, ['eck', 'sch', 'fle'], ['Tine Hansen', 'Ronja Lange', 'Marit Vogt', 'Kaja Ernst', 'St. Til Berg']),
    double(8, ['ply'], ['Elin Brandt', 'Jule Peters', 'Wiebke Sander', 'Frauke Thies', 'St. Ole Marks']),
]

/** Vierzehn Einer — das große Feld für die zweispaltige Tafel. */
const SINGLES: Boat[] = [
    double(1, ['fle'], ['Anna Petersen']),
    double(2, ['kie'], ['Hauke Hansen']),
    double(3, ['son'], ['Mia Sørensen']),
    double(4, ['rat'], ['Timo Beck']),
    double(5, ['ham'], ['Johanna Schmidt']),
    double(6, ['lue'], ['Carla Weber']),
    double(7, ['bre'], ['Pia Hoffmann']),
    double(8, ['wik'], ['Finja Krause']),
    double(9, ['teg'], ['Ben Koch']),
    double(10, ['eck'], ['Tine Hansen']),
    double(11, ['sch'], ['Ronja Lange']),
    double(12, ['ply'], ['Elin Brandt']),
    double(13, ['aab'], ['Freja Nielsen']),
    double(14, ['kap'], ['Lena Brodersen']),
]

const toTeam = (b: Boat, extra: Partial<AthleteBoardTeam> = {}): AthleteBoardTeam => ({
    startNumber: b.startNumber,
    teamNumber: null,
    clubsShort: b.clubsShort,
    clubsFull: b.clubsFull,
    teamName: b.teamName ?? null,
    participants: b.crew.map(person),
    place: null,
    timeString: null,
    penaltySeconds: null,
    penaltyNote: null,
    failed: false,
    failedReason: null,
    deregistered: false,
    deregisteredReason: null,
    laps: [],
    ...extra,
})

interface ResultSpec {
    place?: number | null
    time?: string | null
    penalty?: number
    penaltyNote?: string
    failed?: string
    deregistered?: string
}

const toResultTeam = (b: Boat, spec: ResultSpec): AthleteBoardResultTeam => ({
    place: spec.place ?? null,
    ratingCategory: null,
    categoryPlace: spec.place ?? null,
    startNumber: b.startNumber,
    teamNumber: null,
    clubsShort: b.clubsShort,
    clubsFull: b.clubsFull,
    teamName: b.teamName ?? null,
    timeString: spec.time ?? null,
    penaltySeconds: spec.penalty ?? null,
    penaltyNote: spec.penaltyNote ?? null,
    failed: spec.failed != null,
    failedReason: spec.failed ?? null,
    deregistered: spec.deregistered != null,
    deregisteredReason: spec.deregistered ?? null,
    laps: [],
    participants: b.crew.map(person),
})

interface CompetitionSpec {
    name: string
    shortName: string
    roundName?: string | null
    matchName?: string | null
    startTime?: string | null
}

const COMPETITIONS = {
    mix2x: {name: 'Coastal Mixed Doppelzweier', shortName: 'CMix2x', roundName: 'Finale A', matchName: 'Finale A'},
    w4x: {
        name: 'Coastal Frauen Vierer mit Steuerfrau',
        shortName: 'CW4x+',
        roundName: 'Vorlauf',
        matchName: 'Lauf 2',
    },
    m1x: {name: 'Coastal Männer Einer', shortName: 'CM1x', roundName: 'Zeitfahren', matchName: 'Welle 1'},
    m2x: {name: 'Coastal Männer Doppelzweier', shortName: 'CM2x', roundName: 'Halbfinale', matchName: 'Lauf 1'},
} satisfies Record<string, CompetitionSpec>

const PACE_500: PaceReferenceDto = {id: 'pace-500', name: 'Zeit je 500 m', mode: 'TIME_PER_DISTANCE', referenceMeters: 500}

const match = (
    competition: CompetitionSpec,
    teams: AthleteBoardTeam[],
    extra: Partial<AthleteBoardMatch> = {},
): AthleteBoardMatch => ({
    matchId: `demo-${competition.shortName}-${competition.matchName ?? 'x'}`,
    competitionName: competition.name,
    competitionShortName: competition.shortName,
    categoryName: null,
    roundName: competition.roundName ?? null,
    matchName: competition.matchName ?? null,
    startTime: competition.startTime ?? null,
    actualStartTime: null,
    state: 'PREPARING',
    startState: 'SCHEDULED',
    teams,
    pendingRound: false,
    name: null,
    cancelled: false,
    paceReference: PACE_500,
    ...extra,
})

const result = (
    competition: CompetitionSpec,
    teams: AthleteBoardResultTeam[],
    clarification = false,
): AthleteBoardResult => ({
    matchId: `demo-${competition.shortName}-result`,
    competitionName: competition.name,
    competitionShortName: competition.shortName,
    categoryName: null,
    roundName: competition.roundName ?? null,
    matchName: competition.matchName ?? null,
    startTime: null,
    actualStartTime: null,
    clarification,
    teams,
    paceReference: PACE_500,
})

const graphic = (
    type: StreamGraphicViewDto['type'],
    placement: StreamPlacement,
    content: Partial<StreamGraphicViewDto> = {},
    size: StreamGraphicSize = 'NORMAL',
): StreamGraphicViewDto => ({
    type,
    placement,
    size,
    visible: true,
    visibleSince: null,
    visibleUntil: null,
    overrideState: 'AUTO',
    ...content,
})

const scene = (graphics: StreamGraphicViewDto[], safeAreaPercent = 3): StreamSceneViewDto => ({
    sceneId: 'demo-scene',
    background: 'TRANSPARENT',
    chromaColor: null,
    safeAreaPercent,
    trialMode: true,
    serverTime: new Date().toISOString(),
    graphics,
})

// --- Ergebnisse -----------------------------------------------------------------------------

const QUAD_RESULT: AthleteBoardResult = result(COMPETITIONS.w4x, [
    toResultTeam(COXED_QUADS[2], {place: 1, time: '17:42.6'}),
    toResultTeam(COXED_QUADS[0], {place: 2, time: '17:48.1'}),
    toResultTeam(COXED_QUADS[5], {place: 3, time: '18:03.9'}),
    toResultTeam(COXED_QUADS[1], {place: 4, time: '18:21.4', penalty: 10, penaltyNote: 'Boje berührt'}),
    toResultTeam(COXED_QUADS[3], {place: 5, time: '18:44.0'}),
    toResultTeam(COXED_QUADS[7], {place: 6, time: '19:12.7'}),
    toResultTeam(COXED_QUADS[6], {failed: 'DNF – Kenterung'}),
    toResultTeam(COXED_QUADS[4], {deregistered: 'Krankheit'}),
])

const DOUBLES_RESULT: AthleteBoardResult = result(
    COMPETITIONS.mix2x,
    [
        toResultTeam(MIXED_DOUBLES[1], {place: 1, time: '9:58.3'}),
        toResultTeam(MIXED_DOUBLES[0], {place: 2, time: '10:01.9'}),
        toResultTeam(MIXED_DOUBLES[3], {place: 3, time: '10:14.5', penalty: 10}),
        toResultTeam(MIXED_DOUBLES[2], {failed: 'DSQ'}),
    ],
    true,
)

const SINGLES_RESULT: AthleteBoardResult = result(
    COMPETITIONS.m1x,
    SINGLES.map((b, index) =>
        index === 12
            ? toResultTeam(b, {failed: 'DNS'})
            : toResultTeam(b, {
                  place: index < 12 ? index + 1 : 13,
                  time: `${12 + Math.floor(index / 4)}:${pad((index * 17) % 60)}.${index % 10}`,
              }),
    ),
)

// --- Läufe -----------------------------------------------------------------------------------

const lap = (name: string, meters: number, millis: number, secondsAgo: number): MatchTeamLapDto => {
    const minutes = Math.floor(millis / 60000)
    const seconds = Math.floor((millis % 60000) / 1000)
    const tenths = Math.floor((millis % 1000) / 100)
    return {
        name,
        timeString: `${minutes}:${pad(seconds)}.${tenths}`,
        recordedAt: inSeconds(-secondsAgo),
        lapMillis: millis,
        distanceMeters: meters,
    }
}

const RUNNING_QUADS: AthleteBoardMatch = match(
    COMPETITIONS.w4x,
    [
        toTeam(COXED_QUADS[0], {laps: [lap('Boje 1', 1500, 5 * 60000 + 48300, 40), lap('Boje 2', 3000, 11 * 60000 + 52100, 4)]}),
        toTeam(COXED_QUADS[1], {laps: [lap('Boje 1', 1500, 5 * 60000 + 51900, 38)]}),
        toTeam(COXED_QUADS[2], {laps: [lap('Boje 1', 1500, 5 * 60000 + 44700, 44), lap('Boje 2', 3000, 11 * 60000 + 47800, 9)]}),
        toTeam(COXED_QUADS[3], {laps: [lap('Boje 1', 1500, 6 * 60000 + 2400, 30)]}),
        toTeam(COXED_QUADS[4], {laps: []}),
        toTeam(COXED_QUADS[5], {laps: [lap('Boje 1', 1500, 5 * 60000 + 58000, 34)]}),
        toTeam(COXED_QUADS[6], {laps: [lap('Boje 1', 1500, 6 * 60000 + 9100, 6)]}),
        toTeam(COXED_QUADS[7], {laps: [lap('Boje 1', 1500, 6 * 60000 + 21500, 19)]}),
    ],
    {state: 'RUNNING', actualStartTime: inSeconds(-12 * 60 - 3)},
)

const FROZEN_DOUBLES: AthleteBoardMatch = match(
    COMPETITIONS.mix2x,
    [
        toTeam(MIXED_DOUBLES[1], {place: 1, timeString: '9:58.3'}),
        toTeam(MIXED_DOUBLES[0], {place: 2, timeString: '10:01.9'}),
        toTeam(MIXED_DOUBLES[3], {place: 3, timeString: '10:14.5'}),
        toTeam(MIXED_DOUBLES[2], {failed: true, failedReason: 'DSQ'}),
    ],
    {state: 'FINISHED', actualStartTime: inSeconds(-15 * 60)},
)

const FINISH_ENTRIES: StreamFinishEntry[] = [
    {rank: 1, startNumber: 3, clubsShort: COXED_QUADS[2].clubsShort, clubsFull: COXED_QUADS[2].clubsFull, timeString: '17:42.6', participants: COXED_QUADS[2].crew},
    {rank: 2, startNumber: 1, clubsShort: COXED_QUADS[0].clubsShort, clubsFull: COXED_QUADS[0].clubsFull, timeString: '17:48.1', participants: COXED_QUADS[0].crew},
    {rank: 3, startNumber: 6, clubsShort: COXED_QUADS[5].clubsShort, clubsFull: COXED_QUADS[5].clubsFull, timeString: '18:03.9', participants: COXED_QUADS[5].crew},
    {rank: 4, startNumber: 2, clubsShort: COXED_QUADS[1].clubsShort, clubsFull: COXED_QUADS[1].clubsFull, timeString: '18:11.4', participants: COXED_QUADS[1].crew},
    {rank: 5, startNumber: 4, clubsShort: COXED_QUADS[3].clubsShort, clubsFull: COXED_QUADS[3].clubsFull, timeString: '18:44.0', participants: COXED_QUADS[3].crew},
    {rank: 6, startNumber: 8, clubsShort: COXED_QUADS[7].clubsShort, clubsFull: COXED_QUADS[7].clubsFull, timeString: '19:12.7', participants: COXED_QUADS[7].crew},
    {rank: 7, startNumber: 7, clubsShort: COXED_QUADS[6].clubsShort, clubsFull: COXED_QUADS[6].clubsFull, timeString: '19:40.2', participants: COXED_QUADS[6].crew},
    {rank: 8, startNumber: 5, clubsShort: COXED_QUADS[4].clubsShort, clubsFull: COXED_QUADS[4].clubsFull, timeString: '20:05.8', participants: COXED_QUADS[4].crew},
]

const SINGLES_FINISH: StreamFinishEntry[] = SINGLES.slice(0, 10).map((b, index) => ({
    rank: index + 1,
    startNumber: b.startNumber,
    clubsShort: b.clubsShort,
    clubsFull: b.clubsFull,
    timeString: `${12 + Math.floor(index / 4)}:${pad((index * 17) % 60)}.${index % 10}`,
    participants: b.crew,
}))

// --- Tagesprogramm ---------------------------------------------------------------------------

const scheduleEntry = (
    hours: number,
    minutes: number,
    competition: CompetitionSpec,
    roundName: string,
    matchName: string,
    extra: Partial<AthleteBoardMatch> = {},
): AthleteBoardMatch =>
    match({...competition, roundName, matchName, startTime: atClock(hours, minutes)}, [], {
        matchId: `sched-${hours}-${minutes}-${competition.shortName}-${matchName}`,
        state: 'UPCOMING',
        ...extra,
    })

const SCHEDULE_SHORT: AthleteBoardMatch[] = [
    scheduleEntry(10, 30, COMPETITIONS.w4x, 'Vorlauf', 'Lauf 2'),
    scheduleEntry(10, 45, COMPETITIONS.w4x, 'Vorlauf', 'Lauf 3'),
    scheduleEntry(11, 0, COMPETITIONS.m1x, 'Zeitfahren', 'Welle 1'),
    scheduleEntry(11, 20, COMPETITIONS.m1x, 'Zeitfahren', 'Welle 2', {cancelled: true}),
    scheduleEntry(11, 40, COMPETITIONS.mix2x, 'Vorlauf', 'Lauf 1'),
    scheduleEntry(12, 0, COMPETITIONS.mix2x, 'Vorlauf', 'Lauf 2'),
    scheduleEntry(12, 30, COMPETITIONS.m2x, 'Halbfinale', 'Lauf 1'),
    scheduleEntry(12, 50, COMPETITIONS.m2x, 'Halbfinale', 'Lauf 2'),
]

const SCHEDULE_LONG: AthleteBoardMatch[] = [
    ...SCHEDULE_SHORT,
    scheduleEntry(13, 10, COMPETITIONS.mix2x, 'Pause', 'Mittagspause', {name: 'Mittagspause', pendingRound: false}),
    scheduleEntry(14, 0, COMPETITIONS.w4x, 'Finale B', 'Finale B'),
    scheduleEntry(14, 20, COMPETITIONS.w4x, 'Finale A', 'Finale A'),
    scheduleEntry(14, 40, COMPETITIONS.m1x, 'Finale', 'Finale'),
    scheduleEntry(15, 0, COMPETITIONS.mix2x, 'Finale B', 'Finale B'),
    scheduleEntry(15, 20, COMPETITIONS.mix2x, 'Finale A', 'Finale A'),
    scheduleEntry(15, 40, COMPETITIONS.m2x, 'Finale B', 'Finale B'),
    scheduleEntry(16, 0, COMPETITIONS.m2x, 'Finale A', 'Finale A'),
]

// --- Streckenbild ----------------------------------------------------------------------------

const COURSE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675">
  <rect width="1200" height="675" fill="#1b4a63"/>
  <path d="M0 520 Q300 470 600 520 T1200 520 V675 H0Z" fill="#e6d3a3"/>
  <path d="M120 380 L1080 380" stroke="#fff" stroke-width="4" stroke-dasharray="18 14"/>
  <g fill="#f5b342"><circle cx="120" cy="380" r="16"/><circle cx="600" cy="220" r="16"/><circle cx="1080" cy="380" r="16"/></g>
  <text x="600" y="120" font-family="Arial" font-size="42" fill="#fff" text-anchor="middle">Coastal-Strecke Flensburger Förde · 4 km</text>
</svg>`
const COURSE_IMAGE_URL = `data:image/svg+xml;utf8,${encodeURIComponent(COURSE_SVG)}`

// --- Szenarien -------------------------------------------------------------------------------

const preparing = (competition: CompetitionSpec, boats: Boat[]) =>
    match({...competition, startTime: atClock(10, 30)}, boats.map(b => toTeam(b)), {state: 'PREPARING'})

export const STREAM_DEMO_SCENARIOS: StreamDemoScenario[] = [
    {
        id: 'startlist-band-4',
        title: 'Startliste · Band · 4 Boote',
        note: 'Zweizeilige Bootszeilen mit Besatzung, geplante Startzeit rechts.',
        view: scene([graphic('STARTLIST', 'BOTTOM_CENTER', {match: preparing(COMPETITIONS.mix2x, MIXED_DOUBLES)})]),
    },
    {
        id: 'startlist-band-8',
        title: 'Startliste · Band · 8 Vierer',
        note: 'Einzeilige Zeilen, Renngemeinschaften mit langen Vereinsketten, Teamname, fünf Personen je Boot.',
        view: scene([graphic('STARTLIST', 'BOTTOM_CENTER', {match: preparing(COMPETITIONS.w4x, COXED_QUADS)})]),
    },
    {
        id: 'startlist-band-compact',
        title: 'Startliste · Band kompakt · unten links',
        note: 'COMPACT-Dichte, 6 Boote, am linken Rand verankert.',
        view: scene([
            graphic('STARTLIST', 'BOTTOM_LEFT', {match: preparing(COMPETITIONS.w4x, COXED_QUADS.slice(0, 6))}, 'COMPACT'),
        ]),
    },
    {
        id: 'startlist-board-8',
        title: 'Startliste · Vollbild · 8 Vierer',
        note: 'Tafel, einspaltig zweizeilig — die Obergrenze der einspaltigen Tafel.',
        view: scene([graphic('STARTLIST', 'FULL_CENTER', {match: preparing(COMPETITIONS.w4x, COXED_QUADS)})]),
    },
    {
        id: 'startlist-board-14',
        title: 'Startliste · Vollbild · 14 Einer',
        note: 'Tafel zweispaltig einzeilig — Zeitfahren-Welle mit vollem Feld.',
        view: scene([graphic('STARTLIST', 'FULL_CENTER', {match: preparing(COMPETITIONS.m1x, SINGLES)})]),
    },
    {
        id: 'result-band-4',
        title: 'Ergebnis · Band · 4 Boote · vorläufig',
        note: 'Podium, Strafe, DSQ, Rückstände; „Vorläufig“ im Kopf.',
        view: scene([graphic('RESULT', 'BOTTOM_CENTER', {result: DOUBLES_RESULT, provisional: true})]),
    },
    {
        id: 'result-band-8',
        title: 'Ergebnis · Band · 8 Vierer',
        note: 'Einzeilige Zeilen mit DNF, Abmeldung und Strafnotiz — das volle Band.',
        view: scene([graphic('RESULT', 'BOTTOM_CENTER', {result: QUAD_RESULT})]),
    },
    {
        id: 'result-board-8',
        title: 'Ergebnis · Vollbild · 8 Vierer',
        note: 'Die Vollbild-Ergebnistafel: Platzmarken, Besatzungen, Rückstand je Zeile.',
        view: scene([graphic('RESULT', 'FULL_CENTER', {result: QUAD_RESULT})]),
    },
    {
        id: 'result-board-14',
        title: 'Ergebnis · Vollbild · 14 Einer · vorläufig',
        note: 'Zweispaltige Tafel mit DNS, Klärung läuft.',
        view: scene([graphic('RESULT', 'FULL_CENTER', {result: SINGLES_RESULT, provisional: true})]),
    },
    {
        id: 'ticker-1',
        title: 'Einlauf · 1 Boot',
        note: 'Der erste Zieleinlauf — die Leiste beginnt zu wachsen.',
        view: scene([graphic('FINISH_TICKER', 'SIDE_RIGHT', {finishEntries: FINISH_ENTRIES.slice(0, 1)})]),
    },
    {
        id: 'ticker-8',
        title: 'Einlauf · 8 Boote',
        note: 'Volle Leiste mit Besatzungen und langen Vereinsketten.',
        view: scene([graphic('FINISH_TICKER', 'SIDE_RIGHT', {finishEntries: FINISH_ENTRIES})]),
    },
    {
        id: 'ticker-10-left',
        title: 'Einlauf · 10 Einer · links · kompakt',
        note: 'Am linken Rand, COMPACT — Höhe bei zehn Zeilen.',
        view: scene([graphic('FINISH_TICKER', 'SIDE_LEFT', {finishEntries: SINGLES_FINISH}, 'COMPACT')]),
    },
    {
        id: 'laps-3',
        title: 'Zwischenzeiten · 3 Marken',
        note: 'Neueste Marke links mit Akzentkante, Rang und Tempo je 500 m.',
        view: scene([graphic('LAPS', 'BOTTOM_CENTER', {match: RUNNING_QUADS})]),
    },
    {
        id: 'laps-compact',
        title: 'Zwischenzeiten · kompakt · unten rechts',
        note: 'Zwei Marken, COMPACT, rechts verankert.',
        view: scene([graphic('LAPS', 'BOTTOM_RIGHT', {match: RUNNING_QUADS}, 'COMPACT')]),
    },
    {
        id: 'clock-countdown',
        title: 'Uhr · Countdown',
        note: 'Startsequenz läuft, 1:47 bis zum Start.',
        view: scene([
            graphic('CLOCK', 'TOP_RIGHT', {
                match: preparing(COMPETITIONS.w4x, COXED_QUADS),
                sequenceStartedAt: inSeconds(-73),
                sequenceFiresAt: inSeconds(107),
            }),
        ]),
    },
    {
        id: 'clock-paused',
        title: 'Uhr · Countdown pausiert',
        note: 'Reststand eingefroren, Kante und Beschriftung in Warnfarbe.',
        view: scene([
            graphic('CLOCK', 'TOP_LEFT', {
                match: preparing(COMPETITIONS.w4x, COXED_QUADS),
                sequenceStartedAt: inSeconds(-73),
                sequenceFiresAt: inSeconds(107),
                sequencePausedAt: inSeconds(-12),
            }),
        ]),
    },
    {
        id: 'clock-running',
        title: 'Uhr · Rennzeit',
        note: 'Laufender Vierer, zwölf Minuten unterwegs.',
        view: scene([graphic('CLOCK', 'TOP_RIGHT', {match: RUNNING_QUADS})]),
    },
    {
        id: 'clock-frozen',
        title: 'Uhr · eingefroren',
        note: 'Alle Boote im Ziel — die Uhr steht auf der letzten Zielzeit.',
        view: scene([graphic('CLOCK', 'TOP_RIGHT', {match: FROZEN_DOUBLES})]),
    },
    {
        id: 'nextup',
        title: 'Als Nächstes',
        note: 'Streifen mit Wettkampf, Runde/Lauf und geplanter Startzeit.',
        view: scene([graphic('NEXT_UP', 'BOTTOM_CENTER', {match: preparing(COMPETITIONS.w4x, COXED_QUADS)})]),
    },
    {
        id: 'nextup-long',
        title: 'Als Nächstes · langer Name · kompakt',
        note: 'Ohne Kürzel fällt der volle Wettkampfname an — Ellipse statt Umbruch.',
        view: scene([
            graphic(
                'NEXT_UP',
                'BOTTOM_LEFT',
                {
                    match: match(
                        {
                            ...COMPETITIONS.w4x,
                            shortName: '',
                            name: 'Coastal Frauen Vierer mit Steuerfrau Masters C/D Hochschulwertung',
                            startTime: atClock(14, 20),
                        },
                        [],
                    ),
                },
                'COMPACT',
            ),
        ]),
    },
    {
        id: 'schedule-8',
        title: 'Tagesprogramm · 8 Läufe',
        note: 'Einspaltige Tafel, nächster Lauf hervorgehoben, ein Ausfall.',
        view: scene([graphic('SCHEDULE', 'FULL_CENTER', {schedule: SCHEDULE_SHORT})]),
    },
    {
        id: 'schedule-16',
        title: 'Tagesprogramm · 16 Zeilen',
        note: 'Zweispaltig, mit Mittagspause als Programmpunkt.',
        view: scene([graphic('SCHEDULE', 'FULL_CENTER', {schedule: SCHEDULE_LONG})]),
    },
    {
        id: 'course-image',
        title: 'Streckenbild',
        note: 'Eingepasstes Bild mit Kennzeichen in der Ecke.',
        view: scene([graphic('COURSE_IMAGE', 'FULL_CENTER', {imageUrl: COURSE_IMAGE_URL})]),
    },
    {
        id: 'onair-prestart',
        title: 'Auf Sendung · vor dem Start',
        note: 'Countdown oben rechts, Startliste unten — die typische Szene vor dem Startschuss.',
        view: scene([
            graphic('CLOCK', 'TOP_RIGHT', {
                match: preparing(COMPETITIONS.w4x, COXED_QUADS),
                sequenceStartedAt: inSeconds(-73),
                sequenceFiresAt: inSeconds(107),
            }),
            graphic('STARTLIST', 'BOTTOM_CENTER', {match: preparing(COMPETITIONS.w4x, COXED_QUADS)}),
        ]),
    },
    {
        id: 'onair-race',
        title: 'Auf Sendung · im Rennen',
        note: 'Laufuhr, Zwischenzeiten-Band und wachsender Einlauf gleichzeitig.',
        view: scene([
            graphic('CLOCK', 'TOP_RIGHT', {match: RUNNING_QUADS}),
            graphic('LAPS', 'BOTTOM_CENTER', {match: RUNNING_QUADS}),
            graphic('FINISH_TICKER', 'SIDE_RIGHT', {finishEntries: FINISH_ENTRIES.slice(0, 3)}),
        ]),
    },
    {
        id: 'onair-result',
        title: 'Auf Sendung · Ergebnis',
        note: 'Eingefrorene Uhr und Vollbild-Ergebnistafel nach dem Lauf.',
        view: scene([
            graphic('CLOCK', 'TOP_RIGHT', {match: FROZEN_DOUBLES}),
            graphic('RESULT', 'FULL_CENTER', {result: DOUBLES_RESULT, provisional: true}),
        ]),
    },
    {
        id: 'onair-between',
        title: 'Auf Sendung · zwischen den Läufen',
        note: 'Ergebnis-Band und „Als Nächstes“ liegen sich nie auf demselben Platz — hier unten links und rechts.',
        view: scene([
            graphic('RESULT', 'BOTTOM_LEFT', {result: DOUBLES_RESULT}, 'COMPACT'),
            graphic('NEXT_UP', 'BOTTOM_RIGHT', {match: preparing(COMPETITIONS.w4x, COXED_QUADS)}, 'COMPACT'),
        ]),
    },
    {
        id: 'safe-area-10',
        title: 'Sicherheitsbereich 10 %',
        note: 'Alle Eckplätze belegt bei großem Sicherheitsrand — nichts darf den Rand überschreiten.',
        view: scene(
            [
                graphic('CLOCK', 'TOP_LEFT', {match: RUNNING_QUADS}),
                graphic('FINISH_TICKER', 'SIDE_RIGHT', {finishEntries: FINISH_ENTRIES.slice(0, 4)}),
                graphic('LAPS', 'BOTTOM_CENTER', {match: RUNNING_QUADS}),
            ],
            10,
        ),
    },
]

export const findStreamDemoScenario = (id: string | null): StreamDemoScenario =>
    STREAM_DEMO_SCENARIOS.find(scenario => scenario.id === id) ?? STREAM_DEMO_SCENARIOS[0]
