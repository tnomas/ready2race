import SimpleFormLayout from '@components/SimpleFormLayout.tsx'
import {useTranslation} from 'react-i18next'
import {useState} from 'react'
import {NewPassword, PasswordFormPart} from '@components/form/NewPassword.tsx'
import {FormContainer, useForm} from 'react-hook-form-mui'
import {Box, Stack, Typography} from '@mui/material'
import {ButtonLink} from '@components/ui'
import {SubmitButton} from '@components/form/SubmitButton.tsx'
import {acceptUserInvitation} from '@api/sdk.gen.ts'
import {invitationTokenRoute} from '@routes'
import RequestStatusResponse from '@components/user/RequestStatusResponse.tsx'
import {isRequestNetworkError, runRequest} from '@utils/request.ts'
import {useFeedback} from '@utils/hooks.ts'

type Form = PasswordFormPart

const defaultValues: Form = {
    password: '',
    confirmPassword: '',
}

const AcceptInvitationPage = () => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const {invitationToken} = invitationTokenRoute.useParams()

    const formContext = useForm<Form>({values: defaultValues})

    const [submitting, setSubmitting] = useState(false)
    const [requestResult, setRequestResult] = useState<
        'NotFound' | 'Unexpected' | 'Success' | null
    >(null)

    const handleSubmit = async (formData: Form) => {
        const result = await runRequest(setSubmitting, () =>
            acceptUserInvitation({
                body: {
                    token: invitationToken,
                    password: formData.password,
                },
            }),
        )

        if (result.error === undefined) {
            setRequestResult('Success')
        } else if (isRequestNetworkError(result.error)) {
            // Formular bleibt stehen, damit der Versuch wiederholt werden kann
            feedback.error(t('common.error.network'))
        } else {
            setRequestResult(result.error.status.value === 404 ? 'NotFound' : 'Unexpected')
        }
    }

    return (
        <SimpleFormLayout maxWidth={500}>
            {requestResult === null ? (
                <>
                    <Box sx={{mb: 3}}>
                        <Typography variant="h1" textAlign="center" sx={{mb: 2}}>
                            {t('user.invitation.accept')}
                        </Typography>
                        <Typography>{t('user.invitation.hint')}</Typography>
                    </Box>
                    <FormContainer formContext={formContext} onSuccess={handleSubmit}>
                        <Stack spacing={3}>
                            <NewPassword formContext={formContext} />
                            <SubmitButton submitting={submitting}>
                                {t('user.invitation.submitPassword')}
                            </SubmitButton>
                        </Stack>
                    </FormContainer>
                </>
            ) : requestResult === 'Success' ? (
                <Box sx={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                    <Typography textAlign="center" sx={{mb: 3}}>
                        {t('user.invitation.userCreated.text')}
                    </Typography>
                    <ButtonLink to="/login" variant="contained">
                        {t('user.invitation.userCreated.toLogin')}
                    </ButtonLink>
                </Box>
            ) : (
                <RequestStatusResponse
                    success={false}
                    header={t('user.invitation.error.header')}
                    showLoginNavigation>
                    <Typography textAlign="center">
                        {requestResult === 'NotFound'
                            ? t('user.invitation.error.message.notFound')
                            : t('user.invitation.error.message.unexpected')}
                    </Typography>
                </RequestStatusResponse>
            )}
        </SimpleFormLayout>
    )
}

export default AcceptInvitationPage
