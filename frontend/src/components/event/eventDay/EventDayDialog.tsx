import {useTranslation} from 'react-i18next'
import {BaseEntityDialogProps} from '@utils/types.ts'
import {useForm} from 'react-hook-form-mui'
import {Stack} from '@mui/material'
import {takeIfNotEmpty} from '@utils/ApiUtils.ts'
import {useCallback} from 'react'
import EntityDialog from '@components/EntityDialog.tsx'
import FormInputDate from '@components/form/input/FormInputDate.tsx'
import FormInputDateTime from '@components/form/input/FormInputDateTime.tsx'
import {FormInputText} from '@components/form/input/FormInputText.tsx'
import {eventIndexRoute} from '@routes'
import {addEventDay, updateEventDay} from '@api/sdk.gen.ts'
import {EventDayDto, EventDayRequest} from '@api/types.gen.ts'

type EventDayForm = {
    date: string
    name: string
    description: string
    /**
     * Ab wann an diesem Tag vor Ort gearbeitet wird. Steuert, ab wann die Helfer-App die
     * Veranstaltung ueberhaupt zur Wahl stellt; leer heisst "ab Tagesbeginn".
     */
    operationsStart: string | null
}

const EventDayDialog = (props: BaseEntityDialogProps<EventDayDto>) => {
    const {t} = useTranslation()

    const {eventId} = eventIndexRoute.useParams()

    const addAction = (formData: EventDayForm) => {
        return addEventDay({
            path: {eventId: eventId},
            body: mapFormToRequest(formData),
        })
    }

    const editAction = (formData: EventDayForm, entity: EventDayDto) => {
        return updateEventDay({
            path: {eventId: entity.event, eventDayId: entity.id},
            body: mapFormToRequest(formData),
        })
    }

    const defaultValues: EventDayForm = {
        date: '',
        name: '',
        description: '',
        operationsStart: null,
    }

    const formContext = useForm<EventDayForm>()

    const onOpen = useCallback(() => {
        formContext.reset(props.entity ? mapDtoToForm(props.entity) : defaultValues)
    }, [props.entity])

    return (
        <EntityDialog
            {...props}
            formContext={formContext}
            onOpen={onOpen}
            addAction={addAction}
            editAction={editAction}>
            <Stack spacing={4}>
                <FormInputDate name="date" label={t('event.eventDay.date')} required />
                <FormInputText name="name" label={t('event.eventDay.name')} />
                <FormInputText name="description" label={t('event.eventDay.description')} />
                {/* Darf bewusst vor dem Tag selbst liegen: Die Akkreditierung des ersten
                    Renntages findet oft am Vorabend statt. */}
                <FormInputDateTime
                    name="operationsStart"
                    label={t('event.eventDay.operationsStart')}
                    helperText={t('event.eventDay.operationsStartHint')}
                />
            </Stack>
        </EntityDialog>
    )
}

function mapFormToRequest(formData: EventDayForm): EventDayRequest {
    return {
        date: formData.date,
        name: takeIfNotEmpty(formData.name),
        description: takeIfNotEmpty(formData.description),
        operationsStart: formData.operationsStart ?? undefined,
    }
}

function mapDtoToForm(dto: EventDayDto): EventDayForm {
    return {
        date: dto.date,
        name: dto.name ?? '',
        description: dto.description ?? '',
        operationsStart: dto.operationsStart ?? null,
    }
}

export default EventDayDialog
