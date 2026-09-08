import {useState} from 'react'
import {
    Autocomplete,
    Button,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    List,
    ListItem,
    ListItemText,
    Stack,
    TextField,
    Typography,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import {useTranslation} from 'react-i18next'
import BaseDialog from '@components/BaseDialog.tsx'
import {setMaterialAssignments} from '@api/sdk.gen.ts'
import {
    MaterialAssignmentEntry,
    MaterialOverviewItemDto,
    MaterialOverviewMatchDto,
    MaterialOverviewRequestDto,
} from '@api/types.gen.ts'
import {useFeedback} from '@utils/hooks.ts'

type Props = {
    open: boolean
    eventId: string
    providerId: string
    /** null solange der Dialog geschlossen ist. */
    request: MaterialOverviewRequestDto | null
    matches: MaterialOverviewMatchDto[]
    items: MaterialOverviewItemDto[]
    onClose: () => void
    onChanged: () => void
}

type Option = {id: string; label: string}

const matchLabel = (match: MaterialOverviewMatchDto): string =>
    [match.roundName, match.name].filter(Boolean).join(' · ') || match.id

const itemLabel = (item: {label: string; number?: number}): string =>
    item.number != null ? `${item.label} #${item.number}` : item.label

const toEntries = (
    assignments: MaterialOverviewRequestDto['assignments'],
): MaterialAssignmentEntry[] =>
    assignments.map(a => ({materialItem: a.materialItem, competitionMatch: a.competitionMatch}))

/**
 * Ausnahme je Lauf: für einen Lauf dieser Meldung ein anderes Stück als die Grundzuteilung.
 * Läufe kommen ausschließlich aus den Läufen der eigenen Meldung (matches.registrationIds),
 * Stücke aus der Materialart der Anfrage. Jede Änderung ersetzt die komplette Zuteilung, wie
 * es setMaterialAssignments verlangt - die bestehenden Einträge werden dafür mitgeschickt.
 */
const MaterialExceptionDialog = ({
    open,
    eventId,
    providerId,
    request,
    matches,
    items,
    onClose,
    onChanged,
}: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [selectedMatch, setSelectedMatch] = useState<Option | null>(null)
    const [selectedItem, setSelectedItem] = useState<Option | null>(null)
    const [submitting, setSubmitting] = useState(false)

    const handleClose = () => {
        setSelectedMatch(null)
        setSelectedItem(null)
        onClose()
    }

    if (request == null) {
        return null
    }

    const relevantMatches = matches.filter(m =>
        m.registrationIds.includes(request.competitionRegistration),
    )
    const relevantItems = [...items.filter(i => i.materialType === request.materialType)].sort(
        (a, b) => (a.status === b.status ? 0 : a.status === 'ACTIVE' ? -1 : 1),
    )

    const matchOptions: Option[] = relevantMatches.map(m => ({id: m.id, label: matchLabel(m)}))
    const itemOptions: Option[] = relevantItems.map(i => ({id: i.id, label: itemLabel(i)}))

    const matchesById = new Map(relevantMatches.map(m => [m.id, m]))
    const itemsById = new Map(items.map(i => [i.id, i]))
    const exceptions = request.assignments.filter(a => a.competitionMatch != null)

    const submitEntries = async (entries: MaterialAssignmentEntry[]) => {
        setSubmitting(true)
        const {error} = await setMaterialAssignments({
            path: {eventId, providerId, requestId: request.id},
            body: {assignments: entries},
        })
        setSubmitting(false)
        if (error) {
            feedback.error(t('material.assignment.exceptionDialog.error'))
        } else {
            feedback.success(t('material.assignment.exceptionDialog.success'))
            onChanged()
        }
    }

    const handleAdd = () => {
        if (selectedMatch == null || selectedItem == null) {
            return
        }
        const entries: MaterialAssignmentEntry[] = [
            ...toEntries(request.assignments),
            {materialItem: selectedItem.id, competitionMatch: selectedMatch.id},
        ]
        setSelectedMatch(null)
        setSelectedItem(null)
        void submitEntries(entries)
    }

    const handleRemove = (assignmentId: string) => {
        void submitEntries(toEntries(request.assignments.filter(a => a.id !== assignmentId)))
    }

    return (
        <BaseDialog open={open} onClose={handleClose} maxWidth={'sm'}>
            <DialogTitle>{t('material.assignment.exceptionDialog.title')}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{mt: 1}}>
                    {exceptions.length === 0 ? (
                        <Typography color={'text.secondary'}>
                            {t('material.assignment.exceptionDialog.none')}
                        </Typography>
                    ) : (
                        <List dense>
                            {exceptions.map(exception => {
                                const match = matchesById.get(exception.competitionMatch ?? '')
                                const item = itemsById.get(exception.materialItem)
                                return (
                                    <ListItem
                                        key={exception.id}
                                        secondaryAction={
                                            <IconButton
                                                edge={'end'}
                                                onClick={() => handleRemove(exception.id)}
                                                disabled={submitting}>
                                                <DeleteIcon />
                                            </IconButton>
                                        }>
                                        <ListItemText
                                            primary={
                                                item ? itemLabel(item) : exception.materialItem
                                            }
                                            secondary={
                                                match
                                                    ? matchLabel(match)
                                                    : exception.competitionMatch
                                            }
                                        />
                                    </ListItem>
                                )
                            })}
                        </List>
                    )}
                    <Stack direction={'row'} spacing={2}>
                        <Autocomplete
                            options={matchOptions}
                            value={selectedMatch}
                            onChange={(_, v) => setSelectedMatch(v)}
                            getOptionLabel={o => o.label}
                            isOptionEqualToValue={(o, v) => o.id === v.id}
                            renderInput={params => (
                                <TextField
                                    {...params}
                                    label={t('material.assignment.exceptionDialog.match')}
                                    size={'small'}
                                />
                            )}
                            sx={{flex: 1}}
                        />
                        <Autocomplete
                            options={itemOptions}
                            value={selectedItem}
                            onChange={(_, v) => setSelectedItem(v)}
                            getOptionLabel={o => o.label}
                            isOptionEqualToValue={(o, v) => o.id === v.id}
                            renderInput={params => (
                                <TextField
                                    {...params}
                                    label={t('material.assignment.exceptionDialog.item')}
                                    size={'small'}
                                />
                            )}
                            sx={{flex: 1}}
                        />
                    </Stack>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>{t('common.close')}</Button>
                <Button
                    variant={'contained'}
                    disabled={selectedMatch == null || selectedItem == null || submitting}
                    onClick={handleAdd}>
                    {t('material.assignment.exceptionDialog.add')}
                </Button>
            </DialogActions>
        </BaseDialog>
    )
}

export default MaterialExceptionDialog
