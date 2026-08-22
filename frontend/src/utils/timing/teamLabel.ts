import {TimingTeamDto} from '@api/types.gen.ts'

/**
 * Kurzes Menschen-Label eines Teams: `#12 · Teamname`, mit Rückfällen auf Verein bzw.
 * Teilnehmernamen. Aus dem `SequencePanel` hierher gezogen, weil der Startbildschirm (Zeitnahme)
 * dieselbe Beschriftung zeigt — zwei Implementierungen würden am Start und auf dem Bedienboard
 * unterschiedliche Namen für dasselbe Boot anzeigen.
 */
export function teamLabel(team: TimingTeamDto | undefined, fallbackId: string): string {
    if (team === undefined) return fallbackId
    const bits: string[] = []
    if (team.startNumber !== undefined) bits.push(`#${team.startNumber}`)
    if (team.teamName) bits.push(team.teamName)
    else if (team.clubName) bits.push(team.clubName)
    else if (team.participantNames.length > 0) bits.push(team.participantNames.join(' / '))
    return bits.length > 0 ? bits.join(' · ') : fallbackId
}
