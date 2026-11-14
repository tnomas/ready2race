import {useEffect, useState} from 'react'
import {
    Button,
    Card,
    CardContent,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    MenuItem,
    Stack,
    Switch,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material'
import {useTranslation} from 'react-i18next'
import BaseDialog from '@components/BaseDialog'
import {useFeedback, useFetch} from '@utils/hooks'
import {getDocuments, updateStreamSceneGraphics} from '@api/sdk.gen'
import {StreamGraphicSize, StreamPlacement, StreamSceneDto, StreamSceneGraphicDto} from '@api/types.gen'
import {
    ALLOWED_PLACEMENTS,
    usesDisplaySeconds,
    usesImageDocument,
    usesListLength,
    usesMaterialToggle,
    withAllGraphicTypes,
} from './streamGraphicCatalog'
import {extractErrorReason} from './streamApiError'
import {classifyCourseImageDocuments} from './courseImageDocuments'
import {parseBoundedInt} from './boundedInt'

/** Grenzen der Zahlenfelder — dieselben, die der Server an `StreamGraphicSettings` prüft. */
type NumberField = 'displaySeconds' | 'listLength'
const NUMBER_BOUNDS: Record<NumberField, {min: number; max: number}> = {
    displaySeconds: {min: 1, max: 600},
    listLength: {min: 1, max: 50},
}

/** Rohtext der Zahlenfelder je Grafik-Typ — siehe `parseBoundedInt`, warum Text statt Zahl. */
type NumberDrafts = Partial<Record<StreamSceneGraphicDto['type'], Partial<Record<NumberField, string>>>>

const draftsFrom = (rows: StreamSceneGraphicDto[]): NumberDrafts =>
    Object.fromEntries(
        rows.map(row => [
            row.type,
            {
                displaySeconds: row.settings.displaySeconds == null ? '' : String(row.settings.displaySeconds),
                listLength: row.settings.listLength == null ? '' : String(row.settings.listLength),
            },
        ]),
    )

export type StreamGraphicConfigDialogProps = {
    open: boolean
    onClose: () => void
    eventId: string
    scene: StreamSceneDto
    onSaved: (scene: StreamSceneDto) => void
}

/**
 * Die Grafik-Konfiguration einer Szene: alle acht Typen, jeweils Aktiv/Platz/Größe und die
 * typspezifischen Einstellungen. Speichern schickt IMMER die vollständige Liste an
 * `updateStreamSceneGraphics` — der Endpunkt akzeptiert zwar auch Teilmengen, aber ein Formular,
 * das alle acht Zeilen zeigt, soll auch alle acht in einem Aufruf festschreiben.
 */
const StreamGraphicConfigDialog = ({open, onClose, eventId, scene, onSaved}: StreamGraphicConfigDialogProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [rows, setRows] = useState<StreamSceneGraphicDto[]>([])
    const [drafts, setDrafts] = useState<NumberDrafts>({})
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (!open) return
        const initial = withAllGraphicTypes(scene.graphics)
        setRows(initial)
        setDrafts(draftsFrom(initial))
    }, [open, scene])

    // Nur für COURSE_IMAGE gebraucht, aber unbedingt geladen (statt erst beim Aufklappen), damit
    // die Auswahl sofort einen Namen statt der bloßen ID zeigt.
    //
    // `getDocuments` verlangt READ EVENT - eine reine Stream-Rolle (nur READ/UPDATE STREAM) hat
    // das nicht und bekommt 403. `classifyCourseImageDocuments` unterscheidet das ausdrücklich von
    // einer leeren Dokumentenliste, damit die Auswahl nie stillschweigend leer bleibt.
    const {data: documents, error: documentsError} = useFetch(
        signal => getDocuments({signal, path: {eventId}, query: {limit: 500}}),
        {preCondition: () => open, deps: [open, eventId]},
    )
    const documentsState = classifyCourseImageDocuments(documentsError, documents)

    const updateRow = (type: StreamSceneGraphicDto['type'], patch: Partial<StreamSceneGraphicDto>) => {
        setRows(prev => prev.map(row => (row.type === type ? {...row, ...patch} : row)))
    }

    const draftOf = (type: StreamSceneGraphicDto['type'], field: NumberField): string => drafts[type]?.[field] ?? ''
    const parsedDraft = (type: StreamSceneGraphicDto['type'], field: NumberField): number | null =>
        parseBoundedInt(draftOf(type, field), NUMBER_BOUNDS[field].min, NUMBER_BOUNDS[field].max)
    const usesField = (type: StreamSceneGraphicDto['type'], field: NumberField): boolean =>
        field === 'displaySeconds' ? usesDisplaySeconds(type) : usesListLength(type)

    const setDraft = (type: StreamSceneGraphicDto['type'], field: NumberField, raw: string) =>
        setDrafts(prev => ({...prev, [type]: {...prev[type], [field]: raw}}))

    /** Beim Verlassen des Felds: geklemmt/gerundet zurück ins Feld und in die Zeile — leer bleibt leer (ungültig). */
    const commitDraft = (type: StreamSceneGraphicDto['type'], field: NumberField) => {
        const parsed = parsedDraft(type, field)
        if (parsed === null) return
        setDraft(type, field, String(parsed))
        const row = rows.find(r => r.type === type)
        if (row) updateRow(type, {settings: {...row.settings, [field]: parsed}})
    }

    /**
     * Die Zeilen mit den gelesenen Zahlenfeldern — oder null, wenn ein benutztes Feld leer oder
     * unlesbar ist. Gelesen wird aus dem Rohtext, damit auch ein nie verlassenes Feld zählt.
     */
    const rowsForSubmit = (): StreamSceneGraphicDto[] | null => {
        const result: StreamSceneGraphicDto[] = []
        for (const row of rows) {
            const settings = {...row.settings}
            for (const field of Object.keys(NUMBER_BOUNDS) as NumberField[]) {
                if (!usesField(row.type, field)) continue
                const parsed = parsedDraft(row.type, field)
                if (parsed === null) return null
                settings[field] = parsed
            }
            result.push({...row, settings})
        }
        return result
    }

    const [submitAttempted, setSubmitAttempted] = useState(false)
    const fieldInvalid = (type: StreamSceneGraphicDto['type'], field: NumberField): boolean =>
        parsedDraft(type, field) === null

    const handleSubmit = async () => {
        setSubmitAttempted(true)
        const graphics = rowsForSubmit()
        if (graphics === null) return
        setSaving(true)
        try {
            const {data, error} = await updateStreamSceneGraphics({
                path: {eventId, sceneId: scene.id},
                body: {graphics},
            })
            if (error || !data) {
                feedback.error(extractErrorReason(error) ?? t('common.error.unexpected'))
                return
            }
            feedback.success(t('event.stream.scenes.graphicDialog.saved'))
            onSaved(data)
            onClose()
        } finally {
            setSaving(false)
        }
    }

    return (
        <BaseDialog open={open} onClose={onClose} maxWidth="md">
            <DialogTitle>{t('event.stream.scenes.graphicDialog.title', {name: scene.name})}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{mt: 1}}>
                    {rows.map(row => (
                        <Card key={row.type} variant="outlined">
                            <CardContent>
                                <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap">
                                    <Switch
                                        checked={row.enabled}
                                        onChange={e => updateRow(row.type, {enabled: e.target.checked})}
                                    />
                                    <Typography variant="subtitle1" sx={{minWidth: 150}}>
                                        {t(`event.stream.scenes.type.${row.type}`)}
                                    </Typography>
                                    <TextField
                                        select
                                        size="small"
                                        label={t('event.stream.scenes.graphicDialog.placement')}
                                        value={row.placement}
                                        onChange={e =>
                                            updateRow(row.type, {placement: e.target.value as StreamPlacement})
                                        }
                                        sx={{minWidth: 180}}>
                                        {/* Nur die für diesen Typ erlaubten Plätze - der Server lehnt jeden
                                            anderen ohnehin ab (allowedPlacements, StreamEnums.kt). */}
                                        {ALLOWED_PLACEMENTS[row.type].map(placement => (
                                            <MenuItem key={placement} value={placement}>
                                                {t(`event.stream.scenes.placement.${placement}`)}
                                            </MenuItem>
                                        ))}
                                    </TextField>
                                    <ToggleButtonGroup
                                        exclusive
                                        size="small"
                                        value={row.size}
                                        onChange={(_, value) =>
                                            value && updateRow(row.type, {size: value as StreamGraphicSize})
                                        }>
                                        <ToggleButton value="COMPACT">
                                            {t('event.stream.scenes.graphicDialog.size.COMPACT')}
                                        </ToggleButton>
                                        <ToggleButton value="NORMAL">
                                            {t('event.stream.scenes.graphicDialog.size.NORMAL')}
                                        </ToggleButton>
                                    </ToggleButtonGroup>

                                    {(['displaySeconds', 'listLength'] as const)
                                        .filter(field => usesField(row.type, field))
                                        .map(field => {
                                            const invalid = fieldInvalid(row.type, field)
                                            return (
                                                <TextField
                                                    key={field}
                                                    type="number"
                                                    size="small"
                                                    label={
                                                        field === 'displaySeconds'
                                                            ? t('event.stream.scenes.graphicDialog.displaySeconds')
                                                            : t('event.stream.scenes.graphicDialog.listLength')
                                                    }
                                                    value={draftOf(row.type, field)}
                                                    onChange={e => setDraft(row.type, field, e.target.value)}
                                                    onBlur={() => commitDraft(row.type, field)}
                                                    error={invalid}
                                                    helperText={
                                                        invalid && submitAttempted
                                                            ? t('event.stream.scenes.graphicDialog.numberRange', NUMBER_BOUNDS[field])
                                                            : undefined
                                                    }
                                                    slotProps={{htmlInput: NUMBER_BOUNDS[field]}}
                                                    sx={{width: field === 'displaySeconds' ? 160 : 140}}
                                                />
                                            )
                                        })}

                                    {/* Aktiv-Schalter bleibt in JEDEM Zustand nutzbar - fehlt die Bildwahl (403)
                                        oder ist noch nichts hochgeladen, bleibt imageDocument einfach unbelegt;
                                        die Grafik zeigt dann serverseitig nichts an (siehe StreamGraphic.tsx),
                                        statt das Speichern zu blockieren. */}
                                    {usesMaterialToggle(row.type) && (
                                        <FormControlLabel
                                            control={
                                                <Switch
                                                    size="small"
                                                    checked={row.settings.showMaterial === true}
                                                    onChange={e =>
                                                        updateRow(row.type, {
                                                            settings: {
                                                                ...row.settings,
                                                                showMaterial: e.target.checked,
                                                            },
                                                        })
                                                    }
                                                />
                                            }
                                            label={t('event.stream.scenes.graphicDialog.showMaterial')}
                                        />
                                    )}

                                    {usesImageDocument(row.type) && documentsState.kind === 'loaded' && (
                                        <TextField
                                            select
                                            size="small"
                                            label={t('event.stream.scenes.graphicDialog.image')}
                                            value={row.settings.imageDocument ?? ''}
                                            onChange={e =>
                                                updateRow(row.type, {
                                                    settings: {
                                                        ...row.settings,
                                                        imageDocument: e.target.value === '' ? null : e.target.value,
                                                    },
                                                })
                                            }
                                            sx={{minWidth: 220}}>
                                            <MenuItem value="">
                                                {t('event.stream.scenes.graphicDialog.imageNone')}
                                            </MenuItem>
                                            {documentsState.documents.map(document => (
                                                <MenuItem key={document.id} value={document.id}>
                                                    {document.name}
                                                </MenuItem>
                                            ))}
                                        </TextField>
                                    )}
                                    {/* Kein stillschweigend leeres Dropdown: fehlendes Recht, Ladefehler und eine
                                        (noch) leere Dokumentenliste sind drei sichtbar unterschiedene Hinweise
                                        statt einer Auswahl ohne Einträge. */}
                                    {usesImageDocument(row.type) && documentsState.kind === 'forbidden' && (
                                        <Typography variant="body2" color="warning.main" sx={{minWidth: 220}}>
                                            {t('event.stream.scenes.graphicDialog.imageForbidden')}
                                        </Typography>
                                    )}
                                    {usesImageDocument(row.type) && documentsState.kind === 'empty' && (
                                        <Typography variant="body2" color="text.secondary" sx={{minWidth: 220}}>
                                            {t('event.stream.scenes.graphicDialog.imageEmpty')}
                                        </Typography>
                                    )}
                                    {usesImageDocument(row.type) && documentsState.kind === 'error' && (
                                        <Typography variant="body2" color="error.main" sx={{minWidth: 220}}>
                                            {t('event.stream.scenes.graphicDialog.imageLoadError')}
                                        </Typography>
                                    )}
                                </Stack>
                                {usesImageDocument(row.type) && documentsState.kind === 'loaded' && (
                                    <Typography variant="caption" color="text.secondary" component="div" sx={{mt: 1}}>
                                        {t('event.stream.scenes.graphicDialog.imageHint')}
                                    </Typography>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{t('common.cancel')}</Button>
                <Button variant="contained" disabled={saving} onClick={() => void handleSubmit()}>
                    {t('common.save')}
                </Button>
            </DialogActions>
        </BaseDialog>
    )
}

export default StreamGraphicConfigDialog
