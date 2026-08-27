import {useEffect, useState} from 'react'
import {
    Button,
    Card,
    CardContent,
    DialogActions,
    DialogContent,
    DialogTitle,
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
    withAllGraphicTypes,
} from './streamGraphicCatalog'
import {extractErrorReason} from './streamApiError'

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
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (!open) return
        setRows(withAllGraphicTypes(scene.graphics))
    }, [open, scene])

    // Nur für COURSE_IMAGE gebraucht, aber unbedingt geladen (statt erst beim Aufklappen), damit
    // die Auswahl sofort einen Namen statt der bloßen ID zeigt.
    const {data: documents} = useFetch(
        signal => getDocuments({signal, path: {eventId}, query: {limit: 500}}),
        {preCondition: () => open, deps: [open, eventId]},
    )

    const updateRow = (type: StreamSceneGraphicDto['type'], patch: Partial<StreamSceneGraphicDto>) => {
        setRows(prev => prev.map(row => (row.type === type ? {...row, ...patch} : row)))
    }

    const handleSubmit = async () => {
        setSaving(true)
        try {
            const {data, error} = await updateStreamSceneGraphics({
                path: {eventId, sceneId: scene.id},
                body: {graphics: rows},
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

                                    {usesDisplaySeconds(row.type) && (
                                        <TextField
                                            type="number"
                                            size="small"
                                            label={t('event.stream.scenes.graphicDialog.displaySeconds')}
                                            value={row.settings.displaySeconds ?? ''}
                                            onChange={e => {
                                                const value = Number(e.target.value)
                                                updateRow(row.type, {
                                                    settings: {
                                                        ...row.settings,
                                                        displaySeconds: Number.isFinite(value)
                                                            ? Math.max(1, Math.round(value))
                                                            : row.settings.displaySeconds,
                                                    },
                                                })
                                            }}
                                            slotProps={{htmlInput: {min: 1}}}
                                            sx={{width: 160}}
                                        />
                                    )}

                                    {usesListLength(row.type) && (
                                        <TextField
                                            type="number"
                                            size="small"
                                            label={t('event.stream.scenes.graphicDialog.listLength')}
                                            value={row.settings.listLength ?? ''}
                                            onChange={e => {
                                                const value = Number(e.target.value)
                                                updateRow(row.type, {
                                                    settings: {
                                                        ...row.settings,
                                                        listLength: Number.isFinite(value)
                                                            ? Math.max(1, Math.round(value))
                                                            : row.settings.listLength,
                                                    },
                                                })
                                            }}
                                            slotProps={{htmlInput: {min: 1}}}
                                            sx={{width: 140}}
                                        />
                                    )}

                                    {usesImageDocument(row.type) && (
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
                                            {documents?.data.map(document => (
                                                <MenuItem key={document.id} value={document.id}>
                                                    {document.name}
                                                </MenuItem>
                                            ))}
                                        </TextField>
                                    )}
                                </Stack>
                                {usesImageDocument(row.type) && (
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
