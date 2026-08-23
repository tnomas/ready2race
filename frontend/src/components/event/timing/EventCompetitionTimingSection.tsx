import {
    Alert,
    Box,
    MenuItem,
    Select,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Typography,
} from '@mui/material'
import {useState} from 'react'
import {Trans, useTranslation} from 'react-i18next'
import {
    getRaceClockerCompetitionAssignments,
    getTimingConfig,
    getTimingModeAssignments,
    getTimingModes,
    updateTimingConfig,
    upsertTimingModeAssignment,
} from '@api/sdk.gen.ts'
import {TimingModeDto} from '@api/types.gen.ts'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import Throbber from '@components/Throbber.tsx'
import InlineLink from '@components/InlineLink.tsx'
import {EventTimingFormSystem} from './eventTimingConfigForm.ts'
import {
    competitionWideMode,
    effectiveRowSystem,
    roundDeviationCount,
} from './eventCompetitionTimingRows.ts'
// Die beiden Mapper der Wettkampf-Seite: über sie zu speichern garantiert dieselbe Semantik wie dort.
import {
    mapDtoToTimingForm,
    mapTimingFormToRequest,
} from '../competition/timing/timingConfigForm.ts'

type Props = {
    eventId: string
    /**
     * Die Voreinstellung der Veranstaltung, LIVE aus dem Formular darüber — auch ungespeichert.
     * Bewusst so: wer das Radio umstellt, sieht sofort, was „Erbt“ danach bedeuten würde, statt
     * einen veralteten Stand. Gespeichert wird je Zeile ohnehin nur der eigene Wert des Wettkampfs.
     */
    eventSystem: EventTimingFormSystem
}

/** Formular-Stellvertreter: „erbt“ bzw. „kein Typ“ — ein Select braucht einen Wert, null geht nicht. */
const INHERIT_VALUE = 'NONE'
const NO_MODE_VALUE = ''

/** Ausgeschrieben statt zusammengesetzt, damit die i18n-Schlüssel typgeprüft bleiben. */
const systemLabelKeys = {
    NONE: 'event.timing.systems.none',
    RACECLOCKER: 'event.timing.systems.raceclocker',
    WEBSCORER: 'event.timing.systems.webscorer',
    INTERN: 'event.timing.systems.intern',
} as const

/**
 * Die Wettkampf-Tabelle der Zeitnahme-Einstellungen: alle Wettkämpfe der Veranstaltung mit ihrem
 * Zeitnahme-System und — bei interner Zeitnahme — ihrem Wettkampf-weiten Zeitnahmetyp. Zentrale
 * Pflege statt Durchklicken durch jeden Wettkampf (Wunsch vom 23.08.2026), nach dem Muster der
 * Rennen-Zuordnung (RaceClockerRaceAssignments): jede Änderung speichert sofort je Zeile.
 *
 * Das System-Select schreibt über DENSELBEN Endpunkt wie der Zeitnahme-Tab des Wettkampfs — der
 * aktuelle Stand wird erst gelesen und durch dieselben Mapper geschickt, damit Rennen-Anwahl und
 * Format-Presets exakt so überleben oder aufgeräumt werden wie beim Speichern dort. „Erbt“ heißt:
 * das eigene System entfernen (null), die Presets bleiben unangetastet — ein Teil-Override nur der
 * Formate ist erlaubt und erscheint weiter in der Abweichungsliste.
 *
 * Runden-Abweichungen der Zeitnahmetypen bleiben bewusst auf der Wettkampf-Seite; hier steht nur
 * der Wettkampf-weite Wert und ein Hinweis, wenn Runden abweichen — EIN Ort für die Runden-Pflege.
 */
const EventCompetitionTimingSection = ({eventId, eventSystem}: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [rowsReloaded, setRowsReloaded] = useState(0)
    const [modeAssignmentsReloaded, setModeAssignmentsReloaded] = useState(0)
    /** Zeilen, deren Speichern gerade läuft — sperrt nur die Selects der einen Zeile. */
    const [saving, setSaving] = useState<Set<string>>(new Set())

    const {data: rows, pending: rowsPending} = useFetch(
        signal => getRaceClockerCompetitionAssignments({signal, path: {eventId}}),
        {
            onResponse: ({error}) => {
                if (error) feedback.error(t('common.error.unexpected'))
            },
            deps: [eventId, rowsReloaded],
        },
    )

    const {data: modes} = useFetch(signal => getTimingModes({signal, path: {eventId}}), {
        onResponse: ({error}) => {
            if (error) feedback.error(t('common.error.unexpected'))
        },
        deps: [eventId],
    })

    const {data: modeAssignments} = useFetch(
        signal => getTimingModeAssignments({signal, path: {eventId}}),
        {
            onResponse: ({error}) => {
                if (error) feedback.error(t('common.error.unexpected'))
            },
            deps: [eventId, modeAssignmentsReloaded],
        },
    )

    const withSaving = (key: string, work: () => Promise<void>) => {
        setSaving(prev => new Set(prev).add(key))
        void (async () => {
            try {
                await work()
            } catch {
                feedback.error(t('common.error.unexpected'))
            } finally {
                setSaving(prev => {
                    const next = new Set(prev)
                    next.delete(key)
                    return next
                })
            }
        })()
    }

    /**
     * Lesen–ändern–schreiben über die Mapper der Wettkampf-Seite: nur so behalten Rennen-Anwahl
     * und Presets ihre dortige Semantik (unsichtbar gewordene Felder werden geleert, der Rest
     * überlebt). Ein blindes PUT nur mit dem System würde die übrigen Felder nullen.
     */
    const saveSystem = (competitionId: string, value: string) =>
        withSaving(`system:${competitionId}`, async () => {
            const {data, error} = await getTimingConfig({path: {eventId, competitionId}})
            if (error || !data) {
                feedback.error(t('common.error.unexpected'))
                return
            }
            const form = mapDtoToTimingForm(data)
            const {error: saveError} = await updateTimingConfig({
                path: {eventId, competitionId},
                body: mapTimingFormToRequest({
                    ...form,
                    timingSystem: value as EventTimingFormSystem,
                }),
            })
            if (saveError) {
                feedback.error(t('common.error.unexpected'))
            } else {
                feedback.success(t('event.timing.competitions.saved'))
                setRowsReloaded(Date.now())
            }
        })

    const saveMode = (competitionId: string, value: string) =>
        withSaving(`mode:${competitionId}`, async () => {
            const {error} = await upsertTimingModeAssignment({
                path: {eventId},
                body: {
                    competition: competitionId,
                    competitionSetupRound: null,
                    // Leer heißt: den Eintrag abräumen — der Upsert ist idempotent.
                    timingMode: value === NO_MODE_VALUE ? null : value,
                },
            })
            if (error !== undefined) {
                feedback.error(t('common.error.unexpected'))
            } else {
                feedback.success(t('event.timing.competitions.modeSaved'))
                setModeAssignmentsReloaded(Date.now())
            }
        })

    /** Wie der Posten den Typ sieht: Name plus Startart/Intervall in Kurzform (wie im Wettkampf-Tab). */
    const modeLabel = (mode: TimingModeDto) => {
        const detail =
            mode.intervalSeconds != null
                ? t('event.competition.timing.modes.detailInterval', {
                      seconds: mode.intervalSeconds,
                  })
                : t(`event.timing.modes.startGrouping.${mode.startGrouping}`)
        return `${mode.name} (${detail})`
    }

    if (rowsPending && !rows) return <Throbber />
    if (!rows || rows.length === 0) return null

    // Der Typ-Hinweis fehlt nur, wenn ihn jemand bräuchte: mindestens ein Wettkampf fährt effektiv
    // intern, aber es gibt keine Zeitnahmetypen. Das Anlegen sitzt im Abschnitt darüber, der erst
    // bei Veranstaltungs-System „Interne Zeitnahme" erscheint — darauf zeigt der Hinweis.
    const anyIntern = rows.some(row => effectiveRowSystem(row.timingSystem, eventSystem) === 'INTERN')
    const noModes = (modes ?? []).length === 0

    return (
        <Box>
            <Typography variant={'subtitle2'} gutterBottom>
                <Trans i18nKey={'event.timing.competitions.title'} />
            </Typography>
            <Typography variant={'body2'} color={'text.secondary'}>
                <Trans i18nKey={'event.timing.competitions.hint'} />
            </Typography>
            {anyIntern && noModes && (
                <Alert variant={'outlined'} severity={'info'} sx={{mt: 2}}>
                    <Trans i18nKey={'event.timing.competitions.noModes'} />
                </Alert>
            )}
            <Box sx={{overflowX: 'auto', mt: 1}}>
                <Table size={'small'}>
                    <TableHead>
                        <TableRow>
                            <TableCell>
                                {t('event.timing.competitions.competition')}
                            </TableCell>
                            <TableCell sx={{width: 220}}>
                                {t('event.timing.competitions.system')}
                            </TableCell>
                            <TableCell sx={{width: 280}}>
                                {t('event.timing.competitions.mode')}
                            </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map(row => {
                            const effective = effectiveRowSystem(row.timingSystem, eventSystem)
                            const deviations =
                                roundDeviationCount(modeAssignments ?? [], row.competitionId)
                            return (
                                <TableRow key={row.competitionId}>
                                    <TableCell>
                                        <InlineLink
                                            to={'/event/$eventId/competition/$competitionId'}
                                            params={{
                                                eventId,
                                                competitionId: row.competitionId,
                                            }}
                                            search={{tab: 'timing'}}>
                                            {row.identifier} {row.name}
                                        </InlineLink>
                                    </TableCell>
                                    <TableCell>
                                        <Select
                                            size={'small'}
                                            fullWidth
                                            value={row.timingSystem ?? INHERIT_VALUE}
                                            disabled={saving.has(`system:${row.competitionId}`)}
                                            onChange={event =>
                                                saveSystem(row.competitionId, event.target.value)
                                            }>
                                            <MenuItem value={INHERIT_VALUE}>
                                                <em>
                                                    {t('event.timing.competitions.inherit', {
                                                        system: t(systemLabelKeys[eventSystem]),
                                                    })}
                                                </em>
                                            </MenuItem>
                                            <MenuItem value={'INTERN'}>
                                                {t('event.timing.systems.intern')}
                                            </MenuItem>
                                            <MenuItem value={'RACECLOCKER'}>
                                                {t('event.timing.systems.raceclocker')}
                                            </MenuItem>
                                            <MenuItem value={'WEBSCORER'}>
                                                {t('event.timing.systems.webscorer')}
                                            </MenuItem>
                                        </Select>
                                    </TableCell>
                                    <TableCell>
                                        {effective === 'INTERN' ? (
                                            <Stack spacing={0.5}>
                                                <Select
                                                    size={'small'}
                                                    fullWidth
                                                    value={competitionWideMode(
                                                        modeAssignments ?? [],
                                                        row.competitionId,
                                                    )}
                                                    disabled={saving.has(
                                                        `mode:${row.competitionId}`,
                                                    )}
                                                    displayEmpty
                                                    onChange={event =>
                                                        saveMode(
                                                            row.competitionId,
                                                            event.target.value,
                                                        )
                                                    }>
                                                    <MenuItem value={NO_MODE_VALUE}>
                                                        <em>
                                                            {t(
                                                                'event.timing.competitions.modeUnset',
                                                            )}
                                                        </em>
                                                    </MenuItem>
                                                    {(modes ?? []).map(mode => (
                                                        <MenuItem key={mode.id} value={mode.id}>
                                                            {modeLabel(mode)}
                                                        </MenuItem>
                                                    ))}
                                                </Select>
                                                {deviations > 0 && (
                                                    <Typography
                                                        variant={'caption'}
                                                        color={'text.secondary'}>
                                                        {t(
                                                            'event.timing.competitions.roundDeviations',
                                                            {count: deviations},
                                                        )}
                                                    </Typography>
                                                )}
                                            </Stack>
                                        ) : (
                                            <Typography
                                                variant={'body2'}
                                                color={'text.disabled'}>
                                                {'—'}
                                            </Typography>
                                        )}
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            </Box>
        </Box>
    )
}

export default EventCompetitionTimingSection
