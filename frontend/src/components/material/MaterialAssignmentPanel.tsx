import {useState} from 'react'
import {
    Box,
    Button,
    IconButton,
    Stack,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import {useTranslation} from 'react-i18next'
import {useFeedback} from '@utils/hooks.ts'
import {setMaterialAssignments} from '@api/sdk.gen.ts'
import {MaterialAssignmentEntry} from '@api/types.gen.ts'
import {useMaterialOverview} from '@components/material/useMaterialOverview.ts'
import {assignByStartNumber} from '@components/material/assignByStartNumber.ts'
import {effectiveAssignments} from '@components/material/effectiveAssignments.ts'
import {findConflicts} from '@components/material/conflicts.ts'
import MaterialAssignmentByTeam from '@components/material/MaterialAssignmentByTeam.tsx'
import MaterialAssignmentByItem from '@components/material/MaterialAssignmentByItem.tsx'
import Throbber from '@components/Throbber.tsx'

type Props = {
    eventId: string
    providerId: string
}

type ViewMode = 'team' | 'item'

/**
 * Reiter "Einteilung": Umschalter zwischen Sicht je Team und je Materialstück, dazu die
 * automatische Zuteilung nach Startnummer als Vorschlag mit einem Klick. Konflikte werden aus
 * den reinen Funktionen aus 4.3 einmal hier berechnet und an beide Sichten weitergereicht.
 */
const MaterialAssignmentPanel = ({eventId, providerId}: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const {overview, pending, reload} = useMaterialOverview({eventId, providerId})

    const [view, setView] = useState<ViewMode>('team')
    const [assigning, setAssigning] = useState(false)

    const requests = overview?.requests ?? []
    const items = overview?.items ?? []
    const matches = overview?.matches ?? []
    const offers = overview?.offers ?? []

    const changeoverMinutesByRequest: Record<string, number> = {}
    for (const request of requests) {
        const offer = offers.find(o => o.id === request.materialOffer)
        changeoverMinutesByRequest[request.id] = offer?.changeoverMinutes ?? 0
    }

    const effective = effectiveAssignments(requests, matches)
    const conflicts = findConflicts(effective, matches, items, changeoverMinutesByRequest)

    const handleAssignByStartNumber = async () => {
        const proposals = assignByStartNumber(requests, items)
        if (proposals.length === 0) {
            feedback.info(t('material.assignment.assignByStartNumberNone'))
            return
        }
        setAssigning(true)
        let failures = 0
        for (const proposal of proposals) {
            const request = requests.find(r => r.id === proposal.requestId)
            const existingEntries: MaterialAssignmentEntry[] = (request?.assignments ?? []).map(
                a => ({
                    materialItem: a.materialItem,
                    competitionMatch: a.competitionMatch,
                }),
            )
            const newEntries: MaterialAssignmentEntry[] = proposal.entries.map(e => ({
                materialItem: e.materialItem,
            }))
            const {error} = await setMaterialAssignments({
                path: {eventId, providerId, requestId: proposal.requestId},
                body: {assignments: [...existingEntries, ...newEntries]},
            })
            if (error) {
                failures++
            }
        }
        setAssigning(false)
        if (failures > 0) {
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
            <Stack direction={'row'} spacing={2} alignItems={'center'} flexWrap={'wrap'} useFlexGap>
                <ToggleButtonGroup
                    exclusive
                    size={'small'}
                    value={view}
                    onChange={(_, value: ViewMode | null) => value != null && setView(value)}>
                    <ToggleButton value={'team'}>
                        {t('material.assignment.viewByTeam')}
                    </ToggleButton>
                    <ToggleButton value={'item'}>
                        {t('material.assignment.viewByItem')}
                    </ToggleButton>
                </ToggleButtonGroup>
                <Box sx={{flexGrow: 1}} />
                <Tooltip title={t('material.requests.reload')}>
                    <IconButton onClick={reload} disabled={pending}>
                        <RefreshIcon />
                    </IconButton>
                </Tooltip>
                <Button
                    variant={'contained'}
                    disabled={assigning}
                    onClick={() => void handleAssignByStartNumber()}>
                    {t('material.assignment.assignByStartNumber')}
                </Button>
            </Stack>

            {pending && !overview ? (
                <Throbber />
            ) : view === 'team' ? (
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
