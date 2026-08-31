import {
    Box,
    Chip,
    InputAdornment,
    Stack,
    Switch,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import {format} from 'date-fns'
import {useMemo, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {
    matchBadgeSummary,
    medalEmoji,
    SpeakerBadges,
    SpeakerMatch,
    SpeakerStatus,
    statusColorOf,
} from './speakerData.ts'
import {useSpeakerSettings} from './speakerSettings.ts'
import SpeakerPanel from './SpeakerPanel.tsx'

type ProgramView = 'program' | 'results'

type Props = {
    matches: SpeakerMatch[]
    badges: SpeakerBadges
    selectedMatchId: string | null
    onSelectMatch: (match: SpeakerMatch) => void
    /** Partien, die gerade in einer scharfen/laufenden Startsequenz stecken. */
    startingMatchIds: ReadonlySet<string>
    /** Partien mit stehendem Fehlstart-Banner. */
    falseStartMatchIds: ReadonlySet<string>
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

/**
 * Die linke Dashboard-Spalte: das Programm als kompakte, durchsuchbare Liste — der Ersatz für den
 * früheren Programm-Tab samt Ergebnis-Tab (umschaltbar in der Kopfzeile). Ein Klick wählt den Lauf
 * für das Detail-Panel in der Mitte; die Auswahl bleibt markiert stehen.
 */
const SpeakerProgramPanel = ({
    matches,
    badges,
    selectedMatchId,
    onSelectMatch,
    startingMatchIds,
    falseStartMatchIds,
}: Props) => {
    const {t} = useTranslation()
    const {settings, colors, updateSettings} = useSpeakerSettings()
    const [view, setView] = useState<ProgramView>('program')
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<SpeakerStatus | null>(null)

    const filtered = useMemo(() => {
        if (view === 'results') {
            return matches
                .filter(match => match.status === 'FINISHED' && matchesSearch(match, search))
                .sort(
                    (a, b) =>
                        (b.updatedAt?.getTime() ?? b.startTime?.getTime() ?? 0) -
                        (a.updatedAt?.getTime() ?? a.startTime?.getTime() ?? 0),
                )
        }
        return matches.filter(
            match =>
                (settings.programShowFinished || match.status !== 'FINISHED') &&
                (statusFilter == null || match.status === statusFilter) &&
                matchesSearch(match, search),
        )
    }, [matches, view, search, statusFilter, settings.programShowFinished])

    const winnerLine = (match: SpeakerMatch): string | null => {
        const winner = match.teams.find(team => team.place === 1)
        if (!winner) return null
        const name = winner.clubName ?? winner.clubsFull ?? winner.teamName ?? ''
        return `${medalEmoji(1)} ${name}${winner.timeString ? ` · ${winner.timeString}` : ''}`
    }

    return (
        <SpeakerPanel
            title={t(view === 'program' ? 'speaker.tabs.program' : 'speaker.tabs.results')}
            headerExtra={
                <ToggleButtonGroup
                    exclusive
                    size={'small'}
                    value={view}
                    onChange={(_, value: ProgramView | null) => {
                        if (value) setView(value)
                    }}
                    sx={{
                        '& .MuiToggleButton-root': {
                            color: colors.textSecondary,
                            borderColor: colors.border,
                            py: 0.25,
                            px: 1,
                            '&.Mui-selected': {color: colors.text, bgcolor: colors.panelHover},
                        },
                    }}>
                    <ToggleButton value={'program'}>{t('speaker.tabs.program')}</ToggleButton>
                    <ToggleButton value={'results'}>{t('speaker.tabs.results')}</ToggleButton>
                </ToggleButtonGroup>
            }
            settings={
                <>
                    <Stack direction={'row'} alignItems={'center'} justifyContent={'space-between'}>
                        <Typography variant={'body2'}>
                            {t('speaker.panelSettings.showFinished')}
                        </Typography>
                        <Switch
                            size={'small'}
                            checked={settings.programShowFinished}
                            onChange={(_, checked) =>
                                updateSettings({programShowFinished: checked})
                            }
                        />
                    </Stack>
                    <Stack direction={'row'} alignItems={'center'} justifyContent={'space-between'}>
                        <Typography variant={'body2'}>
                            {t('speaker.panelSettings.compactRows')}
                        </Typography>
                        <Switch
                            size={'small'}
                            checked={settings.programCompact}
                            onChange={(_, checked) => updateSettings({programCompact: checked})}
                        />
                    </Stack>
                </>
            }>
            <Box sx={{p: 1.5, pb: 0}}>
                <TextField
                    size={'small'}
                    fullWidth
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                    placeholder={t('speaker.program.searchPlaceholder')}
                    sx={{
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
                                    <SearchIcon
                                        fontSize={'small'}
                                        sx={{color: colors.textSecondary}}
                                    />
                                </InputAdornment>
                            ),
                        },
                    }}
                />
                {view === 'program' && (
                    <Stack direction={'row'} spacing={0.5} flexWrap={'wrap'} useFlexGap sx={{mt: 1}}>
                        {(['UPCOMING', 'RUNNING', 'FINISHED'] as const).map(status => {
                            const count = matches.filter(match => match.status === status).length
                            return (
                                <Chip
                                    key={status}
                                    size={'small'}
                                    label={`${t(`speaker.status.${status}`)} (${count})`}
                                    onClick={() =>
                                        setStatusFilter(current =>
                                            current === status ? null : status,
                                        )
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
                )}
            </Box>
            {filtered.length === 0 ? (
                <Typography sx={{color: colors.textSecondary, p: 3, textAlign: 'center'}}>
                    {t(view === 'program' ? 'speaker.program.empty' : 'speaker.results.empty')}
                </Typography>
            ) : (
                <Box sx={{p: 1, display: 'flex', flexDirection: 'column', gap: 0.5}}>
                    {filtered.map(match => {
                        const color = statusColorOf(colors, match.status)
                        const selected = match.matchId === selectedMatchId
                        const starting = startingMatchIds.has(match.matchId)
                        const falseStart = falseStartMatchIds.has(match.matchId)
                        const emoji = matchBadgeSummary(match, badges)
                        const winner = view === 'results' ? winnerLine(match) : null
                        return (
                            <Box
                                key={match.matchId}
                                onClick={() => onSelectMatch(match)}
                                sx={{
                                    display: 'flex',
                                    alignItems: 'baseline',
                                    gap: 1,
                                    px: 1,
                                    py: settings.programCompact ? 0.25 : 0.75,
                                    borderRadius: 1,
                                    borderLeft: `4px solid ${match.cancelled ? colors.now : color}`,
                                    bgcolor: selected ? colors.panelHover : 'transparent',
                                    outline: selected ? `1px solid ${color}` : 'none',
                                    cursor: 'pointer',
                                    '&:hover': {bgcolor: colors.panelHover},
                                    ...(match.cancelled && {opacity: 0.65}),
                                }}>
                                <Typography
                                    variant={'body2'}
                                    fontWeight={'bold'}
                                    sx={{
                                        minWidth: 44,
                                        color: match.status === 'RUNNING' ? color : colors.text,
                                        fontVariantNumeric: 'tabular-nums',
                                    }}>
                                    {match.startTime
                                        ? format(match.startTime, t('format.time'))
                                        : '–'}
                                </Typography>
                                <Box sx={{flex: 1, minWidth: 0}}>
                                    <Typography variant={'body2'} noWrap sx={{color: colors.text}}>
                                        <Typography
                                            component={'span'}
                                            variant={'body2'}
                                            fontWeight={'bold'}>
                                            {match.competitionName}
                                        </Typography>
                                        {match.categoryName ? ` (${match.categoryName})` : ''}
                                    </Typography>
                                    {!settings.programCompact && (
                                        <Typography
                                            variant={'caption'}
                                            noWrap
                                            sx={{color: colors.textSecondary, display: 'block'}}>
                                            {winner ??
                                                [
                                                    [match.roundName, match.matchName]
                                                        .filter(Boolean)
                                                        .join(' · ') || null,
                                                    match.teams.length > 0
                                                        ? t('speaker.program.teamCount', {
                                                              count: match.teams.length,
                                                          })
                                                        : null,
                                                ]
                                                    .filter(Boolean)
                                                    .join(' · ')}
                                        </Typography>
                                    )}
                                </Box>
                                <Typography variant={'caption'} sx={{whiteSpace: 'nowrap'}}>
                                    {emoji}
                                </Typography>
                                {falseStart ? (
                                    <Typography
                                        variant={'caption'}
                                        fontWeight={'bold'}
                                        sx={{color: colors.now, whiteSpace: 'nowrap'}}>
                                        ⚠ {t('speaker.timing.falseStartShort')}
                                    </Typography>
                                ) : starting ? (
                                    <Typography
                                        variant={'caption'}
                                        fontWeight={'bold'}
                                        sx={{color: colors.running, whiteSpace: 'nowrap'}}>
                                        ▶ {t('speaker.timing.startingShort')}
                                    </Typography>
                                ) : (
                                    match.status === 'RUNNING' &&
                                    view === 'program' && (
                                        <Typography
                                            variant={'caption'}
                                            fontWeight={'bold'}
                                            sx={{color, whiteSpace: 'nowrap'}}>
                                            ● {t('speaker.status.liveShort')}
                                        </Typography>
                                    )
                                )}
                            </Box>
                        )
                    })}
                </Box>
            )}
        </SpeakerPanel>
    )
}

export default SpeakerProgramPanel
