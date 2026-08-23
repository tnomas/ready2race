import {BaseEntityDialogProps} from '@utils/types.ts'
import {ApiError, TimingStationDto, TimingStationRequest, TimingStationType, uuid} from '@api/types.gen.ts'
import EntityDialog from '@components/EntityDialog.tsx'
import {createTimingStation, getTimingStations, updateTimingStation} from '@api/sdk.gen.ts'
import {FormInputText} from '@components/form/input/FormInputText.tsx'
import {FormInputSelect} from '@components/form/input/FormInputSelect.tsx'
import FormInputNumber from '@components/form/input/FormInputNumber.tsx'
import {useForm, useWatch} from 'react-hook-form-mui'
import {useCallback} from 'react'
import {Stack, Typography} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {eventRoute} from '@routes'
import {RequestResult} from '@hey-api/client-fetch'
import {useFetch} from '@utils/hooks.ts'

type Form = {
    name: string
    type: TimingStationType
    sorting: number
    /** Nur für ANZEIGE: der gespiegelte START-Posten; '' = jede Startsequenz der Veranstaltung. */
    linkedStation: string
}

const defaultValues: Form = {
    name: '',
    type: 'START',
    sorting: 0,
    linkedStation: '',
}

const TimingStationDialog = (props: BaseEntityDialogProps<TimingStationDto>) => {
    const {t} = useTranslation()

    const {eventId} = eventRoute.useParams()

    const typeOptions = [
        {id: 'START', label: t('timing.station.types.START')},
        {id: 'SPLIT', label: t('timing.station.types.SPLIT')},
        {id: 'FINISH', label: t('timing.station.types.FINISH')},
        {id: 'ANZEIGE', label: t('timing.station.types.ANZEIGE')},
    ]

    // Die Verknüpfungs-Ziele eines ANZEIGE-Postens: nur START-Posten derselben Veranstaltung
    // (das erzwingt auch der Server). Bei jedem Öffnen neu geladen — der Dialog ist dauerhaft
    // gemountet, und ein gerade eben angelegter START-Posten muss sofort verknüpfbar sein.
    const {data: stations} = useFetch(signal => getTimingStations({signal, path: {eventId}}), {
        deps: [eventId, props.dialogIsOpen],
    })
    const startStationOptions = [
        {id: '', label: t('timing.station.linkedStation.all')},
        ...(stations ?? [])
            .filter(station => station.type === 'START')
            .map(station => ({id: station.id, label: station.name})),
    ]

    // Both generated error types deviate from the shared ApiError shape (an artifact of the
    // surgical tsp merge for the timing subtree, see Task 1) - the runtime envelope is still
    // the usual ApiError, so we cast to line up with EntityDialog's generic bound.
    const addAction = (formData: Form) =>
        createTimingStation({
            path: {eventId},
            body: mapFormToRequest(formData),
        }) as unknown as RequestResult<uuid, ApiError, false>

    const editAction = (formData: Form, entity: TimingStationDto) =>
        updateTimingStation({
            path: {eventId: entity.event, stationId: entity.id},
            body: mapFormToRequest(formData),
        }) as unknown as RequestResult<void, ApiError, false>

    const formContext = useForm<Form>()

    const type = useWatch({control: formContext.control, name: 'type'})

    const onOpen = useCallback(() => {
        formContext.reset(props.entity ? mapDtoToForm(props.entity) : defaultValues)
    }, [props.entity])

    return (
        <EntityDialog
            {...props}
            title={t(props.entity ? 'timing.station.edit' : 'timing.station.add')}
            formContext={formContext}
            onOpen={onOpen}
            addAction={addAction}
            editAction={editAction}>
            <Stack spacing={4}>
                <FormInputText name={'name'} label={t('timing.station.name')} required />
                <FormInputSelect
                    name={'type'}
                    label={t('timing.station.type')}
                    options={typeOptions}
                    required
                    fullWidth
                />
                {/* Die Spiegelung eines ANZEIGE-Postens: welcher START-Posten auf diesem
                    Bildschirm läuft. Leer = jede Startsequenz der Veranstaltung. */}
                {type === 'ANZEIGE' && (
                    <Stack spacing={1}>
                        <FormInputSelect
                            name={'linkedStation'}
                            label={t('timing.station.linkedStation.label')}
                            options={startStationOptions}
                            fullWidth
                        />
                        <Typography variant={'caption'} color={'text.secondary'}>
                            {t('timing.station.linkedStation.hint')}
                        </Typography>
                    </Stack>
                )}
                <FormInputNumber
                    name={'sorting'}
                    label={t('timing.station.sorting')}
                    integer
                    required
                />
            </Stack>
        </EntityDialog>
    )
}

const mapFormToRequest = (formData: Form): TimingStationRequest => ({
    name: formData.name,
    type: formData.type,
    sorting: formData.sorting,
    // Nur ANZEIGE darf eine Verknüpfung tragen (Server-Regel); ein anderer Typ schickt null,
    // damit ein Typwechsel eine alte Verknüpfung nicht unsichtbar stehen lässt.
    linkedStation:
        formData.type === 'ANZEIGE' && formData.linkedStation !== ''
            ? formData.linkedStation
            : null,
})

const mapDtoToForm = (dto: TimingStationDto): Form => ({
    name: dto.name,
    type: dto.type,
    sorting: dto.sorting,
    linkedStation: dto.linkedStation ?? '',
})

export default TimingStationDialog
