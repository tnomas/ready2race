import {ReactNode, useState} from 'react'
import {
    Alert,
    Box,
    Button,
    IconButton,
    MenuItem,
    Select,
    Stack,
    Tooltip,
    Typography,
} from '@mui/material'
import {ChevronRight, ExpandMore, RestartAlt} from '@mui/icons-material'
import {Trans, useTranslation} from 'react-i18next'
import {
    getTimingProfileTree,
    resetTimingProfileAssignments,
    upsertTimingProfileAssignment,
} from '@api/sdk.gen.ts'
import {TimingProfileAssignmentRequest, TimingProfileOptionDto} from '@api/types.gen.ts'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import {useConfirmation} from '@contexts/confirmation/ConfirmationContext.ts'
import Throbber from '@components/Throbber.tsx'
import InlineLink from '@components/InlineLink.tsx'
import {deviationCount, optionLabel, profileLabel, toggleExpanded} from './timingProfileTree.ts'

type Props = {
    eventId: string
    /**
     * Gesetzt im Zeitnahme-Tab eines Wettkampfs: Der Baum zeigt dann nur diesen einen Ast. Die
     * Wurzelzeile entfällt — was von der Veranstaltung geerbt wird, steht als Hinweis darüber und
     * wird dort gepflegt, nicht hier.
     */
    competitionId?: string
}

/** Ein Select braucht einen Wert; null lässt sich nicht auswählen. Leer heißt „erbt“ bzw. „nicht gesetzt“. */
const INHERIT_VALUE = ''

/**
 * Der eine Ort, an dem Zeitnahmeprofile zugeordnet werden: Veranstaltung → Wettkampf → Runde →
 * Partie, vier Ebenen als aufklappbare Liste. Ein Profil ist das, womit gestoppt wird — bei
 * RaceClocker ein Rennen, bei der internen Zeitnahme ein Zeitnahmetyp; welche Art gilt, entscheidet
 * allein das Zeitnahme-System der Veranstaltung (`tree.kind`).
 *
 * Bewusst KEINE Tabelle: vier Ebenen mit unterschiedlicher Bedeutung passen nicht in eine
 * Tabellenzeile, die Einrückung trägt hier die Aussage.
 *
 * Was tatsächlich gilt (`effectiveProfile`), rechnet der Server. Die Oberfläche baut die Regel
 * nicht nach — sie zeigt nur, was er liefert, und speichert je Zeile sofort. Nach jeder Änderung
 * wird der ganze Baum neu geladen: nur so ziehen die geerbten Beschriftungen aller Ebenen darunter
 * nach, ohne dass hier eine zweite Auflösungslogik entstünde.
 */
const TimingProfileTree = ({eventId, competitionId}: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const {confirmAction} = useConfirmation()

    const [reloaded, setReloaded] = useState(0)
    /** Alles zugeklappt: die Wettkampfliste ist die erste Ebene, tiefer geht nur, wer hinschaut. */
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    /** Zeilen, deren Speichern gerade läuft — sperrt nur das Select der einen Zeile. */
    const [saving, setSaving] = useState<Set<string>>(new Set())

    const {data: tree, pending} = useFetch(
        signal => getTimingProfileTree({signal, path: {eventId}}),
        {
            onResponse: ({error}) => {
                if (error) feedback.error(t('common.error.unexpected'))
            },
            deps: [eventId, reloaded],
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

    const save = (
        key: string,
        path: Omit<TimingProfileAssignmentRequest, 'profile'>,
        value: string,
    ) =>
        withSaving(key, async () => {
            const {error} = await upsertTimingProfileAssignment({
                path: {eventId},
                // Leer heißt: den Eintrag abräumen — die Ebene erbt danach wieder.
                body: {...path, profile: value === INHERIT_VALUE ? null : value},
            })
            if (error) {
                feedback.error(t('common.error.unexpected'))
            } else {
                feedback.success(t('event.timing.profiles.saved'))
                setReloaded(Date.now())
            }
        })

    /** Räumt alles UNTERHALB der Ebene ab; die Ebene selbst behält ihren Wert. */
    const reset = (competition?: string) =>
        confirmAction(
            () =>
                withSaving('reset', async () => {
                    const {error} = await resetTimingProfileAssignments({
                        path: {eventId},
                        query: competition ? {competition} : {},
                    })
                    if (error) {
                        feedback.error(t('common.error.unexpected'))
                    } else {
                        feedback.success(t('event.timing.profiles.reset'))
                        setReloaded(Date.now())
                    }
                }),
            {content: t('event.timing.profiles.resetConfirm')},
        )

    if (pending && !tree) return <Throbber />
    if (!tree) return null

    const heading = (
        <Box>
            <Typography variant={'subtitle2'} gutterBottom>
                <Trans i18nKey={'event.timing.profiles.title'} />
            </Typography>
            <Typography variant={'body2'} color={'text.secondary'}>
                <Trans i18nKey={'event.timing.profiles.hint'} />
            </Typography>
        </Box>
    )

    // Ohne RaceClocker und ohne interne Zeitnahme gibt es nichts zuzuordnen — dann steht hier der
    // Weg dorthin statt eines Baums aus leeren Zeilen.
    if (!tree.kind) {
        return (
            <Stack spacing={2}>
                {heading}
                <Alert variant={'outlined'} severity={'info'}>
                    <Trans i18nKey={'event.timing.profiles.noSystem'} />
                </Alert>
            </Stack>
        )
    }

    // Das System steht, aber es ist noch kein Rennen bzw. Zeitnahmetyp angelegt: Auswahlfelder
    // ohne Auswahl helfen niemandem, der Hinweis zeigt, wo sie herkommen.
    if (tree.options.length === 0) {
        return (
            <Stack spacing={2}>
                {heading}
                <Alert variant={'outlined'} severity={'info'}>
                    <Trans i18nKey={'event.timing.profiles.noOptions'} />
                </Alert>
            </Stack>
        )
    }

    const options: TimingProfileOptionDto[] = tree.options
    const competitions = competitionId
        ? tree.competitions.filter(c => c.competitionId === competitionId)
        : tree.competitions

    const label = (profile: string | null | undefined) => profileLabel(options, profile)

    /** „Erbt (…)“ mit dem Wert der Ebene DARÜBER — das ist es, was ohne eigenen Wert gilt. */
    const inheritLabel = (inherited: string | null | undefined) =>
        t('event.timing.profiles.inherit', {
            profile: label(inherited) ?? t('event.timing.profiles.inheritsNothing'),
        })

    const toggle = (id: string) => setExpanded(prev => toggleExpanded(prev, id))

    const profileSelect = (
        key: string,
        own: string | null | undefined,
        emptyLabel: string,
        path: Omit<TimingProfileAssignmentRequest, 'profile'>,
    ) => (
        <Select
            size={'small'}
            displayEmpty
            sx={{minWidth: 260}}
            value={own ?? INHERIT_VALUE}
            disabled={saving.has(key)}
            onChange={event => save(key, path, event.target.value)}>
            <MenuItem value={INHERIT_VALUE}>
                <em>{emptyLabel}</em>
            </MenuItem>
            {options.map(option => (
                <MenuItem key={option.id} value={option.id}>
                    {optionLabel(option)}
                </MenuItem>
            ))}
        </Select>
    )

    /** Eine Zeile des Baums: Einrückung, Aufklapp-Pfeil (oder Platzhalter), Beschriftung, Select. */
    const row = (
        key: string,
        depth: number,
        text: string,
        control: ReactNode,
        expandableId?: string,
        after?: ReactNode,
    ) => (
        <Stack
            key={key}
            direction={'row'}
            spacing={1}
            alignItems={'center'}
            flexWrap={'wrap'}
            sx={{pl: depth * 3}}>
            {expandableId ? (
                <IconButton
                    size={'small'}
                    className={'cursor-pointer'}
                    aria-label={t('event.timing.profiles.toggle')}
                    onClick={() => toggle(expandableId)}>
                    {expanded.has(expandableId) ? (
                        <ExpandMore fontSize={'small'} />
                    ) : (
                        <ChevronRight fontSize={'small'} />
                    )}
                </IconButton>
            ) : (
                <Box sx={{width: 30}} />
            )}
            <Typography variant={'body2'} sx={{flexGrow: 1, minWidth: 160}}>
                {text}
            </Typography>
            {control}
            {after}
        </Stack>
    )

    // Der Sammelexport der Startlisten gruppiert je Wettkampf und ist blind für Zuordnungen an
    // einzelnen Partien. Ohne diesen Hinweis fällt das erst am Renntag auf.
    const anyMatchLevel = competitions.some(competition =>
        competition.rounds.some(round => round.matches.some(match => match.ownProfile)),
    )

    return (
        <Stack spacing={2}>
            {heading}

            {competitionId && (
                <Typography variant={'body2'} color={'text.secondary'}>
                    {t('event.timing.profiles.fromEvent', {
                        profile: label(tree.ownProfile) ?? t('event.timing.profiles.unset'),
                    })}{' '}
                    <InlineLink
                        to={'/event/$eventId'}
                        params={{eventId}}
                        search={{tab: 'settings'}}>
                        <Trans i18nKey={'event.timing.profiles.fromEventLink'} />
                    </InlineLink>
                </Typography>
            )}

            {anyMatchLevel && (
                <Alert variant={'outlined'} severity={'info'}>
                    <Trans i18nKey={'event.timing.profiles.matchLevelExportHint'} />
                </Alert>
            )}

            {/* Der Sammelknopf nur in der Veranstaltungs-Ansicht: im Wettkampf-Tab macht der
                Knopf an der Wettkampfzeile schon genau dasselbe, zwei davon nebeneinander wären
                nur die Frage, welcher der gefährlichere ist. */}
            {!competitionId && (
                <Box>
                    <Button
                        size={'small'}
                        startIcon={<RestartAlt />}
                        className={'cursor-pointer'}
                        disabled={saving.has('reset')}
                        onClick={() => reset()}>
                        <Trans i18nKey={'event.timing.profiles.resetAll'} />
                    </Button>
                </Box>
            )}

            <Stack spacing={1}>
                {!competitionId &&
                    row(
                        'root',
                        0,
                        t('event.timing.profiles.event'),
                        profileSelect('root', tree.ownProfile, t('event.timing.profiles.unset'), {
                            competition: null,
                            competitionSetupRound: null,
                            competitionSetupMatch: null,
                        }),
                    )}

                {competitions.map(competition => {
                    const depth = competitionId ? 0 : 1
                    const deviations = deviationCount(competition)
                    const key = `competition:${competition.competitionId}`
                    return (
                        <Stack key={key} spacing={1}>
                            {row(
                                key,
                                depth,
                                `${competition.identifier} ${competition.name}`,
                                profileSelect(
                                    key,
                                    competition.ownProfile,
                                    inheritLabel(tree.ownProfile),
                                    {
                                        competition: competition.competitionId,
                                        competitionSetupRound: null,
                                        competitionSetupMatch: null,
                                    },
                                ),
                                competition.rounds.length > 0
                                    ? competition.competitionId
                                    : undefined,
                                <Stack direction={'row'} spacing={1} alignItems={'center'}>
                                    {deviations > 0 && (
                                        <Typography variant={'caption'} color={'text.secondary'}>
                                            {t('event.timing.profiles.deviations', {
                                                count: deviations,
                                            })}
                                        </Typography>
                                    )}
                                    <Tooltip
                                        title={t('event.timing.profiles.resetCompetition')}
                                        disableInteractive>
                                        <span>
                                            <IconButton
                                                size={'small'}
                                                className={'cursor-pointer'}
                                                aria-label={t(
                                                    'event.timing.profiles.resetCompetition',
                                                )}
                                                disabled={saving.has('reset')}
                                                onClick={() => reset(competition.competitionId)}>
                                                <RestartAlt fontSize={'small'} />
                                            </IconButton>
                                        </span>
                                    </Tooltip>
                                </Stack>,
                            )}

                            {expanded.has(competition.competitionId) &&
                                competition.rounds.map(round => {
                                    const roundKey = `round:${round.roundId}`
                                    return (
                                        <Stack key={roundKey} spacing={1}>
                                            {row(
                                                roundKey,
                                                depth + 1,
                                                round.name,
                                                profileSelect(
                                                    roundKey,
                                                    round.ownProfile,
                                                    inheritLabel(competition.effectiveProfile),
                                                    {
                                                        competition: competition.competitionId,
                                                        competitionSetupRound: round.roundId,
                                                        competitionSetupMatch: null,
                                                    },
                                                ),
                                                round.matches.length > 0
                                                    ? round.roundId
                                                    : undefined,
                                            )}

                                            {expanded.has(round.roundId) &&
                                                round.matches.map(match => {
                                                    const matchKey = `match:${match.matchId}`
                                                    return row(
                                                        matchKey,
                                                        depth + 2,
                                                        match.name,
                                                        profileSelect(
                                                            matchKey,
                                                            match.ownProfile,
                                                            inheritLabel(round.effectiveProfile),
                                                            {
                                                                competition:
                                                                    competition.competitionId,
                                                                competitionSetupRound:
                                                                    round.roundId,
                                                                competitionSetupMatch:
                                                                    match.matchId,
                                                            },
                                                        ),
                                                    )
                                                })}
                                        </Stack>
                                    )
                                })}
                        </Stack>
                    )
                })}

                {competitions.length === 0 && !competitionId && (
                    <Typography variant={'body2'} color={'text.secondary'} sx={{pl: 3}}>
                        <Trans i18nKey={'event.timing.profiles.noCompetitions'} />
                    </Typography>
                )}
            </Stack>
        </Stack>
    )
}

export default TimingProfileTree
