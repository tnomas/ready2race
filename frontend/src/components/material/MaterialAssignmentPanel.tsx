import {useMemo, useState} from 'react'
import {Box, Button, Stack, ToggleButton, ToggleButtonGroup, Typography} from '@mui/material'
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered'
import {useTranslation} from 'react-i18next'
import {useFeedback} from '@utils/hooks.ts'
import {isRequestNetworkError, runRequest} from '@utils/request.ts'
import {setMaterialAssignments} from '@api/sdk.gen.ts'
import {MaterialOverviewDto} from '@api/types.gen.ts'
import {assignByTeamNumber, withoutNumberMatch} from '@components/material/materialNumbers.ts'
import {assignmentEntriesAfter} from '@components/material/assignmentEntries.ts'
import {useReloadGate} from '@components/material/reloadGate.ts'
import {effectiveAssignments} from '@components/material/effectiveAssignments.ts'
import {MaterialConflict} from '@components/material/conflicts.ts'
import {assignmentWork} from '@components/material/materialWorkplace.ts'
import MaterialAssignmentByTeam from '@components/material/MaterialAssignmentByTeam.tsx'
import MaterialAssignmentByItem from '@components/material/MaterialAssignmentByItem.tsx'

type Props = {
    eventId: string
    providerId: string
    overview: MaterialOverviewDto
    conflicts: MaterialConflict[]
    /** Lädt die Übersicht gerade? Sperrt Zuteilungen bis zum frischen Stand. */
    pending: boolean
    /** Schreibrecht beim gezeigten Anbieter; ohne bleibt die Einteilung eine Ansicht. */
    canWrite: boolean
    reload: () => void
}

type ViewMode = 'team' | 'item'

/**
 * Reiter „Zuteilung": oben die offene Arbeit in einem Satz und die Sammelaktion „Nach
 * Meldungsnummer zuteilen" (Boot n zur Meldungsnummer n), darunter wahlweise die Sicht je Team (Arbeitsliste, Unzugeteiltes zuerst) oder je
 * Materialstück (Belegung in Zeitfolge). Konflikte rechnet die Seite einmal und reicht sie durch.
 */
const MaterialAssignmentPanel = ({
    eventId,
    providerId,
    overview,
    conflicts,
    pending,
    canWrite,
    reload,
}: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [view, setView] = useState<ViewMode>('team')
    const [assigning, setAssigning] = useState(false)

    const {requests, items, matches} = overview
    const effective = useMemo(() => effectiveAssignments(requests, matches), [requests, matches])
    const work = assignmentWork(requests, conflicts)
    const noNumberMatch = useMemo(() => withoutNumberMatch(requests, items), [requests, items])
    const gate = useReloadGate(requests, pending)

    const handleAssignByTeamNumber = async () => {
        if (assigning || gate.locked) return
        const proposals = assignByTeamNumber(requests, items)
        if (proposals.length === 0) {
            feedback.info(t('material.assignment.assignByTeamNumberNone'))
            return
        }
        setAssigning(true)
        let failures = 0
        let network = false
        for (const proposal of proposals) {
            const request = requests.find(r => r.id === proposal.requestId)
            const assignments = assignmentEntriesAfter(request?.assignments ?? [], {
                kind: 'addBase',
                itemIds: proposal.entries.map(e => e.materialItem),
            })
            const {error} = await runRequest(undefined, () =>
                setMaterialAssignments({
                    path: {eventId, providerId, requestId: proposal.requestId},
                    body: {assignments},
                }),
            )
            if (error) failures++
            if (isRequestNetworkError(error)) network = true
        }
        setAssigning(false)
        if (network) {
            feedback.error(t('common.error.network'))
        } else if (failures > 0) {
            feedback.error(t('material.assignment.assignByTeamNumberError', {count: failures}))
        } else {
            feedback.success(
                t('material.assignment.assignByTeamNumberSuccess', {count: proposals.length}),
            )
        }
        gate.arm()
        reload()
    }

    return (
        <Stack spacing={2}>
            <Stack
                direction={{xs: 'column', sm: 'row'}}
                gap={1.5}
                alignItems={{xs: 'stretch', sm: 'center'}}>
                <Box sx={{flex: 1}}>
                    <Typography variant={'body2'} color={'text.secondary'}>
                        {work.unassigned + work.withConflicts === 0
                            ? t('material.assignment.workDone')
                            : t('material.assignment.workSummary', {
                                  unassigned: work.unassigned,
                                  conflicts: work.withConflicts,
                              })}
                    </Typography>
                    {noNumberMatch.size > 0 && (
                        <Typography variant={'body2'} color={'text.secondary'}>
                            {t('material.assignment.withoutNumberMatchSummary', {
                                count: noNumberMatch.size,
                            })}
                        </Typography>
                    )}
                </Box>
                {canWrite && (
                    <Button
                        variant={work.unassigned > 0 ? 'contained' : 'outlined'}
                        startIcon={<FormatListNumberedIcon />}
                        disabled={assigning || gate.locked}
                        onClick={() => void handleAssignByTeamNumber()}
                        sx={{cursor: 'pointer'}}>
                        {t('material.assignment.assignByTeamNumber')}
                    </Button>
                )}
            </Stack>
            <Box>
                <ToggleButtonGroup
                    exclusive
                    size={'small'}
                    value={view}
                    onChange={(_, value: ViewMode | null) => value != null && setView(value)}>
                    <ToggleButton value={'team'} sx={{cursor: 'pointer'}}>
                        {t('material.assignment.viewByTeam')}
                    </ToggleButton>
                    <ToggleButton value={'item'} sx={{cursor: 'pointer'}}>
                        {t('material.assignment.viewByItem')}
                    </ToggleButton>
                </ToggleButtonGroup>
            </Box>

            {view === 'team' ? (
                <MaterialAssignmentByTeam
                    eventId={eventId}
                    providerId={providerId}
                    requests={requests}
                    items={items}
                    matches={matches}
                    conflicts={conflicts}
                    pending={pending}
                    withoutNumberMatch={noNumberMatch}
                    canWrite={canWrite}
                    onChanged={reload}
                />
            ) : (
                <MaterialAssignmentByItem
                    items={items}
                    requests={requests}
                    matches={matches}
                    effective={effective}
                    conflicts={conflicts}
                />
            )}
        </Stack>
    )
}

export default MaterialAssignmentPanel
