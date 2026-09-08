import {useFeedback, useFetch} from '@utils/hooks.ts'
import {getRoles, getUser, updateUser} from '@api/sdk.gen.ts'
import {userRoute} from '@routes'
import {useTranslation} from 'react-i18next'
import {Box, Paper, Stack, Typography} from '@mui/material'
import {FormContainer, useForm} from 'react-hook-form-mui'
import {useState} from 'react'
import Throbber from '@components/Throbber.tsx'
import {FormInputText} from '@components/form/input/FormInputText.tsx'
import {SubmitButton} from '@components/form/SubmitButton.tsx'
import {useUser} from '@contexts/user/UserContext.ts'
import {updateStaffGlobal} from '@authorization/privileges.ts'
import RolesSelect from '@components/user/RolesSelect.tsx'
import {UpdateAppUserRequest} from '@api/types.gen.ts'
import PendingClubRepresentativeAlert from '@components/user/PendingClubRepresentativeAlert.tsx'
import {roleLabel} from '@authorization/roleLabels.ts'

type Form = {
    firstname: string
    lastname: string
    roles: string[]
}

const UserPage = () => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const user = useUser()

    const [submitting, setSubmitting] = useState(false)

    const {userId} = userRoute.useParams()

    const defaultValues: Form = {
        firstname: '',
        lastname: '',
        roles: [],
    }

    const formContext = useForm<Form>({values: defaultValues})

    const [reloadUserData, setReloadUserData] = useState(false)

    const {data: userData, pending} = useFetch(
        signal => getUser({signal, path: {userId: userId}}),
        {
            onResponse: ({data, error}) => {
                if (error) {
                    feedback.error(t('user.page.error.load'))
                } else {
                    formContext.reset({
                        firstname: data.firstname,
                        lastname: data.lastname,
                        roles: data.roles.map(r => r.id),
                    })
                }
            },
            deps: [userId, reloadUserData],
        },
    )

    const handleSubmit = async (formData: Form) => {
        setSubmitting(true)
        const {error} = await updateUser({
            path: {userId: userId},
            body: mapFormToRequest(formData, user.checkPrivilege(updateStaffGlobal)),
        })
        setSubmitting(false)

        if (error) {
            if (error.status.value === 403 && 'errorCode' in error && error.errorCode === 'SELF_ASSIGNMENT') {
                feedback.error(t('role.error.selfAssignment'))
            } else {
                feedback.error(t('user.update.error'))
            }
        } else {
            feedback.success(t('user.update.success'))
            setReloadUserData(!reloadUserData)
        }
    }

    const {data} = useFetch(signal => getRoles({signal}), {
        preCondition: () => user.checkPrivilege(updateStaffGlobal), // The backend checks for the privilege READRoleGlobal
    })

    return (
        <Box sx={{maxWidth: 600}}>
            <Stack spacing={2}>
                {user.loggedIn && user.id === userId && <PendingClubRepresentativeAlert />}
                <Paper sx={{padding: 4}}>
                    {(userData && (
                        <FormContainer formContext={formContext} onSuccess={handleSubmit}>
                            <Stack spacing={4}>
                                <FormInputText
                                    name={'firstname'}
                                    label={t('user.firstname')}
                                    required
                                />
                                <FormInputText
                                    name={'lastname'}
                                    label={t('user.lastname')}
                                    required
                                />
                                <Typography>{userData.email}</Typography>
                                {user.checkPrivilege(updateStaffGlobal)
                                    ? (data?.data.length ?? 0) > 0 && (
                                          <RolesSelect availableRoles={data?.data} />
                                      )
                                    : userData.roles.length > 0 && (
                                          <Box>
                                              <Typography>{t('role.roles')}</Typography>
                                              <Typography>
                                                  {userData.roles
                                                      .map(r => roleLabel(r, t))
                                                      .join(', ')}
                                              </Typography>
                                          </Box>
                                      )}
                                <SubmitButton
                                    submitting={submitting}
                                    disabled={!formContext.formState.isDirty}>
                                    {t('common.save')}
                                </SubmitButton>
                            </Stack>
                        </FormContainer>
                    )) ||
                        (pending && <Throbber />)}
                </Paper>
            </Stack>
        </Box>
    )
}

export default UserPage

function mapFormToRequest(formData: Form, editRoles: boolean): UpdateAppUserRequest {
    return {
        firstname: formData.firstname,
        lastname: formData.lastname,
        roles: editRoles ? formData.roles : [],
    }
}
