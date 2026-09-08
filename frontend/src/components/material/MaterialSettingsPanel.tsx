import {useEffect, useState} from 'react'
import {Card, FormControlLabel, Stack, Switch, Typography} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {useEntityAdministration, useFeedback, useFetch} from '@utils/hooks.ts'
import {getMaterialProviderEvents, setMaterialRequestsClosed} from '@api/sdk.gen.ts'
import {MaterialOfferDto} from '@api/types.gen.ts'
import MaterialOfferTable from '@components/material/MaterialOfferTable.tsx'
import MaterialOfferDialog from '@components/material/MaterialOfferDialog.tsx'

type Props = {
    eventId: string
    providerId: string
}

/**
 * Einstellungen-Reiter des Anbieter-Dashboards: Vergabe öffnen/schließen und die Angebote für
 * diese Veranstaltung pflegen. requestsClosed lebt am Paar (Veranstaltung, Anbieter) - der
 * Anfangswert kommt aus der Veranstaltungswahl des Anbieters (READ MATERIAL reicht dafür, anders
 * als bei der Veranstalter-Karte, die READ EVENT GLOBAL braucht).
 */
const MaterialSettingsPanel = ({eventId, providerId}: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [lastRequested, setLastRequested] = useState(Date.now())
    const [submitting, setSubmitting] = useState(false)

    const {data: events, pending} = useFetch(
        signal => getMaterialProviderEvents({signal, path: {providerId}}),
        {
            onResponse: ({error}) => {
                if (error) {
                    feedback.error(t('common.load.error.single', {entity: t('event.event')}))
                }
            },
            deps: [providerId, lastRequested],
        },
    )

    const requestsClosed = events?.find(event => event.event === eventId)?.requestsClosed ?? false

    const [checked, setChecked] = useState(requestsClosed)
    useEffect(() => {
        setChecked(requestsClosed)
    }, [requestsClosed])

    const handleToggle = async (value: boolean) => {
        setChecked(value)
        setSubmitting(true)
        const {error} = await setMaterialRequestsClosed({
            path: {eventId, providerId},
            body: {requestsClosed: value},
        })
        setSubmitting(false)
        if (error) {
            feedback.error(t('entity.edit.error', {entity: t('material.settings.requestsClosed')}))
            setChecked(!value)
        } else {
            feedback.success(t('entity.edit.success', {entity: t('material.settings.requestsClosed')}))
            setLastRequested(Date.now())
        }
    }

    const offerAdministrationProps = useEntityAdministration<MaterialOfferDto>(
        t('material.offer.offer'),
    )

    return (
        <Stack spacing={4}>
            <Card sx={{p: 2}}>
                <Typography variant="h6" sx={{mb: 1}}>
                    {t('material.settings.title')}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{mb: 2}}>
                    {t('material.settings.requestsClosedHint')}
                </Typography>
                <FormControlLabel
                    control={
                        <Switch
                            checked={checked}
                            disabled={pending || submitting}
                            onChange={(_, value) => handleToggle(value)}
                        />
                    }
                    label={t('material.settings.requestsClosed')}
                />
            </Card>
            <MaterialOfferTable
                eventId={eventId}
                providerId={providerId}
                {...offerAdministrationProps.table}
                title={t('material.offer.offers')}
            />
            <MaterialOfferDialog
                eventId={eventId}
                providerId={providerId}
                {...offerAdministrationProps.dialog}
            />
        </Stack>
    )
}

export default MaterialSettingsPanel
