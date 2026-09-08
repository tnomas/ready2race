import {
    Box,
    Chip,
    FormControl,
    InputLabel,
    List,
    ListItemButton,
    ListItemText,
    MenuItem,
    Select,
    Typography,
} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {Link, useNavigate} from '@tanstack/react-router'
import {materialIndexRoute} from '@routes'
import {useUser} from '@contexts/user/UserContext.ts'
import {readMaterialGlobal} from '@authorization/privileges.ts'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import {getMaterialProviderEvents, getMaterialProviders} from '@api/sdk.gen.ts'
import Throbber from '@components/Throbber.tsx'

/**
 * Veranstaltungswahl eines Materialanbieters: der eigene Anbieter (materialProviderId am Konto)
 * sieht sofort seine Veranstaltungen; Konten mit READ MATERIAL GLOBAL ohne eigene Zuordnung
 * wählen den Anbieter zuerst über die Adresse (`?provider=`), wie auf der Flotten-Seite.
 */
const SelectMaterialEventPage = () => {
    const {t} = useTranslation()
    const user = useUser()
    const feedback = useFeedback()
    const search = materialIndexRoute.useSearch()
    const navigate = useNavigate()

    const mayReadGlobal = user.checkPrivilege(readMaterialGlobal)
    const ownProviderId = user.loggedIn ? user.materialProviderId : undefined
    const providerId = ownProviderId ?? (mayReadGlobal ? search.provider : undefined)

    const {data: providers, pending: providersPending} = useFetch(
        signal => getMaterialProviders({signal, query: {limit: 200}}),
        {
            preCondition: () => providerId === undefined && mayReadGlobal,
            onResponse: ({error}) => {
                if (error) {
                    feedback.error(
                        t('common.load.error.multiple.short', {
                            entity: t('material.provider.providers'),
                        }),
                    )
                }
            },
            deps: [providerId, mayReadGlobal],
        },
    )

    const {data: events, pending: eventsPending} = useFetch(
        signal => getMaterialProviderEvents({signal, path: {providerId: providerId ?? ''}}),
        {
            preCondition: () => providerId !== undefined,
            onResponse: ({error}) => {
                if (error) {
                    feedback.error(t('common.load.error.multiple.short', {entity: t('event.event')}))
                }
            },
            deps: [providerId],
        },
    )

    if (providerId === undefined) {
        return (
            <Box>
                <Typography variant={'h1'}>{t('material.events.title')}</Typography>
                {!mayReadGlobal ? (
                    <Typography>{t('material.fleet.noProvider')}</Typography>
                ) : providersPending && !providers ? (
                    <Throbber />
                ) : (
                    <FormControl sx={{minWidth: 300, mt: 2}}>
                        <InputLabel id={'material-events-provider-label'}>
                            {t('material.provider.provider')}
                        </InputLabel>
                        <Select
                            labelId={'material-events-provider-label'}
                            label={t('material.provider.provider')}
                            value={''}
                            onChange={e => {
                                const provider = e.target.value as string
                                navigate({
                                    from: materialIndexRoute.fullPath,
                                    search: {provider},
                                }).then()
                            }}>
                            {providers?.data.map(provider => (
                                <MenuItem key={provider.id} value={provider.id}>
                                    {provider.name}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                )}
            </Box>
        )
    }

    return (
        <Box>
            <Typography variant={'h1'}>{t('material.events.title')}</Typography>
            {eventsPending && !events ? (
                <Throbber />
            ) : (events?.length ?? 0) > 0 ? (
                <List>
                    {events?.map(event => (
                        <Link
                            key={event.event}
                            to={'/material/event/$eventId'}
                            params={{eventId: event.event}}
                            // providerId reist als Adresse mit - das Dashboard zieht bei einer
                            // eigenen Zuordnung ohnehin useUser().materialProviderId vor, dieser
                            // Parameter zählt nur für Konten mit READ MATERIAL GLOBAL.
                            search={{provider: providerId}}
                            style={{textDecoration: 'none', color: 'inherit'}}>
                            <ListItemButton>
                                <ListItemText primary={event.eventName} />
                                {event.requestsClosed ? (
                                    <Chip size="small" label={t('event.material.closed')} />
                                ) : (
                                    <Chip
                                        size="small"
                                        color="success"
                                        label={t('material.events.open')}
                                    />
                                )}
                            </ListItemButton>
                        </Link>
                    ))}
                </List>
            ) : (
                <Typography>{t('material.events.none')}</Typography>
            )}
        </Box>
    )
}

export default SelectMaterialEventPage
