import {
    Box,
    Chip,
    Collapse,
    IconButton,
    InputAdornment,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from '@mui/material'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import SearchIcon from '@mui/icons-material/Search'
import {format} from 'date-fns'
import {Fragment, useMemo, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {
    matchBadgeSummary,
    medalEmoji,
    SpeakerBadges,
    SpeakerMatch,
    SpeakerStatus,
    statusColorOf,
} from './speakerData.ts'
import {useSpeakerColors} from './speakerSettings.ts'
import {ParticipantBadges} from './SpeakerBadges.tsx'

type Props = {
    matches: SpeakerMatch[]
    badges: SpeakerBadges
    onSelectMatch: (match: SpeakerMatch) => void
    onSelectParticipant: (participantId: string) => void
}

const matchesSearch = (match: SpeakerMatch, search: string): boolean => {
    if (!search) return true
    const haystack = [
        match.competitionName,
        match.categoryName,
        match.roundName,
        match.matchName,
        ...match.teams.flatMap(team => [
            team.clubName,
            team.clubsFull,
            team.teamName,
            ...team.participants.map(
                participant => `${participant.firstName} ${participant.lastName}`,
            ),
        ]),
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
    return search
        .toLowerCase()
        .split(/\s+/)
        .every(word => haystack.includes(word))
}

const SpeakerProgramTable = ({matches, badges, onSelectMatch, onSelectParticipant}: Props) => {
    const {t} = useTranslation()
    const colors = useSpeakerColors()
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<SpeakerStatus | null>(null)
    const [expanded, setExpanded] = useState<Set<string>>(new Set())

    const filtered = useMemo(
        () =>
            matches.filter(
                match =>
                    (statusFilter == null || match.status === statusFilter) &&
                    matchesSearch(match, search),
            ),
        [matches, search, statusFilter],
    )

    const toggleExpanded = (matchId: string) =>
        setExpanded(previous => {
            const next = new Set(previous)
            if (next.has(matchId)) {
                next.delete(matchId)
            } else {
                next.add(matchId)
            }
            return next
        })

    const headerCellSx = {
        color: colors.textSecondary,
        borderBottom: `1px solid ${colors.border}`,
        fontWeight: 'bold',
        whiteSpace: 'nowrap',
    }

    const bodyCellSx = {
        color: colors.text,
        borderBottom: `1px solid ${colors.border}`,
    }

    return (
        <Box>
            <Stack direction={'row'} spacing={1} flexWrap={'wrap'} useFlexGap sx={{mb: 1.5}}>
                <TextField
                    size={'small'}
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                    placeholder={t('speaker.program.searchPlaceholder')}
                    sx={{
                        minWidth: 280,
                        '& .MuiOutlinedInput-root': {
                            color: colors.text,
                            '& fieldset': {borderColor: colors.border},
                            '&:hover fieldset': {borderColor: colors.textSecondary},
                        },
                        '& input::placeholder': {color: colors.textSecondary, opacity: 1},
                    }}
                    slotProps={{
                        input: {
                            startAdornment: (
                                <InputAdornment position={'start'}>
                                    <SearchIcon sx={{color: colors.textSecondary}} />
                                </InputAdornment>
                            ),
                        },
                    }}
                />
                <Chip
                    label={`${t('speaker.program.all')} (${matches.length})`}
                    onClick={() => setStatusFilter(null)}
                    variant={statusFilter == null ? 'filled' : 'outlined'}
                    sx={{
                        color: colors.text,
                        borderColor: colors.border,
                        bgcolor: statusFilter == null ? colors.panelHover : 'transparent',
                    }}
                />
                {(['UPCOMING', 'RUNNING', 'FINISHED'] as const).map(status => {
                    const count = matches.filter(match => match.status === status).length
                    return (
                        <Chip
                            key={status}
                            label={`${t(`speaker.status.${status}`)} (${count})`}
                            onClick={() =>
                                setStatusFilter(current => (current === status ? null : status))
                            }
                            variant={statusFilter === status ? 'filled' : 'outlined'}
                            sx={{
                                color: statusColorOf(colors, status),
                                borderColor: statusColorOf(colors, status),
                                bgcolor:
                                    statusFilter === status
                                        ? `${statusColorOf(colors, status)}22`
                                        : 'transparent',
                                fontWeight: 'bold',
                            }}
                        />
                    )
                })}
            </Stack>
            {filtered.length === 0 ? (
                <Typography sx={{color: colors.textSecondary, p: 4, textAlign: 'center'}}>
                    {t('speaker.program.empty')}
                </Typography>
            ) : (
                <Table size={'small'}>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={headerCellSx} width={40} />
                            <TableCell sx={headerCellSx}>{t('speaker.match.start')}</TableCell>
                            <TableCell sx={headerCellSx}>{t('speaker.program.status')}</TableCell>
                            <TableCell sx={headerCellSx}>
                                {t('speaker.program.competition')}
                            </TableCell>
                            <TableCell sx={headerCellSx}>{t('speaker.program.round')}</TableCell>
                            <TableCell sx={headerCellSx} align={'center'}>
                                {t('speaker.program.teams')}
                            </TableCell>
                            <TableCell sx={headerCellSx} align={'center'}>
                                {t('speaker.program.badges')}
                            </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {filtered.map(match => {
                            const isExpanded = expanded.has(match.matchId)
                            return (
                                <Fragment key={match.matchId}>
                                    <TableRow
                                        hover
                                        onClick={() => toggleExpanded(match.matchId)}
                                        sx={{
                                            cursor: 'pointer',
                                            '&:hover': {bgcolor: colors.panelHover},
                                        }}>
                                        <TableCell sx={bodyCellSx}>
                                            <IconButton
                                                size={'small'}
                                                sx={{color: colors.textSecondary}}>
                                                {isExpanded ? (
                                                    <KeyboardArrowUpIcon />
                                                ) : (
                                                    <KeyboardArrowDownIcon />
                                                )}
                                            </IconButton>
                                        </TableCell>
                                        <TableCell sx={{...bodyCellSx, whiteSpace: 'nowrap'}}>
                                            <Typography fontWeight={'bold'} variant={'body2'}>
                                                {match.startTime
                                                    ? format(match.startTime, t('format.time'))
                                                    : '–'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell sx={{...bodyCellSx, whiteSpace: 'nowrap'}}>
                                            <Typography
                                                variant={'body2'}
                                                fontWeight={'bold'}
                                                sx={{
                                                    color: match.cancelled
                                                        ? colors.now
                                                        : statusColorOf(colors, match.status),
                                                }}>
                                                {match.cancelled ? (
                                                    t('speaker.status.CANCELLED')
                                                ) : (
                                                    <>
                                                        {match.status === 'RUNNING' && '● '}
                                                        {match.status === 'FINISHED' && '✓ '}
                                                        {t(`speaker.status.${match.status}`)}
                                                    </>
                                                )}
                                            </Typography>
                                        </TableCell>
                                        <TableCell sx={bodyCellSx}>
                                            <Typography variant={'body2'} fontWeight={'bold'}>
                                                {match.competitionName}
                                            </Typography>
                                            {match.categoryName && (
                                                <Typography
                                                    variant={'caption'}
                                                    sx={{color: colors.textSecondary}}>
                                                    {match.categoryName}
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell sx={bodyCellSx}>
                                            <Typography variant={'body2'}>
                                                {[match.roundName, match.matchName]
                                                    .filter(Boolean)
                                                    .join(' · ') || '–'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell sx={bodyCellSx} align={'center'}>
                                            {match.teams.length}
                                        </TableCell>
                                        <TableCell sx={bodyCellSx} align={'center'}>
                                            {matchBadgeSummary(match, badges)}
                                        </TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell
                                            colSpan={7}
                                            sx={{
                                                p: 0,
                                                border: 0,
                                                bgcolor: colors.background,
                                            }}>
                                            <Collapse in={isExpanded} unmountOnExit>
                                                <Box sx={{px: 6, py: 1.5}}>
                                                    {[...match.teams]
                                                        .sort(
                                                            (a, b) =>
                                                                (a.place ??
                                                                    a.startNumber ??
                                                                    Number.MAX_SAFE_INTEGER) -
                                                                (b.place ??
                                                                    b.startNumber ??
                                                                    Number.MAX_SAFE_INTEGER),
                                                        )
                                                        .map(team => (
                                                            <Stack
                                                                key={team.teamId}
                                                                direction={'row'}
                                                                spacing={2}
                                                                alignItems={'baseline'}
                                                                sx={{py: 0.25}}>
                                                                <Typography
                                                                    variant={'body2'}
                                                                    fontWeight={'bold'}
                                                                    sx={{
                                                                        minWidth: 42,
                                                                        color: colors.textSecondary,
                                                                    }}>
                                                                    {match.status === 'FINISHED' &&
                                                                    team.place != undefined
                                                                        ? `${team.place <= 3 ? medalEmoji(team.place) : ''}${team.place}.`
                                                                        : (team.startNumber ?? '–')}
                                                                </Typography>
                                                                <Typography
                                                                    variant={'body2'}
                                                                    fontWeight={'bold'}
                                                                    sx={{
                                                                        minWidth: 180,
                                                                        color: colors.text,
                                                                    }}>
                                                                    {team.clubName ??
                                                                        team.clubsFull ??
                                                                        ''}
                                                                    {team.teamName
                                                                        ? ` – ${team.teamName}`
                                                                        : ''}
                                                                </Typography>
                                                                <Typography
                                                                    variant={'body2'}
                                                                    sx={{
                                                                        color: colors.textSecondary,
                                                                    }}>
                                                                    {team.participants.map(
                                                                        (participant, index) => (
                                                                            <Fragment
                                                                                key={
                                                                                    participant.participantId
                                                                                }>
                                                                                {index > 0 && ', '}
                                                                                <Typography
                                                                                    component={
                                                                                        'span'
                                                                                    }
                                                                                    variant={
                                                                                        'body2'
                                                                                    }
                                                                                    onClick={event => {
                                                                                        event.stopPropagation()
                                                                                        onSelectParticipant(
                                                                                            participant.participantId,
                                                                                        )
                                                                                    }}
                                                                                    sx={{
                                                                                        cursor: 'pointer',
                                                                                        '&:hover': {
                                                                                            color: colors.upcoming,
                                                                                        },
                                                                                    }}>
                                                                                    {
                                                                                        participant.firstName
                                                                                    }{' '}
                                                                                    {
                                                                                        participant.lastName
                                                                                    }
                                                                                </Typography>
                                                                                <ParticipantBadges
                                                                                    participant={
                                                                                        participant
                                                                                    }
                                                                                    badges={badges}
                                                                                    currentMatchId={
                                                                                        match.matchId
                                                                                    }
                                                                                />
                                                                            </Fragment>
                                                                        ),
                                                                    )}
                                                                </Typography>
                                                                {team.timeString && (
                                                                    <Typography
                                                                        variant={'body2'}
                                                                        sx={{
                                                                            ml: 'auto',
                                                                            color: colors.text,
                                                                        }}>
                                                                        {team.timeString}
                                                                    </Typography>
                                                                )}
                                                            </Stack>
                                                        ))}
                                                    <Typography
                                                        variant={'caption'}
                                                        sx={{
                                                            color: colors.upcoming,
                                                            cursor: 'pointer',
                                                            display: 'inline-block',
                                                            mt: 0.5,
                                                        }}
                                                        onClick={() => onSelectMatch(match)}>
                                                        {t('speaker.program.openDetails')} →
                                                    </Typography>
                                                </Box>
                                            </Collapse>
                                        </TableCell>
                                    </TableRow>
                                </Fragment>
                            )
                        })}
                    </TableBody>
                </Table>
            )}
        </Box>
    )
}

export default SpeakerProgramTable
