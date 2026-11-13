import {describe, expect, it} from 'vitest'
import {
    LatestMatchResultInfo,
    MatchResultTeamInfo,
    RunningMatchInfo,
    UpcomingCompetitionMatchInfo,
} from '@api/types.gen.ts'
import {
    computeSpeakerBadges,
    displayPlace,
    isLiveOnWater,
    liveFollowCandidate,
    mergeSpeakerMatches,
    nextUpcomingSpeakerMatch,
    SpeakerMatch,
} from './speakerData.ts'

const resultTeam = (overrides: Partial<MatchResultTeamInfo>): MatchResultTeamInfo => ({
    teamId: 'team-1',
    teamName: null,
    teamNumber: 7,
    startNumber: 3,
    clubName: 'RC Flensburg',
    failed: false,
    deregistered: false,
    participants: [{participantId: 'athlete-1', firstName: 'Anna', lastName: 'Ahlers', year: 1999}],
    ...overrides,
})

const result = (teams: MatchResultTeamInfo[]): LatestMatchResultInfo => ({
    matchId: 'match-1',
    competitionId: 'competition-1',
    competitionName: 'JM4x',
    teams,
    updatedAt: '2026-08-14T10:30:00',
})

describe('fromResultTeam', () => {
    it('nimmt die Startnummer aus startNumber, nicht aus der Mannschaftsnummer', () => {
        const [match] = mergeSpeakerMatches([], [], [result([resultTeam({})])])
        expect(match.teams[0].startNumber).toBe(3)
    })

    it('übernimmt Wertungskategorie und Kategorieplatz', () => {
        const [match] = mergeSpeakerMatches(
            [],
            [],
            [
                result([
                    resultTeam({
                        place: 4,
                        ratingCategory: {id: 'cat-1', name: 'Masters B', sortOrder: 2},
                        categoryPlace: 1,
                    }),
                ]),
            ],
        )
        expect(match.teams[0].ratingCategory).toBe('Masters B')
        expect(match.teams[0].categoryPlace).toBe(1)
    })

    it('führt Boote ohne Wertungskategorie mit null', () => {
        const [match] = mergeSpeakerMatches([], [], [result([resultTeam({place: 2})])])
        expect(match.teams[0].ratingCategory).toBeNull()
        expect(match.teams[0].categoryPlace).toBeNull()
    })
})

describe('displayPlace', () => {
    it('zeigt den Kategorieplatz, wenn es einen gibt', () => {
        const [match] = mergeSpeakerMatches(
            [],
            [],
            [
                result([
                    resultTeam({
                        place: 4,
                        ratingCategory: {id: 'cat-1', name: 'Masters B', sortOrder: 2},
                        categoryPlace: 1,
                    }),
                ]),
            ],
        )
        expect(displayPlace(match.teams[0])).toBe(1)
    })

    it('fällt ohne Kategorie auf den Gesamtplatz zurück', () => {
        const [match] = mergeSpeakerMatches([], [], [result([resultTeam({place: 4})])])
        expect(displayPlace(match.teams[0])).toBe(4)
    })
})

describe('computeSpeakerBadges', () => {
    it('vergibt die Medaille nach dem angezeigten Platz', () => {
        const matches = mergeSpeakerMatches(
            [],
            [],
            [
                result([
                    resultTeam({
                        place: 5,
                        ratingCategory: {id: 'cat-1', name: 'Masters B', sortOrder: 2},
                        categoryPlace: 1,
                    }),
                ]),
            ],
        )
        const badges = computeSpeakerBadges(matches)
        expect(badges.medals.get('athlete-1')).toEqual([{place: 1, label: 'JM4x (Masters B)'}])
    })

    it('vergibt keine Medaille für Platz 5 ohne Kategorie', () => {
        const matches = mergeSpeakerMatches([], [], [result([resultTeam({place: 5})])])
        expect(computeSpeakerBadges(matches).medals.has('athlete-1')).toBe(false)
    })
})

describe('nextUpcomingSpeakerMatch', () => {
    const at = (iso: string) => new Date(iso)
    const match = (overrides: Partial<SpeakerMatch>): SpeakerMatch => ({
        matchId: 'm',
        status: 'UPCOMING',
        competitionName: 'JM4x',
        teams: [],
        ...overrides,
    })
    const now = at('2026-08-14T10:00:00').getTime()

    it('nimmt den ersten anstehenden Lauf mit Startzeit', () => {
        const matches = [
            match({matchId: 'running', status: 'RUNNING', startTime: at('2026-08-14T09:50:00')}),
            match({matchId: 'next', startTime: at('2026-08-14T10:10:00')}),
            match({matchId: 'later', startTime: at('2026-08-14T10:30:00')}),
        ]
        expect(nextUpcomingSpeakerMatch(matches, now)?.matchId).toBe('next')
    })

    it('überspringt abgesagte, zeitlose und mehr als fünf Minuten überfällige Läufe', () => {
        const matches = [
            match({matchId: 'overdue', startTime: at('2026-08-14T09:54:00')}),
            match({matchId: 'cancelled', cancelled: true, startTime: at('2026-08-14T10:05:00')}),
            match({matchId: 'noTime'}),
            match({matchId: 'graced', startTime: at('2026-08-14T09:56:00')}),
        ]
        expect(nextUpcomingSpeakerMatch(matches, now)?.matchId).toBe('graced')
    })

    it('liefert nichts, wenn nichts mehr ansteht', () => {
        expect(
            nextUpcomingSpeakerMatch(
                [match({status: 'FINISHED', startTime: at('2026-08-14T11:00:00')})],
                now,
            ),
        ).toBeUndefined()
    })
})

describe('Lauf in Vorbereitung ist nicht live', () => {
    const running = (overrides: Partial<RunningMatchInfo>): RunningMatchInfo => ({
        matchId: 'r',
        competitionId: 'c',
        competitionName: 'CF 2x',
        executionOrder: 0,
        state: 'RUNNING',
        teams: [],
        ...overrides,
    })
    const at = (iso: string) => new Date(iso)
    const now = at('2026-11-13T23:00:00').getTime()

    it('übernimmt den Zustand der einen Ableitung aus dem Running-Feed', () => {
        const [preparing, live] = mergeSpeakerMatches(
            [],
            [
                running({matchId: 'prep', state: 'PREPARING', startTime: '2026-11-13T23:02:00'}),
                running({
                    matchId: 'live',
                    startedAt: '2026-11-13T22:45:59',
                    startTime: '2026-11-13T23:10:00',
                }),
            ],
            [],
        )
        // Vorher: beide „● Live" (status RUNNING ohne Unterscheidung).
        expect(preparing.preparing).toBe(true)
        expect(isLiveOnWater(preparing)).toBe(false)
        expect(live.preparing).toBe(false)
        expect(isLiveOnWater(live)).toBe(true)
    })

    it('„Live folgen" nimmt den fahrenden Lauf vor dem gerufenen, den gerufenen vor dem anstehenden', () => {
        const prep = running({
            matchId: 'prep',
            state: 'PREPARING',
            startTime: '2026-11-13T23:02:00',
        })
        const live = running({matchId: 'live', startTime: '2026-11-13T22:44:00'})
        const disputed = running({matchId: 'disputed', state: 'CLARIFICATION', clarification: true})
        const upcoming: UpcomingCompetitionMatchInfo = {
            matchId: 'next',
            pendingRound: false,
            cancelled: false,
            competitionId: 'c',
            competitionName: 'CM 2x',
            scheduledStartTime: '2026-11-13T23:22:00',
            executionOrder: 1,
            teams: [],
        }
        expect(
            liveFollowCandidate(mergeSpeakerMatches([upcoming], [prep, live, disputed], []), now),
        ).toBe('live')
        expect(
            liveFollowCandidate(mergeSpeakerMatches([upcoming], [prep, disputed], []), now),
        ).toBe('prep')
        expect(liveFollowCandidate(mergeSpeakerMatches([upcoming], [disputed], []), now)).toBe(
            'next',
        )
    })
})
