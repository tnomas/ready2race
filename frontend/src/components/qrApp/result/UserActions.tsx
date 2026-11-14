import {Alert, Stack} from '@mui/material'
import {useState} from 'react'
import {useTranslation} from 'react-i18next'
import {QrCodeAppuserResponse} from '@api/types.gen.ts'
import {createCateringTransaction} from '@api/sdk.gen.ts'
import {useFeedback} from '@utils/hooks.ts'
import {ScanMode} from '@components/qrApp/appAccess.ts'
import {CatererTransaction} from '@components/qrApp/CatererTransaction'
import {BandInfo} from './BandInfo'
import {RemoveBandButton} from './RemoveBandButton'
import {isRequestNetworkError, runRequest} from '@utils/request.ts'

type Props = {
    eventId: string
    qrCodeId: string
    response: QrCodeAppuserResponse
    mode: ScanMode
    canRemove: boolean
    onDone: () => void
}

/** Die Ansicht eines Helferbands je Modus — siehe Tabelle in Abschnitt 8.2 der Spezifikation. */
export const UserActions = ({eventId, qrCodeId, response, mode, canRemove, onDone}: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const [submitting, setSubmitting] = useState(false)

    const handleCateringTransaction = async (price: string) => {
        const appUserId = response.id
        if (!appUserId) return
        const {error} = await runRequest(setSubmitting, () =>
            createCateringTransaction({
                body: {appUserId, eventId, price: price === '' ? '0' : price},
            }),
        )
        if (isRequestNetworkError(error)) {
            feedback.error(t('common.error.network'))
            return
        }
        if (error) {
            feedback.error(t('caterer.transactionError'))
            return
        }
        feedback.success(t('caterer.transactionSuccess'))
        onDone()
    }

    return (
        <Stack spacing={2} sx={{width: 1}}>
            <BandInfo response={response} showCompetitions={false} />
            {mode === 'APP_CATERER' && (
                <CatererTransaction
                    onConfirm={price => void handleCateringTransaction(price)}
                    submitting={submitting}
                />
            )}
            {(mode === 'APP_COMPETITION_CHECK' || mode === 'APP_EVENT_REQUIREMENT') && (
                <Alert severity="info">{t('app.result.helperBandNothingToDo')}</Alert>
            )}
            {canRemove && (
                <RemoveBandButton
                    qrCodeId={qrCodeId}
                    bandType="appuser"
                    emphasis={mode === 'APP_QR_MANAGEMENT' ? 'primary' : 'secondary'}
                    onRemoved={onDone}
                />
            )}
        </Stack>
    )
}
