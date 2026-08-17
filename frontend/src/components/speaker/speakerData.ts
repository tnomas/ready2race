import {
    LatestMatchResultInfo,
    MatchResultTeamInfo,
    RunningMatchInfo,
    UpcomingCompetitionMatchInfo,
} from '@api/types.gen.ts'

export type SpeakerStatus = 'UPCOMING' | 'RUNNING' | 'FINISHED'

export type SpeakerParticipant = {
    participantId: string
    firstName: string
    lastName: string
    namedRole?: string | null
    year?: number | null
    gender?: string | null
    externalClubName?: string | null
}

export type SpeakerTeam = {
    teamId: string
    teamName?: string | null
    startNumber?: number | null
    clubName?: string | null
    /** full club names of the crew - a composite crew rows for more than one club */
    clubsFull?: string | null
    place?: number
    timeString?: string | null
    failed?: boolean
    failedReason?: string | null
    deregistered?: boolean
    deregisteredReason?: string | null
    participants: SpeakerParticipant[]
}

export type SpeakerMatch = {
    matchId: string
    status: SpeakerStatus
    /** null for schedule placeholders (a break has no competition) */
    competitionId?: string | null
    competitionName: string
    categoryName?: string | null
    roundName?: string | null
    matchName?: string | null
    startTime?: Date
    updatedAt?: Date
    executionOrder?: number
    elapsedMinutes?: number | null
    /** the schedule slot was cancelled - the race stays listed so the crews still see it */
    cancelled?: boolean
    /** round not drawn yet: matchId points at the setup round and teams is empty */
    pendingRound?: boolean
    teams: SpeakerTeam[]
}

const parseDate = (value: string | null | undefined): Date | undefined => {
    if (!value) return undefined
    const date = new Date(value)
    return isNaN(date.getTime()) ? undefined : date
}

const fromUpcoming = (match: UpcomingCompetitionMatchInfo): SpeakerMatch => ({
    matchId: match.matchId,
    status: 'UPCOMING',
    competitionId: match.competitionId,
    // breaks and other schedule items carry their label in `name`
    competitionName: match.competitionName || match.name || '',
    categoryName: match.categoryName,
    roundName: match.roundName,
    matchName: match.matchName,
    startTime: parseDate(match.scheduledStartTime),
    executionOrder: match.executionOrder,
    cancelled: match.cancelled,
    pendingRound: match.pendingRound,
    teams: match.teams.map(team => ({
        teamId: team.teamId,
        teamName: team.teamName,
        startNumber: team.startNumber,
        clubName: team.clubName,
        clubsFull: team.clubsFull,
        participants: team.participants,
    })),
})

const fromRunning = (match: RunningMatchInfo): SpeakerMatch => ({
    matchId: match.matchId,
    status: 'RUNNING',
    competitionId: match.competitionId,
    competitionName: match.competitionName,
    categoryName: match.categoryName,
    roundName: match.roundName,
    matchName: match.matchName,
    startTime: parseDate(match.startTime),
    executionOrder: match.executionOrder,
    elapsedMinutes: match.elapsedMinutes,
    teams: match.teams.map(team => ({
        teamId: team.teamId,
        teamName: team.teamName,
        startNumber: team.startNumber,
        clubName: team.clubName,
        clubsFull: team.clubsFull,
        timeString: team.timeString,
        failed: team.failed,
        failedReason: team.failedReason,
        participants: team.participants,
    })),
})

const fromResultTeam = (team: MatchResultTeamInfo): SpeakerTeam => ({
    teamId: team.teamId,
    teamName: team.teamName,
    startNumber: team.teamNumber,
    clubName: team.clubName,
    clubsFull: team.clubsFull,
    place: team.place,
    timeString: team.timeString,
    failed: team.failed,
    failedReason: team.failedReason,
    deregistered: team.deregistered,
    deregisteredReason: team.deregisteredReason,
    participants: team.participants,
})

const fromResult = (match: LatestMatchResultInfo): SpeakerMatch => ({
    matchId: match.matchId,
    status: 'FINISHED',
    competitionId: match.competitionId,
    competitionName: match.competitionName,
    categoryName: match.categoryName,
    roundName: match.roundName,
    matchName: match.matchName,
    startTime: parseDate(match.startTime),
    updatedAt: parseDate(match.updatedAt),
    teams: match.teams.map(fromResultTeam),
})

// Running beats finished beats upcoming when the same match shows up in more than one feed
export const mergeSpeakerMatches = (
    upcoming: UpcomingCompetitionMatchInfo[],
    running: RunningMatchInfo[],
    results: LatestMatchResultInfo[],
): SpeakerMatch[] => {
    const byId = new Map<string, SpeakerMatch>()
    upcoming.forEach(match => byId.set(match.matchId, fromUpcoming(match)))
    results.forEach(match => byId.set(match.matchId, fromResult(match)))
    running.forEach(match => byId.set(match.matchId, fromRunning(match)))
    return [...byId.values()].sort(compareByStartTime)
}

export const compareByStartTime = (a: SpeakerMatch, b: SpeakerMatch): number => {
    if (a.startTime && b.startTime) return a.startTime.getTime() - b.startTime.getTime()
    if (a.startTime) return -1
    if (b.startTime) return 1
    return (a.executionOrder ?? 0) - (b.executionOrder ?? 0)
}

export const matchLabel = (match: SpeakerMatch): string =>
    [
        match.competitionName,
        match.categoryName ? `(${match.categoryName})` : null,
        match.roundName,
        match.matchName,
    ]
        .filter(Boolean)
        .join(' ')

export type OtherStart = {
    matchId: string
    label: string
    startTime?: Date
    status: SpeakerStatus
}

export type Medal = {
    place: number
    label: string
}

export type ParticipantStart = {
    match: SpeakerMatch
    team: SpeakerTeam
    participant: SpeakerParticipant
}

export type SpeakerBadges = {
    // participantId -> all matches this participant starts in (only filled when more than one)
    doubleStarts: Map<string, OtherStart[]>
    // participantId -> medals won in finished matches of this event
    medals: Map<string, Medal[]>
    // participantId -> every start of this participant across the event, chronological
    starts: Map<string, ParticipantStart[]>
}

export const computeSpeakerBadges = (matches: SpeakerMatch[]): SpeakerBadges => {
    const starts = new Map<string, ParticipantStart[]>()
    const medals = new Map<string, Medal[]>()

    matches.forEach(match => {
        match.teams.forEach(team => {
            if (team.deregistered) return
            const isMedal = match.status === 'FINISHED' && team.place != undefined && team.place <= 3
            team.participants.forEach(participant => {
                const list = starts.get(participant.participantId) ?? []
                list.push({match, team, participant})
                starts.set(participant.participantId, list)
                if (isMedal) {
                    const medalList = medals.get(participant.participantId) ?? []
                    medalList.push({place: team.place!, label: matchLabel(match)})
                    medals.set(participant.participantId, medalList)
                }
            })
        })
    })

    const doubleStarts = new Map<string, OtherStart[]>()
    starts.forEach((list, participantId) => {
        list.sort((a, b) => compareByStartTime(a.match, b.match))
        if (list.length > 1) {
            doubleStarts.set(
                participantId,
                list.map(start => ({
                    matchId: start.match.matchId,
                    label: matchLabel(start.match),
                    startTime: start.match.startTime,
                    status: start.match.status,
                })),
            )
        }
    })

    return {doubleStarts, medals, starts}
}

// minutes between two consecutive starts; undefined when either has no start time
export const turnaroundMinutes = (
    previous: ParticipantStart,
    next: ParticipantStart,
): number | undefined =>
    previous.match.startTime && next.match.startTime
        ? Math.round(
              (next.match.startTime.getTime() - previous.match.startTime.getTime()) / 60000,
          )
        : undefined

export const medalEmoji = (place: number): string =>
    place === 1 ? '🥇' : place === 2 ? '🥈' : '🥉'

export const teamHasBadges = (team: SpeakerTeam, badges: SpeakerBadges): string => {
    let result = ''
    if (team.participants.some(participant => badges.doubleStarts.has(participant.participantId))) {
        result += '🔁'
    }
    if (team.participants.some(participant => badges.medals.has(participant.participantId))) {
        result += '🏅'
    }
    return result
}

export const matchBadgeSummary = (match: SpeakerMatch, badges: SpeakerBadges): string => {
    const summary = new Set<string>()
    match.teams.forEach(team => {
        const teamBadges = teamHasBadges(team, badges)
        if (teamBadges.includes('🔁')) summary.add('🔁')
        if (teamBadges.includes('🏅')) summary.add('🏅')
    })
    return [...summary].join(' ')
}

export type SpeakerColors = {
    background: string
    panel: string
    panelHover: string
    border: string
    text: string
    textSecondary: string
    upcoming: string
    running: string
    finished: string
    now: string
    gold: string
}

// LOTG-inspired dark board palette (default)
export const speakerColors: SpeakerColors = {
    background: '#0f172a',
    panel: '#1e293b',
    panelHover: '#27354a',
    border: '#334155',
    text: '#e2e8f0',
    textSecondary: '#94a3b8',
    upcoming: '#60a5fa',
    running: '#34d399',
    finished: '#64748b',
    now: '#f87171',
    gold: '#facc15',
}

export const statusColorOf = (colors: SpeakerColors, status: SpeakerStatus): string =>
    status === 'RUNNING'
        ? colors.running
        : status === 'FINISHED'
          ? colors.finished
          : colors.upcoming
