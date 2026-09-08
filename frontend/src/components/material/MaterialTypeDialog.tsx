import {BaseEntityDialogProps} from '@utils/types.ts'
import {MaterialCategory, MaterialTypeDto, MaterialTypeRequest} from '@api/types.gen.ts'
import {useTranslation} from 'react-i18next'
import {addMaterialType, updateMaterialType} from '@api/sdk.gen.ts'
import {useForm} from 'react-hook-form-mui'
import {useCallback} from 'react'
import EntityDialog from '@components/EntityDialog.tsx'
import {Stack} from '@mui/material'
import {FormInputText} from '@components/form/input/FormInputText.tsx'
import {FormInputSelect} from '@components/form/input/FormInputSelect.tsx'
import {takeIfNotEmpty} from '@utils/ApiUtils.ts'

type MaterialTypeForm = {
    name: string
    category: MaterialCategory
    description: string
}

const defaultValues: MaterialTypeForm = {
    name: '',
    category: 'BOAT',
    description: '',
}

const MaterialTypeDialog = (props: BaseEntityDialogProps<MaterialTypeDto>) => {
    const {t} = useTranslation()

    const categoryOptions = [
        {id: 'BOAT', label: t('material.category.BOAT')},
        {id: 'OTHER', label: t('material.category.OTHER')},
    ]

    const addAction = (formData: MaterialTypeForm) =>
        addMaterialType({body: mapFormToRequest(formData)})

    const editAction = (formData: MaterialTypeForm, entity: MaterialTypeDto) =>
        updateMaterialType({
            path: {typeId: entity.id},
            body: mapFormToRequest(formData),
        })

    const formContext = useForm<MaterialTypeForm>()

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
                <FormInputText name="name" label={t('material.type.name')} required />
                <FormInputSelect
                    name="category"
                    label={t('material.type.category')}
                    options={categoryOptions}
                    required
                    fullWidth
                />
                <FormInputText
                    name="description"
                    label={t('material.type.description')}
                    multiline
                    rows={3}
                />
            </Stack>
        </EntityDialog>
    )
}

function mapFormToRequest(formData: MaterialTypeForm): MaterialTypeRequest {
    return {
        name: formData.name,
        category: formData.category,
        description: takeIfNotEmpty(formData.description),
    }
}

function mapDtoToForm(dto: MaterialTypeDto): MaterialTypeForm {
    return {
        name: dto.name,
        category: dto.category,
        description: dto.description ?? '',
    }
}

export default MaterialTypeDialog
