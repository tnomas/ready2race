import {materialErrorKey} from '@components/material/materialErrors.ts'
import {useState} from 'react'
import {
    Box,
    Button,
    Chip,
    Divider,
    FormControl,
    IconButton,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    Tooltip,
    Typography,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import {useTranslation} from 'react-i18next'
import {useUser} from '@contexts/user/UserContext.ts'
import {useConfirmation} from '@contexts/confirmation/ConfirmationContext.ts'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import {isRequestNetworkError, runRequest} from '@utils/request.ts'
import {readMaterialGlobal, updateEventGlobal} from '@authorization/privileges.ts'
import {
    getEventMaterialProviders,
    getMaterialProviders,
    inviteMaterialProvider,
    uninviteMaterialProvider,
} from '@api/sdk.gen.ts'
import {EmptyState, ErrorState, LoadingState, SectionHeader} from '@components/ui'

type Props = {
    eventId: string
}

/**
 * Veranstalter-Sicht auf die Materialvermietung (Block „Materialanbieter" im Bereich
 * Einstellungen): eingeladene Anbieter mit Zählern für offene Anfragen und offene Schäden,
 * einladen und ausladen. Details sieht der Veranstalter bewusst nicht – die Arbeit macht der
 * Anbieter in seinem Dashboard. Laden braucht READ EVENT GLOBAL (wie der Bereich selbst),
 * ein-/ausladen UPDATE EVENT GLOBAL, die Anbieterliste zum Einladen READ MATERIAL GLOBAL.
 */
const EventMaterialProvidersCard = ({eventId}: Props) => {
    const {t} = useTranslation()
    const user = useUser()
    const feedback = useFeedback()
    const {confirmAction} = useConfirmation()
    const mayManage = user.checkPrivilege(updateEventGlobal)
    const mayInvite = mayManage && user.checkPrivilege(readMaterialGlobal)

    const [selectedProviderId, setSelectedProviderId] = useState('')
    const [busy, setBusy] = useState(false)

    const {
        data: invited,
        pending: invitedPending,
        error: invitedError,
        reload,
    } = useFetch(signal => getEventMaterialProviders({signal, path: {eventId}}), {
        deps: [eventId],
    })

    const {data: allProviders, pending: allProvidersPending} = useFetch(
        signal => getMaterialProviders({signal, query: {limit: 200}}),
        {
            preCondition: () => mayInvite,
            onResponse: ({error}) => {
                if (error) {
                    feedback.error(
                        t('common.load.error.multiple.short', {
                            entity: t('material.provider.providers'),
                        }),
                    )
                }
            },
            deps: [mayInvite],
        },
    )

    const invitedIds = new Set((invited ?? []).map(p => p.materialProvider))
    const availableProviders = (allProviders?.data ?? []).filter(p => !invitedIds.has(p.id))

    const handleInvite = async () => {
        if (!selectedProviderId || busy) {
            return
        }
        const {error} = await runRequest(setBusy, () =>
            inviteMaterialProvider({path: {eventId, providerId: selectedProviderId}}),
        )
        if (isRequestNetworkError(error)) {
            feedback.error(t('common.error.network'))
        } else if (error) {
            feedback.error(t('entity.add.error', {entity: t('material.provider.provider')}))
        } else {
            feedback.success(t('entity.add.success', {entity: t('material.provider.provider')}))
            setSelectedProviderId('')
            reload()
        }
    }

    const handleUninvite = (providerId: string, name: string) => {
        confirmAction(
            async () => {
                const {error} = await runRequest(setBusy, () =>
                    uninviteMaterialProvider({path: {eventId, providerId}}),
                )
                if (isRequestNetworkError(error)) {
                    feedback.error(t('common.error.network'))
                } else if (materialErrorKey(error) === 'material.error.providerInUse') {
                    // 409: Es gibt schon Anfragen - Ausladen würde sie verwaisen lassen.
                    feedback.error(t('event.material.uninviteInUse', {name}))
                } else if (error) {
                    feedback.error(
                        t('entity.delete.error', {entity: t('material.provider.provider')}),
                    )
                } else {
                    feedback.success(
                        t('entity.delete.success', {entity: t('material.provider.provider')}),
                    )
                    reload()
                }
            },
            {
                title: t('event.material.uninviteTitle', {name}),
                content: t('event.material.uninviteConfirm'),
                okText: t('event.material.uninvite'),
                destructive: true,
            },
        )
    }

    return (
        <Paper variant={'outlined'} sx={{p: {xs: 1.5, sm: 2}}}>
            <SectionHeader
                title={t('event.material.providers')}
                description={t('event.material.description')}
            />
            {invitedError && !invited ? (
                <ErrorState
                    dense
                    message={t('common.load.error.multiple.short', {
                        entity: t('event.material.providers'),
                    })}
                    onRetry={reload}
                />
            ) : invitedPending && !invited ? (
                <LoadingState variant={'inline'} />
            ) : (invited?.length ?? 0) > 0 ? (
                <Stack divider={<Divider flexItem />}>
                    {invited?.map(provider => (
                        <Stack
                            key={provider.materialProvider}
                            direction={'row'}
                            alignItems={'center'}
                            gap={1}
                            sx={{py: 1}}>
                            <Box sx={{flex: 1, minWidth: 0}}>
                                <Stack
                                    direction={'row'}
                                    gap={1}
                                    alignItems={'center'}
                                    flexWrap={'wrap'}>
                                    <Typography fontWeight={600}>{provider.name}</Typography>
                                    {provider.requestsClosed && (
                                        <Chip size={'small'} label={t('event.material.closed')} />
                                    )}
                                </Stack>
                                <Typography variant={'body2'} color={'text.secondary'}>
                                    {t('event.material.counts', {
                                        requests: provider.openRequests,
                                        damages: provider.openDamages,
                                    })}
                                </Typography>
                            </Box>
                            {mayManage && (
                                <Tooltip title={t('event.material.uninvite')}>
                                    <span>
                                        <IconButton
                                            aria-label={t('event.material.uninviteNamed', {
                                                name: provider.name,
                                            })}
                                            disabled={busy}
                                            onClick={() =>
                                                handleUninvite(
                                                    provider.materialProvider,
                                                    provider.name,
                                                )
                                            }
                                            sx={{cursor: 'pointer'}}>
                                            <DeleteIcon />
                                        </IconButton>
                                    </span>
                                </Tooltip>
                            )}
                        </Stack>
                    ))}
                </Stack>
            ) : (
                <EmptyState dense title={t('event.material.none')} />
            )}
            {mayManage &&
                (mayInvite ? (
                    <Stack
                        direction={{xs: 'column', sm: 'row'}}
                        gap={1.5}
                        sx={{mt: 2}}
                        alignItems={{xs: 'stretch', sm: 'center'}}>
                        <FormControl sx={{minWidth: {sm: 260}}} size={'small'}>
                            <InputLabel id={'event-material-provider-invite-label'}>
                                {t('material.provider.provider')}
                            </InputLabel>
                            <Select
                                labelId={'event-material-provider-invite-label'}
                                label={t('material.provider.provider')}
                                value={selectedProviderId}
                                disabled={allProvidersPending || availableProviders.length === 0}
                                onChange={e => setSelectedProviderId(e.target.value)}>
                                {availableProviders.map(provider => (
                                    <MenuItem key={provider.id} value={provider.id}>
                                        {provider.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <Button
                            variant={'contained'}
                            disabled={!selectedProviderId || busy}
                            onClick={() => void handleInvite()}
                            sx={{cursor: 'pointer'}}>
                            {t('event.material.invite')}
                        </Button>
                    </Stack>
                ) : (
                    <Typography color={'text.secondary'} sx={{mt: 2}}>
                        {t('event.material.inviteNeedsMaterialRead')}
                    </Typography>
                ))}
        </Paper>
    )
}

export default EventMaterialProvidersCard
