import {Alert, Stack} from '@mui/material'
import {Cancel} from '@mui/icons-material'
import {useTranslation} from 'react-i18next'
import {QrCodeParticipantResponse} from '@api/types.gen.ts'
import {ScanMode} from '@components/qrApp/appAccess.ts'
import {TeamCheckInOut} from '@components/qrApp/TeamCheckInOut'
import {BandInfo} from './BandInfo'
import {ParticipantRequirements} from './ParticipantRequirements'
import {RemoveBandButton} from './RemoveBandButton'
import {ScanErrorCard} from './ScanErrorCard'

type Props = {
    eventId: string
    qrCodeId: string
    response: QrCodeParticipantResponse
    mode: ScanMode
    canRemove: boolean
    onDone: () => void
}

/** Die Ansicht eines Teilnehmerbands je Modus — siehe Tabelle in Abschnitt 8.2 der Spezifikation. */
export const ParticipantActions = ({
    eventId,
    qrCodeId,
    response,
    mode,
    canRemove,
    onDone,
}: Props) => {
    const {t} = useTranslation()
    const participantId = response.id

    // Ohne Teilnehmer-ID trägt die Antwort nichts, woran Check-in oder Bedingungen hängen könnten.
    // Früher verschwanden die Bedienelemente dann wortlos; eine Fehlerkarte sagt wenigstens, dass
    // hier nichts geht. Kartenverwaltung und Verpflegung brauchen die ID nicht - dort lässt sich
    // ein Band auch ohne sie noch entfernen.
    if (!participantId && (mode === 'APP_COMPETITION_CHECK' || mode === 'APP_EVENT_REQUIREMENT')) {
        return (
            <ScanErrorCard
                title={t('app.result.loadErrorTitle')}
                message={t('app.result.loadError')}
                onRescan={onDone}
            />
        )
    }

    if (mode === 'APP_CATERER') {
        return (
            <Stack spacing={2} sx={{width: 1}}>
                <Alert severity="error" icon={<Cancel />} sx={{p: 2}}>
                    {t('club.participant.cateringNotAllowed')}
                </Alert>
                {canRemove && (
                    <RemoveBandButton
                        qrCodeId={qrCodeId}
                        bandType="participant"
                        emphasis="secondary"
                        onRemoved={onDone}
                    />
                )}
            </Stack>
        )
    }

    return (
        <Stack spacing={2} sx={{width: 1, flex: 1}}>
            <BandInfo response={response} showCompetitions={mode !== 'APP_COMPETITION_CHECK'} />
            {mode === 'APP_COMPETITION_CHECK' && participantId && (
                <TeamCheckInOut
                    eventId={eventId}
                    qrCodeId={qrCodeId}
                    participantId={participantId}
                    onDone={onDone}
                />
            )}
            {mode === 'APP_EVENT_REQUIREMENT' && participantId && (
                <ParticipantRequirements eventId={eventId} participantId={participantId} />
            )}
            {canRemove && (
                <RemoveBandButton
                    qrCodeId={qrCodeId}
                    bandType="participant"
                    emphasis={mode === 'APP_QR_MANAGEMENT' ? 'primary' : 'secondary'}
                    onRemoved={onDone}
                />
            )}
        </Stack>
    )
}
