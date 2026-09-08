import {useState} from 'react'
import {
    Box,
    Button,
    Card,
    Chip,
    FormControl,
    IconButton,
    InputLabel,
    List,
    ListItem,
    ListItemText,
    MenuItem,
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
import {updateEventGlobal} from '@authorization/privileges.ts'
import {
    getEventMaterialProviders,
    getMaterialProviders,
    inviteMaterialProvider,
    uninviteMaterialProvider,
} from '@api/sdk.gen.ts'
import Throbber from '@components/Throbber.tsx'

type Props = {
    eventId: string
}

/**
 * Veranstalter-Sicht auf die eingeladenen Materialanbieter: einladen (aus allen Anbietern
 * abzüglich der bereits eingeladenen), ausladen mit Bestätigung, dazu je Anbieter die Zähler
 * für offene Anfragen/Schäden und ein Hinweis, wenn der Anbieter die Vergabe geschlossen hat.
 * Die Angebote selbst pflegt der Anbieter in seinem eigenen Dashboard (Reiter „Einstellungen").
 */
const EventMaterialProvidersCard = ({eventId}: Props) => {
    const {t} = useTranslation()
    const user = useUser()
    const feedback = useFeedback()
    const {confirmAction} = useConfirmation()
    const mayManage = user.checkPrivilege(updateEventGlobal)

    const [lastRequested, setLastRequested] = useState(Date.now())
    const reload = () => setLastRequested(Date.now())

    const [selectedProviderId, setSelectedProviderId] = useState('')
    const [inviting, setInviting] = useState(false)

    const {data: invited, pending: invitedPending} = useFetch(
        signal => getEventMaterialProviders({signal, path: {eventId}}),
        {
            onResponse: ({error}) => {
                if (error) {
                    feedback.error(
                        t('common.load.error.multiple.short', {
                            entity: t('event.material.providers'),
                        }),
                    )
                }
            },
            deps: [eventId, lastRequested],
        },
    )

    const {data: allProviders, pending: allProvidersPending} = useFetch(
        signal => getMaterialProviders({signal, query: {limit: 200}}),
        {
            preCondition: () => mayManage,
            onResponse: ({error}) => {
                if (error) {
                    feedback.error(
                        t('common.load.error.multiple.short', {
                            entity: t('material.provider.providers'),
                        }),
                    )
                }
            },
        },
    )

    const invitedIds = new Set((invited ?? []).map(p => p.materialProvider))
    const availableProviders = (allProviders?.data ?? []).filter(p => !invitedIds.has(p.id))

    const handleInvite = async () => {
        if (!selectedProviderId) {
            return
        }
        setInviting(true)
        const {error} = await inviteMaterialProvider({
            path: {eventId, providerId: selectedProviderId},
        })
        setInviting(false)
        if (error) {
            feedback.error(t('entity.add.error', {entity: t('material.provider.provider')}))
        } else {
            feedback.success(t('entity.add.success', {entity: t('material.provider.provider')}))
            setSelectedProviderId('')
            reload()
        }
    }

    const handleUninvite = (providerId: string) => {
        confirmAction(
            async () => {
                const {error} = await uninviteMaterialProvider({
                    path: {eventId, providerId},
                })
                if (error) {
                    feedback.error(t('entity.delete.error', {entity: t('material.provider.provider')}))
                } else {
                    feedback.success(
                        t('entity.delete.success', {entity: t('material.provider.provider')}),
                    )
                    reload()
                }
            },
            {
                content: t('event.material.uninviteConfirm'),
                okText: t('event.material.uninvite'),
            },
        )
    }

    return (
        <Card sx={{p: 2}}>
            <Typography variant="h6" sx={{mb: 2}}>
                {t('event.material.providers')}
            </Typography>
            {invitedPending && !invited ? (
                <Throbber />
            ) : (invited?.length ?? 0) > 0 ? (
                <List>
                    {invited?.map(provider => (
                        <ListItem
                            key={provider.materialProvider}
                            secondaryAction={
                                mayManage && (
                                    <Tooltip title={t('event.material.uninvite')}>
                                        <IconButton
                                            edge="end"
                                            onClick={() =>
                                                handleUninvite(provider.materialProvider)
                                            }>
                                            <DeleteIcon />
                                        </IconButton>
                                    </Tooltip>
                                )
                            }>
                            <ListItemText
                                primary={
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <Typography>{provider.name}</Typography>
                                        {provider.requestsClosed && (
                                            <Chip
                                                size="small"
                                                color="default"
                                                label={t('event.material.closed')}
                                            />
                                        )}
                                    </Stack>
                                }
                                secondary={`${t('event.material.openRequests')}: ${provider.openRequests} · ${t('event.material.openDamages')}: ${provider.openDamages}`}
                            />
                        </ListItem>
                    ))}
                </List>
            ) : (
                <Typography color="text.secondary">{t('event.material.none')}</Typography>
            )}
            {mayManage && (
                <Stack direction="row" spacing={2} sx={{mt: 2, alignItems: 'center'}}>
                    <FormControl sx={{minWidth: 260}} size="small">
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
                    <Box>
                        <Button
                            variant="contained"
                            disabled={!selectedProviderId || inviting}
                            onClick={handleInvite}>
                            {t('event.material.invite')}
                        </Button>
                    </Box>
                </Stack>
            )}
        </Card>
    )
}

export default EventMaterialProvidersCard
