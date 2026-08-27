import {useEffect, useState} from 'react'
import {Button, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField} from '@mui/material'
import {useTranslation} from 'react-i18next'
import BaseDialog from '@components/BaseDialog'
import {useFeedback} from '@utils/hooks'
import {createStreamScene, updateStreamScene} from '@api/sdk.gen'
import {StreamBackground, StreamSceneDto} from '@api/types.gen'
import {hasStreamSceneFormErrors, validateStreamSceneForm} from './streamSceneValidation'
import {extractErrorReason} from './streamApiError'

export type StreamSceneDialogProps = {
    open: boolean
    onClose: () => void
    eventId: string
    /** null = Neuanlage. */
    scene: StreamSceneDto | null
    onSaved: (scene: StreamSceneDto) => void
}

/**
 * Anlegen/Umbenennen einer Szene: Name, Hintergrund, Chroma-Farbe, Sicherheitsabstand — die
 * Grafik-Konfiguration läuft über `StreamGraphicConfigDialog`, genau wie beim Server
 * (`updateStreamSceneGraphics` ist ein eigener Endpunkt).
 */
const StreamSceneDialog = ({open, onClose, eventId, scene, onSaved}: StreamSceneDialogProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [name, setName] = useState('')
    const [background, setBackground] = useState<StreamBackground>('TRANSPARENT')
    const [chromaColor, setChromaColor] = useState('#00FF00')
    const [safeAreaPercent, setSafeAreaPercent] = useState(0)
    const [touched, setTouched] = useState(false)
    const [saving, setSaving] = useState(false)

    // Auf jeder Öffnen-Flanke frisch aus der Szene (oder den Neuanlage-Vorgaben) laden — sonst
    // stünden beim zweiten Öffnen noch die Werte der zuvor bearbeiteten Szene da.
    useEffect(() => {
        if (!open) return
        setName(scene?.name ?? '')
        setBackground(scene?.background ?? 'TRANSPARENT')
        setChromaColor(scene?.chromaColor ?? '#00FF00')
        setSafeAreaPercent(scene?.safeAreaPercent ?? 0)
        setTouched(false)
    }, [open, scene])

    const errors = validateStreamSceneForm({name, background, chromaColor, safeAreaPercent})

    const handleSubmit = async () => {
        setTouched(true)
        if (hasStreamSceneFormErrors(errors)) return

        setSaving(true)
        try {
            const request = {
                name: name.trim(),
                background,
                chromaColor: background === 'CHROMA' ? chromaColor.trim() : null,
                safeAreaPercent,
            }
            const {data, error} =
                scene === null
                    ? await createStreamScene({path: {eventId}, body: request})
                    : await updateStreamScene({path: {eventId, sceneId: scene.id}, body: request})

            if (error || !data) {
                feedback.error(extractErrorReason(error) ?? t('common.error.unexpected'))
                return
            }

            feedback.success(t('event.stream.scenes.saved'))
            onSaved(data)
            onClose()
        } finally {
            setSaving(false)
        }
    }

    return (
        <BaseDialog open={open} onClose={onClose} maxWidth="sm">
            <DialogTitle>{scene ? t('event.stream.scenes.edit') : t('event.stream.scenes.create')}</DialogTitle>
            <DialogContent>
                <Stack spacing={3} sx={{mt: 1}}>
                    <TextField
                        label={t('event.stream.scenes.name')}
                        value={name}
                        onChange={e => setName(e.target.value)}
                        error={touched && errors.name}
                        helperText={touched && errors.name ? t('event.stream.scenes.validation.name') : undefined}
                        autoFocus
                        fullWidth
                    />
                    <TextField
                        select
                        label={t('event.stream.scenes.background.label')}
                        value={background}
                        onChange={e => setBackground(e.target.value as StreamBackground)}
                        fullWidth>
                        <MenuItem value="TRANSPARENT">{t('event.stream.scenes.background.TRANSPARENT')}</MenuItem>
                        <MenuItem value="CHROMA">{t('event.stream.scenes.background.CHROMA')}</MenuItem>
                    </TextField>
                    {background === 'CHROMA' && (
                        <TextField
                            type="color"
                            label={t('event.stream.scenes.chromaColor')}
                            value={chromaColor}
                            onChange={e => setChromaColor(e.target.value)}
                            error={touched && errors.chromaColor}
                            helperText={
                                touched && errors.chromaColor
                                    ? t('event.stream.scenes.validation.chromaColor')
                                    : undefined
                            }
                            sx={{width: 160}}
                        />
                    )}
                    <TextField
                        type="number"
                        label={t('event.stream.scenes.safeAreaPercent')}
                        value={safeAreaPercent}
                        onChange={e => {
                            const value = Number(e.target.value)
                            setSafeAreaPercent(Number.isFinite(value) ? value : safeAreaPercent)
                        }}
                        error={touched && errors.safeAreaPercent}
                        helperText={
                            touched && errors.safeAreaPercent
                                ? t('event.stream.scenes.validation.safeAreaPercent')
                                : t('event.stream.scenes.safeAreaPercentHint')
                        }
                        slotProps={{htmlInput: {min: 0, max: 100}}}
                        fullWidth
                    />
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

export default StreamSceneDialog
