import {useEffect, useState} from 'react'
import {FormControlLabel, Paper, Stack, Switch, Typography} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {useEntityAdministration, useFeedback} from '@utils/hooks.ts'
import {isRequestNetworkError, runRequest} from '@utils/request.ts'
import {setMaterialRequestsClosed} from '@api/sdk.gen.ts'
import {MaterialOfferDto} from '@api/types.gen.ts'
import {SectionHeader} from '@components/ui'
import MaterialOfferTable from '@components/material/MaterialOfferTable.tsx'
import MaterialOfferDialog from '@components/material/MaterialOfferDialog.tsx'

type Props = {
    eventId: string
    providerId: string
    /** Stand aus der Übersicht der Seite (eine Quelle für Kopf-Chip und Schalter). */
    requestsClosed: boolean
    reload: () => void
}

/**
 * Reiter „Einstellungen": Vergabe öffnen/schließen und die Angebote dieser Veranstaltung. Der
 * Schalter schaltet sofort (optimistisch) und springt bei Fehler zurück.
 */
const MaterialSettingsPanel = ({eventId, providerId, requestsClosed, reload}: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [submitting, setSubmitting] = useState(false)
    const [checked, setChecked] = useState(requestsClosed)
    useEffect(() => {
        setChecked(requestsClosed)
    }, [requestsClosed])

    const handleToggle = async (value: boolean) => {
        if (submitting) return
        setChecked(value)
        const {error} = await runRequest(setSubmitting, () =>
            setMaterialRequestsClosed({
                path: {eventId, providerId},
                body: {requestsClosed: value},
            }),
        )
        if (error) {
            setChecked(!value)
            feedback.error(
                isRequestNetworkError(error)
                    ? t('common.error.network')
                    : t('entity.edit.error', {entity: t('material.settings.requestsClosed')}),
            )
        } else {
            feedback.success(
                t('entity.edit.success', {entity: t('material.settings.requestsClosed')}),
            )
            reload()
        }
    }

    const offerAdministrationProps = useEntityAdministration<MaterialOfferDto>(
        t('material.offer.offer'),
    )
    // Angebote speisen die Übersicht (Kapazität, Ampel, Angebotsnamen in Anfragen und Zuteilung):
    // nach jedem Anlegen, Ändern oder Löschen Tabelle UND Übersicht der Seite neu laden.
    const reloadOffers = () => {
        offerAdministrationProps.table.reloadData()
        reload()
    }

    return (
        <Stack spacing={4}>
            <Paper variant={'outlined'} sx={{p: 2}}>
                <SectionHeader
                    title={t('material.settings.title')}
                    description={t('material.settings.requestsClosedHint')}
                />
                <FormControlLabel
                    control={
                        <Switch
                            checked={checked}
                            disabled={submitting}
                            onChange={(_, value) => void handleToggle(value)}
                        />
                    }
                    label={t('material.settings.requestsClosed')}
                    sx={{cursor: 'pointer'}}
                />
                <Typography variant={'body2'} color={'text.secondary'}>
                    {checked ? t('material.settings.closedNow') : t('material.settings.openNow')}
                </Typography>
            </Paper>
            <MaterialOfferTable
                eventId={eventId}
                providerId={providerId}
                {...offerAdministrationProps.table}
                reloadData={reloadOffers}
                title={t('material.offer.offers')}
            />
            <MaterialOfferDialog
                eventId={eventId}
                providerId={providerId}
                {...offerAdministrationProps.dialog}
                reloadData={reloadOffers}
            />
        </Stack>
    )
}

export default MaterialSettingsPanel
