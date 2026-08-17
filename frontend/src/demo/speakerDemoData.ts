// Demo data for the standalone speaker board preview (see vite.demo.config.ts).
// Start times are generated relative to page load, so the board always shows a
// plausible regatta day around the current time: a few races rowed, one on the
// water, the rest ahead.

type DemoParticipant = {
    participantId: string
    firstName: string
    lastName: string
    namedRole: string | null
    year: number
    gender: string
}

const p = (
    id: string,
    first: string,
    last: string,
    year: number,
    role?: string,
): DemoParticipant => ({
    participantId: id,
    firstName: first,
    lastName: last,
    namedRole: role ?? null,
    year,
    gender: 'F',
})

const anna = p('anna', 'Anna', 'Petersen', 1996)
const lena = p('lena', 'Lena', 'Brodersen', 1999)
const mia = p('mia', 'Mia', 'Sørensen', 2001)
const jonas = p('jonas', 'Jonas', 'Feddersen', 1988)
const hauke = p('hauke', 'Hauke', 'Hansen', 1992)
const ida = p('ida', 'Ida', 'Clausen', 2003)
const kim = p('kim', 'Kim', 'Lorenzen', 1995)
const eva = p('eva', 'Eva', 'Matthiesen', 1990)
const finn = p('finn', 'Finn', 'Krüger', 1998)
const maren = p('maren', 'Maren', 'Voss', 1993)
const timo = p('timo', 'Timo', 'Beck', 2002)
const rike = p('rike', 'Rike', 'Storm', 1996)
const jule = p('jule', 'Jule', 'Martens', 2008)
const arne = p('arne', 'Arne', 'Wulf', 1987)
const bo = p('bo', 'Bo', 'Nielsen', 1989)
const gesa = p('gesa', 'Gesa', 'Paulsen', 1999)
const inke = p('inke', 'Inke', 'Johannsen', 1997)
const ole = p('ole', 'Ole', 'Thomsen', 1994)
const nils = p('nils', 'Nils', 'Jacobsen', 1997)
const sven = p('sven', 'Sven', 'Bahnsen', 1991)
const karen = p('karen', 'Karen', 'Iversen', 1994)
const lis = p('lis', 'Lis', 'Holm', 1992)
const thea = p('thea', 'Thea', 'Nissen', 2007)
const mads = p('mads', 'Mads', 'Skov', 1993)
const erik = p('erik', 'Erik', 'Rohde', 1990)
const meike = p('meike', 'Meike', 'Carstens', 1995, 'Steuerfrau')
const joerg = p('joerg', 'Jörg', 'Bahr', 1985, 'Steuermann')
const pia = p('pia', 'Pia', 'Lund', 2000, 'Steuerfrau')

type DemoTeam = {
    id: string
    club: string
    startNumber: number
    crew: DemoParticipant[]
    place?: number
    time?: string
    failed?: boolean
    failedReason?: string
    deregistered?: boolean
    deregisteredReason?: string
}

type DemoRace = {
    id: string
    /** minutes relative to page load */
    offset: number
    competition: string
    category: string
    matchName: string
    roundName: string
    teams: DemoTeam[]
}

const DEMO_EVENT = {
    id: 'demo',
    name: 'Fördewoche Coastal Regatta',
    description: 'Demo-Veranstaltung des Sprecher-Boards',
    published: true,
}

export const DEMO_EVENT_ID = DEMO_EVENT.id

/** Races that count as "currently on the water". */
const RUNNING_IDS = ['r5']

const RACES: DemoRace[] = [
    {
        id: 'r1',
        offset: -195,
        competition: 'Coastal Solo W1x',
        category: 'Frauen',
        matchName: 'Rennen 1',
        roundName: 'Vorlauf',
        teams: [
            {id: 't1', club: 'RC Flensburg', startNumber: 1, crew: [anna], place: 1, time: '24:31.2'},
            {id: 't2', club: 'Kieler RV', startNumber: 2, crew: [lena], place: 2, time: '24:55.0'},
            {id: 't3', club: 'RG Eckernförde', startNumber: 3, crew: [mia], place: 3, time: '25:12.8'},
            {id: 't4', club: 'RV Sønderborg', startNumber: 4, crew: [ida], place: 4, time: '26:01.4'},
            {id: 't5', club: 'RV Aabenraa', startNumber: 5, crew: [jule], place: 5, time: '27:44.9'},
        ],
    },
    {
        id: 'r2',
        offset: -150,
        competition: 'Coastal Doppelzweier M2x',
        category: 'Männer',
        matchName: 'Rennen 2',
        roundName: 'Vorlauf',
        teams: [
            {id: 't6', club: 'RC Flensburg', startNumber: 1, crew: [jonas, hauke], place: 1, time: '22:44.7'},
            {id: 't7', club: 'Kieler RV', startNumber: 2, crew: [kim, ole], place: 2, time: '23:02.1'},
            {id: 't8', club: 'RV Aabenraa', startNumber: 3, crew: [nils, sven], failed: true, failedReason: 'DNF'},
            {id: 't9', club: 'RG Eckernförde', startNumber: 4, crew: [finn, timo], place: 3, time: '23:48.6'},
        ],
    },
    {
        id: 'r3',
        offset: -95,
        competition: 'Coastal Solo M1x',
        category: 'Männer',
        matchName: 'Rennen 3',
        roundName: 'Vorlauf',
        teams: [
            {id: 't10', club: 'RV Aabenraa', startNumber: 1, crew: [bo], place: 1, time: '25:18.0'},
            {id: 't11', club: 'RC Flensburg', startNumber: 2, crew: [arne], place: 2, time: '25:39.3'},
            {id: 't12', club: 'Kieler RV', startNumber: 3, crew: [timo], place: 3, time: '26:07.7'},
            {
                id: 't13',
                club: 'RV Sønderborg',
                startNumber: 4,
                crew: [ole],
                deregistered: true,
                deregisteredReason: 'Abgemeldet',
            },
        ],
    },
    {
        id: 'r4',
        offset: -48,
        competition: 'Coastal Doppelzweier W2x',
        category: 'Frauen',
        matchName: 'Rennen 4',
        roundName: 'Vorlauf',
        teams: [
            {id: 't14', club: 'Kieler RV', startNumber: 1, crew: [lena, rike], place: 1, time: '23:55.9'},
            {id: 't15', club: 'RG Eckernförde', startNumber: 2, crew: [mia, maren], place: 2, time: '24:12.2'},
            {id: 't16', club: 'RV Sønderborg', startNumber: 3, crew: [karen, lis], place: 3, time: '24:58.4'},
        ],
    },
    {
        id: 'r5',
        offset: -11,
        competition: 'Coastal Mixed C4x+',
        category: 'Mixed',
        matchName: 'Rennen 5',
        roundName: 'Vorlauf',
        teams: [
            {id: 't17', club: 'RC Flensburg', startNumber: 1, crew: [anna, jonas, eva, hauke, pia]},
            {id: 't18', club: 'RG Eckernförde', startNumber: 2, crew: [mia, ida, finn, maren, joerg]},
            {id: 't19', club: 'Kieler RV', startNumber: 3, crew: [lena, kim, timo, rike, meike]},
            {id: 't20', club: 'RV Aabenraa', startNumber: 4, crew: [nils, sven, karen, lis, joerg]},
        ],
    },
    {
        id: 'r6',
        offset: 22,
        competition: 'Coastal Solo W1x Junioren',
        category: 'U19',
        matchName: 'Rennen 6',
        roundName: 'Vorlauf',
        teams: [
            {id: 't21', club: 'RG Eckernförde', startNumber: 1, crew: [ida]},
            {id: 't22', club: 'Kieler RV', startNumber: 2, crew: [jule]},
            {id: 't23', club: 'RV Sønderborg', startNumber: 3, crew: [thea]},
        ],
    },
    {
        id: 'r7',
        offset: 38,
        competition: 'Coastal Doppelvierer W4x+',
        category: 'Frauen',
        matchName: 'Rennen 7',
        roundName: 'Vorlauf',
        teams: [
            {id: 't24', club: 'RC Flensburg', startNumber: 1, crew: [anna, eva, gesa, inke, pia]},
            {id: 't25', club: 'Kieler RV', startNumber: 2, crew: [lena, rike, karen, lis, meike]},
        ],
    },
    {
        id: 'r8',
        offset: 75,
        competition: 'Coastal Doppelvierer M4x-',
        category: 'Männer',
        matchName: 'Rennen 8',
        roundName: 'Vorlauf',
        teams: [
            {id: 't26', club: 'RC Flensburg', startNumber: 1, crew: [jonas, hauke, arne, ole]},
            {id: 't27', club: 'RV Aabenraa', startNumber: 2, crew: [bo, nils, sven, finn]},
            {id: 't28', club: 'Kieler RV', startNumber: 3, crew: [kim, timo, mads, erik]},
        ],
    },
    {
        id: 'r9',
        offset: 120,
        competition: 'Coastal Solo W1x',
        category: 'Frauen',
        matchName: 'Rennen 9',
        roundName: 'Finale A',
        teams: [
            {id: 't29', club: 'RC Flensburg', startNumber: 1, crew: [anna]},
            {id: 't30', club: 'Kieler RV', startNumber: 2, crew: [lena]},
            {id: 't31', club: 'RG Eckernförde', startNumber: 3, crew: [mia]},
            {id: 't32', club: 'RV Sønderborg', startNumber: 4, crew: [ida]},
        ],
    },
    {
        id: 'r10',
        offset: 165,
        competition: 'Coastal Doppelzweier M2x',
        category: 'Männer',
        matchName: 'Rennen 10',
        roundName: 'Finale A',
        teams: [
            {id: 't33', club: 'RC Flensburg', startNumber: 1, crew: [jonas, hauke]},
            {id: 't34', club: 'Kieler RV', startNumber: 2, crew: [kim, ole]},
            {id: 't35', club: 'RG Eckernförde', startNumber: 3, crew: [finn, timo]},
        ],
    },
    {
        id: 'r11',
        offset: 210,
        competition: 'Coastal Mixed 2x',
        category: 'Mixed',
        matchName: 'Rennen 11',
        roundName: 'Vorlauf',
        teams: [
            {id: 't36', club: 'RC Flensburg', startNumber: 1, crew: [anna, jonas]},
            {id: 't37', club: 'RG Eckernförde', startNumber: 2, crew: [mia, finn]},
            {id: 't38', club: 'Kieler RV', startNumber: 3, crew: [lena, kim]},
            {id: 't39', club: 'RV Sønderborg', startNumber: 4, crew: [karen, bo]},
        ],
    },
    {
        id: 'r12',
        offset: 265,
        competition: 'Coastal Mixed C4x+',
        category: 'Mixed',
        matchName: 'Rennen 12',
        roundName: 'Finale A',
        teams: [
            {id: 't40', club: 'RC Flensburg', startNumber: 1, crew: [anna, jonas, eva, hauke, pia]},
            {id: 't41', club: 'RG Eckernförde', startNumber: 2, crew: [mia, ida, finn, maren, joerg]},
            {id: 't42', club: 'Kieler RV', startNumber: 3, crew: [lena, kim, timo, rike, meike]},
        ],
    },
]

const isRunning = (race: DemoRace) => RUNNING_IDS.includes(race.id)

const isFinished = (race: DemoRace) =>
    !isRunning(race) && race.teams.some(team => team.place != undefined || team.failed)

const iso = (base: number, minutes: number) => new Date(base + minutes * 60000).toISOString()

const teamBase = (team: DemoTeam) => ({
    teamId: team.id,
    teamName: null,
    startNumber: team.startNumber,
    clubName: team.club,
    clubsFull: team.club,
    participants: team.crew,
})

/**
 * Answers the event info endpoints the speaker board uses.
 * Returns null for anything else so the caller can fall through.
 */
export const buildDemoResponse = (pathname: string): unknown => {
    const base = Date.now()

    if (pathname.endsWith('/info/upcoming-matches')) {
        return RACES.filter(race => !isRunning(race) && !isFinished(race)).map((race, index) => ({
            matchId: race.id,
            matchNumber: null,
            competitionId: `c-${race.id}`,
            competitionName: race.competition,
            categoryName: race.category,
            scheduledStartTime: iso(base, race.offset),
            placeName: null,
            roundNumber: null,
            roundName: race.roundName,
            matchName: race.matchName,
            executionOrder: index,
            teams: race.teams.map(teamBase),
        }))
    }

    if (pathname.endsWith('/info/running-matches')) {
        return RACES.filter(isRunning).map((race, index) => ({
            matchId: race.id,
            matchNumber: null,
            competitionId: `c-${race.id}`,
            competitionName: race.competition,
            categoryName: race.category,
            startTime: iso(base, race.offset),
            elapsedMinutes: Math.max(0, -race.offset),
            placeName: null,
            roundNumber: null,
            roundName: race.roundName,
            matchName: race.matchName,
            executionOrder: index,
            teams: race.teams.map(teamBase),
        }))
    }

    if (pathname.endsWith('/info/latest-match-results')) {
        return RACES.filter(isFinished).map(race => ({
            matchId: race.id,
            competitionId: `c-${race.id}`,
            competitionName: race.competition,
            categoryName: race.category,
            roundName: race.roundName,
            matchName: race.matchName,
            matchNumber: null,
            updatedAt: iso(base, race.offset + 28),
            startTime: iso(base, race.offset),
            teams: race.teams.map(team => ({
                teamId: team.id,
                teamName: null,
                teamNumber: team.startNumber,
                clubName: team.club,
                clubsFull: team.club,
                place: team.place,
                timeString: team.time,
                failed: team.failed ?? false,
                failedReason: team.failedReason,
                deregistered: team.deregistered ?? false,
                deregisteredReason: team.deregisteredReason,
                participants: team.crew,
            })),
        }))
    }

    if (pathname.endsWith(`/event/${DEMO_EVENT_ID}`)) {
        return DEMO_EVENT
    }

    if (pathname.endsWith('/event')) {
        return {data: [DEMO_EVENT], pagination: {total: 1, limit: 10, offset: 0}}
    }

    return null
}
