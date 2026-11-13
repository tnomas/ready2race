import {Stack, Typography, Card, CardContent, Box, Chip, Alert, Divider} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import {checkInOutParticipant, getTeamsByParticipantQrCode} from '@api/sdk.gen.ts'
import {useState} from 'react'
import Throbber from '@components/Throbber.tsx'
import LoadingButton from '@components/form/LoadingButton.tsx'
import {participantTrackingErrorKey} from '@components/event/liveDashboard/liveDashboardError.ts'
import {isRequestNetworkError, runRequest} from '@utils/request.ts'

type Props = {
    eventId: string
    qrCodeId: string
    participantId: string
    onDone: () => void
}

export const TeamCheckInOut = ({eventId, qrCodeId, participantId, onDone}: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [submitting, setSubmitting] = useState(false)

    const {data: teamsData, pending: teamsPending} = useFetch(
        signal =>
            getTeamsByParticipantQrCode({
                signal,
                path: {
                    eventId,
                    qrCode: qrCodeId,
                },
            }),
        {
            onResponse: ({error}) => {
                if (error) {
                    feedback.error(
                        t('common.load.error.multiple.short', {
                            entity: t('club.participant.tracking.teams'),
                        }),
                    )
                }
            },
            deps: [eventId, qrCodeId],
        },
    )

    const selectedParticipant = teamsData
        ?.flatMap(team => team.participants)
        .find(participant => participant.participantId === participantId)

    const anyTeamRequiresCheckInOut = teamsData?.some(team => team.checkInOutRequired) ?? false

    const handleCheckInOut = async (checkIn: boolean) => {
        if (!selectedParticipant) return
        const {error} = await runRequest(setSubmitting, () =>
            checkInOutParticipant({
                path: {
                    eventId,
                    participantId: selectedParticipant.participantId,
                },
                query: {
                    checkIn: checkIn,
                },
            }),
        )
        if (isRequestNetworkError(error)) {
            feedback.error(t('common.error.network'))
            return
        }
        if (error) {
            // Vier Gründe teilten sich diese beiden Texte - dabei ist "schon eingecheckt" keine
            // Störung, sondern die Auskunft, dass nichts mehr zu tun ist.
            const reason = participantTrackingErrorKey(error)
            feedback.error(
                reason !== undefined
                    ? t(reason)
                    : checkIn
                      ? t('club.participant.tracking.checkIn.error')
                      : t('club.participant.tracking.checkOut.error'),
            )
            // Bei einem Fehler bleibt die Seite stehen, wie bei den anderen Ergebnis-Bausteinen:
            // wer ihn übersieht und weiterscannt, verliert sonst den Check-in/-out kommentarlos.
            return
        }
        feedback.success(
            checkIn
                ? t('club.participant.tracking.checkIn.success')
                : t('club.participant.tracking.checkOut.success'),
        )
        onDone()
    }

    return (
        <Stack spacing={2} sx={{width: 1, flex: 1}}>
            {teamsPending ? (
                <Throbber />
            ) : !teamsData || selectedParticipant === undefined ? (
                <Alert severity="error">{t('club.participant.tracking.participantNotFound')}</Alert>
            ) : teamsData.length === 0 ? (
                <Alert severity="info">{t('club.participant.tracking.noTeamsFound')}</Alert>
            ) : (
                <Stack spacing={2} sx={{justifyContent: 'space-between', flex: 1}}>
                    <Box>
                        <Typography variant="h6">{t('club.participant.tracking.teams')}</Typography>
                        <Stack spacing={2}>
                            {teamsData
                                .sort((a, b) =>
                                    a.competitionIdentifier > b.competitionIdentifier ? 1 : -1,
                                )
                                .map(team => (
                                    <Card key={team.competitionRegistrationId} variant="outlined">
                                        <CardContent>
                                            <Stack
                                                direction="row"
                                                justifyContent="space-between"
                                                alignItems="center">
                                                <Box>
                                                    <Typography variant="h6" gutterBottom>
                                                        {team.competitionIdentifier} |{' '}
                                                        {team.competitionName}
                                                    </Typography>
                                                    {!team.checkInOutRequired && (
                                                        <Chip
                                                            size="small"
                                                            label={t(
                                                                'club.participant.tracking.noCheckInOutNeeded',
                                                            )}
                                                        />
                                                    )}
                                                    <Typography>
                                                        {team.clubName +
                                                            (team.teamName
                                                                ? ' ' + team.teamName
                                                                : '')}
                                                    </Typography>
                                                </Box>
                                            </Stack>
                                            <Divider sx={{my: 1}} />
                                            <Stack spacing={1}>
                                                {team.participants.map(participant => (
                                                    <Stack
                                                        key={
                                                            participant.participantId +
                                                            team.competitionRegistrationId
                                                        }
                                                        direction={'row'}
                                                        spacing={2}
                                                        sx={{justifyContent: 'space-between'}}>
                                                        <Typography sx={{flex: 2}}>
                                                            {participant.firstName}{' '}
                                                            {participant.lastName}
                                                        </Typography>
                                                        {participant.currentStatus && (
                                                            <Chip
                                                                sx={{flex: 1}}
                                                                label={
                                                                    participant.currentStatus ===
                                                                    'ENTRY'
                                                                        ? t(
                                                                              'club.participant.tracking.in',
                                                                          )
                                                                        : t(
                                                                              'club.participant.tracking.out',
                                                                          )
                                                                }
                                                                color={
                                                                    participant.currentStatus ===
                                                                    'ENTRY'
                                                                        ? 'success'
                                                                        : 'default'
                                                                }
                                                                size="small"
                                                            />
                                                        )}
                                                    </Stack>
                                                ))}
                                            </Stack>
                                        </CardContent>
                                    </Card>
                                ))}
                        </Stack>
                    </Box>
                    <Box
                        sx={{
                            position: 'sticky',
                            bottom: 0,
                            width: 1,
                            display: 'flex',
                            justifyContent: 'center',
                            pt: 1,
                            pb: 'calc(8px + env(safe-area-inset-bottom))',
                        }}
                        bgcolor={'background.default'}>
                        {anyTeamRequiresCheckInOut ? (
                            <LoadingButton
                                pending={submitting || teamsPending}
                                variant={'contained'}
                                size="large"
                                fullWidth
                                onClick={() =>
                                    handleCheckInOut(selectedParticipant.currentStatus !== 'ENTRY')
                                }>
                                {selectedParticipant.currentStatus === 'ENTRY'
                                    ? t('club.participant.tracking.checkOutText')
                                    : t('club.participant.tracking.checkInText')}
                            </LoadingButton>
                        ) : (
                            <Typography variant="body2" color="text.secondary">
                                {t('club.participant.tracking.noCheckInOutForAnyTeam')}
                            </Typography>
                        )}
                    </Box>
                </Stack>
            )}
        </Stack>
    )
}
