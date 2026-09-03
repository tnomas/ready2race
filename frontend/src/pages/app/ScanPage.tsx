import {Button, Chip} from '@mui/material'
import {useNavigate} from '@tanstack/react-router'
import {useTranslation} from 'react-i18next'
import QrNimiqScanner from '@components/qrApp/QrNimiqScanner.tsx'
import AppHeader from '@components/qrApp/AppHeader.tsx'
import AppColumn from '@components/qrApp/AppColumn.tsx'
import {useAppSession} from '@contexts/app/AppSessionContext.tsx'
import {useFeedback} from '@utils/hooks.ts'
import Config from '../../Config.ts'

const uuidRegex = /([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/

/** Die Startseite der Scan-Welt. Sie ruft nichts ab: das Ergebnis lädt sich selbst. */
const ScanPage = () => {
    const {t} = useTranslation()
    const {event, scanRights, scanMode, worlds} = useAppSession()
    const navigate = useNavigate()
    const feedback = useFeedback()

    const handleScan = (content: string) => {
        const match = content.match(uuidRegex)
        if (!match) {
            feedback.error(t('qrAssign.invalidQrFormat'))
            return
        }
        void navigate({to: '/app/scan/$qrCodeId', params: {qrCodeId: match[1]}})
    }

    return (
        <AppColumn>
            <AppHeader
                title={t('app.scan.title')}
                subtitle={event?.name}
                onBack={worlds.length > 1 ? () => void navigate({to: '/app/start'}) : undefined}
                settings>
                {scanRights.length > 1 && (
                    <Chip
                        clickable
                        onClick={() => void navigate({to: '/app/einstellungen'})}
                        color={scanMode ? 'primary' : 'warning'}
                        label={
                            scanMode
                                ? t('app.scan.modeChip', {mode: t(`app.mode.${scanMode}`)})
                                : t('app.scan.modeUnset')
                        }
                    />
                )}
            </AppHeader>
            <QrNimiqScanner callback={handleScan} />
            {(Config.mode === 'development' || Config.mode === 'test') && (
                <Button
                    onClick={() => handleScan('b294a2e0-039d-4ede-bd84-c61a47dd9c04')}
                    fullWidth
                    size="large"
                    variant="contained">
                    Skip ({Config.mode}-mode)
                </Button>
            )}
        </AppColumn>
    )
}

export default ScanPage
