import {useFormContext, useWatch} from 'react-hook-form-mui'
import {
    FormControl,
    FormControlLabel,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    Switch,
    Tooltip,
    Typography,
} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {EventRegistrationMaterialDemandDto, MaterialRequestDto} from '../../api'
import {buildChoices, choiceKind, MaterialDemandChoice} from './materialChoice.ts'
import {MaterialCapacityChip} from './MaterialCapacityChip.tsx'

/**
 * Anfragen in diesen Zuständen zählen als „besteht schon" - eine Vergabesperre
 * (`requestsClosed`) blockiert dann nicht das Beibehalten, nur eine neue Anfrage.
 */
const ACTIVE_REQUEST_STATUSES: MaterialRequestDto['status'][] = [
    'REQUESTED',
    'CONFIRMED',
    'WAITLISTED',
]

/**
 * Material-Abschnitt einer Meldung im Anmeldeformular: eine Zeile je Materialbedarf des
 * Wettkampfs, mit Auswahl zwischen eigenem Material/Boot und den Angeboten der eingeladenen
 * Anbieter. Bindet `materialOfferIds` per `useWatch`/`setValue`, weil die Auswahl je Materialart
 * (nicht je Angebot) getroffen wird und ein einfaches `CheckboxButtonGroup` das nicht abbildet.
 */
export const EventRegistrationMaterialSection = (props: {
    demands: EventRegistrationMaterialDemandDto[]
    name: string
    existingRequests?: MaterialRequestDto[]
    locked: boolean
}) => {
    const {t} = useTranslation()
    const formContext = useFormContext()

    const selected: string[] =
        useWatch({
            control: formContext.control,
            name: props.name,
        }) ?? []

    const choices = buildChoices(props.demands, selected)

    const alreadyRequested = (offerId: string) =>
        props.existingRequests?.some(
            r => r.materialOffer === offerId && ACTIVE_REQUEST_STATUSES.includes(r.status),
        ) ?? false

    const requestStatus = (offerId: string) =>
        props.existingRequests?.find(
            r => r.materialOffer === offerId && ACTIVE_REQUEST_STATUSES.includes(r.status),
        )?.status

    const setSelectedOffer = (choice: MaterialDemandChoice, offerId: string | null) => {
        const withoutThisType = selected.filter(
            id => !choice.offers.some(offer => offer.offerId === id),
        )
        formContext.setValue(props.name, offerId ? [...withoutThisType, offerId] : withoutThisType)
    }

    if (props.demands.length === 0) {
        return null
    }

    return (
        <Stack spacing={1.5}>
            {choices.map(choice => {
                const kind = choiceKind(choice)
                const ownLabel = t(
                    choice.category === 'BOAT'
                        ? 'material.registration.ownBoat'
                        : 'material.registration.ownMaterial',
                )

                return (
                    <Stack
                        key={choice.materialType}
                        direction={{xs: 'column', sm: 'row'}}
                        spacing={1}
                        alignItems={{xs: 'flex-start', sm: 'center'}}
                        flexWrap={'wrap'}>
                        <Typography sx={{minWidth: 180}}>
                            {t('material.registration.demandLabel', {
                                name: choice.typeName,
                                count: choice.count,
                            })}
                        </Typography>

                        {kind === 'noOffer' && (
                            <Typography variant="body2" color="text.secondary">
                                {ownLabel}
                            </Typography>
                        )}

                        {choice.offers.length === 1 &&
                            (() => {
                                const offer = choice.offers[0]
                                // Vergabeschluss sperrt Schalter komplett, auch für eine
                                // bestehende Anfrage - sonst könnte der Verein sie über den
                                // Schalter zurückziehen, obwohl der Anbieter danach nicht mehr
                                // eingreifen kann (Spec Abschnitt 4/7).
                                const disabled = props.locked || offer.requestsClosed
                                const status = requestStatus(offer.offerId)
                                const control = (
                                    <FormControlLabel
                                        disabled={disabled}
                                        control={<Switch />}
                                        checked={choice.selectedOfferId === offer.offerId}
                                        onChange={(_, checked) =>
                                            setSelectedOffer(choice, checked ? offer.offerId : null)
                                        }
                                        label={t('material.registration.rentFrom', {
                                            provider: offer.providerName,
                                        })}
                                    />
                                )
                                return (
                                    <Stack
                                        direction={'row'}
                                        spacing={1}
                                        alignItems={'center'}
                                        flexWrap={'wrap'}>
                                        {disabled ? (
                                            <Tooltip title={t('material.registration.closed')}>
                                                <span>{control}</span>
                                            </Tooltip>
                                        ) : (
                                            control
                                        )}
                                        <MaterialCapacityChip capacity={offer.capacity} />
                                        {offer.priceText && (
                                            <Typography variant="caption" color="text.secondary">
                                                {offer.priceText}
                                            </Typography>
                                        )}
                                        {status && (
                                            <Typography variant="caption" color="text.secondary">
                                                {t(`material.registration.status.${status}`)}
                                            </Typography>
                                        )}
                                    </Stack>
                                )
                            })()}

                        {choice.offers.length > 1 &&
                            (() => {
                                const selectedOffer = choice.offers.find(
                                    o => o.offerId === choice.selectedOfferId,
                                )
                                const selectedStatus = choice.selectedOfferId
                                    ? requestStatus(choice.selectedOfferId)
                                    : undefined
                                // Steht die gewählte Anfrage bei einem Anbieter, der die Vergabe
                                // geschlossen hat, muss die ganze Auswahl gesperrt sein - sonst
                                // könnte der Verein über "eigenes Boot" oder ein anderes Angebot
                                // die bestätigte Anfrage faktisch zurückziehen (Spec Abschnitt
                                // 4/7).
                                const closedExistingOffer = choice.offers.find(
                                    o => o.requestsClosed && alreadyRequested(o.offerId),
                                )
                                const selectDisabled = props.locked || !!closedExistingOffer
                                const select = (
                                    <FormControl size="small" sx={{minWidth: 220}}>
                                        <InputLabel
                                            id={`material-offer-${choice.materialType}`}>
                                            {choice.typeName}
                                        </InputLabel>
                                        <Select
                                            labelId={`material-offer-${choice.materialType}`}
                                            label={choice.typeName}
                                            disabled={selectDisabled}
                                            value={choice.selectedOfferId ?? ''}
                                            onChange={e =>
                                                setSelectedOffer(choice, e.target.value || null)
                                            }>
                                            <MenuItem value={''}>{ownLabel}</MenuItem>
                                            {choice.offers.map(offer => {
                                                const optionDisabled = offer.requestsClosed
                                                // Kein Tooltip auf dem MenuItem: Select sucht
                                                // seine Kinder direkt nach `value` ab, ein
                                                // umschließendes Tooltip-Element würde diese
                                                // Zuordnung zerstören.
                                                return (
                                                    <MenuItem
                                                        key={offer.offerId}
                                                        value={offer.offerId}
                                                        disabled={optionDisabled}
                                                        title={
                                                            optionDisabled
                                                                ? t(
                                                                      'material.registration.closed',
                                                                  )
                                                                : undefined
                                                        }>
                                                        {offer.priceText
                                                            ? t(
                                                                  'material.registration.offerOption',
                                                                  {
                                                                      provider:
                                                                          offer.providerName,
                                                                      price: offer.priceText,
                                                                  },
                                                              )
                                                            : offer.providerName}
                                                    </MenuItem>
                                                )
                                            })}
                                        </Select>
                                    </FormControl>
                                )
                                return (
                                    <Stack
                                        direction={'row'}
                                        spacing={1}
                                        alignItems={'center'}
                                        flexWrap={'wrap'}>
                                        {closedExistingOffer ? (
                                            <Tooltip title={t('material.registration.closed')}>
                                                <span>{select}</span>
                                            </Tooltip>
                                        ) : (
                                            select
                                        )}
                                        {selectedOffer && (
                                            <MaterialCapacityChip
                                                capacity={selectedOffer.capacity}
                                            />
                                        )}
                                        {selectedStatus && (
                                            <Typography variant="caption" color="text.secondary">
                                                {t(
                                                    `material.registration.status.${selectedStatus}`,
                                                )}
                                            </Typography>
                                        )}
                                    </Stack>
                                )
                            })()}
                    </Stack>
                )
            })}
        </Stack>
    )
}
