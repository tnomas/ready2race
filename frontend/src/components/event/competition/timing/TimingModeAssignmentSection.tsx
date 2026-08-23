import {
    Alert,
    Box,
    Divider,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    Typography,
} from '@mui/material'
import {useMemo, useState} from 'react'
import {Trans, useTranslation} from 'react-i18next'
import {
    getCompetitionSetup,
    getTimingModeAssignments,
    getTimingModes,
    upsertTimingModeAssignment,
} from '@api/sdk.gen.ts'
import {TimingModeDto} from '@api/types.gen.ts'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import InlineLink from '@components/InlineLink.tsx'

export type TimingModeAssignmentSectionProps = {
    eventId: string
    competitionId: string
}

/** Formular-Stellvertreter für „nichts zugeordnet" — ein Select braucht einen Wert, null geht nicht. */
const NONE_VALUE = ''

/**
 * Die Zuordnung der Zeitnahmetypen zu diesem Wettkampf: eine Auswahl für den ganzen Wettkampf,
 * dazu je Runde eine optionale Abweichung. Leer heißt erben (die Runde erbt vom Wettkampf), und
 * die effektive Auflösung steht sichtbar daneben — dieselbe Regel wie im Backend: der
 * Runden-Eintrag schlägt den Wettkampf-Eintrag.
 *
 * Jede Änderung schreibt sofort per PUT-Upsert (idempotent über den natürlichen Schlüssel
 * Wettkampf+Runde) statt über den Speichern-Knopf des Formulars darüber — die Zuordnung ist wie
 * die Rennen-Anwahl der RaceClocker-Welt kein Override der Veranstaltung, sondern eine eigene
 * Ressource mit eigenen Endpunkten.
 */
const TimingModeAssignmentSection = ({eventId, competitionId}: TimingModeAssignmentSectionProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [assignmentsReloaded, setAssignmentsReloaded] = useState(0)
    /** Runden- (oder Wettkampf-)Schlüssel, deren Upsert gerade läuft — sperrt nur das eine Select. */
    const [saving, setSaving] = useState<Set<string>>(new Set())

    const {data: modes, pending: modesPending} = useFetch(
        signal => getTimingModes({signal, path: {eventId}}),
        {
            onResponse: ({error}) => {
                if (error) {
                    feedback.error(t('common.error.unexpected'))
                }
            },
            deps: [eventId],
        },
    )

    const {data: assignments} = useFetch(
        signal => getTimingModeAssignments({signal, path: {eventId}}),
        {
            onResponse: ({error}) => {
                if (error) {
                    feedback.error(t('common.error.unexpected'))
                }
            },
            deps: [eventId, assignmentsReloaded],
        },
    )

    // Die Runden des Wettkampfs kommen aus dem Wettkampfablauf; nur bestehende Runden (mit id)
    // sind zuordnungsfähig.
    const {data: setup} = useFetch(
        signal => getCompetitionSetup({signal, path: {eventId, competitionId}}),
        {
            onResponse: ({error}) => {
                if (error) {
                    feedback.error(t('common.error.unexpected'))
                }
            },
            deps: [eventId, competitionId],
        },
    )
    const rounds = useMemo(
        () =>
            (setup?.rounds ?? []).flatMap(round =>
                round.id != null ? [{id: round.id, name: round.name}] : [],
            ),
        [setup],
    )

    const modeById = useMemo(
        () => new Map((modes ?? []).map(mode => [mode.id, mode])),
        [modes],
    )

    const competitionAssignments = useMemo(
        () => (assignments ?? []).filter(assignment => assignment.competition === competitionId),
        [assignments, competitionId],
    )
    const competitionWideMode =
        competitionAssignments.find(assignment => assignment.competitionSetupRound == null)
            ?.timingMode ?? NONE_VALUE
    const roundMode = (roundId: string) =>
        competitionAssignments.find(assignment => assignment.competitionSetupRound === roundId)
            ?.timingMode ?? NONE_VALUE

    /** Wie der Posten den Typ sieht: Name plus Startart/Intervall in Kurzform. */
    const modeLabel = (mode: TimingModeDto) => {
        const detail =
            mode.intervalSeconds != null
                ? t('event.competition.timing.modes.detailInterval', {
                      seconds: mode.intervalSeconds,
                  })
                : t(`event.timing.modes.startGrouping.${mode.startGrouping}`)
        return `${mode.name} (${detail})`
    }

    const upsert = (savingKey: string, roundId: string | null, timingMode: string) => {
        setSaving(prev => new Set(prev).add(savingKey))
        void (async () => {
            try {
                const {error} = await upsertTimingModeAssignment({
                    path: {eventId},
                    body: {
                        competition: competitionId,
                        competitionSetupRound: roundId,
                        // Leer heißt: den Eintrag abräumen (erben) — der Upsert ist idempotent.
                        timingMode: timingMode === NONE_VALUE ? null : timingMode,
                    },
                })
                if (error !== undefined) {
                    feedback.error(t('common.error.unexpected'))
                } else {
                    feedback.success(t('event.competition.timing.modes.saved'))
                }
            } catch {
                feedback.error(t('common.error.unexpected'))
            } finally {
                setSaving(prev => {
                    const next = new Set(prev)
                    next.delete(savingKey)
                    return next
                })
                setAssignmentsReloaded(Date.now())
            }
        })()
    }

    const competitionModeDto =
        competitionWideMode !== NONE_VALUE ? modeById.get(competitionWideMode) : undefined

    return (
        <Stack spacing={3}>
            <Box>
                <Typography variant={'subtitle2'}>
                    <Trans i18nKey={'event.competition.timing.modes.title'} />
                </Typography>
                <Typography variant={'body2'} color={'text.secondary'}>
                    <Trans i18nKey={'event.competition.timing.modes.hint'} />
                </Typography>
            </Box>

            {(modes ?? []).length === 0 && !modesPending ? (
                <Alert variant={'outlined'} severity={'info'}>
                    <Trans i18nKey={'event.competition.timing.modes.noModes.1'} />
                    <InlineLink
                        to={'/event/$eventId'}
                        params={{eventId}}
                        search={{tab: 'settings'}}>
                        <Trans i18nKey={'event.competition.timing.modes.noModes.2'} />
                    </InlineLink>
                    <Trans i18nKey={'event.competition.timing.modes.noModes.3'} />
                </Alert>
            ) : (
                <>
                    <FormControl fullWidth>
                        <InputLabel id={'timing-mode-competition'}>
                            {t('event.competition.timing.modes.competitionWide')}
                        </InputLabel>
                        <Select
                            labelId={'timing-mode-competition'}
                            label={t('event.competition.timing.modes.competitionWide')}
                            value={competitionWideMode}
                            disabled={saving.has('competition')}
                            onChange={event =>
                                upsert('competition', null, event.target.value)
                            }>
                            <MenuItem value={NONE_VALUE}>
                                <em>{t('event.competition.timing.modes.unset')}</em>
                            </MenuItem>
                            {(modes ?? []).map(mode => (
                                <MenuItem key={mode.id} value={mode.id}>
                                    {modeLabel(mode)}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    {competitionWideMode === NONE_VALUE && (
                        <Alert variant={'outlined'} severity={'warning'}>
                            <Trans i18nKey={'event.competition.timing.modes.unsetWarning'} />
                        </Alert>
                    )}

                    {rounds.length > 0 && (
                        <Stack spacing={2}>
                            <Divider />
                            <Typography variant={'body2'} color={'text.secondary'}>
                                <Trans i18nKey={'event.competition.timing.modes.roundsHint'} />
                            </Typography>
                            {rounds.map(round => {
                                const value = roundMode(round.id)
                                return (
                                    <Stack key={round.id} spacing={0.5}>
                                        <FormControl fullWidth>
                                            <InputLabel id={`timing-mode-round-${round.id}`}>
                                                {round.name}
                                            </InputLabel>
                                            <Select
                                                labelId={`timing-mode-round-${round.id}`}
                                                label={round.name}
                                                value={value}
                                                disabled={saving.has(round.id)}
                                                onChange={event =>
                                                    upsert(round.id, round.id, event.target.value)
                                                }>
                                                <MenuItem value={NONE_VALUE}>
                                                    <em>
                                                        {t(
                                                            'event.competition.timing.modes.inherit',
                                                        )}
                                                    </em>
                                                </MenuItem>
                                                {(modes ?? []).map(mode => (
                                                    <MenuItem key={mode.id} value={mode.id}>
                                                        {modeLabel(mode)}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                        {/* Die effektive Auflösung: was am Posten wirklich gilt,
                                            wenn die Runde erbt. */}
                                        {value === NONE_VALUE && (
                                            <Typography
                                                variant={'caption'}
                                                color={'text.secondary'}>
                                                {competitionModeDto !== undefined
                                                    ? t(
                                                          'event.competition.timing.modes.inherits',
                                                          {mode: modeLabel(competitionModeDto)},
                                                      )
                                                    : t(
                                                          'event.competition.timing.modes.inheritsNothing',
                                                      )}
                                            </Typography>
                                        )}
                                    </Stack>
                                )
                            })}
                        </Stack>
                    )}
                </>
            )}
        </Stack>
    )
}

export default TimingModeAssignmentSection
