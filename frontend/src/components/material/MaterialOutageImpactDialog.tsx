import {startNumberOf} from '@components/material/assignByStartNumber.ts'
import {useState} from 'react'
import {
    Autocomplete,
    Button,
    Chip,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    TextField,
    Typography,
} from '@mui/material'
import {format} from 'date-fns'
import {useTranslation} from 'react-i18next'
import BaseDialog from '@components/BaseDialog.tsx'
import {setMaterialAssignments} from '@api/sdk.gen.ts'
import {
    MaterialAssignmentEntry,
    MaterialOverviewDto,
    MaterialOverviewItemDto,
    MaterialOverviewRequestDto,
} from '@api/types.gen.ts'
import {useFeedback} from '@utils/hooks.ts'
import {isRequestNetworkError, runRequest} from '@utils/request.ts'
import {materialErrorKey} from '@components/material/materialErrors.ts'
import {itemLabel} from '@components/material/materialWorkplace.ts'
import {effectiveAssignments} from '@components/material/effectiveAssignments.ts'
import {affectedByOutage, replacementCandidates} from '@components/material/affectedByOutage.ts'

type Props = {
    open: boolean
    eventId: string
    providerId: string
    /** null solange der Dialog geschlossen ist. */
    item: MaterialOverviewItemDto | null
    from: string | null
    until?: string
    overview: MaterialOverviewDto
    onClose: () => void
    reload: () => void
}

type Option = {id: string; label: string; sameNumber: boolean}

type Row = {
    key: string
    requestId: string
    matchId: string
    request: MaterialOverviewRequestDto
    label: string
    options: Option[]
}

const matchLabel = (match: {roundName?: string; name?: string}): string =>
    [match.roundName, match.name].filter(Boolean).join(' · ')

/**
 * Nach einem Schaden mit Ausfallfenster: je betroffenem Lauf ein Ersatzstück wählen. Jede
 * Übernahme setzt für diesen Lauf eine Ausnahme (ersetzt eine bestehende Ausnahme für denselben
 * Lauf) und schickt dafür die komplette Zuteilungsliste der Anfrage, wie setMaterialAssignments
 * es verlangt - genau das Muster aus MaterialExceptionDialog. "Später" schließt nur, ohne etwas
 * zu speichern - der Ausfall bleibt in der Einteilung als Konflikt sichtbar.
 */
const MaterialOutageImpactDialog = ({
    open,
    eventId,
    providerId,
    item,
    from,
    until,
    overview,
    onClose,
    reload,
}: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [selected, setSelected] = useState<Record<string, Option | null>>({})
    const [submittingKey, setSubmittingKey] = useState<string | null>(null)
    const [done, setDone] = useState<Set<string>>(new Set())

    const handleClose = () => {
        setSelected({})
        setDone(new Set())
        setSubmittingKey(null)
        onClose()
    }

    if (item == null || from == null) {
        return null
    }

    const effective = effectiveAssignments(overview.requests, overview.matches)
    const affected = affectedByOutage(effective, overview.matches, item.id, from, until)
    const matchesById = new Map(overview.matches.map(m => [m.id, m]))
    const requestsById = new Map(overview.requests.map(r => [r.id, r]))

    const rows: Row[] = affected
        .filter(a => !done.has(`${a.requestId}|${a.matchId}`))
        .map(a => {
            const request = requestsById.get(a.requestId)
            const match = matchesById.get(a.matchId)
            if (request == null || match == null) {
                return null
            }
            const candidates = replacementCandidates(
                overview.items,
                effective,
                overview.matches,
                a.matchId,
                item.materialType,
                startNumberOf(request),
            )
            const options: Option[] = candidates.map(c => ({
                id: c.item.id,
                label: itemLabel(c.item),
                sameNumber: c.sameNumber,
            }))
            const time = match.startTime ? format(new Date(match.startTime), 'HH:mm') : ''
            const label =
                `#${startNumberOf(request) ?? '–'} ${request.clubName} · ${request.competitionIdentifier} · ` +
                `${matchLabel(match)} ${time}`.trim()
            return {
                key: `${a.requestId}|${a.matchId}`,
                requestId: a.requestId,
                matchId: a.matchId,
                request,
                label,
                options,
            }
        })
        .filter((row): row is Row => row != null)

    const handleSave = async (row: Row) => {
        const option = selected[row.key]
        if (option == null) {
            return
        }
        if (submittingKey) return
        const remaining: MaterialAssignmentEntry[] = row.request.assignments
            .filter(a => a.competitionMatch !== row.matchId)
            .map(a => ({materialItem: a.materialItem, competitionMatch: a.competitionMatch}))
        const entries: MaterialAssignmentEntry[] = [
            ...remaining,
            {materialItem: option.id, competitionMatch: row.matchId},
        ]
        const {error} = await runRequest(
            busy => setSubmittingKey(busy ? row.key : null),
            () =>
                setMaterialAssignments({
                    path: {eventId, providerId, requestId: row.requestId},
                    body: {assignments: entries},
                }),
        )
        if (isRequestNetworkError(error)) {
            feedback.error(t('common.error.network'))
        } else if (error) {
            const key = materialErrorKey(error)
            feedback.error(t(key ?? 'material.damage.impact.error'))
            // Fachlicher Konflikt = veralteter Stand: neu laden.
            if (key) reload()
        } else {
            feedback.success(t('material.damage.impact.success'))
            setDone(prev => new Set(prev).add(row.key))
            reload()
        }
    }

    return (
        <BaseDialog open={open} onClose={handleClose} maxWidth={'sm'}>
            <DialogTitle>{t('material.damage.impact.title')}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{mt: 1}}>
                    {rows.length > 0 && (
                        <Typography variant={'body2'} color={'text.secondary'}>
                            {t('material.damage.impact.hint', {item: itemLabel(item)})}
                        </Typography>
                    )}
                    {rows.length === 0 ? (
                        <Typography color={'text.secondary'}>
                            {t('material.damage.impact.none')}
                        </Typography>
                    ) : (
                        rows.map(row => (
                            <Stack key={row.key} spacing={1}>
                                <Typography variant={'body2'}>{row.label}</Typography>
                                <Stack
                                    direction={{xs: 'column', sm: 'row'}}
                                    spacing={1}
                                    alignItems={{xs: 'stretch', sm: 'center'}}>
                                    <Autocomplete
                                        options={row.options}
                                        noOptionsText={t('material.damage.impact.noCandidates')}
                                        value={selected[row.key] ?? null}
                                        onChange={(_, v) =>
                                            setSelected(prev => ({...prev, [row.key]: v}))
                                        }
                                        getOptionLabel={o => o.label}
                                        isOptionEqualToValue={(o, v) => o.id === v.id}
                                        renderOption={(liProps, option) => (
                                            <li {...liProps} key={option.id}>
                                                {option.label}
                                                {option.sameNumber && (
                                                    <Chip
                                                        size={'small'}
                                                        sx={{ml: 1}}
                                                        label={t(
                                                            'material.damage.impact.sameNumber',
                                                        )}
                                                    />
                                                )}
                                            </li>
                                        )}
                                        renderInput={params => (
                                            <TextField
                                                {...params}
                                                label={t('material.damage.impact.replacement')}
                                                size={'small'}
                                            />
                                        )}
                                        sx={{flex: 1}}
                                    />
                                    <Button
                                        variant={'contained'}
                                        size={'small'}
                                        disabled={
                                            selected[row.key] == null || submittingKey === row.key
                                        }
                                        onClick={() => void handleSave(row)}
                                        sx={{cursor: 'pointer'}}>
                                        {t('material.damage.impact.save')}
                                    </Button>
                                </Stack>
                            </Stack>
                        ))
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose} sx={{cursor: 'pointer'}}>
                    {rows.length === 0 ? t('common.close') : t('material.damage.impact.later')}
                </Button>
            </DialogActions>
        </BaseDialog>
    )
}

export default MaterialOutageImpactDialog
