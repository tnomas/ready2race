import {Card, Chip, Stack, Typography} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {format} from 'date-fns'
import {
    MaterialOverviewItemDto,
    MaterialOverviewMatchDto,
    MaterialOverviewRequestDto,
} from '@api/types.gen.ts'
import {EffectiveAssignment} from '@components/material/effectiveAssignments.ts'
import {ConflictKind, MaterialConflict, severityOf} from '@components/material/conflicts.ts'
import {
    deviatesInMatch,
    startNumberInMatch,
    teamNumberOf,
} from '@components/material/materialNumbers.ts'
import {itemLabel} from '@components/material/materialWorkplace.ts'
import {statusTextColor} from '../../theme/themeColors.ts'

type Props = {
    items: MaterialOverviewItemDto[]
    requests: MaterialOverviewRequestDto[]
    matches: MaterialOverviewMatchDto[]
    effective: EffectiveAssignment[]
    conflicts: MaterialConflict[]
}

type Row = {
    matchId: string
    requestId: string
    startTime: string | null
    /** Startnummer des Teams in genau diesem Lauf. */
    startNumber?: number
    /** Meldungsnummer – nur gezeigt, solange der Lauf keine Startnummer liefert. */
    teamNumber?: number
    deviates: boolean
    clubName: string
    competitionIdentifier: string
}

/**
 * Zuteilung nach Materialstück: je Stück die Läufe, in denen es wirksam zugeteilt ist,
 * zeitlich sortiert, mit der Startnummer des Teams in diesem Lauf und „abweichend", wenn das
 * Stück sie nicht trägt (wie auf den Anzeigen). Läufe ohne Startzeit stehen hinten, sortiert nach Wettkampfkennung, damit
 * die Reihenfolge stabil bleibt - ohne jeden Zeitplan (alle startTime null) ergibt das
 * schlicht die Teams in dieser Reihenfolge.
 */
const MaterialAssignmentByItem = ({items, requests, matches, effective, conflicts}: Props) => {
    const {t} = useTranslation()

    const requestsById = new Map(requests.map(r => [r.id, r]))
    const matchesById = new Map(matches.map(m => [m.id, m]))

    return (
        <Stack spacing={2}>
            {items.map(item => {
                const rows: Row[] = effective
                    .filter(e => e.itemIds.includes(item.id))
                    .map(e => {
                        const match = matchesById.get(e.matchId)
                        const request = requestsById.get(e.requestId)
                        const startNumber =
                            match && request
                                ? startNumberInMatch(match, request.competitionRegistration)
                                : undefined
                        return {
                            matchId: e.matchId,
                            requestId: e.requestId,
                            startTime: match?.startTime ?? null,
                            startNumber,
                            teamNumber: request ? teamNumberOf(request) : undefined,
                            deviates: deviatesInMatch(e.itemIds, startNumber, items),
                            clubName: request?.clubName ?? '',
                            competitionIdentifier: request?.competitionIdentifier ?? '',
                        }
                    })
                    .sort((a, b) => {
                        if (a.startTime == null && b.startTime == null) {
                            return a.competitionIdentifier.localeCompare(b.competitionIdentifier)
                        }
                        if (a.startTime == null) {
                            return 1
                        }
                        if (b.startTime == null) {
                            return -1
                        }
                        return new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
                    })

                const itemConflicts = conflicts.filter(c => c.itemId === item.id)

                const conflictKindsFor = (matchId: string): ConflictKind[] =>
                    Array.from(
                        new Set(
                            itemConflicts
                                .filter(c => c.matchIds.includes(matchId))
                                .map(c => c.kind),
                        ),
                    )

                return (
                    <Card key={item.id} sx={{p: 2, opacity: item.status === 'RETIRED' ? 0.5 : 1}}>
                        <Stack direction={'row'} spacing={1} alignItems={'center'} sx={{mb: 1}}>
                            <Typography variant={'subtitle1'}>{itemLabel(item)}</Typography>
                            <Typography variant={'body2'} color={'text.secondary'}>
                                {item.materialTypeName}
                            </Typography>
                            {item.status === 'RETIRED' && (
                                <Chip size={'small'} label={t('material.itemStatus.RETIRED')} />
                            )}
                        </Stack>
                        {rows.length === 0 ? (
                            <Typography color={'text.secondary'} variant={'body2'}>
                                {t('material.assignment.byItem.noAssignments')}
                            </Typography>
                        ) : (
                            <Stack spacing={0.5}>
                                {rows.map((row, index) => (
                                    <Stack
                                        key={`${row.matchId}-${row.requestId}-${index}`}
                                        direction={'row'}
                                        spacing={1}
                                        alignItems={'center'}
                                        flexWrap={'wrap'}
                                        useFlexGap>
                                        <Typography variant={'body2'}>
                                            {row.startTime != null
                                                ? format(new Date(row.startTime), t('format.time'))
                                                : '—'}
                                            {' · '}
                                            {row.startNumber != null
                                                ? `${t('material.number.start', {number: row.startNumber})} · `
                                                : row.teamNumber != null
                                                  ? `${t('material.number.team', {number: row.teamNumber})} · `
                                                  : ''}
                                            {row.clubName} · {row.competitionIdentifier}
                                        </Typography>
                                        {row.deviates && (
                                            <Chip
                                                size={'small'}
                                                color={'warning'}
                                                variant={'outlined'}
                                                label={t('material.assignment.deviatesInMatch')}
                                                sx={{
                                                    color: theme =>
                                                        statusTextColor(theme, 'warning'),
                                                }}
                                            />
                                        )}
                                        {conflictKindsFor(row.matchId).map(kind => (
                                            <Chip
                                                key={kind}
                                                size={'small'}
                                                color={severityOf(kind)}
                                                label={t(`material.conflict.${kind}`)}
                                            />
                                        ))}
                                    </Stack>
                                ))}
                            </Stack>
                        )}
                    </Card>
                )
            })}
        </Stack>
    )
}

export default MaterialAssignmentByItem
