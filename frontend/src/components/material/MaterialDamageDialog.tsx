import {startNumberOf} from '@components/material/assignByStartNumber.ts'
import {useEffect, useMemo, useState} from 'react'
import {
    Avatar,
    Box,
    Button,
    Chip,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    Stack,
    Typography,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import {useTranslation} from 'react-i18next'
import {FormContainer, useForm} from 'react-hook-form-mui'
import BaseDialog from '@components/BaseDialog.tsx'
import {SubmitButton} from '@components/form/SubmitButton.tsx'
import {FormInputText} from '@components/form/input/FormInputText.tsx'
import FormInputDateTime from '@components/form/input/FormInputDateTime.tsx'
import {FormInputSelect} from '@components/form/input/FormInputSelect.tsx'
import FormInputAutocomplete from '@components/form/input/FormInputAutocomplete.tsx'
import {nowAsFormValue} from '@components/form/input/dateTimeValue.ts'
import SelectFileButton from '@components/SelectFileButton.tsx'
import {resizeImage} from '@utils/resizeImage.ts'
import {takeIfNotEmpty} from '@utils/ApiUtils.ts'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import {isRequestNetworkError, runRequest} from '@utils/request.ts'
import {materialErrorKey} from '@components/material/materialErrors.ts'
import {AutocompleteOption} from '@utils/types.ts'
import {
    addMaterialDamage,
    addMaterialDamagePhotos,
    deleteMaterialDamagePhoto,
    getMaterialDamage,
    getMaterialDamagePhoto,
    getMaterialItems,
    updateMaterialDamage,
} from '@api/sdk.gen.ts'
import {
    MaterialDamageDto,
    MaterialDamagePhotoDto,
    MaterialDamageRequest,
    MaterialDamageSeverity,
    MaterialDamageStatus,
    MaterialOverviewDto,
    MaterialOverviewRequestDto,
} from '@api/types.gen.ts'
import {effectiveAssignments} from '@components/material/effectiveAssignments.ts'
import {windowOf} from '@components/material/conflicts.ts'

type DamageForm = {
    item: AutocompleteOption
    reportedAt?: string
    description: string
    severity: MaterialDamageSeverity
    status: MaterialDamageStatus
    causedByRegistration: AutocompleteOption
    outOfServiceFrom?: string
    outOfServiceUntil?: string
    repairedAt?: string
}

const severities: MaterialDamageSeverity[] = ['MINOR', 'MAJOR', 'TOTAL', 'OUTAGE_ONLY']
const statuses: MaterialDamageStatus[] = ['REPORTED', 'REPAIRED']

export type SavedDamageInfo = {
    itemId: string
    outOfServiceFrom?: string
    outOfServiceUntil?: string
}

type Props = {
    open: boolean
    providerId: string
    /** null legt einen neuen Schaden an. */
    damage: MaterialDamageDto | null
    /** Vorbelegtes Stück beim Öffnen aus der Flotte (ohne Veranstaltungsbezug). */
    presetItem?: {id: string; label: string; number?: number}
    /** Nur im Veranstaltungskontext gesetzt - schaltet Verursacher-Vorschlag frei. */
    overview?: MaterialOverviewDto
    onClose: () => void
    /** Nach erfolgreichem Speichern (nicht bei reinen Foto-Änderungen). */
    onSaved: (info: SavedDamageInfo) => void
    /** Aktualisiert die Liste des Aufrufers - auch nach reinen Foto-Änderungen. */
    reload: () => void
}

const itemOptionLabel = (item: {label: string; number?: number}) =>
    item.number != null ? `${item.label} #${item.number}` : item.label

const causerLabel = (r: MaterialOverviewRequestDto) =>
    `#${startNumberOf(r) ?? '–'} ${r.teamName ?? '–'} · ${r.clubName} · ${r.competitionIdentifier}`

const causerOptionFromDto = (
    dto: MaterialDamageDto,
    overview?: MaterialOverviewDto,
): AutocompleteOption => {
    if (dto.causedByRegistration == null) {
        return null
    }
    const request = overview?.requests.find(
        r => r.competitionRegistration === dto.causedByRegistration,
    )
    if (request) {
        return {id: request.competitionRegistration, label: causerLabel(request)}
    }
    return {
        id: dto.causedByRegistration,
        label: [dto.causedByTeam, dto.causedByClub, dto.causedByCompetition]
            .filter(Boolean)
            .join(' · '),
    }
}

const defaultValues = (presetItem?: {id: string; label: string; number?: number}): DamageForm => ({
    item: presetItem ? {id: presetItem.id, label: itemOptionLabel(presetItem)} : null,
    reportedAt: nowAsFormValue(),
    description: '',
    severity: 'MINOR',
    status: 'REPORTED',
    causedByRegistration: null,
    outOfServiceFrom: undefined,
    outOfServiceUntil: undefined,
    repairedAt: undefined,
})

const mapDtoToForm = (dto: MaterialDamageDto, overview?: MaterialOverviewDto): DamageForm => ({
    item: {
        id: dto.materialItem,
        label: itemOptionLabel({label: dto.itemLabel, number: dto.itemNumber}),
    },
    reportedAt: dto.reportedAt.slice(0, 19),
    description: dto.description,
    severity: dto.severity,
    status: dto.status,
    causedByRegistration: causerOptionFromDto(dto, overview),
    outOfServiceFrom: dto.outOfServiceFrom?.slice(0, 19),
    outOfServiceUntil: dto.outOfServiceUntil?.slice(0, 19),
    repairedAt: dto.repairedAt?.slice(0, 19),
})

const mapFormToRequest = (formData: DamageForm): MaterialDamageRequest => ({
    materialItem: formData.item?.id ?? '',
    reportedAt: formData.reportedAt ?? '',
    description: formData.description,
    severity: formData.severity,
    status: formData.status,
    causedByRegistration: formData.causedByRegistration?.id,
    outOfServiceFrom: takeIfNotEmpty(formData.outOfServiceFrom),
    outOfServiceUntil: takeIfNotEmpty(formData.outOfServiceUntil),
    repairedAt: takeIfNotEmpty(formData.repairedAt),
})

/**
 * Ein Foto einzeln laden und als Objekt-URL anzeigen - eigene Lebensdauer je Miniatur, damit
 * revokeObjectURL beim Entfernen aus der Liste (Löschen oder Dialog schließt, MUI hängt
 * Dialog-Kinder dann aus) zuverlässig zum passenden Blob läuft.
 */
const PhotoThumbnail = ({
    providerId,
    photo,
    onDelete,
    disabled,
}: {
    providerId: string
    photo: MaterialDamagePhotoDto
    onDelete: () => void
    disabled: boolean
}) => {
    const {t} = useTranslation()
    const [url, setUrl] = useState<string | null>(null)

    useEffect(() => {
        let objectUrl: string | null = null
        let cancelled = false
        getMaterialDamagePhoto({path: {providerId, photoId: photo.id}})
            .then(({data}) => {
                if (data instanceof Blob && !cancelled) {
                    objectUrl = URL.createObjectURL(data)
                    setUrl(objectUrl)
                }
            })
            // Netzfehler: die Miniatur bleibt beim Platzhalter-Symbol.
            .catch(() => undefined)
        return () => {
            cancelled = true
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl)
            }
        }
    }, [providerId, photo.id])

    return (
        <Box sx={{position: 'relative'}}>
            <Avatar
                variant={'rounded'}
                src={url ?? undefined}
                alt={photo.name}
                sx={{width: 72, height: 72}}>
                <InsertDriveFileIcon />
            </Avatar>
            <IconButton
                size={'small'}
                aria-label={t('material.damage.deletePhoto', {name: photo.name})}
                onClick={onDelete}
                disabled={disabled}
                sx={{
                    cursor: 'pointer',
                    position: 'absolute',
                    top: -10,
                    right: -10,
                    bgcolor: 'background.paper',
                    '&:hover': {bgcolor: 'background.paper'},
                }}>
                <DeleteIcon fontSize={'small'} />
            </IconButton>
        </Box>
    )
}

/**
 * Schaden anlegen oder bearbeiten. Kein EntityDialog, weil nach dem Speichern noch zwei Dinge
 * passieren müssen, die EntityDialog nicht vorsieht: beim Anlegen erst danach die schon
 * gewählten Fotos hochladen (die Schaden-ID gibt es vorher nicht), und der Aufrufer öffnet bei
 * einem Ausfallfenster im Anschluss den Ersatz-Dialog statt einfach zu schließen.
 */
const MaterialDamageDialog = ({
    open,
    providerId,
    damage,
    presetItem,
    overview,
    onClose,
    onSaved,
    reload,
}: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [submitting, setSubmitting] = useState(false)
    const [pendingFiles, setPendingFiles] = useState<File[]>([])
    const [existingPhotos, setExistingPhotos] = useState<MaterialDamagePhotoDto[]>([])
    const [uploadingPhoto, setUploadingPhoto] = useState(false)

    const formContext = useForm<DamageForm>({defaultValues: defaultValues()})

    useEffect(() => {
        if (open) {
            formContext.reset(damage ? mapDtoToForm(damage, overview) : defaultValues(presetItem))
            setExistingPhotos(damage?.photos ?? [])
            setPendingFiles([])
        }
        // Nur beim Öffnen zurücksetzen - während der Dialog offen ist, sollen weder ein
        // Overview-Reload noch ein geänderter presetItem das Formular überschreiben.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, damage])

    const {data: items, pending: itemsPending} = useFetch(
        signal => getMaterialItems({signal, path: {providerId}, query: {limit: 500}}),
        {
            preCondition: () => open,
            deps: [open, providerId],
        },
    )
    const itemOptions: AutocompleteOption[] =
        items?.data.map(i => ({id: i.id, label: itemOptionLabel(i)})) ?? []

    const causerOptions: AutocompleteOption[] = useMemo(() => {
        if (!overview) {
            return []
        }
        const byRegistration = new Map<string, MaterialOverviewRequestDto>()
        for (const request of overview.requests) {
            if (
                request.status === 'CONFIRMED' &&
                !byRegistration.has(request.competitionRegistration)
            ) {
                byRegistration.set(request.competitionRegistration, request)
            }
        }
        return [...byRegistration.values()].map(r => ({
            id: r.competitionRegistration,
            label: causerLabel(r),
        }))
    }, [overview])

    const status = formContext.watch('status')

    const handleClose = () => {
        onClose()
    }

    const suggestCauser = (itemId: string) => {
        if (overview == null || formContext.getValues('causedByRegistration') != null) {
            return
        }
        const reportedAtValue = formContext.getValues('reportedAt')
        const time = reportedAtValue ? new Date(reportedAtValue).getTime() : NaN
        if (Number.isNaN(time)) {
            return
        }
        const effective = effectiveAssignments(overview.requests, overview.matches)
        const matchesById = new Map(overview.matches.map(m => [m.id, m]))
        for (const entry of effective) {
            if (!entry.itemIds.includes(itemId)) {
                continue
            }
            const match = matchesById.get(entry.matchId)
            const window = match ? windowOf(match) : null
            if (window != null && window.start <= time && time <= window.end) {
                const request = overview.requests.find(r => r.id === entry.requestId)
                if (request) {
                    formContext.setValue('causedByRegistration', {
                        id: request.competitionRegistration,
                        label: causerLabel(request),
                    })
                }
                return
            }
        }
    }

    const handleSeverityChange = (value: MaterialDamageSeverity) => {
        if (value === 'TOTAL' && !formContext.getValues('outOfServiceFrom')) {
            formContext.setValue(
                'outOfServiceFrom',
                formContext.getValues('reportedAt') || nowAsFormValue(),
            )
        }
    }

    const photoErrorMessage = (error: unknown) =>
        isRequestNetworkError(error)
            ? t('common.error.network')
            : typeof error === 'object' &&
                error !== null &&
                'errorCode' in error &&
                error.errorCode === 'MATERIAL_PHOTO_TOO_LARGE'
              ? t('material.damage.photoTooLarge')
              : typeof error === 'object' &&
                  error !== null &&
                  'errorCode' in error &&
                  error.errorCode === 'MATERIAL_PHOTO_INVALID_TYPE'
                ? t('material.damage.photoInvalidType')
                : t('material.damage.photoUploadError')

    const handleAddFiles = async (files: FileList) => {
        const selected = Array.from(files)
        if (damage == null) {
            setPendingFiles(prev => [...prev, ...selected])
            return
        }
        if (uploadingPhoto) return
        const {error} = await runRequest(setUploadingPhoto, async () => {
            const resized = await Promise.all(selected.map(file => resizeImage(file)))
            return addMaterialDamagePhotos({
                path: {providerId, damageId: damage.id},
                body: {files: resized},
            })
        })
        if (error) {
            feedback.error(photoErrorMessage(error))
            return
        }
        const {data: refreshed} = await runRequest(undefined, () =>
            getMaterialDamage({path: {providerId, damageId: damage.id}}),
        )
        if (refreshed) setExistingPhotos(refreshed.photos)
        reload()
    }

    const handleDeletePhoto = async (photoId: string) => {
        if (damage == null || uploadingPhoto) {
            return
        }
        const {error} = await runRequest(setUploadingPhoto, () =>
            deleteMaterialDamagePhoto({path: {providerId, photoId}}),
        )
        if (isRequestNetworkError(error)) {
            feedback.error(t('common.error.network'))
        } else if (error) {
            feedback.error(t('material.damage.photoDeleteError'))
        } else {
            setExistingPhotos(prev => prev.filter(p => p.id !== photoId))
            reload()
        }
    }

    const removePendingFile = (index: number) => {
        setPendingFiles(prev => prev.filter((_, i) => i !== index))
    }

    const onSubmit = async (formData: DamageForm) => {
        if (submitting) return
        const body = mapFormToRequest(formData)

        const saved = await runRequest(setSubmitting, async () => {
            if (damage) {
                const {error} = await updateMaterialDamage({
                    path: {providerId, damageId: damage.id},
                    body,
                })
                return error ? {error} : {data: damage.id}
            }
            return addMaterialDamage({path: {providerId}, body})
        })
        if (saved.error || saved.data === undefined) {
            feedback.error(
                isRequestNetworkError(saved.error)
                    ? t('common.error.network')
                    : t(materialErrorKey(saved.error) ?? 'material.damage.error'),
            )
            return
        }
        const damageId = saved.data

        if (!damage && pendingFiles.length > 0) {
            const {error: photoError} = await runRequest(setSubmitting, async () => {
                const resized = await Promise.all(pendingFiles.map(file => resizeImage(file)))
                return addMaterialDamagePhotos({
                    path: {providerId, damageId},
                    body: {files: resized},
                })
            })
            if (photoError) {
                // Der Schaden steht; nur die Fotos fehlen und lassen sich nachträglich ergänzen.
                feedback.error(photoErrorMessage(photoError))
            }
        }

        feedback.success(t('material.damage.success'))
        reload()
        onSaved({
            itemId: body.materialItem,
            outOfServiceFrom: body.outOfServiceFrom,
            outOfServiceUntil: body.outOfServiceUntil,
        })
        handleClose()
    }

    return (
        <BaseDialog open={open} onClose={handleClose} maxWidth={'sm'}>
            <DialogTitle>
                {t(damage ? 'material.damage.edit' : 'material.damage.report')}
            </DialogTitle>
            <FormContainer
                FormProps={{style: {display: 'contents'}}}
                formContext={formContext}
                onSuccess={data => onSubmit(data)}>
                <DialogContent dividers>
                    <Stack spacing={3}>
                        <FormInputAutocomplete
                            name={'item'}
                            options={itemOptions}
                            label={t('material.damage.item')}
                            autocompleteProps={{
                                getOptionKey: option => option.id,
                                onChange: (_, value) => {
                                    if (value) {
                                        suggestCauser(value.id)
                                    }
                                },
                            }}
                            loading={itemsPending}
                            required
                        />
                        <FormInputDateTime
                            name={'reportedAt'}
                            label={t('material.damage.reportedAt')}
                            required
                        />
                        <FormInputText
                            name={'description'}
                            label={t('material.damage.description')}
                            multiline
                            rows={3}
                            required
                        />
                        <Stack direction={{xs: 'column', sm: 'row'}} spacing={2}>
                            <FormInputSelect
                                name={'severity'}
                                label={t('material.damage.severity')}
                                options={severities.map(s => ({
                                    id: s,
                                    label: t(`material.severity.${s}`),
                                }))}
                                onChange={handleSeverityChange}
                                sx={{flex: 1}}
                                required
                            />
                            <FormInputSelect
                                name={'status'}
                                label={t('material.damage.status')}
                                options={statuses.map(s => ({
                                    id: s,
                                    label: t(`material.damageStatus.${s}`),
                                }))}
                                sx={{flex: 1}}
                                required
                            />
                        </Stack>
                        {overview && (
                            <FormInputAutocomplete
                                name={'causedByRegistration'}
                                options={causerOptions}
                                label={t('material.damage.causedBy')}
                                autocompleteProps={{getOptionKey: option => option.id}}
                            />
                        )}
                        <Typography variant={'body2'} color={'text.secondary'}>
                            {t('material.damage.outOfServiceHint')}
                        </Typography>
                        <Stack direction={{xs: 'column', sm: 'row'}} spacing={2}>
                            <FormInputDateTime
                                name={'outOfServiceFrom'}
                                label={t('material.damage.outOfServiceFrom')}
                                sx={{flex: 1}}
                            />
                            <FormInputDateTime
                                name={'outOfServiceUntil'}
                                label={t('material.damage.outOfServiceUntil')}
                                sx={{flex: 1}}
                            />
                        </Stack>
                        {status === 'REPAIRED' && (
                            <FormInputDateTime
                                name={'repairedAt'}
                                label={t('material.damage.repairedAt')}
                                required
                            />
                        )}
                        <Stack spacing={1}>
                            <Typography variant={'subtitle2'}>
                                {t('material.damage.photos')}
                            </Typography>
                            <Stack direction={'row'} spacing={1} flexWrap={'wrap'} useFlexGap>
                                {existingPhotos.map(photo => (
                                    <PhotoThumbnail
                                        key={photo.id}
                                        providerId={providerId}
                                        photo={photo}
                                        onDelete={() => void handleDeletePhoto(photo.id)}
                                        disabled={submitting}
                                    />
                                ))}
                                {pendingFiles.map((file, index) => (
                                    <Chip
                                        key={`${file.name}-${index}`}
                                        icon={<InsertDriveFileIcon />}
                                        label={file.name}
                                        onDelete={() => removePendingFile(index)}
                                    />
                                ))}
                            </Stack>
                            <SelectFileButton
                                multiple
                                accept={'image/*'}
                                size={'small'}
                                disabled={uploadingPhoto}
                                onSelected={files => void handleAddFiles(files)}>
                                {t('material.damage.addPhotos')}
                            </SelectFileButton>
                        </Stack>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleClose} disabled={submitting} sx={{cursor: 'pointer'}}>
                        {t('common.cancel')}
                    </Button>
                    <SubmitButton submitting={submitting}>{t('common.save')}</SubmitButton>
                </DialogActions>
            </FormContainer>
        </BaseDialog>
    )
}

export default MaterialDamageDialog
