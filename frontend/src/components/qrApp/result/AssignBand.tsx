import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material'
import React, {useRef, useState} from 'react'
import {updateQrCodeAppuser, updateQrCodeParticipant} from '@api/sdk.gen.ts'
import {useTranslation} from 'react-i18next'
import PersonIcon from '@mui/icons-material/Person'
import ParticipantAssignment, {
    DedupedParticipant,
} from '@components/qrApp/assign/ParticipantAssignment'
import UserAssignment from '@components/qrApp/assign/UserAssignment'
import SystemUserScanner from '@components/qrApp/assign/SystemUserScanner'
import {useFeedback} from '@utils/hooks.ts'
import {
    LiveDashboardApiError,
    qrAssignErrorKey,
} from '@components/event/liveDashboard/liveDashboardError.ts'
import {isRequestNetworkError, runRequest} from '@utils/request.ts'
import type {NetworkError} from '@utils/hooks.ts'

type UserTyp = 'Participant' | 'User'

interface ConfirmationData {
    id: string
    name: string
    type: 'participant' | 'user'
    additionalInfo?: string[]
}

type Props = {
    eventId: string
    qrCodeId: string
    onDone: () => void
}

export const AssignBand = ({eventId, qrCodeId, onDone}: Props) => {
    const {t} = useTranslation()
    const [userTyp, setUserTyp] = useState<UserTyp | null>('Participant')
    const [scanningSystemUser, setScanningSystemUser] = useState(false)
    const [confirmationOpen, setConfirmationOpen] = useState(false)
    const [selectedPerson, setSelectedPerson] = useState<ConfirmationData | null>(null)
    // Sperre gegen den zweiten Tipper auf "OK", solange die erste Zuweisung noch läuft.
    const [submitting, setSubmitting] = useState(false)
    const feedback = useFeedback()
    const qrCheckPending = useRef<boolean>(false)

    /**
     * Warum die Zuweisung nicht geklappt hat. Beide bisherigen Meldungen klangen nach Scanfehler
     * und schickten die Helfer dazu, es noch einmal zu scannen - beim mit Abstand häufigsten
     * Grund (Bändchen schon vergeben) hilft nur ein anderes Bändchen.
     */
    const showAssignError = (
        error: LiveDashboardApiError | NetworkError,
        fallbackKey: 'common.error.unexpected' | 'qrAssign.notAssigned',
    ) => {
        if (isRequestNetworkError(error)) {
            feedback.error(t('common.error.network'))
            return
        }
        feedback.error(t(qrAssignErrorKey(error) ?? fallbackKey))
    }

    const handleUserTypChange = (
        _event: React.MouseEvent<HTMLElement>,
        newUserTyp: UserTyp | null,
    ) => {
        if (newUserTyp !== null) {
            setUserTyp(newUserTyp)
            setScanningSystemUser(false)
        }
    }

    const handleScanSystemUser = () => {
        setScanningSystemUser(true)
        setUserTyp(null) // Clear toggle group selection
    }

    const handleParticipantClick = (participant: DedupedParticipant) => {
        setSelectedPerson({
            id: participant.participantId,
            name: `${participant.firstname} ${participant.lastname}`,
            type: 'participant',
            additionalInfo: participant.contexts.map(c => `${c.competitionName} (${c.role})`),
        })
        setConfirmationOpen(true)
    }

    const handleUserClick = (user: {id: string; firstname: string; lastname: string}) => {
        setSelectedPerson({
            id: user.id,
            name: `${user.firstname} ${user.lastname}`,
            type: 'user',
        })
        setConfirmationOpen(true)
    }

    /**
     * Der Dialog schließt in jedem Fall, aber weiter geht es nur nach einer geglückten
     * Zuweisung: Beim häufigsten Fehler (Bändchen schon vergeben) muss die Bandausgabe hier
     * bleiben und ein anderes Bändchen nehmen, statt zurück in den Scanner geworfen zu werden.
     */
    const handleConfirmSelection = async () => {
        if (!selectedPerson || submitting) return
        let assigned = false
        if (selectedPerson.type === 'participant') {
            const {error} = await runRequest(setSubmitting, () =>
                updateQrCodeParticipant({
                    body: {
                        qrCodeId: qrCodeId,
                        eventId: eventId,
                        id: selectedPerson.id,
                    },
                }),
            )
            if (error) {
                showAssignError(error, 'common.error.unexpected')
            } else {
                assigned = true
                feedback.success(t('qrAssign.successParticipant'))
            }
        } else {
            const {error} = await runRequest(setSubmitting, () =>
                updateQrCodeAppuser({
                    body: {
                        qrCodeId: qrCodeId,
                        eventId: eventId,
                        id: selectedPerson.id,
                    },
                }),
            )
            if (error) {
                showAssignError(error, 'common.error.unexpected')
            } else {
                assigned = true
                feedback.success(t('qrAssign.successUser'))
            }
        }

        setConfirmationOpen(false)
        if (assigned) {
            onDone()
        }
    }

    const handleCloseConfirmation = () => {
        setConfirmationOpen(false)
        setSelectedPerson(null)
    }

    const handleSystemUserScan = async (qrCodeContent: string) => {
        if (!qrCheckPending.current) {
            qrCheckPending.current = true
            try {
                const data = JSON.parse(qrCodeContent)

                if (data.appUserId) {
                    setScanningSystemUser(false)
                    const {error} = await updateQrCodeAppuser({
                        body: {
                            qrCodeId: qrCodeId,
                            eventId: eventId,
                            id: data.appUserId,
                        },
                    })
                    if (error) {
                        setScanningSystemUser(true)
                        showAssignError(error, 'qrAssign.notAssigned')
                    } else {
                        onDone()

                        feedback.success(t('qrAssign.success'))
                    }
                } else if (data.participantId) {
                    setScanningSystemUser(false)
                    const {error} = await updateQrCodeParticipant({
                        body: {
                            qrCodeId: qrCodeId,
                            eventId: eventId,
                            id: data.participantId,
                        },
                    })
                    if (error) {
                        setScanningSystemUser(true)
                        showAssignError(error, 'qrAssign.notAssigned')
                    } else {
                        onDone()
                        feedback.success(t('qrAssign.success'))
                    }
                } else {
                    feedback.error(t('qrAssign.invalidUserQr'))
                }
            } catch {
                feedback.error(t('qrAssign.invalidUserQr'))
            }

            qrCheckPending.current = false
        }
    }

    return (
        <Stack spacing={2} sx={{width: 1}}>
            <Stack spacing={2} sx={{width: '100%'}}>
                <ToggleButtonGroup
                    value={scanningSystemUser ? null : userTyp}
                    exclusive
                    onChange={handleUserTypChange}
                    aria-label="user type selection"
                    sx={{width: '100%'}}>
                    <ToggleButton value="Participant" sx={{flex: 1, py: 1.5}}>
                        {t('qrAssign.participant')}
                    </ToggleButton>
                    <ToggleButton value="User" sx={{flex: 1, py: 1.5}}>
                        {t('qrAssign.user')}
                    </ToggleButton>
                </ToggleButtonGroup>

                <Button
                    variant={'outlined'}
                    fullWidth
                    onClick={handleScanSystemUser}
                    sx={{py: 1.5}}>
                    {t('qrAssign.scanSystemUser')}
                </Button>
            </Stack>

            {userTyp === 'Participant' && !scanningSystemUser && (
                <ParticipantAssignment
                    eventId={eventId}
                    onSelectParticipant={handleParticipantClick}
                />
            )}

            {userTyp === 'User' && !scanningSystemUser && (
                <UserAssignment eventId={eventId} onSelectUser={handleUserClick} />
            )}

            {scanningSystemUser && (
                <SystemUserScanner
                    onScan={handleSystemUserScan}
                    onBack={() => setScanningSystemUser(false)}
                />
            )}

            <Dialog
                open={confirmationOpen}
                onClose={handleCloseConfirmation}
                maxWidth="sm"
                fullWidth>
                <DialogTitle>{t('common.confirmation.title')}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{pt: 2}}>
                        <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                            <PersonIcon sx={{fontSize: 48, color: 'text.secondary'}} />
                            <Box>
                                <Typography variant="h6">{selectedPerson?.name}</Typography>
                                {selectedPerson?.additionalInfo &&
                                    selectedPerson.additionalInfo.map((info, index) => (
                                        <Typography
                                            key={index}
                                            variant="body2"
                                            color="text.secondary">
                                            {info}
                                        </Typography>
                                    ))}
                            </Box>
                        </Box>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseConfirmation} variant="outlined">
                        {t('common.back')}
                    </Button>
                    <Button
                        onClick={() => void handleConfirmSelection()}
                        variant="contained"
                        color="primary"
                        disabled={submitting}>
                        {t('common.ok')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Stack>
    )
}
