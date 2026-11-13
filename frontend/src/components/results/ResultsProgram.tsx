import {useTranslation} from 'react-i18next'
import {Alert, Box, Card, Chip, Divider, Stack, Typography} from '@mui/material'
import {CalendarMonthOutlined} from '@mui/icons-material'
import {EmptyState, LoadingState} from '@components/ui'
import {BoardProgramEntry} from '@api/types.gen.ts'
import {getPublicProgram} from '@api/sdk.gen.ts'
import {usePolledFetch} from '@utils/usePolledFetch.ts'
import {format} from 'date-fns'
import {programStateChip} from './programStateChip.ts'

type Props = {
    eventId: string
}

/**
 * Etwas gemächlicher als der Live-Tab (15 s): Der Zeitplan ändert sich nur, wenn Läufe starten,
 * enden oder verschoben werden — eine halbe Minute Verzug fällt hier nicht auf.
 */
const REFRESH_MS = 30_000

/**
 * Der Tab „Zeitplan" der öffentlichen Ergebnisanzeige: das ganze Tagesprogramm aus dem
 * Zeitplan — auch das bereits Gefahrene, im Unterschied zum Live-Tab, der nur Laufendes und
 * Anstehendes zeigt. Die Einträge kommen aus demselben Server-Bausatz wie die SCHEDULE-Boards
 * (`buildProgram`) und tragen bewusst weder Aufstellungen noch Ergebnisse.
 *
 * Gestaltet als kompakte Liste statt Karten: Besucher überfliegen das Programm wie einen
 * Aushang — Uhrzeit, Name, Zustand, eine Zeile pro Eintrag, gruppiert nach Tag.
 */
const ResultsProgram = ({eventId}: Props) => {
    const {t} = useTranslation()

    const {data, initialLoad, failed, lastUpdated} = usePolledFetch<BoardProgramEntry[]>(
        async signal => {
            const {data} = await getPublicProgram({signal, path: {eventId}})
            return data ?? null
        },
        REFRESH_MS,
        [eventId],
        // Push statt Takt (siehe eventChangePush.ts) — wie beim Live-Tab.
        eventId,
    )

    if (initialLoad) {
        return <LoadingState variant={'section'} />
    }

    if (data === null) {
        return <Alert severity={'warning'}>{t('results.program.loadFailed')}</Alert>
    }

    if (data.length === 0) {
        return (
            <Card>
                <EmptyState icon={<CalendarMonthOutlined />} title={t('results.program.empty')} />
            </Card>
        )
    }

    // Gruppierung nach Kalendertag: bei einer Regatta über mehrere Tage trennt eine
    // Tagesüberschrift die Blöcke. Einträge ohne Zeit sammeln sich hinten.
    const days = data.reduce<{day: string | null; entries: BoardProgramEntry[]}[]>(
        (groups, entry) => {
            const day = entry.startTime ? format(new Date(entry.startTime), 'yyyy-MM-dd') : null
            const last = groups[groups.length - 1]
            if (last && last.day === day) {
                last.entries.push(entry)
            } else {
                groups.push({day, entries: [entry]})
            }
            return groups
        },
        [],
    )

    const stateChip = (entry: BoardProgramEntry) => {
        const chip = programStateChip(entry.state, entry.name != null)
        if (chip === null) return null
        return (
            <Chip
                size={'small'}
                color={chip.color}
                variant={chip.variant}
                label={t(chip.labelKey)}
            />
        )
    }

    return (
        <Stack spacing={3}>
            {failed && lastUpdated && (
                <Typography variant={'body2'} color={'text.secondary'}>
                    {t('results.liveMatches.stale', {
                        time: format(lastUpdated, t('format.time')),
                    })}
                </Typography>
            )}
            {days.map((group, groupIndex) => (
                <Box component={'section'} key={group.day ?? `ohne-tag-${groupIndex}`}>
                    {group.day && (
                        <Typography variant={'h2'} sx={{mb: 1.5}}>
                            {format(new Date(group.entries[0].startTime!), t('format.date'))}
                        </Typography>
                    )}
                    <Card>
                        {group.entries.map((entry, index) => (
                            <Box key={index}>
                                {index > 0 && <Divider />}
                                <Box
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'baseline',
                                        columnGap: 2,
                                        py: 1.25,
                                        px: {xs: 2, sm: 2.5},
                                    }}>
                                    <Typography
                                        sx={{
                                            fontVariantNumeric: 'tabular-nums',
                                            flexShrink: 0,
                                            width: '3rem',
                                            fontWeight: 600,
                                        }}>
                                        {entry.startTime
                                            ? format(new Date(entry.startTime), t('format.time'))
                                            : '–'}
                                    </Typography>
                                    <Box sx={{minWidth: 0, flex: 1}}>
                                        {entry.name != null ? (
                                            // Programmpunkt (Pause o.ä.): nur der Name, kursiv.
                                            <Typography fontStyle={'italic'}>
                                                {entry.name}
                                            </Typography>
                                        ) : (
                                            <>
                                                <Typography sx={{overflowWrap: 'anywhere'}}>
                                                    {entry.competitionName}
                                                </Typography>
                                                <Typography
                                                    variant={'body2'}
                                                    color={'text.secondary'}>
                                                    {[entry.roundName, entry.matchName]
                                                        .filter(
                                                            (part, i, parts) =>
                                                                part && part !== parts[i - 1],
                                                        )
                                                        .join(' · ')}
                                                </Typography>
                                            </>
                                        )}
                                    </Box>
                                    <Box sx={{flexShrink: 0, alignSelf: 'center'}}>
                                        {stateChip(entry)}
                                    </Box>
                                </Box>
                            </Box>
                        ))}
                    </Card>
                </Box>
            ))}
        </Stack>
    )
}

export default ResultsProgram
