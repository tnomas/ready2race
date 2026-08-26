import {BaseEntityDialogProps} from '@utils/types.ts'
import {
    ApiError,
    TimingStationDto,
    TimingStationRequest,
    TimingStationType,
} from '@api/types.gen.ts'
import EntityDialog from '@components/EntityDialog.tsx'
import {createTimingStation, updateTimingStation} from '@api/sdk.gen.ts'
import {FormInputText} from '@components/form/input/FormInputText.tsx'
import {FormInputSelect} from '@components/form/input/FormInputSelect.tsx'
import FormInputNumber from '@components/form/input/FormInputNumber.tsx'
import {useForm} from 'react-hook-form-mui'
import {useCallback} from 'react'
import {Stack} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {eventIndexRoute} from '@routes'
import {RequestResult} from '@hey-api/client-fetch'

type Form = {
    name: string
    type: TimingStationType
    sorting: number
}

const defaultValues: Form = {
    name: '',
    type: 'START',
    sorting: 0,
}

const TimingStationDialog = (props: BaseEntityDialogProps<TimingStationDto>) => {
    const {t} = useTranslation()

    const {eventId} = eventIndexRoute.useParams()

    const typeOptions = [
        {id: 'START', label: t('timing.station.types.START')},
        {id: 'SPLIT', label: t('timing.station.types.SPLIT')},
        {id: 'FINISH', label: t('timing.station.types.FINISH')},
    ]

    // Both generated error types deviate from the shared ApiError shape (an artifact of the
    // surgical tsp merge for the timing subtree, see Task 1) - the runtime envelope is still
    // the usual ApiError, so we cast to line up with EntityDialog's generic bound.
    const addAction = (formData: Form) =>
        createTimingStation({
            path: {eventId},
            body: mapFormToRequest(formData),
        }) as unknown as RequestResult<string, ApiError, false>

    const editAction = (formData: Form, entity: TimingStationDto) =>
        updateTimingStation({
            path: {eventId: entity.event, stationId: entity.id},
            body: mapFormToRequest(formData),
        }) as unknown as RequestResult<void, ApiError, false>

    const formContext = useForm<Form>()

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
})

const mapDtoToForm = (dto: TimingStationDto): Form => ({
    name: dto.name,
    type: dto.type,
    sorting: dto.sorting,
})

export default TimingStationDialog
