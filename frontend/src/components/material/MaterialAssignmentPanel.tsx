import {useMemo, useState} from 'react'
import {Box, Button, Stack, ToggleButton, ToggleButtonGroup, Typography} from '@mui/material'
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered'
import {useTranslation} from 'react-i18next'
import {useFeedback} from '@utils/hooks.ts'
import {isRequestNetworkError, runRequest} from '@utils/request.ts'
import {setMaterialAssignments} from '@api/sdk.gen.ts'
import {MaterialAssignmentEntry, MaterialOverviewDto} from '@api/types.gen.ts'
import {assignByStartNumber} from '@components/material/assignByStartNumber.ts'
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
    reload: () => void
}

type ViewMode = 'team' | 'item'

/**
 * Reiter „Zuteilung": oben die offene Arbeit in einem Satz und die Sammelaktion „Nach Startnummer
 * zuteilen", darunter wahlweise die Sicht je Team (Arbeitsliste, Unzugeteiltes zuerst) oder je
 * Materialstück (Belegung in Zeitfolge). Konflikte rechnet die Seite einmal und reicht sie durch.
 */
const MaterialAssignmentPanel = ({eventId, providerId, overview, conflicts, reload}: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [view, setView] = useState<ViewMode>('team')
    const [assigning, setAssigning] = useState(false)

    const {requests, items, matches} = overview
    const effective = useMemo(() => effectiveAssignments(requests, matches), [requests, matches])
    const work = assignmentWork(requests, conflicts)

    const handleAssignByStartNumber = async () => {
        if (assigning) return
        const proposals = assignByStartNumber(requests, items)
        if (proposals.length === 0) {
            feedback.info(t('material.assignment.assignByStartNumberNone'))
            return
        }
        setAssigning(true)
        let failures = 0
        let network = false
        for (const proposal of proposals) {
            const request = requests.find(r => r.id === proposal.requestId)
            const existingEntries: MaterialAssignmentEntry[] = (request?.assignments ?? []).map(
                a => ({materialItem: a.materialItem, competitionMatch: a.competitionMatch}),
            )
            const newEntries: MaterialAssignmentEntry[] = proposal.entries.map(e => ({
                materialItem: e.materialItem,
            }))
            const {error} = await runRequest(undefined, () =>
                setMaterialAssignments({
                    path: {eventId, providerId, requestId: proposal.requestId},
                    body: {assignments: [...existingEntries, ...newEntries]},
                }),
            )
            if (error) failures++
            if (isRequestNetworkError(error)) network = true
        }
        setAssigning(false)
        if (network) {
            feedback.error(t('common.error.network'))
        } else if (failures > 0) {
            feedback.error(t('material.assignment.assignByStartNumberError', {count: failures}))
        } else {
            feedback.success(
                t('material.assignment.assignByStartNumberSuccess', {count: proposals.length}),
            )
        }
        reload()
    }

    return (
        <Stack spacing={2}>
            <Stack
                direction={{xs: 'column', sm: 'row'}}
                gap={1.5}
                alignItems={{xs: 'stretch', sm: 'center'}}>
                <Typography variant={'body2'} color={'text.secondary'} sx={{flex: 1}}>
                    {work.unassigned + work.withConflicts === 0
                        ? t('material.assignment.workDone')
                        : t('material.assignment.workSummary', {
                              unassigned: work.unassigned,
                              conflicts: work.withConflicts,
                          })}
                </Typography>
                <Button
                    variant={work.unassigned > 0 ? 'contained' : 'outlined'}
                    startIcon={<FormatListNumberedIcon />}
                    disabled={assigning}
                    onClick={() => void handleAssignByStartNumber()}
                    sx={{cursor: 'pointer'}}>
                    {t('material.assignment.assignByStartNumber')}
                </Button>
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
