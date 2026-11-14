import {useEffect, useMemo, useRef, useState} from 'react'
import {TFunction} from 'i18next'
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
import {
    causerCandidates,
    outageUntilFollowsRepair,
    outageUntilShownForRepair,
    suggestCauser,
} from '@components/material/damageLogic.ts'
import {
    PhotoRejection,
    preparePhotos,
    uploadPhotosOneByOne,
} from '@components/material/damagePhotos.ts'
import {teamNumberOf} from '@components/material/materialNumbers.ts'

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
    status: MaterialDamageStatus
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

/** Verein, Team, Wettkampf und – wenn fixiert – die Meldungsnummer, ausdrücklich benannt. */
const causerLabel = (t: TFunction, r: MaterialOverviewRequestDto) => {
    const number = teamNumberOf(r)
    return [
        r.clubName,
        r.teamName,
        r.competitionIdentifier,
        number != null ? t('material.number.team', {number}) : null,
    ]
        .filter(Boolean)
        .join(' · ')
}

const causerOptionFromDto = (
    t: TFunction,
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
        return {id: request.competitionRegistration, label: causerLabel(t, request)}
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

const mapDtoToForm = (
    t: TFunction,
    dto: MaterialDamageDto,
    overview?: MaterialOverviewDto,
): DamageForm => ({
    item: {
        id: dto.materialItem,
        label: itemOptionLabel({label: dto.itemLabel, number: dto.itemNumber}),
    },
    reportedAt: dto.reportedAt.slice(0, 19),
    description: dto.description,
    severity: dto.severity,
    status: dto.status,
    causedByRegistration: causerOptionFromDto(t, dto, overview),
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
    /** Fortschritt beim Verkleinern („3 von 15"), damit am Telefon sichtbar ist, dass es läuft. */
    const [photoProgress, setPhotoProgress] = useState<{done: number; total: number} | null>(null)

    const formContext = useForm<DamageForm>({defaultValues: defaultValues()})
    // „Ausfall bis“ folgt „Repariert am“, bis jemand es selbst ändert (H2-F5).
    const untilFollowsRepair = useRef(true)

    useEffect(() => {
        if (open) {
            const values = damage ? mapDtoToForm(t, damage, overview) : defaultValues(presetItem)
            formContext.reset(values)
            untilFollowsRepair.current = outageUntilFollowsRepair(
                values.outOfServiceUntil,
                values.repairedAt,
            )
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

    const causerOptions: AutocompleteOption[] = useMemo(
        () =>
            causerCandidates(overview?.requests ?? []).map(r => ({
                id: r.competitionRegistration,
                label: causerLabel(t, r),
            })),
        [overview, t],
    )

    const status = formContext.watch('status')

    useEffect(() => {
        const subscription = formContext.watch((values, {name, type}) => {
            if (name === 'outOfServiceUntil' && type === 'change') {
                untilFollowsRepair.current = outageUntilFollowsRepair(
                    values.outOfServiceUntil,
                    values.repairedAt,
                )
            } else if (name === 'repairedAt' || name === 'status') {
                // Gleich anzeigen, was der Server beim Speichern setzt - nicht erst danach.
                const shown = outageUntilShownForRepair(
                    values.status ?? 'REPORTED',
                    values.repairedAt,
                    untilFollowsRepair.current,
                )
                if (shown && shown !== values.outOfServiceUntil) {
                    formContext.setValue('outOfServiceUntil', shown)
                }
            }
        })
        return () => subscription.unsubscribe()
    }, [formContext])

    const handleClose = () => {
        onClose()
    }

    const proposeCauser = (itemId: string) => {
        if (overview == null || formContext.getValues('causedByRegistration') != null) {
            return
        }
        const reportedAtValue = formContext.getValues('reportedAt')
        const time = reportedAtValue ? new Date(reportedAtValue).getTime() : NaN
        const request = suggestCauser(overview, itemId, time)
        if (request) {
            formContext.setValue('causedByRegistration', {
                id: request.competitionRegistration,
                label: causerLabel(t, request),
            })
        }
    }

    /** Verkleinert nacheinander und meldet aussortierte Fotos mit Namen und Grund. */
    const prepare = async (files: readonly File[]): Promise<File[]> => {
        setPhotoProgress({done: 0, total: files.length})
        try {
            const {accepted, rejected} = await preparePhotos(files, resizeImage, (done, total) =>
                setPhotoProgress({done, total}),
            )
            if (rejected.length > 0) {
                feedback.error(t('material.damage.photosRejected', {list: rejectionList(rejected)}))
            }
            return accepted
        } finally {
            setPhotoProgress(null)
        }
    }

    const rejectionList = (rejected: PhotoRejection[]) =>
        rejected.map(r => `${r.name} (${t(`material.damage.photoReject.${r.reason}`)})`).join(', ')

    const handleSeverityChange = (value: MaterialDamageSeverity) => {
        if (value === 'TOTAL' && !formContext.getValues('outOfServiceFrom')) {
            formContext.setValue(
                'outOfServiceFrom',
                formContext.getValues('reportedAt') || nowAsFormValue(),
            )
        }
    }

    /**
     * Lädt die Fotos einzeln hoch (H2-F3): gültige werden gespeichert, abgelehnte nennt die
     * Meldung mit Namen und Grund.
     */
    const uploadPhotos = async (damageId: string, files: File[]) => {
        const rejected = await uploadPhotosOneByOne(files, file =>
            addMaterialDamagePhotos({path: {providerId, damageId}, body: {files: [file]}}),
        )
        if (rejected.length > 0) {
            feedback.error(t('material.damage.photosRejected', {list: rejectionList(rejected)}))
        }
    }

    const handleAddFiles = async (files: FileList) => {
        const selected = Array.from(files)
        if (damage == null) {
            setPendingFiles(prev => [...prev, ...selected])
            return
        }
        if (uploadingPhoto) return
        await runRequest(setUploadingPhoto, async () => {
            const resized = await prepare(selected)
            if (resized.length > 0) await uploadPhotos(damage.id, resized)
            return {data: undefined}
        })
        // Auch nach Teil-Ablehnungen neu laden: die gültigen Fotos stehen schon.
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
            // Der Schaden steht; abgelehnte Fotos nennt die Meldung, sie lassen sich nachträglich
            // ergänzen.
            await runRequest(setSubmitting, async () => {
                const resized = await prepare(pendingFiles)
                if (resized.length > 0) await uploadPhotos(damageId, resized)
                return {data: undefined}
            })
        }

        feedback.success(t('material.damage.success'))
        reload()
        onSaved({
            itemId: body.materialItem,
            status: body.status,
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
                                        proposeCauser(value.id)
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
                            {photoProgress && (
                                <Typography
                                    variant={'body2'}
                                    color={'text.secondary'}
                                    role={'status'}>
                                    {t('material.damage.photoProgress', photoProgress)}
                                </Typography>
                            )}
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
