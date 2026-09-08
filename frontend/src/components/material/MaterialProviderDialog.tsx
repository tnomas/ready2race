import {BaseEntityDialogProps} from '@utils/types.ts'
import {MaterialProviderDto, MaterialProviderRequest} from '@api/types.gen.ts'
import {useTranslation} from 'react-i18next'
import {addMaterialProvider, updateMaterialProvider} from '@api/sdk.gen.ts'
import {useForm} from 'react-hook-form-mui'
import {useCallback} from 'react'
import EntityDialog from '@components/EntityDialog.tsx'
import {Stack} from '@mui/material'
import {FormInputText} from '@components/form/input/FormInputText.tsx'
import FormInputEmail from '@components/form/input/FormInputEmail.tsx'
import {takeIfNotEmpty} from '@utils/ApiUtils.ts'

type MaterialProviderForm = {
    name: string
    contactName: string
    contactEmail: string
    contactPhone: string
    note: string
}

const defaultValues: MaterialProviderForm = {
    name: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    note: '',
}

const MaterialProviderDialog = (props: BaseEntityDialogProps<MaterialProviderDto>) => {
    const {t} = useTranslation()

    const addAction = (formData: MaterialProviderForm) =>
        addMaterialProvider({body: mapFormToRequest(formData)})

    const editAction = (formData: MaterialProviderForm, entity: MaterialProviderDto) =>
        updateMaterialProvider({
            path: {providerId: entity.id},
            body: mapFormToRequest(formData),
        })

    const formContext = useForm<MaterialProviderForm>()

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
                <FormInputText name="name" label={t('material.provider.name')} required />
                <FormInputText name="contactName" label={t('material.provider.contactName')} />
                <FormInputEmail name="contactEmail" label={t('material.provider.contactEmail')} />
                <FormInputText name="contactPhone" label={t('material.provider.contactPhone')} />
                <FormInputText name="note" label={t('material.provider.note')} multiline rows={3} />
            </Stack>
        </EntityDialog>
    )
}

function mapFormToRequest(formData: MaterialProviderForm): MaterialProviderRequest {
    return {
        name: formData.name,
        contactName: takeIfNotEmpty(formData.contactName),
        contactEmail: takeIfNotEmpty(formData.contactEmail),
        contactPhone: takeIfNotEmpty(formData.contactPhone),
        note: takeIfNotEmpty(formData.note),
    }
}

function mapDtoToForm(dto: MaterialProviderDto): MaterialProviderForm {
    return {
        name: dto.name,
        contactName: dto.contactName ?? '',
        contactEmail: dto.contactEmail ?? '',
        contactPhone: dto.contactPhone ?? '',
        note: dto.note ?? '',
    }
}

export default MaterialProviderDialog
