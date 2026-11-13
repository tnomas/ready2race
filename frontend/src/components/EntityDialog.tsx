import {BaseSyntheticEvent, PropsWithChildren, useEffect, useRef, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {FieldValues, FormContainer, UseFormReturn} from 'react-hook-form-mui'
import {Alert, Button, DialogActions, DialogContent, DialogProps, DialogTitle} from '@mui/material'
import {RequestResult} from '@hey-api/client-fetch'
import {BaseEntityDialogProps} from '@utils/types.ts'
import {useFeedback} from '@utils/hooks.ts'
import {SubmitButton} from './form/SubmitButton.tsx'
import {GridValidRowModel} from '@mui/x-data-grid'
import {ApiError} from '@api/types.gen.ts'
import BaseDialog from '@components/BaseDialog.tsx'
import {useOptionalConfirmation} from '@contexts/confirmation/ConfirmationContext.ts'
import {isRequestNetworkError, runRequest} from '@utils/request.ts'
import {DialogRefreshMode, shouldConfirmDiscard, shouldRunOnOpen} from '@utils/entityDialog.ts'

type EntityDialogProps<
    Entity extends GridValidRowModel,
    Form extends FieldValues,
    AddError extends ApiError,
    UpdateError extends ApiError,
> = BaseEntityDialogProps<Entity> &
    ExtendedEntityDialogProps<Entity, Form, AddError, UpdateError> &
    Partial<DialogProps>

type ExtendedEntityDialogProps<
    Entity extends GridValidRowModel,
    Form extends FieldValues,
    AddError extends ApiError,
    UpdateError extends ApiError,
> = {
    formContext: UseFormReturn<Form>
    onOpen: () => void
    addAction?: (formData: Form) => RequestResult<unknown, AddError, false>
    editAction?: (formData: Form, entity: Entity) => RequestResult<void, UpdateError, false>
    onAddError?: (error: AddError) => boolean
    onEditError?: (error: UpdateError) => boolean
    title?: string
    showSaveAndNew?: boolean
    disableSave?: boolean
    /**
     * Schließen (X, Escape, Abbrechen) mit ungespeicherten Änderungen fragt nach („Änderungen
     * verwerfen?"). Standard `true`; `false` für Dialoge, deren Formular sich schon beim Öffnen
     * selbst als geändert meldet oder die nichts Wertvolles enthalten.
     */
    confirmDiscard?: boolean
    /**
     * Ob eine neue `onOpen`-Identität bei offenem Dialog das Formular erneut befüllt. Standard
     * `'pristine'`: nur solange nichts geändert wurde (nachgeladene Daten kommen an, ein
     * Hintergrund-Abgleich wirft aber keine Eingaben weg). `'always'` ist das frühere Verhalten.
     */
    refreshWhileOpen?: DialogRefreshMode
}

//todo: add semantic tabs
const EntityDialog = <
    Entity extends GridValidRowModel,
    Form extends FieldValues,
    AddError extends ApiError,
    UpdateError extends ApiError,
>({
    entityName,
    dialogIsOpen,
    closeDialog,
    reloadData,
    entity,
    formContext,
    onOpen,
    addAction,
    editAction,
    onAddError,
    onEditError,
    children,
    title,
    showSaveAndNew,
    disableSave,
    confirmDiscard = true,
    refreshWhileOpen = 'pristine',
    ...props
}: PropsWithChildren<EntityDialogProps<Entity, Form, AddError, UpdateError>>) => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    // Ohne Provider (Tests, eingebettete Ansichten) schließt der Dialog wie bisher ohne Rückfrage.
    const confirmation = useOptionalConfirmation()

    const [submitting, setSubmitting] = useState(false)
    // Sperre gegen doppeltes Absenden, bevor der nächste Render den Knopf deaktiviert hat.
    const submittingRef = useRef(false)
    const [submitError, setSubmitError] = useState<string | null>(null)

    // Im Render gelesen, damit react-hook-form `isDirty` abonniert und aktuell hält.
    const isDirty = formContext.formState.isDirty

    const requestClose = () => {
        if (
            confirmation !== null &&
            shouldConfirmDiscard({enabled: confirmDiscard, dirty: isDirty, submitting})
        ) {
            confirmation.confirmAction(closeDialog, {
                title: t('entity.discard.title'),
                content: t('entity.discard.content'),
                okText: t('entity.discard.ok'),
                cancelText: t('entity.discard.keep'),
                destructive: true,
            })
        } else {
            closeDialog()
        }
    }

    const handleErrorGeneric = () => {
        const message = entity
            ? t('entity.edit.error', {entity: entityName})
            : t('entity.add.error', {entity: entityName})
        feedback.error(message)
        setSubmitError(message)
    }

    const onSubmit = async (formData: Form, event: BaseSyntheticEvent | undefined) => {
        if (submittingRef.current) return
        const addNew =
            showSaveAndNew &&
            entity == null &&
            (event?.nativeEvent as SubmitEvent)?.submitter?.id === 'saveAndNew'

        if (entity) {
            if (!editAction) throw Error('Missing edit action')
        } else {
            if (!addAction) throw Error('Missing add action')
        }
        setSubmitError(null)
        submittingRef.current = true
        let result
        try {
            result = await runRequest<unknown, AddError | UpdateError>(setSubmitting, async () =>
                entity !== undefined
                    ? ((await editAction?.(formData, entity)) ?? {})
                    : ((await addAction?.(formData)) ?? {}),
            )
        } finally {
            submittingRef.current = false
        }
        const error = result.error

        if (isRequestNetworkError(error)) {
            const message = t('common.error.network')
            feedback.error(message)
            setSubmitError(message)
        } else if (error !== undefined && entity === undefined) {
            if (!(onAddError && onAddError(error as AddError))) handleErrorGeneric()
        } else if (error !== undefined) {
            if (!(onEditError && onEditError(error as UpdateError))) handleErrorGeneric()
        } else {
            if (addNew) {
                onOpen()
            } else {
                closeDialog()
            }
            reloadData()
            if (entity) {
                feedback.success(t('entity.edit.success', {entity: entityName}))
            } else {
                feedback.success(t('entity.add.success', {entity: entityName}))
            }
        }
    }

    // `onOpen` setzt das Formular zurück. Früher lief es bei JEDER neuen Identität von `onOpen`,
    // solange der Dialog offen war: Ein Aufrufer, dessen `onOpen` an nachgeladenen Daten hängt
    // (Zeitplan: alle 30 s), warf damit laufende Eingaben weg. Jetzt: beim Öffnen und bei neuem
    // Datensatz immer, sonst nur nach `refreshWhileOpen` (Standard: solange nichts geändert ist).
    const wasOpen = useRef(false)
    const lastOnOpen = useRef(onOpen)
    const lastEntity = useRef(entity)
    useEffect(() => {
        const run = shouldRunOnOpen(
            {
                open: dialogIsOpen,
                wasOpen: wasOpen.current,
                onOpenChanged: lastOnOpen.current !== onOpen,
                entityChanged: lastEntity.current !== entity,
                dirty: isDirty,
            },
            refreshWhileOpen,
        )
        if (dialogIsOpen && !wasOpen.current) {
            setSubmitError(null)
        }
        wasOpen.current = dialogIsOpen
        lastOnOpen.current = onOpen
        lastEntity.current = entity
        if (run) {
            onOpen()
        }
        // isDirty bewusst nicht in den Abhängigkeiten: Es entscheidet nur, ob eine neue
        // onOpen-Identität übernommen wird, und soll selbst nichts auslösen.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dialogIsOpen, onOpen, entity, refreshWhileOpen])

    // Die Fehlermeldung im Dialog verschwindet mit der nächsten Eingabe.
    useEffect(() => {
        if (submitError === null) return
        const subscription = formContext.watch(() => setSubmitError(null))
        return () => subscription.unsubscribe()
    }, [submitError, formContext])

    return (
        <BaseDialog
            {...props}
            open={dialogIsOpen}
            onClose={requestClose}
            maxWidth={props.maxWidth ?? 'sm'}>
            <DialogTitle>
                {title ?? t(`entity.${entity ? 'edit' : 'add'}.action`, {entity: entityName})}
            </DialogTitle>
            <FormContainer
                FormProps={{style: {display: 'contents'}}}
                formContext={formContext}
                onSuccess={(data, event) => onSubmit(data, event)}>
                <DialogContent dividers={true}>
                    {submitError && (
                        <Alert severity={'error'} sx={{mb: 2}} role={'alert'}>
                            {submitError}
                        </Alert>
                    )}
                    {children}
                </DialogContent>
                <DialogActions>
                    <Button onClick={requestClose} disabled={submitting} sx={{cursor: 'pointer'}}>
                        {t('common.cancel')}
                    </Button>
                    {showSaveAndNew && entity == null && (
                        <SubmitButton
                            id={'saveAndNew'}
                            variant={'outlined'}
                            submitting={submitting}>
                            {t('common.saveAndNew')}
                        </SubmitButton>
                    )}
                    <SubmitButton disabled={disableSave} submitting={submitting}>
                        {t('common.save')}
                    </SubmitButton>
                </DialogActions>
            </FormContainer>
        </BaseDialog>
    )
}

export default EntityDialog
