import {useState} from 'react'
import {
    Autocomplete,
    Button,
    Chip,
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
    MaterialOverviewItemDto,
    MaterialOverviewMatchDto,
    MaterialOverviewRequestDto,
} from '@api/types.gen.ts'
import {useFeedback} from '@utils/hooks.ts'
import {isRequestNetworkError, runRequest} from '@utils/request.ts'
import {materialErrorKey} from '@components/material/materialErrors.ts'
import {itemLabel} from '@components/material/materialWorkplace.ts'
import {AssignmentChange, assignmentEntriesAfter} from '@components/material/assignmentEntries.ts'
import {useReloadGate} from '@components/material/reloadGate.ts'
import {startNumberInMatch} from '@components/material/materialNumbers.ts'
import {roundMatchLabel} from '@utils/roundMatchLabel.ts'

type Props = {
    open: boolean
    eventId: string
    providerId: string
    /** null solange der Dialog geschlossen ist. */
    request: MaterialOverviewRequestDto | null
    matches: MaterialOverviewMatchDto[]
    items: MaterialOverviewItemDto[]
    /** Lädt die Übersicht gerade? Hält die Sperre bis zum frischen Stand. */
    pending: boolean
    onClose: () => void
    onChanged: () => void
}

type Option = {id: string; label: string; sameNumber?: boolean}

const matchLabel = (match: MaterialOverviewMatchDto): string =>
    roundMatchLabel(match.roundName, match.name) || match.id

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
    pending,
    onClose,
    onChanged,
}: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [selectedMatch, setSelectedMatch] = useState<Option | null>(null)
    const [selectedItem, setSelectedItem] = useState<Option | null>(null)
    const [submitting, setSubmitting] = useState(false)
    // Nach einem Erfolg erst wieder ändern, wenn der neue Stand da ist: Jede Änderung schickt die
    // Komplettliste, ein Klick auf altem Stand überschriebe die gerade gespeicherte.
    const gate = useReloadGate(request, pending)
    const locked = submitting || gate.locked

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

    /** Lauf samt Startnummer des Teams dort – die Zahl, gegen die die Anzeigen prüfen. */
    const matchOptionLabel = (m: MaterialOverviewMatchDto) => {
        const number = startNumberInMatch(m, request.competitionRegistration)
        return number != null
            ? `${matchLabel(m)} · ${t('material.number.start', {number})}`
            : matchLabel(m)
    }
    const matchOptions: Option[] = relevantMatches.map(m => ({
        id: m.id,
        label: matchOptionLabel(m),
    }))
    const selectedStartNumber =
        selectedMatch != null
            ? startNumberInMatch(
                  relevantMatches.find(m => m.id === selectedMatch.id),
                  request.competitionRegistration,
              )
            : undefined
    const itemOptions: Option[] = relevantItems
        .map(i => ({
            id: i.id,
            label: itemLabel(i),
            sameNumber: selectedStartNumber != null && i.number === selectedStartNumber,
        }))
        .sort((a, b) => (a.sameNumber === b.sameNumber ? 0 : a.sameNumber ? -1 : 1))

    const matchesById = new Map(relevantMatches.map(m => [m.id, m]))
    const itemsById = new Map(items.map(i => [i.id, i]))
    const exceptions = request.assignments.filter(a => a.competitionMatch != null)

    const submitChange = async (change: AssignmentChange) => {
        if (locked) return
        const {error} = await runRequest(setSubmitting, () =>
            setMaterialAssignments({
                path: {eventId, providerId, requestId: request.id},
                body: {assignments: assignmentEntriesAfter(request.assignments, change)},
            }),
        )
        if (isRequestNetworkError(error)) {
            feedback.error(t('common.error.network'))
        } else if (error) {
            const key = materialErrorKey(error)
            feedback.error(t(key ?? 'material.assignment.exceptionDialog.error'))
            // Fachlicher Konflikt = veralteter Stand (z. B. Runde neu gesetzt): neu laden.
            if (key) onChanged()
        } else {
            feedback.success(t('material.assignment.exceptionDialog.success'))
            gate.arm()
            onChanged()
        }
    }

    const handleAdd = () => {
        if (selectedMatch == null || selectedItem == null) {
            return
        }
        const change: AssignmentChange = {
            kind: 'addException',
            matchId: selectedMatch.id,
            itemId: selectedItem.id,
        }
        setSelectedMatch(null)
        setSelectedItem(null)
        void submitChange(change)
    }

    const handleRemove = (assignmentId: string) => void submitChange({kind: 'remove', assignmentId})

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
                                                aria-label={t(
                                                    'material.assignment.exceptionDialog.remove',
                                                )}
                                                onClick={() => handleRemove(exception.id)}
                                                disabled={locked}
                                                sx={{cursor: 'pointer'}}>
                                                <DeleteIcon />
                                            </IconButton>
                                        }>
                                        <ListItemText
                                            primary={
                                                item ? itemLabel(item) : exception.materialItem
                                            }
                                            secondary={
                                                match
                                                    ? matchOptionLabel(match)
                                                    : exception.competitionMatch
                                            }
                                        />
                                    </ListItem>
                                )
                            })}
                        </List>
                    )}
                    <Typography variant={'body2'} color={'text.secondary'}>
                        {t('material.assignment.exceptionDialog.hint')}
                    </Typography>
                    <Stack direction={{xs: 'column', sm: 'row'}} spacing={2}>
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
                            renderOption={(liProps, option) => (
                                <li {...liProps} key={option.id}>
                                    {option.label}
                                    {option.sameNumber && (
                                        <Chip
                                            size={'small'}
                                            sx={{ml: 1}}
                                            label={t('material.damage.impact.sameNumber')}
                                        />
                                    )}
                                </li>
                            )}
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
                <Button onClick={handleClose} sx={{cursor: 'pointer'}}>
                    {t('common.close')}
                </Button>
                <Button
                    variant={'contained'}
                    disabled={selectedMatch == null || selectedItem == null || locked}
                    onClick={handleAdd}
                    sx={{cursor: 'pointer'}}>
                    {t('material.assignment.exceptionDialog.add')}
                </Button>
            </DialogActions>
        </BaseDialog>
    )
}

export default MaterialExceptionDialog
