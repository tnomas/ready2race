import {
    Autocomplete,
    Box,
    CircularProgress,
    IconButton,
    InputAdornment,
    ListSubheader,
    TextField,
    Tooltip,
    Typography,
    useMediaQuery,
    useTheme,
} from '@mui/material'
import {Close, EmojiEventsOutlined, Event as EventIcon, Search} from '@mui/icons-material'
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {useLocation, useNavigate, useRouter} from '@tanstack/react-router'
import {useTranslation} from 'react-i18next'
import {getCompetitions, getEvents} from '@api/sdk.gen.ts'
import {useUser} from '@contexts/user/UserContext.ts'
import {useFetch} from '@utils/hooks.ts'
import {
    buildQuickJumpOptions,
    isQuickJumpShortcut,
    QUICK_JUMP_DEBOUNCE_MS,
    QUICK_JUMP_GROUP_LIMIT,
    quickJumpContext,
    QuickJumpGroup,
    quickJumpGroup,
    QuickJumpOption,
    quickJumpTarget,
    rankQuickJumpCompetitions,
    rankQuickJumpEvents,
    rankQuickJumpSections,
    shouldSearchQuickJumpEvents,
} from '@utils/navigation/quickJump.ts'
import {EVENT_SECTIONS, visibleEventSections} from '../../pages/event/eventSections.ts'
import {formatEventDateRange} from '@components/dashboard/currentEventsLogic.ts'

const INPUT_ID = 'ready2race-quick-jump'

const GROUP_LABEL_KEYS = {
    sections: 'quickJump.groups.sections',
    competitions: 'quickJump.groups.competitions',
    events: 'quickJump.groups.events',
} as const satisfies Record<QuickJumpGroup, string>

/** Ist gerade ein Dialog, Menü oder die Seitenleiste (als Schublade) offen? */
const isModalOpen = (): boolean =>
    typeof document !== 'undefined' &&
    document.querySelector('.MuiModal-root:not(.MuiModal-hidden)') !== null

/**
 * Schnellsprung in der Kopfleiste: ein Suchfeld, das ohne Umweg zu einer Veranstaltung, zu einem
 * Bereich der aktuellen Veranstaltung oder zu einem ihrer Wettkämpfe springt. Öffnet auch mit „/"
 * (außerhalb von Eingabefeldern), Escape schließt. Auf schmalen Bildschirmen ein Lupen-Knopf, der
 * das Feld über die Kopfleiste legt.
 *
 * Regeln (Treffer, Rangfolge, Ziele, Tastenkürzel) in `utils/navigation/quickJump.ts`.
 * Nur für angemeldete Personen; der Rahmen blendet ihn auf Vollbild-Arbeitsplätzen aus.
 */
const QuickJump = () => {
    const {t, i18n} = useTranslation()
    const theme = useTheme()
    const compact = useMediaQuery(theme.breakpoints.down('sm'))
    const user = useUser()
    const navigate = useNavigate()
    const router = useRouter()
    const location = useLocation()
    const inputRef = useRef<HTMLInputElement | null>(null)

    const [expanded, setExpanded] = useState(false) // nur schmal: Feld über die Kopfleiste gelegt
    const [open, setOpen] = useState(false)
    const [input, setInput] = useState('')
    const [debouncedInput, setDebouncedInput] = useState('')

    const context = useMemo(
        () =>
            quickJumpContext(
                location.pathname,
                location.search as Record<string, unknown>,
                router.basepath,
            ),
        [location.pathname, location.search, router.basepath],
    )
    const eventId = context?.eventId

    const canSearchEvents = user.getPrivilegeScope('READ', 'EVENT') !== undefined

    // Entprellen: erst nach einer Tipp-Pause beim Server suchen.
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedInput(input), QUICK_JUMP_DEBOUNCE_MS)
        return () => clearTimeout(timer)
    }, [input])

    const eventQuery = debouncedInput.trim()
    const searchEvents = open && canSearchEvents && shouldSearchQuickJumpEvents(eventQuery)

    // Jede neue Suche bricht die vorige ab (useFetch: AbortController je Abruf) – eine späte
    // Antwort auf einen älteren Suchbegriff kann den neueren Stand nicht überschreiben.
    const events = useFetch(
        signal =>
            getEvents({
                signal,
                query: {
                    search: eventQuery,
                    limit: QUICK_JUMP_GROUP_LIMIT,
                    sort: JSON.stringify([{field: 'NAME', direction: 'ASC'}]),
                },
            }),
        {preCondition: () => searchEvents, deps: [searchEvents, eventQuery]},
    )

    // Die Wettkampfliste erst beim ersten Öffnen innerhalb einer Veranstaltung laden, dann für
    // diese Veranstaltung behalten – keine zusätzliche Last auf jeder Seite.
    const [competitionsFor, setCompetitionsFor] = useState<string | null>(null)
    useEffect(() => {
        if (open && eventId !== undefined && competitionsFor !== eventId) {
            setCompetitionsFor(eventId)
        }
    }, [open, eventId, competitionsFor])
    const loadCompetitions = competitionsFor !== null && competitionsFor === eventId
    const competitions = useFetch(
        signal =>
            getCompetitions({
                signal,
                path: {eventId: competitionsFor!},
                query: {sort: JSON.stringify([{field: 'IDENTIFIER', direction: 'ASC'}])},
            }),
        {preCondition: () => loadCompetitions, deps: [loadCompetitions, competitionsFor]},
    )

    const sectionInputs = useMemo(
        () =>
            eventId === undefined
                ? []
                : visibleEventSections(user).map(s => ({key: s.key, label: t(s.labelKey)})),
        [eventId, user, t],
    )

    const options = useMemo(() => {
        if (!user.loggedIn) return []
        return buildQuickJumpOptions({
            sections:
                eventId === undefined ? [] : rankQuickJumpSections(input, eventId, sectionInputs),
            competitions:
                eventId === undefined || !loadCompetitions
                    ? []
                    : rankQuickJumpCompetitions(input, eventId, competitions.data?.data ?? []),
            // Nur Treffer, die zum angezeigten Suchbegriff gehören (sonst flackert beim Tippen
            // das Ergebnis des vorigen Begriffs auf).
            events:
                searchEvents && input.trim() === eventQuery
                    ? rankQuickJumpEvents(input, events.data?.data ?? [])
                    : [],
        })
    }, [
        user.loggedIn,
        eventId,
        input,
        sectionInputs,
        loadCompetitions,
        competitions.data,
        searchEvents,
        eventQuery,
        events.data,
    ])

    const waitingForEvents =
        canSearchEvents &&
        shouldSearchQuickJumpEvents(input) &&
        (input.trim() !== eventQuery || events.pending)
    const loading = waitingForEvents || (loadCompetitions && competitions.pending)

    const focusInput = useCallback(() => {
        // Nach dem Aufklappen (schmal) steht das Feld erst im nächsten Bild.
        requestAnimationFrame(() => {
            inputRef.current?.focus()
            setOpen(true)
        })
    }, [])

    const close = useCallback(() => {
        setOpen(false)
        setInput('')
        setExpanded(false)
        inputRef.current?.blur()
    }, [])

    // Tastenkürzel „/"
    useEffect(() => {
        if (!user.loggedIn) return
        const onKeyDown = (e: KeyboardEvent) => {
            const target = e.target instanceof HTMLElement ? e.target : null
            if (!isQuickJumpShortcut(e, target, isModalOpen())) return
            e.preventDefault()
            setExpanded(true)
            focusInput()
        }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
    }, [user.loggedIn, focusInput])

    const jump = (option: QuickJumpOption) => {
        const target = quickJumpTarget(option, context)
        close()
        void navigate(target)
    }

    if (!user.loggedIn) return null

    const noOptionsText =
        (competitions.error || events.error) && !loading
            ? t('quickJump.error')
            : eventId === undefined && !shouldSearchQuickJumpEvents(input)
              ? t('quickJump.typeMore')
              : t('quickJump.noResults')

    const field = (
        <Autocomplete<QuickJumpOption, false, false, false>
            id={INPUT_ID}
            open={open}
            onOpen={() => setOpen(true)}
            onClose={(_e, reason) => {
                // Escape schließt ganz (auch das aufgeklappte Feld); Verlassen schließt die Liste.
                if (reason === 'escape') close()
                else setOpen(false)
            }}
            options={options}
            value={null}
            inputValue={input}
            onInputChange={(_e, value, reason) => {
                if (reason !== 'reset') setInput(value)
            }}
            onChange={(_e, option) => {
                if (option) jump(option)
            }}
            filterOptions={x => x}
            groupBy={o => quickJumpGroup(o)}
            getOptionLabel={o => o.label}
            getOptionKey={o => o.id}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            loading={loading}
            loadingText={t('quickJump.loading')}
            noOptionsText={noOptionsText}
            openOnFocus
            forcePopupIcon={false}
            autoHighlight
            blurOnSelect
            clearOnBlur={false}
            handleHomeEndKeys
            size={'small'}
            sx={{width: compact ? '100%' : {sm: 220, md: 280, lg: 340}}}
            slotProps={{
                popper: {className: 'ready2race', sx: {minWidth: 300}},
                listbox: {sx: {maxHeight: '70vh'}},
            }}
            onBlur={() => {
                if (compact) close()
            }}
            renderGroup={params => (
                <li key={params.key}>
                    <ListSubheader component={'div'} sx={{lineHeight: '32px'}}>
                        {t(GROUP_LABEL_KEYS[params.group as QuickJumpGroup])}
                    </ListSubheader>
                    <Box component={'ul'} sx={{p: 0}}>
                        {params.children}
                    </Box>
                </li>
            )}
            renderOption={(props, option) => {
                const {key, ...rest} = props
                return (
                    <Box component={'li'} key={key} {...rest} sx={{gap: 1.5, cursor: 'pointer'}}>
                        <OptionIcon option={option} />
                        <Box sx={{minWidth: 0}}>
                            <Typography variant={'body2'} noWrap>
                                {option.kind === 'competition' ? (
                                    <>
                                        <Box component={'span'} sx={{fontWeight: 600}}>
                                            {option.identifier}
                                        </Box>
                                        {option.shortName && ` · ${option.shortName}`}
                                    </>
                                ) : (
                                    option.label
                                )}
                            </Typography>
                            {option.kind === 'competition' && (
                                <Typography variant={'caption'} color={'text.secondary'} noWrap>
                                    {option.name}
                                </Typography>
                            )}
                            {option.kind === 'event' && (
                                <Typography variant={'caption'} color={'text.secondary'} noWrap>
                                    {formatEventDateRange(
                                        option.firstEventDay,
                                        option.lastEventDay,
                                        i18n.language,
                                    )}
                                </Typography>
                            )}
                        </Box>
                    </Box>
                )
            }}
            renderInput={params => (
                <TextField
                    {...params}
                    inputRef={inputRef}
                    placeholder={t('quickJump.placeholder')}
                    slotProps={{
                        htmlInput: {
                            ...params.inputProps,
                            'aria-label': t('quickJump.label'),
                            'aria-keyshortcuts': '/',
                        },
                        input: {
                            ...params.InputProps,
                            startAdornment: (
                                <InputAdornment position={'start'}>
                                    <Search fontSize={'small'} />
                                </InputAdornment>
                            ),
                            endAdornment: (
                                <>
                                    {loading && <CircularProgress color={'inherit'} size={16} />}
                                    {compact ? (
                                        <IconButton
                                            size={'small'}
                                            aria-label={t('quickJump.close')}
                                            onMouseDown={e => e.preventDefault()}
                                            onClick={close}
                                            sx={{cursor: 'pointer'}}>
                                            <Close fontSize={'small'} />
                                        </IconButton>
                                    ) : (
                                        params.InputProps.endAdornment
                                    )}
                                </>
                            ),
                        },
                    }}
                />
            )}
        />
    )

    if (!compact) return field

    return (
        <>
            <Tooltip title={t('quickJump.open')}>
                <IconButton
                    aria-label={t('quickJump.open')}
                    aria-expanded={expanded}
                    aria-controls={expanded ? INPUT_ID : undefined}
                    onClick={() => {
                        setExpanded(true)
                        focusInput()
                    }}
                    sx={{cursor: 'pointer'}}>
                    <Search />
                </IconButton>
            </Tooltip>
            {expanded && (
                <Box
                    sx={{
                        position: 'absolute',
                        inset: 0,
                        zIndex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        px: 1,
                        bgcolor: 'background.paper',
                    }}>
                    {field}
                </Box>
            )}
        </>
    )
}

const OptionIcon = ({option}: {option: QuickJumpOption}) => {
    const sx = {color: 'text.secondary', fontSize: 20, flexShrink: 0}
    if (option.kind === 'section') {
        const Icon = EVENT_SECTIONS.find(s => s.key === option.section)?.icon
        return Icon ? <Icon sx={sx} /> : null
    }
    if (option.kind === 'competition') return <EmojiEventsOutlined sx={sx} />
    return <EventIcon sx={sx} />
}

export default QuickJump
