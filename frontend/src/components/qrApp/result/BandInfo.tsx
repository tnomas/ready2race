import {Paper, Stack, Typography} from '@mui/material'
import {Business, EmojiEvents, Person} from '@mui/icons-material'
import {useTranslation} from 'react-i18next'
import {StaffQrCodeResponse} from '@components/qrApp/scanDecision.ts'

type Props = {
    response: StaffQrCodeResponse
    /** Beim Check-in stehen die Boote ohnehin darunter — dann wäre die Liste hier doppelt. */
    showCompetitions: boolean
}

export const BandInfo = ({response, showCompetitions}: Props) => {
    const {t} = useTranslation()
    const competitions =
        response.type !== 'User' && 'competitions' in response ? (response.competitions ?? []) : []

    return (
        <Paper sx={{p: 2, width: '100%'}}>
            <Stack spacing={1.5}>
                <Typography variant="h6" color="primary">
                    {response.type === 'User'
                        ? t('qrAppuser.assignmentInfo')
                        : t('qrParticipant.assignmentInfo')}
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                    <Person color="action" />
                    <Typography sx={{overflowWrap: 'anywhere'}}>
                        <strong>{t('common.name')}:</strong> {response.firstname}{' '}
                        {response.lastname}
                    </Typography>
                </Stack>
                {response.clubName && (
                    <Stack direction="row" spacing={1} alignItems="center">
                        <Business color="action" />
                        <Typography sx={{overflowWrap: 'anywhere'}}>
                            <strong>{t('club.club')}:</strong> {response.clubName}
                        </Typography>
                    </Stack>
                )}
                {showCompetitions && competitions.length > 0 && (
                    <Stack spacing={1}>
                        <Stack direction="row" spacing={1} alignItems="center">
                            <EmojiEvents color="action" />
                            <Typography>
                                <strong>{t('event.competition.competitions')}:</strong>
                            </Typography>
                        </Stack>
                        <Stack sx={{pl: 4}}>
                            {competitions.map((comp, index) => (
                                <Typography key={index} variant="body2">
                                    • {comp}
                                </Typography>
                            ))}
                        </Stack>
                    </Stack>
                )}
            </Stack>
        </Paper>
    )
}
