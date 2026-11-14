import {useState} from 'react'
import {Box, Button, Card, Stack} from '@mui/material'
import EmojiEvents from '@mui/icons-material/EmojiEvents'
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined'
import FormatListNumbered from '@mui/icons-material/FormatListNumbered'
import PublicOutlined from '@mui/icons-material/PublicOutlined'
import SendOutlined from '@mui/icons-material/SendOutlined'
import WorkspacePremium from '@mui/icons-material/WorkspacePremium'
import {useTranslation} from 'react-i18next'
import {EventDto} from '@api/types.gen.ts'
import {
    downloadCertificatesOfParticipation,
    downloadEventResults,
    sendCertificatesToParticipants,
} from '@api/sdk.gen.ts'
import {useUser} from '@contexts/user/UserContext.ts'
import {useConfirmation} from '@contexts/confirmation/ConfirmationContext.ts'
import {useFeedback} from '@utils/hooks.ts'
import {runDownload} from '@utils/download.ts'
import {isRequestNetworkError, runRequest} from '@utils/request.ts'
import {ButtonLink, SectionHeader} from '@components/ui'
import SplitButton from '@components/SplitButton.tsx'
import AwardCertificateDialog from '@components/awardCertificate/AwardCertificateDialog.tsx'
import AwardCeremonyDialog from '@components/awardCeremony/AwardCeremonyDialog.tsx'
import ResultListDialog from '@components/awardCeremony/ResultListDialog.tsx'
import {visibleResultActions} from '../eventPageLogic.ts'

type Props = {
    event: EventDto
}

/**
 * Bereich „Ergebnisse & Urkunden" (Nachbereitung): alles, was nach den Rennen herausgegeben wird.
 * Die Knöpfe standen bis zum 13.11.2026 auf der Übersicht (Ergebnisseite, Ergebnisse
 * herunterladen, Urkunden, Teilnahmeurkunden) und unter der Wettkampftabelle (Ergebnisliste,
 * Siegerehrungsbogen). Welche erscheinen, entscheidet `visibleResultActions` mit den
 * unveränderten Bedingungen von dort.
 */
const ResultsTab = ({event}: Props) => {
    const {t} = useTranslation()
    const user = useUser()
    const feedback = useFeedback()
    const {confirmAction} = useConfirmation()
    const eventId = event.id

    const [awardCertificateOpen, setAwardCertificateOpen] = useState(false)
    const [awardCeremonyOpen, setAwardCeremonyOpen] = useState(false)
    const [resultListOpen, setResultListOpen] = useState(false)

    const actions = visibleResultActions(
        {
            checkPrivilege: user.checkPrivilege,
            loggedIn: user.loggedIn,
            clubId: user.loggedIn ? user.clubId : undefined,
        },
        event,
    )
    const can = (action: (typeof actions)[number]) => actions.includes(action)

    const handleResultsDownload = async () => {
        const {downloaded, error} = await runDownload(
            undefined,
            () => downloadEventResults({path: {eventId}}),
            'event-results.pdf',
        )
        if (isRequestNetworkError(error)) {
            feedback.error(t('common.error.network'))
        } else if (error || !downloaded) {
            feedback.error(t('event.results.downloadError'))
        }
    }

    const handleCertificateSending = async () => {
        const {error} = await runRequest(undefined, () =>
            sendCertificatesToParticipants({path: {eventId}}),
        )
        if (isRequestNetworkError(error)) {
            feedback.error(t('common.error.network'))
        } else if (error) {
            feedback.error(t('common.error.unexpected'))
        } else {
            feedback.success(t('event.action.sendCertificatesSucceeded'))
        }
    }

    const handleClubCertificatesDownload = async (format: 'pdf' | 'docx') => {
        const {downloaded, error} = await runDownload(
            undefined,
            () => downloadCertificatesOfParticipation({path: {eventId}, query: {format}}),
            'certificates_of_participation.zip',
        )
        if (isRequestNetworkError(error)) {
            feedback.error(t('common.error.network'))
        } else if (error || !downloaded) {
            feedback.error(t('common.error.unexpected'))
        }
    }

    const showDocuments =
        can('downloadResults') ||
        can('resultList') ||
        can('awardCeremony') ||
        can('awardCertificates')
    const showParticipation =
        can('sendParticipationCertificates') || can('downloadParticipationCertificates')

    const cardSx = {p: 2} as const
    const buttonRowSx = {display: 'flex', flexWrap: 'wrap', gap: 1} as const

    return (
        <Stack spacing={2}>
            <Card sx={cardSx}>
                <SectionHeader
                    level={3}
                    title={t('event.results.public.title')}
                    description={t('event.results.public.description')}
                />
                <Box sx={buttonRowSx}>
                    <ButtonLink
                        to={'/results/event/$eventId'}
                        params={{eventId}}
                        variant={'contained'}
                        startIcon={<PublicOutlined />}>
                        {t('event.toResults')}
                    </ButtonLink>
                </Box>
            </Card>
            {showDocuments && (
                <Card sx={cardSx}>
                    <SectionHeader
                        level={3}
                        title={t('event.results.documents.title')}
                        description={t('event.results.documents.description')}
                    />
                    <Box sx={buttonRowSx}>
                        {can('downloadResults') && (
                            <Button
                                variant={'outlined'}
                                startIcon={<FileDownloadOutlined />}
                                onClick={handleResultsDownload}>
                                {t('event.results.download')}
                            </Button>
                        )}
                        {can('resultList') && (
                            <Button
                                variant={'outlined'}
                                startIcon={<FormatListNumbered />}
                                onClick={() => setResultListOpen(true)}>
                                {t('resultList.download.button')}
                            </Button>
                        )}
                        {can('awardCeremony') && (
                            <Button
                                variant={'outlined'}
                                startIcon={<EmojiEvents />}
                                onClick={() => setAwardCeremonyOpen(true)}>
                                {t('awardCeremony.download.button')}
                            </Button>
                        )}
                        {can('awardCertificates') && (
                            <Button
                                variant={'outlined'}
                                startIcon={<WorkspacePremium />}
                                onClick={() => setAwardCertificateOpen(true)}>
                                {t('event.action.downloadAwardCertificates')}
                            </Button>
                        )}
                    </Box>
                </Card>
            )}
            {showParticipation && (
                <Card sx={cardSx}>
                    <SectionHeader
                        level={3}
                        title={t('event.results.participation.title')}
                        description={t('event.results.participation.description')}
                    />
                    <Box sx={buttonRowSx}>
                        {can('sendParticipationCertificates') && (
                            <Button
                                variant={'outlined'}
                                startIcon={<SendOutlined />}
                                onClick={() => confirmAction(handleCertificateSending)}>
                                {t('event.action.sendCertificates')}
                            </Button>
                        )}
                        {can('downloadParticipationCertificates') && (
                            <SplitButton
                                main={{
                                    label: t('event.action.downloadCertificates'),
                                    onClick: () => handleClubCertificatesDownload('pdf'),
                                }}
                                options={[
                                    {
                                        label: t('event.action.downloadCertificatesWord'),
                                        onClick: () => handleClubCertificatesDownload('docx'),
                                    },
                                ]}
                            />
                        )}
                    </Box>
                </Card>
            )}
            {can('awardCertificates') && (
                <AwardCertificateDialog
                    open={awardCertificateOpen}
                    onClose={() => setAwardCertificateOpen(false)}
                    eventId={eventId}
                />
            )}
            {can('awardCeremony') && (
                <AwardCeremonyDialog
                    open={awardCeremonyOpen}
                    onClose={() => setAwardCeremonyOpen(false)}
                    eventId={eventId}
                />
            )}
            {can('resultList') && (
                <ResultListDialog
                    open={resultListOpen}
                    onClose={() => setResultListOpen(false)}
                    eventId={eventId}
                />
            )}
        </Stack>
    )
}

export default ResultsTab
