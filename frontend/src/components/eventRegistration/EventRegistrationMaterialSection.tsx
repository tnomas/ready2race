import {useFormContext, useWatch} from 'react-hook-form-mui'
import {
    Box,
    Chip,
    FormControl,
    FormControlLabel,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    Switch,
    Typography,
} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {EventRegistrationMaterialDemandDto, MaterialRequestDto} from '../../api'
import {
    activeRequestFor,
    buildChoices,
    choiceKind,
    declinedRequestFor,
    MaterialDemandChoice,
} from './materialChoice.ts'
import {MaterialCapacityChip} from './MaterialCapacityChip.tsx'

/**
 * Material-Abschnitt einer Meldung im Meldeformular: eine Zeile je Materialbedarf des
 * Wettkampfs, mit Auswahl zwischen eigenem Material/Boot und den Angeboten der eingeladenen
 * Anbieter. Bindet `materialOfferIds` per `useWatch`/`setValue`, weil die Auswahl je Materialart
 * (nicht je Angebot) getroffen wird.
 *
 * Alles, was man am Telefon wissen muss, steht als Text da (keine Tooltips): was die Ampel
 * bedeutet, was nach dem Absenden passiert, wie man eine Anfrage zurückzieht und warum das nach
 * Vergabeschluss nicht mehr geht.
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
    const anyOffer = choices.some(choice => choice.offers.length > 0)

    const setSelectedOffer = (choice: MaterialDemandChoice, offerId: string | null) => {
        const withoutThisType = selected.filter(
            id => !choice.offers.some(offer => offer.offerId === id),
        )
        formContext.setValue(
            props.name,
            offerId ? [...withoutThisType, offerId] : withoutThisType,
            {shouldDirty: true},
        )
    }

    if (props.demands.length === 0) {
        return null
    }

    // Festgeschriebene Meldung: keine (gesperrten) Bedienelemente ohne Inhalt, sondern lesbar, was
    // gilt. Das Template liefert für gesperrte Meldungen keine Anfragen mit – deshalb nennt die
    // Zeile die Anbieter dieser Materialart und wohin man sich wendet.
    if (props.locked) {
        return (
            <Stack spacing={0.5}>
                {choices.map(choice => (
                    <Typography key={choice.materialType} variant="body2">
                        {t('material.registration.demandLabel', {
                            name: choice.typeName,
                            count: choice.count,
                        })}
                        {choice.offers.length > 0 &&
                            ` · ${t('material.registration.lockedProviders', {
                                providers: choice.offers.map(o => o.providerName).join(', '),
                            })}`}
                    </Typography>
                ))}
                <Typography variant="caption" color="text.secondary">
                    {t('material.registration.lockedHint')}
                </Typography>
            </Stack>
        )
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
                // Die bestehende, noch aktive Anfrage dieser Materialart (höchstens eine).
                const existing = choice.offers
                    .map(offer => activeRequestFor(props.existingRequests, offer.offerId))
                    .find(r => r !== undefined)
                const existingOffer = existing
                    ? choice.offers.find(o => o.offerId === existing.materialOffer)
                    : undefined
                // Liegt die bestehende Anfrage bei einem Anbieter mit Vergabeschluss, ist die
                // ganze Zeile gesperrt – sonst ließe sie sich über „eigenes Boot" oder ein
                // anderes Angebot faktisch zurückziehen (Spec Abschnitt 7).
                const closedForExisting = existingOffer?.requestsClosed === true
                const selectedOffer = choice.offers.find(o => o.offerId === choice.selectedOfferId)
                const willWithdraw =
                    existing !== undefined && existing.materialOffer !== choice.selectedOfferId
                // Abgelehnt: als Chip mit Notiz zeigen; wer wieder einschaltet, fragt neu an.
                const declined = declinedRequestFor(
                    props.existingRequests,
                    choice.offers.map(o => o.offerId),
                )
                const declinedOffer = declined
                    ? choice.offers.find(o => o.offerId === declined.materialOffer)
                    : undefined

                return (
                    <Box key={choice.materialType}>
                        <Stack
                            direction={{xs: 'column', sm: 'row'}}
                            spacing={1}
                            alignItems={{xs: 'flex-start', sm: 'center'}}
                            flexWrap={'wrap'}
                            useFlexGap>
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
                                    // Vergabeschluss sperrt den Schalter, auch für eine
                                    // bestehende Anfrage (siehe oben).
                                    const disabled = props.locked || offer.requestsClosed
                                    return (
                                        <FormControlLabel
                                            disabled={disabled}
                                            control={<Switch />}
                                            checked={choice.selectedOfferId === offer.offerId}
                                            onChange={(_, checked) =>
                                                setSelectedOffer(
                                                    choice,
                                                    checked ? offer.offerId : null,
                                                )
                                            }
                                            label={t('material.registration.rentFrom', {
                                                provider: offer.providerName,
                                            })}
                                            sx={{cursor: disabled ? undefined : 'pointer'}}
                                        />
                                    )
                                })()}

                            {choice.offers.length > 1 && (
                                <FormControl size="small" sx={{minWidth: 220}}>
                                    <InputLabel id={`material-offer-${choice.materialType}`}>
                                        {choice.typeName}
                                    </InputLabel>
                                    <Select
                                        labelId={`material-offer-${choice.materialType}`}
                                        label={choice.typeName}
                                        disabled={props.locked || closedForExisting}
                                        value={choice.selectedOfferId ?? ''}
                                        onChange={e =>
                                            setSelectedOffer(choice, e.target.value || null)
                                        }>
                                        <MenuItem value={''}>{ownLabel}</MenuItem>
                                        {choice.offers.map(offer => (
                                            <MenuItem
                                                key={offer.offerId}
                                                value={offer.offerId}
                                                disabled={offer.requestsClosed}>
                                                {offer.requestsClosed
                                                    ? t('material.registration.offerClosed', {
                                                          provider: offer.providerName,
                                                      })
                                                    : offer.priceText
                                                      ? t('material.registration.offerOption', {
                                                            provider: offer.providerName,
                                                            price: offer.priceText,
                                                        })
                                                      : offer.providerName}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            )}

                            {selectedOffer && !selectedOffer.requestsClosed && (
                                <MaterialCapacityChip capacity={selectedOffer.capacity} />
                            )}
                            {choice.offers.length === 1 &&
                                !selectedOffer &&
                                !choice.offers[0].requestsClosed && (
                                    <MaterialCapacityChip capacity={choice.offers[0].capacity} />
                                )}
                            {choice.offers.length === 1 && choice.offers[0].priceText && (
                                <Typography variant="caption" color="text.secondary">
                                    {choice.offers[0].priceText}
                                </Typography>
                            )}
                            {existing && !willWithdraw && (
                                <Chip
                                    size={'small'}
                                    variant={
                                        existing.status === 'CONFIRMED' ? 'filled' : 'outlined'
                                    }
                                    color={existing.status === 'CONFIRMED' ? 'success' : 'default'}
                                    label={t(`material.registration.status.${existing.status}`)}
                                />
                            )}
                            {declined && (
                                <Chip
                                    size={'small'}
                                    variant={'outlined'}
                                    label={t('material.registration.declinedBy', {
                                        provider: declined.providerName,
                                    })}
                                />
                            )}
                        </Stack>
                        {declined?.decisionNote && (
                            <Typography variant="caption" color="text.secondary" component="p">
                                {t('material.registration.decisionNote', {
                                    note: declined.decisionNote,
                                })}
                            </Typography>
                        )}
                        {declined && choice.selectedOfferId !== null && (
                            <Typography variant="caption" color="text.secondary" component="p">
                                {t('material.registration.requestAgain', {
                                    provider:
                                        selectedOffer?.providerName ??
                                        declinedOffer?.providerName ??
                                        declined.providerName,
                                })}
                            </Typography>
                        )}
                        {existing?.decisionNote && !willWithdraw && (
                            <Typography variant="caption" color="text.secondary" component="p">
                                {t('material.registration.decisionNote', {
                                    note: existing.decisionNote,
                                })}
                            </Typography>
                        )}
                        {willWithdraw && existingOffer && (
                            <Typography variant="caption" color="text.secondary" component="p">
                                {t('material.registration.willWithdraw', {
                                    provider: existingOffer.providerName,
                                })}
                            </Typography>
                        )}
                        {!props.locked && closedForExisting && (
                            <Typography variant="caption" color="text.secondary" component="p">
                                {t('material.registration.closedExisting')}
                            </Typography>
                        )}
                        {!props.locked &&
                            !closedForExisting &&
                            choice.offers.length > 0 &&
                            choice.offers.every(o => o.requestsClosed) && (
                                <Typography variant="caption" color="text.secondary" component="p">
                                    {t('material.registration.closed')}
                                </Typography>
                            )}
                        {!props.locked && existing && !closedForExisting && !willWithdraw && (
                            <Typography variant="caption" color="text.secondary" component="p">
                                {t(
                                    choice.offers.length > 1
                                        ? 'material.registration.withdrawHowSelect'
                                        : 'material.registration.withdrawHowSwitch',
                                )}
                            </Typography>
                        )}
                    </Box>
                )
            })}
            {anyOffer && !props.locked && (
                <Typography variant="caption" color="text.secondary">
                    {t('material.registration.legend')}
                </Typography>
            )}
        </Stack>
    )
}
