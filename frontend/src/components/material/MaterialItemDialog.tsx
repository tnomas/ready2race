import {AutocompleteOption, BaseEntityDialogProps} from '@utils/types.ts'
import {MaterialItemDto, MaterialItemRequest} from '@api/types.gen.ts'
import {useTranslation} from 'react-i18next'
import {addMaterialItem, getMaterialTypes, updateMaterialItem} from '@api/sdk.gen.ts'
import {useForm} from 'react-hook-form-mui'
import {useCallback} from 'react'
import EntityDialog from '@components/EntityDialog.tsx'
import {Stack} from '@mui/material'
import {FormInputText} from '@components/form/input/FormInputText.tsx'
import FormInputNumber from '@components/form/input/FormInputNumber.tsx'
import FormInputAutocomplete from '@components/form/input/FormInputAutocomplete.tsx'
import FormInputSwitch from '@components/form/input/FormInputSwitch.tsx'
import {takeIfNotEmpty} from '@utils/ApiUtils.ts'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import {materialErrorKey} from './materialErrors.ts'

type MaterialItemForm = {
    materialType: AutocompleteOption
    number?: number
    label: string
    note: string
    retired: boolean
}

const defaultValues: MaterialItemForm = {
    materialType: null,
    number: undefined,
    label: '',
    note: '',
    retired: false,
}

type Props = BaseEntityDialogProps<MaterialItemDto> & {
    providerId: string
}

const MaterialItemDialog = ({providerId, ...props}: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const {data: types, pending: typesPending} = useFetch(signal =>
        getMaterialTypes({signal, query: {limit: 200}}),
    )

    const typeOptions: AutocompleteOption[] =
        types?.data.map(dto => ({id: dto.id, label: dto.name})) ?? []

    const addAction = (formData: MaterialItemForm) =>
        addMaterialItem({
            path: {providerId},
            body: mapFormToRequest(formData),
        })

    const editAction = (formData: MaterialItemForm, entity: MaterialItemDto) =>
        updateMaterialItem({
            path: {providerId, itemId: entity.id},
            body: mapFormToRequest(formData),
        })

    // Art eines zugeteilten Stücks bleibt fest (409 MATERIAL_ITEM_TYPE_LOCKED): sagen, warum.
    const showKnownError = (error: unknown): boolean => {
        const key = materialErrorKey(error)
        if (key) feedback.error(t(key))
        return key !== null
    }

    const formContext = useForm<MaterialItemForm>()

    const onOpen = useCallback(() => {
        formContext.reset(props.entity ? mapDtoToForm(props.entity) : defaultValues)
    }, [props.entity])

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
                <FormInputAutocomplete
                    name={'materialType'}
                    options={typeOptions}
                    label={t('material.item.type')}
                    autocompleteProps={{getOptionKey: option => option.id}}
                    loading={typesPending}
                    required
                />
                <FormInputNumber name="number" label={t('material.item.number')} integer />
                <FormInputText
                    name="label"
                    label={t('material.item.label')}
                    required
                    rules={{
                        maxLength: {value: 20, message: t('material.item.labelTooLong')},
                    }}
                />
                <FormInputText name="note" label={t('material.item.note')} multiline rows={3} />
                <FormInputSwitch
                    name="retired"
                    label={t('material.item.retired')}
                    horizontal
                    reverse
                />
            </Stack>
        </EntityDialog>
    )
}

function mapFormToRequest(formData: MaterialItemForm): MaterialItemRequest {
    // FormInputNumber liefert intern immer einen String (kein type="number"-Feld) — ein
    // geleertes Feld kommt deshalb als leerer String an, nicht als undefined, und Number('')
    // wäre fälschlich 0. Beides zusammen auf undefined abbilden.
    const numberValue =
        formData.number === undefined || `${formData.number}` === ''
            ? undefined
            : Number(formData.number)

    return {
        materialType: formData.materialType?.id ?? '',
        number: numberValue,
        label: formData.label,
        note: takeIfNotEmpty(formData.note),
        status: formData.retired ? 'RETIRED' : 'ACTIVE',
    }
}

function mapDtoToForm(dto: MaterialItemDto): MaterialItemForm {
    return {
        materialType: {id: dto.materialType, label: dto.materialTypeName},
        number: dto.number,
        label: dto.label,
        note: dto.note ?? '',
        retired: dto.status === 'RETIRED',
    }
}

export default MaterialItemDialog
