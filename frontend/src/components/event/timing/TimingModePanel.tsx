import {Box, Button, IconButton, Stack, Typography} from '@mui/material'
import {Add, Delete, Edit} from '@mui/icons-material'
import {useState} from 'react'
import {Trans, useTranslation} from 'react-i18next'
import {deleteTimingMode, getTimingModes} from '@api/sdk.gen.ts'
import {ApiError, TimingModeDto} from '@api/types.gen.ts'
import {useConfirmation} from '@contexts/confirmation/ConfirmationContext.ts'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import TimingModeDialog from './TimingModeDialog.tsx'

export type TimingModePanelProps = {
    eventId: string
    /** Wird nach jeder Änderung gerufen, damit der Zeitnahmeprofil-Baum darunter die neuen Typen kennt. */
    onChanged?: () => void
}

/**
 * Pflege der Zeitnahmetypen einer Veranstaltung — die Vorlagen, nach denen die Startposten ihre
 * Sequenzen ableiten („Timetrial 30s", „Wellenstart", …). Gleiche Gestalt wie die
 * RaceClocker-Rennen-Liste darüber im Einstellungen-Tab: eigene Endpunkte, eigenes Neuladen,
 * bewusst außerhalb des Speichern-Formulars.
 */
const TimingModePanel = ({eventId, onChanged}: TimingModePanelProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const {confirmAction} = useConfirmation()

    const [reloaded, setReloaded] = useState(0)
    const reload = () => {
        setReloaded(Date.now())
        onChanged?.()
    }
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editedMode, setEditedMode] = useState<TimingModeDto | undefined>(undefined)

    const {data: modes, pending} = useFetch(
        signal => getTimingModes({signal, path: {eventId}}),
        {
            onResponse: ({error}) => {
                if (error) {
                    feedback.error(t('common.error.unexpected'))
                }
            },
            deps: [eventId, reloaded],
        },
    )

    /**
     * Die Eckdaten eines Typs in einer Zeile — was der Posten später als Chip sieht. Startet die
     * App den Lauf gar nicht, entfallen Intervall und Vorlauf: Sie stehen zwar am Typ, wirken aber
     * nirgends, und eine Zeile, die „Intervall 30 s" für einen Typ ohne Startsequenz behauptet,
     * verspricht etwas, das nie passiert.
     */
    const describeMode = (mode: TimingModeDto) =>
        [
            t(`event.timing.modes.startGrouping.${mode.startGrouping}`),
            ...(mode.startSequenceEnabled
                ? [
                      mode.intervalSeconds != null
                          ? t('event.timing.modes.describe.interval', {
                                seconds: mode.intervalSeconds,
                            })
                          : t('event.timing.modes.describe.manualStart'),
                      t('event.timing.modes.describe.leadIn', {seconds: mode.leadInSeconds}),
                  ]
                : [t('event.timing.modes.describe.noStartSequence')]),
        ].join(' · ')

    const removeMode = (mode: TimingModeDto) => {
        confirmAction(
            async () => {
                // Der Löschschutz sitzt im Server: 409, solange der Typ noch einem Wettkampf oder
                // einer Runde zugeordnet ist. Hier wird die Sperre nur verständlich gemacht.
                const {error} = (await deleteTimingMode({
                    path: {eventId, modeId: mode.id},
                })) as {error?: ApiError}
                if (error !== undefined) {
                    if (error.status?.value === 409) {
                        feedback.error(t('event.timing.modes.deleteBlocked', {name: mode.name}))
                    } else {
                        feedback.error(t('common.error.unexpected'))
                    }
                } else {
                    feedback.success(t('event.timing.modes.deleted'))
                    reload()
                }
            },
            {content: t('event.timing.modes.deleteConfirm', {name: mode.name})},
        )
    }

    return (
        <Box>
            <Typography variant={'subtitle2'} gutterBottom>
                <Trans i18nKey={'event.timing.modes.title'} />
            </Typography>
            <Typography variant={'body2'} color={'text.secondary'}>
                <Trans i18nKey={'event.timing.modes.hint'} />
            </Typography>
            <Stack spacing={1} sx={{mt: 2}}>
                {(modes ?? []).length === 0 && !pending && (
                    <Typography variant={'body2'} color={'text.secondary'}>
                        <Trans i18nKey={'event.timing.modes.none'} />
                    </Typography>
                )}
                {(modes ?? []).map(mode => (
                    <Stack key={mode.id} direction={'row'} spacing={1} alignItems={'center'}>
                        <Box sx={{flexGrow: 1, minWidth: 0}}>
                            <Typography variant={'body2'}>{mode.name}</Typography>
                            <Typography variant={'body2'} color={'text.secondary'}>
                                {describeMode(mode)}
                            </Typography>
                        </Box>
                        <IconButton
                            aria-label={t('event.timing.modes.edit')}
                            className={'cursor-pointer'}
                            onClick={() => {
                                setEditedMode(mode)
                                setDialogOpen(true)
                            }}>
                            <Edit fontSize={'small'} />
                        </IconButton>
                        <IconButton
                            aria-label={t('common.delete')}
                            className={'cursor-pointer'}
                            onClick={() => removeMode(mode)}>
                            <Delete fontSize={'small'} />
                        </IconButton>
                    </Stack>
                ))}
            </Stack>
            <Button
                startIcon={<Add />}
                sx={{mt: 1}}
                className={'cursor-pointer'}
                onClick={() => {
                    setEditedMode(undefined)
                    setDialogOpen(true)
                }}>
                <Trans i18nKey={'event.timing.modes.add'} />
            </Button>

            <TimingModeDialog
                open={dialogOpen}
                onClose={() => setDialogOpen(false)}
                eventId={eventId}
                entity={editedMode}
                reloadData={reload}
            />
        </Box>
    )
}

export default TimingModePanel
