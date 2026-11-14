import {Box, Button, DialogActions, DialogContent, DialogTitle, Stack} from '@mui/material'
import BaseDialog from '@components/BaseDialog.tsx'
import {Trans, useTranslation} from 'react-i18next'
import {useEffect, useState} from 'react'
import {downloadGapDocumentTemplateSample} from '@api/sdk.gen.ts'
import {useFeedback} from '@utils/hooks.ts'

type Props = {
    open: boolean
    onClose: () => void
    gapDocumentTemplateId: string | null
}

const GapDocumentTemplatePreviewDialog = (props: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)

    useEffect(() => {
        if (!props.open || !props.gapDocumentTemplateId) {
            return
        }
        const templateId = props.gapDocumentTemplateId
        let cancelled = false
        let url: string | null = null

        const loadPreview = async () => {
            const {data, error} = await downloadGapDocumentTemplateSample({
                path: {gapDocumentTemplateId: templateId},
            })
            if (cancelled) {
                return
            }
            if (error) {
                feedback.error(t('gap.document.template.preview.error'))
            } else if (data !== undefined) {
                url = URL.createObjectURL(data)
                setPreviewUrl(url)
            }
        }
        loadPreview()

        return () => {
            cancelled = true
            if (url) {
                URL.revokeObjectURL(url)
            }
            setPreviewUrl(null)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.open, props.gapDocumentTemplateId])

    const handleClose = () => {
        props.onClose()
    }

    return (
        <BaseDialog open={props.open} onClose={handleClose} fullScreen>
            <DialogTitle>
                <Trans i18nKey={'gap.document.template.preview.title'} />
            </DialogTitle>
            <DialogContent>
                <Stack spacing={4} sx={{height: 1}}>
                    {previewUrl && (
                        <Box
                            sx={{
                                position: 'relative',
                                flex: 1,
                            }}>
                            <Box
                                component={'iframe'}
                                src={previewUrl}
                                sx={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: 1,
                                    height: 1,
                                }}
                            />
                        </Box>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>{t('common.close')}</Button>
            </DialogActions>
        </BaseDialog>
    )
}

export default GapDocumentTemplatePreviewDialog
