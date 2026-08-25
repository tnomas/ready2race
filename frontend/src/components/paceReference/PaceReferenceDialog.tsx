import {BaseEntityDialogProps} from '@utils/types.ts'
import {ApiError, PaceReferenceDto, PaceReferenceMode, PaceReferenceRequest} from '@api/types.gen.ts'
import EntityDialog from '@components/EntityDialog.tsx'
import {addPaceReference, updatePaceReference} from '@api/sdk.gen.ts'
import {FormInputText} from '@components/form/input/FormInputText.tsx'
import {FormInputRadioButtonGroup} from '@components/form/input/FormInputRadioButtonGroup.tsx'
import FormInputNumber from '@components/form/input/FormInputNumber.tsx'
import {useForm} from 'react-hook-form-mui'
import {useCallback} from 'react'
import {Stack, Typography} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {useFeedback} from '@utils/hooks.ts'
import {paceReferenceLabel} from '@components/paceReference/paceReferenceLabel.ts'

type Form = {
    name: string
    mode: PaceReferenceMode
    referenceMeters: number
}

const defaultValues: Form = {
    name: '',
    mode: 'TIME_PER_DISTANCE',
    referenceMeters: 500,
}

const addAction = (formData: Form) =>
    addPaceReference({
        body: mapFormToRequest(formData),
    })

const editAction = (formData: Form, entity: PaceReferenceDto) =>
    updatePaceReference({
        path: {paceReferenceId: entity.id},
        body: mapFormToRequest(formData),
    })

const PaceReferenceDialog = (props: BaseEntityDialogProps<PaceReferenceDto>) => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const formContext = useForm<Form>()

    // `formContext` steht mit in den Abhängigkeiten, obwohl die Nachbardialoge es weglassen: Das
    // Objekt aus useForm ist über die Lebensdauer stabil, die Kennung von onOpen bleibt damit
    // gleich - und die Regel react-hooks/exhaustive-deps meldet nichts.
    const onOpen = useCallback(() => {
        formContext.reset(props.entity ? mapDtoToForm(props.entity) : defaultValues)
    }, [props.entity, formContext])

    /**
     * Den einzigen Fehler, der hier wirklich vorkommt, beim Namen nennen: Über den Namen wird die
     * Bezugsgröße am Wettkampf ausgewählt, und die Sammelmeldung von [EntityDialog] verriete nicht,
     * dass es schon eine gleichnamige gibt.
     */
    const showKnownError = (error: ApiError): boolean => {
        if (error.errorCode === 'PACE_REFERENCE_NAME_TAKEN') {
            feedback.error(t('configuration.paceReference.error.nameTaken'))
            return true
        }
        return false
    }

    const mode = formContext.watch('mode')
    const referenceMeters = Number(formContext.watch('referenceMeters'))
    // Solange die Eingabe unbrauchbar ist (leer, Buchstaben, 0), gibt es nichts zu zeigen - die
    // Vorschau bleibt dann leer statt „NaN" zu behaupten.
    const preview =
        mode && Number.isFinite(referenceMeters) && referenceMeters > 0
            ? paceReferenceLabel(mode, referenceMeters)
            : undefined

    return (
        <EntityDialog
            {...props}
            formContext={formContext}
            onOpen={onOpen}
            addAction={addAction}
            editAction={editAction}
            onAddError={showKnownError}
            onEditError={showKnownError}>
            <Stack spacing={4}>
                <FormInputText
                    name={'name'}
                    label={t('configuration.paceReference.name')}
                    required
                />
                <FormInputRadioButtonGroup
                    name={'mode'}
                    label={t('configuration.paceReference.mode.mode')}
                    required
                    options={[
                        {
                            id: 'TIME_PER_DISTANCE',
                            label: t('configuration.paceReference.mode.TIME_PER_DISTANCE'),
                        },
                        {
                            id: 'DISTANCE_PER_TIME',
                            label: t('configuration.paceReference.mode.DISTANCE_PER_TIME'),
                        },
                    ]}
                />
                <FormInputNumber
                    name={'referenceMeters'}
                    label={t('configuration.paceReference.referenceMeters')}
                    min={1}
                    integer
                    required
                />
                {preview !== undefined && (
                    <Typography variant={'body2'}>
                        {t('configuration.paceReference.preview', {label: preview})}
                    </Typography>
                )}
            </Stack>
        </EntityDialog>
    )
}

const mapFormToRequest = (formData: Form): PaceReferenceRequest => ({
    name: formData.name,
    mode: formData.mode,
    // Das Zahlenfeld ist ein Textfeld; ohne die Umwandlung ginge die Meterzahl als Zeichenkette
    // an den Server und scheiterte dort erst beim Einlesen.
    referenceMeters: Number(formData.referenceMeters),
})

const mapDtoToForm = (dto: PaceReferenceDto): Form => ({
    name: dto.name,
    mode: dto.mode,
    referenceMeters: dto.referenceMeters,
})

export default PaceReferenceDialog
