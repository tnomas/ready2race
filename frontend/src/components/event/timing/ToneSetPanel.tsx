import {Box, Button, Chip, IconButton, Stack, Tooltip, Typography} from '@mui/material'
import {Add, Delete, Edit, StarBorder} from '@mui/icons-material'
import {useState} from 'react'
import {Trans, useTranslation} from 'react-i18next'
import {deleteTimingToneSet, getTimingToneSets, updateTimingToneSet} from '@api/sdk.gen.ts'
import {ApiError, TimingToneSetDto, TimingToneSetRequest} from '@api/types.gen.ts'
import {useConfirmation} from '@contexts/confirmation/ConfirmationContext.ts'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import ToneSetDialog from './ToneSetDialog.tsx'

export type ToneSetPanelProps = {
    eventId: string
}

/**
 * Pflege der Ton-Sätze einer Veranstaltung — der benannten Klang-Vorlagen („Laut fürs Wasser",
 * „Leise für die Halle"), aus denen die Zeitnahmetypen wählen; wer nicht wählt, erbt den
 * Vorgabesatz.
 *
 * Gleiche Bauform wie die Nachbarn auf derselben Seite ([TimingModePanel], die
 * RaceClocker-Rennen): Liste plus Dialog, eigene Endpunkte, eigenes Neuladen, bewusst außerhalb
 * des Speichern-Formulars. Und bewusst NICHT ausgeklappt — vor dem 26.08.2026 standen hier drei
 * Ton-Editoren dauerhaft offen; ein Abschnitt tritt an ihre Stelle.
 *
 * Die zwei Server-Regeln, die diese Liste vorwegnimmt, statt den Bediener in einen roten Kasten
 * laufen zu lassen:
 * - Die Vorgabe kann WEITERGEGEBEN, aber nicht abgewählt werden — deshalb bietet nur eine Zeile
 *   ohne Markierung „Als Vorgabe" an, und der Schalter im Dialog ist am Vorgabesatz gesperrt.
 * - Der Vorgabesatz geht nur als LETZTER — deshalb ist sein Löschen gesperrt, solange es andere
 *   Sätze gibt, mit dem Grund als Tooltip statt als Fehlermeldung hinterher.
 */
const ToneSetPanel = ({eventId}: ToneSetPanelProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const {confirmAction} = useConfirmation()

    const [reloaded, setReloaded] = useState(0)
    const reload = () => setReloaded(Date.now())
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editedSet, setEditedSet] = useState<TimingToneSetDto | undefined>(undefined)

    const {data: toneSets, pending} = useFetch(
        signal => getTimingToneSets({signal, path: {eventId}}),
        {
            onResponse: ({error}) => {
                if (error) {
                    feedback.error(t('common.error.unexpected'))
                }
            },
            deps: [eventId, reloaded],
        },
    )

    const sets = toneSets ?? []

    /** Der DTO zurück in einen Request — jedes Schreiben schickt den ganzen Satz. */
    const requestOf = (toneSet: TimingToneSetDto): TimingToneSetRequest => ({
        name: toneSet.name,
        isDefault: toneSet.isDefault,
        sequenceTonePlan: toneSet.sequenceTonePlan ?? null,
        splitTone: toneSet.splitTone ?? null,
        falseStartTone: toneSet.falseStartTone ?? null,
        finishTone: toneSet.finishTone ?? null,
        tonePerBoat: toneSet.tonePerBoat,
    })

    /**
     * Die Eckdaten eines Satzes in einer Zeile: WELCHE der vier Töne eigene Werte tragen (der
     * Rest klingt wie eingebaut) und ob die Tonleiter je Boot an ist. Das ist die Frage, die man
     * vor dem Öffnen hat — „ist hier überhaupt etwas verstellt?".
     */
    const describeSet = (toneSet: TimingToneSetDto) => {
        const own = [
            toneSet.sequenceTonePlan != null && toneSet.sequenceTonePlan.length > 0
                ? t('event.timing.toneSets.tones.sequence')
                : null,
            toneSet.splitTone != null ? t('event.timing.toneSets.tones.split') : null,
            toneSet.falseStartTone != null && toneSet.falseStartTone.length > 0
                ? t('event.timing.toneSets.tones.falseStart')
                : null,
            toneSet.finishTone != null ? t('event.timing.toneSets.tones.finish') : null,
        ].filter((label): label is string => label !== null)

        return [
            own.length === 0
                ? t('event.timing.toneSets.describe.allDefault')
                : t('event.timing.toneSets.describe.own', {tones: own.join(', ')}),
            t(
                toneSet.tonePerBoat
                    ? 'event.timing.toneSets.describe.tonePerBoatOn'
                    : 'event.timing.toneSets.describe.tonePerBoatOff',
            ),
        ].join(' · ')
    }

    const makeDefault = (toneSet: TimingToneSetDto) => {
        void (async () => {
            const {error} = (await updateTimingToneSet({
                path: {eventId, toneSetId: toneSet.id},
                body: {...requestOf(toneSet), isDefault: true},
            })) as {error?: ApiError}
            if (error !== undefined) {
                feedback.error(t('common.error.unexpected'))
            } else {
                feedback.success(t('event.timing.toneSets.defaultSet', {name: toneSet.name}))
                reload()
            }
        })()
    }

    const removeSet = (toneSet: TimingToneSetDto) => {
        confirmAction(
            async () => {
                const {error} = (await deleteTimingToneSet({
                    path: {eventId, toneSetId: toneSet.id},
                })) as {error?: ApiError}
                if (error !== undefined) {
                    // Der Vorgabesatz mit Nachbarn ist oben schon gesperrt; bleibt der Fall, dass
                    // jemand anderes inzwischen einen Satz angelegt hat.
                    feedback.error(
                        error.status?.value === 409
                            ? t('event.timing.toneSets.deleteBlocked', {name: toneSet.name})
                            : t('common.error.unexpected'),
                    )
                } else {
                    feedback.success(t('event.timing.toneSets.deleted'))
                    reload()
                }
            },
            {content: t('event.timing.toneSets.deleteConfirm', {name: toneSet.name})},
        )
    }

    return (
        <Box>
            <Typography variant={'subtitle2'} gutterBottom>
                <Trans i18nKey={'event.timing.toneSets.title'} />
            </Typography>
            <Typography variant={'body2'} color={'text.secondary'}>
                <Trans i18nKey={'event.timing.toneSets.hint'} />
            </Typography>
            <Stack spacing={1} sx={{mt: 2}}>
                {sets.length === 0 && !pending && (
                    <Typography variant={'body2'} color={'text.secondary'}>
                        <Trans i18nKey={'event.timing.toneSets.none'} />
                    </Typography>
                )}
                {sets.map(toneSet => {
                    // Nur als LETZTER Satz darf die Vorgabe gehen — sonst erbte niemand mehr
                    // etwas, und jeder Typ ohne eigenen Satz fiele still auf die eingebauten
                    // Töne zurück.
                    const deleteBlocked = toneSet.isDefault && sets.length > 1
                    return (
                        <Stack
                            key={toneSet.id}
                            direction={'row'}
                            spacing={1}
                            alignItems={'center'}>
                            <Box sx={{flexGrow: 1, minWidth: 0}}>
                                <Stack
                                    direction={'row'}
                                    spacing={1}
                                    alignItems={'center'}
                                    flexWrap={'wrap'}
                                    useFlexGap>
                                    <Typography variant={'body2'}>{toneSet.name}</Typography>
                                    {toneSet.isDefault && (
                                        <Chip
                                            size={'small'}
                                            label={t('event.timing.toneSets.defaultChip')}
                                        />
                                    )}
                                </Stack>
                                <Typography variant={'body2'} color={'text.secondary'}>
                                    {describeSet(toneSet)}
                                </Typography>
                            </Box>
                            {!toneSet.isDefault && (
                                <Tooltip title={t('event.timing.toneSets.makeDefault')}>
                                    <IconButton
                                        aria-label={t('event.timing.toneSets.makeDefault')}
                                        className={'cursor-pointer'}
                                        onClick={() => makeDefault(toneSet)}>
                                        <StarBorder fontSize={'small'} />
                                    </IconButton>
                                </Tooltip>
                            )}
                            <IconButton
                                aria-label={t('event.timing.toneSets.edit')}
                                className={'cursor-pointer'}
                                onClick={() => {
                                    setEditedSet(toneSet)
                                    setDialogOpen(true)
                                }}>
                                <Edit fontSize={'small'} />
                            </IconButton>
                            {/* Gesperrt statt rot: Der Grund steht im Tooltip, bevor man klickt.
                                Das `span` trägt ihn, weil ein deaktivierter Knopf selbst keine
                                Maus-Ereignisse mehr auslöst. */}
                            <Tooltip
                                title={
                                    deleteBlocked
                                        ? t('event.timing.toneSets.deleteDefaultBlocked')
                                        : ''
                                }>
                                <span>
                                    <IconButton
                                        aria-label={t('common.delete')}
                                        disabled={deleteBlocked}
                                        className={'cursor-pointer'}
                                        onClick={() => removeSet(toneSet)}>
                                        <Delete fontSize={'small'} />
                                    </IconButton>
                                </span>
                            </Tooltip>
                        </Stack>
                    )
                })}
            </Stack>
            <Button
                startIcon={<Add />}
                sx={{mt: 1}}
                className={'cursor-pointer'}
                onClick={() => {
                    setEditedSet(undefined)
                    setDialogOpen(true)
                }}>
                <Trans i18nKey={'event.timing.toneSets.add'} />
            </Button>

            <ToneSetDialog
                open={dialogOpen}
                onClose={() => setDialogOpen(false)}
                eventId={eventId}
                entity={editedSet}
                isFirstSet={sets.length === 0}
                reloadData={reload}
            />
        </Box>
    )
}

export default ToneSetPanel
