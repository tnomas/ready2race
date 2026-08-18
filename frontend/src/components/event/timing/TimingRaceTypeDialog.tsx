import {BaseEntityDialogProps} from '@utils/types.ts'
import {ApiError, SequenceMode, TimingRaceTypeDto, TimingRaceTypeRequest} from '@api/types.gen.ts'
import EntityDialog from '@components/EntityDialog.tsx'
import {createTimingRaceType, updateTimingRaceType} from '@api/sdk.gen.ts'
import {FormInputText} from '@components/form/input/FormInputText.tsx'
import {FormInputSelect} from '@components/form/input/FormInputSelect.tsx'
import FormInputNumber from '@components/form/input/FormInputNumber.tsx'
import FormInputSwitch from '@components/form/input/FormInputSwitch.tsx'
import {useForm, useWatch} from 'react-hook-form-mui'
import {useCallback} from 'react'
import {Alert, Stack} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {eventIndexRoute} from '@routes'
import {RequestResult} from '@hey-api/client-fetch'

type Form = {
    name: string
    timed: boolean
    startMode: SequenceMode
    // Seconds, and empty-able: a blank field means "no preset - the starter decides", which is a
    // different statement than "zero". Kept as '' rather than null so the text input behind
    // FormInputNumber stays controlled.
    intervalSeconds: number | ''
    leadInSeconds: number | ''
    sorting: number
}

const defaultValues: Form = {
    name: '',
    timed: true,
    startMode: 'MASS',
    intervalSeconds: '',
    leadInSeconds: '',
    sorting: 0,
}

const TimingRaceTypeDialog = (props: BaseEntityDialogProps<TimingRaceTypeDto>) => {
    const {t} = useTranslation()

    const {eventId} = eventIndexRoute.useParams()

    const modeOptions = [
        {id: 'MASS', label: t('timing.sequence.mode.MASS')},
        {id: 'INTERVAL', label: t('timing.sequence.mode.INTERVAL')},
    ]

    // Same cast as the station dialog: the generated error types for the timing subtree deviate
    // from the shared ApiError shape while the runtime envelope is the usual one.
    const addAction = (formData: Form) =>
        createTimingRaceType({
            path: {eventId},
            body: mapFormToRequest(formData),
        }) as unknown as RequestResult<string, ApiError, false>

    const editAction = (formData: Form, entity: TimingRaceTypeDto) =>
        updateTimingRaceType({
            path: {eventId: entity.event, raceTypeId: entity.id},
            body: mapFormToRequest(formData),
        }) as unknown as RequestResult<void, ApiError, false>

    const formContext = useForm<Form>({defaultValues})

    const startMode = useWatch({control: formContext.control, name: 'startMode'})
    const timed = useWatch({control: formContext.control, name: 'timed'})

    const onOpen = useCallback(() => {
        formContext.reset(props.entity ? mapDtoToForm(props.entity) : defaultValues)
    }, [props.entity])

    return (
        <EntityDialog
            {...props}
            title={t(props.entity ? 'timing.raceType.edit' : 'timing.raceType.add')}
            formContext={formContext}
            onOpen={onOpen}
            addAction={addAction}
            editAction={editAction}>
            <Stack spacing={4}>
                <FormInputText name={'name'} label={t('timing.raceType.name')} required />
                <FormInputSwitch name={'timed'} label={t('timing.raceType.timed')} horizontal />
                {!timed && <Alert severity={'info'}>{t('timing.raceType.untimedHint')}</Alert>}
                <FormInputSelect
                    name={'startMode'}
                    label={t('timing.raceType.startMode')}
                    options={modeOptions}
                    required
                    fullWidth
                />
                {/* A mass start has no cadence, so the field only exists where it means something. */}
                {startMode === 'INTERVAL' && (
                    <FormInputNumber
                        name={'intervalSeconds'}
                        label={t('timing.raceType.intervalSeconds')}
                        helperText={t('timing.raceType.presetOptional')}
                        integer
                        min={1}
                    />
                )}
                <FormInputNumber
                    name={'leadInSeconds'}
                    label={t('timing.raceType.leadInSeconds')}
                    helperText={t('timing.raceType.presetOptional')}
                    integer
                    min={3}
                    max={600}
                />
                <FormInputNumber name={'sorting'} label={t('timing.raceType.sorting')} integer required />
            </Stack>
        </EntityDialog>
    )
}

const secondsToMillis = (seconds: number | ''): number | null => {
    const value = Number(seconds)
    return seconds === '' || Number.isNaN(value) ? null : Math.round(value * 1000)
}

const mapFormToRequest = (formData: Form): TimingRaceTypeRequest => ({
    name: formData.name,
    timed: formData.timed,
    startMode: formData.startMode,
    // MASS never carries a cadence - the backend drops it too, but sending it would make the form
    // and the stored race type disagree in the meantime.
    intervalMillis:
        formData.startMode === 'INTERVAL' ? secondsToMillis(formData.intervalSeconds) : null,
    leadInMillis: secondsToMillis(formData.leadInSeconds),
    sorting: formData.sorting,
})

const mapDtoToForm = (dto: TimingRaceTypeDto): Form => ({
    name: dto.name,
    timed: dto.timed,
    startMode: dto.startMode,
    intervalSeconds: dto.intervalMillis != null ? Math.round(dto.intervalMillis / 1000) : '',
    leadInSeconds: dto.leadInMillis != null ? Math.round(dto.leadInMillis / 1000) : '',
    sorting: dto.sorting,
})

export default TimingRaceTypeDialog
