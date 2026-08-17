import {
    Autocomplete,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    TextField,
    Typography,
} from '@mui/material'
import {useMemo, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {assignTimeMark} from '@api/sdk.gen.ts'
import {ApiError, AssignTimeMarkRequest, TimingTeamDto} from '@api/types.gen.ts'
import {RequestResult} from '@hey-api/client-fetch'
import {useFeedback} from '@utils/hooks.ts'
import {BoardMark} from '@components/timing/useTimingBoardState.ts'

export type AssignTeamDialogProps = {
    open: boolean
    onClose: () => void
    eventId: string
    mark: BoardMark
    /** All of the event's teams, loaded once per board mount and sorted by start number. */
    teams: TimingTeamDto[]
    teamsLoading: boolean
    /**
     * Optimistic-update callback: called immediately with the new assignment (before the request
     * even goes out), and again with the previous value if the request ends up failing. The board's
     * websocket `assignmentChanged` echo is the authoritative confirmation.
     */
    onAssign: (timeMarkId: string, competitionMatchTeam: string | null) => void
}

function teamPrimaryLabel(team: TimingTeamDto): string {
    const start = team.startNumber !== undefined ? `#${team.startNumber}` : '#–'
    const name = team.teamName ?? team.clubName ?? ''
    const participants = team.participantNames.join(', ')
    const head = [start, name].filter(part => part.length > 0).join(' ')
    return participants.length > 0 ? `${head} — ${participants}` : head
}

function teamSecondaryLabel(team: TimingTeamDto): string {
    return [team.competitionName, team.matchName].filter((part): part is string => !!part).join(' · ')
}

/** Lowercased haystack of every field an operator might search by: start number and all names. */
function teamSearchHaystack(team: TimingTeamDto): string {
    return [team.startNumber?.toString(), team.teamName, team.clubName, ...team.participantNames]
        .filter((part): part is string => !!part)
        .join(' ')
        .toLowerCase()
}

/**
 * Dialog for assigning (or re-assigning, or detaching) a competition-match team to a captured time
 * mark. The Autocomplete searches the event's teams by start number or any name part; selecting an
 * option assigns it, the "Zuordnung lösen" action detaches (assigns `null`). Both paths update the
 * board optimistically via `onAssign` and roll back on failure.
 */
const AssignTeamDialog = ({
    open,
    onClose,
    eventId,
    mark,
    teams,
    teamsLoading,
    onAssign,
}: AssignTeamDialogProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const [submitting, setSubmitting] = useState(false)

    const currentTeam = useMemo(
        () => teams.find(team => team.competitionMatchTeam === mark.assignedTeam) ?? null,
        [teams, mark.assignedTeam],
    )

    const doAssign = async (competitionMatchTeam: string | null) => {
        const previous = mark.assignedTeam ?? null
        setSubmitting(true)
        onAssign(mark.id, competitionMatchTeam)
        onClose()
        try {
            // The generated request type declares `competitionMatchTeam` as an optional uuid
            // (`string | undefined`), a generation artifact of the same tsp-vs-yaml mismatch called
            // out elsewhere in the timing endpoints — the backend contract (and the websocket echo of
            // this same field) explicitly requires `null` to detach, so the body is cast to line up.
            const {error} = await (assignTimeMark({
                path: {eventId, timeMarkId: mark.id},
                body: {competitionMatchTeam} as unknown as AssignTimeMarkRequest,
            }) as unknown as RequestResult<void, ApiError, false>)
            if (error !== undefined) {
                // Not `error.message`: the backend's message is untranslated English, and none of its
                // failure cases are actionable enough to be worth distinguishing here.
                feedback.error(t('timing.assign.error'))
                onAssign(mark.id, previous)
            }
        } catch {
            feedback.error(t('common.error.unexpected'))
            onAssign(mark.id, previous)
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>{t('timing.assign.title')}</DialogTitle>
            <DialogContent>
                <Autocomplete
                    options={teams}
                    loading={teamsLoading}
                    value={currentTeam}
                    disabled={submitting}
                    autoHighlight
                    openOnFocus
                    getOptionLabel={teamPrimaryLabel}
                    isOptionEqualToValue={(option, value) =>
                        option.competitionMatchTeam === value.competitionMatchTeam
                    }
                    filterOptions={(options, state) => {
                        const search = state.inputValue.trim().toLowerCase()
                        if (search.length === 0) return options
                        return options.filter(option => teamSearchHaystack(option).includes(search))
                    }}
                    onChange={(_, value) => {
                        if (value !== null) void doAssign(value.competitionMatchTeam)
                    }}
                    renderOption={(props, option) => {
                        const {key, ...optionProps} = props
                        const secondary = teamSecondaryLabel(option)
                        return (
                            <li key={key} {...optionProps}>
                                <Stack sx={{py: 0.25}}>
                                    <Typography variant="body2">{teamPrimaryLabel(option)}</Typography>
                                    {secondary.length > 0 && (
                                        <Typography variant="caption" color="text.secondary">
                                            {secondary}
                                        </Typography>
                                    )}
                                </Stack>
                            </li>
                        )
                    }}
                    renderInput={params => (
                        <TextField {...params} autoFocus label={t('timing.assign.searchLabel')} sx={{mt: 1}} />
                    )}
                    sx={{mt: 1}}
                />
            </DialogContent>
            <DialogActions>
                {mark.assignedTeam !== undefined && (
                    <Button color="error" disabled={submitting} onClick={() => void doAssign(null)}>
                        {t('timing.assign.detach')}
                    </Button>
                )}
                <Button onClick={onClose} disabled={submitting}>
                    {t('common.cancel')}
                </Button>
            </DialogActions>
        </Dialog>
    )
}

export default AssignTeamDialog
