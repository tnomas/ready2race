import {AutocompleteOption, BaseEntityDialogProps} from '@utils/types.ts'
import {MaterialOfferDto, MaterialOfferRequest} from '@api/types.gen.ts'
import {useTranslation} from 'react-i18next'
import {
    addMaterialOffer,
    getMaterialOffers,
    getMaterialTypes,
    updateMaterialOffer,
} from '@api/sdk.gen.ts'
import {useForm} from 'react-hook-form-mui'
import {useCallback} from 'react'
import EntityDialog from '@components/EntityDialog.tsx'
import {Stack} from '@mui/material'
import {FormInputText} from '@components/form/input/FormInputText.tsx'
import FormInputNumber from '@components/form/input/FormInputNumber.tsx'
import FormInputAutocomplete from '@components/form/input/FormInputAutocomplete.tsx'
import {takeIfNotEmpty} from '@utils/ApiUtils.ts'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import {materialErrorKey} from './materialErrors.ts'

type MaterialOfferForm = {
    materialType: AutocompleteOption
    priceText: string
    plannedCount?: number
    changeoverMinutes?: number
}

const defaultValues: MaterialOfferForm = {
    materialType: null,
    priceText: '',
    plannedCount: 0,
    changeoverMinutes: 30,
}

type Props = BaseEntityDialogProps<MaterialOfferDto> & {
    eventId: string
    providerId: string
}

const MaterialOfferDialog = ({eventId, providerId, ...props}: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const {data: types, pending: typesPending} = useFetch(signal =>
        getMaterialTypes({signal, query: {limit: 200}}),
    )

    const {data: offers, pending: offersPending} = useFetch(
        signal => getMaterialOffers({signal, path: {eventId, providerId}}),
        {
            onResponse: ({error}) => {
                if (error) {
                    feedback.error(
                        t('common.load.error.multiple.short', {entity: t('material.offer.offers')}),
                    )
                }
            },
            preCondition: () => props.dialogIsOpen,
            deps: [props.dialogIsOpen],
        },
    )

    // Beim Anlegen darf nur eine Materialart gewählt werden, für die es noch kein Angebot gibt
    // (je Materialart nur ein Angebot). Beim Bearbeiten bleibt die eigene, schon vergebene
    // Materialart in der Liste, sonst würde das Formular sie beim Öffnen nicht mehr anzeigen.
    const takenTypeIds = new Set(
        (offers ?? [])
            .filter(offer => offer.id !== props.entity?.id)
            .map(offer => offer.materialType),
    )

    const typeOptions: AutocompleteOption[] =
        types?.data
            .filter(dto => !takenTypeIds.has(dto.id))
            .map(dto => ({id: dto.id, label: dto.name})) ?? []

    const addAction = (formData: MaterialOfferForm) =>
        addMaterialOffer({
            path: {eventId, providerId},
            body: mapFormToRequest(formData),
        })

    const editAction = (formData: MaterialOfferForm, entity: MaterialOfferDto) =>
        updateMaterialOffer({
            path: {eventId, providerId, offerId: entity.id},
            body: mapFormToRequest(formData),
        })

    // Fachliche Ablehnung (z. B. Einladung inzwischen zurückgenommen) mit eigenem Text.
    const showKnownError = (error: unknown): boolean => {
        const key = materialErrorKey(error)
        if (key) feedback.error(t(key))
        return key !== null
    }

    const formContext = useForm<MaterialOfferForm>()

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
                    label={t('material.offer.type')}
                    autocompleteProps={{getOptionKey: option => option.id}}
                    loading={typesPending || offersPending}
                    required
                />
                <FormInputText name="priceText" label={t('material.offer.priceText')} />
                <FormInputNumber
                    name="plannedCount"
                    label={t('material.offer.plannedCount')}
                    min={0}
                    integer
                    required
                />
                <FormInputNumber
                    name="changeoverMinutes"
                    label={t('material.offer.changeoverMinutes')}
                    min={0}
                    integer
                    required
                />
            </Stack>
        </EntityDialog>
    )
}

function mapFormToRequest(formData: MaterialOfferForm): MaterialOfferRequest {
    return {
        materialType: formData.materialType?.id ?? '',
        priceText: takeIfNotEmpty(formData.priceText),
        plannedCount: Number(formData.plannedCount),
        changeoverMinutes: Number(formData.changeoverMinutes),
    }
}

function mapDtoToForm(dto: MaterialOfferDto): MaterialOfferForm {
    return {
        materialType: {id: dto.materialType, label: dto.materialTypeName},
        priceText: dto.priceText ?? '',
        plannedCount: dto.plannedCount,
        changeoverMinutes: dto.changeoverMinutes,
    }
}

export default MaterialOfferDialog
