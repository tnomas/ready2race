import {useFeedback, useFetch} from '@utils/hooks.ts'
import {getRoles, getUser, updateUser} from '@api/sdk.gen.ts'
import {userRoute} from '@routes'
import {useTranslation} from 'react-i18next'
import {Box, Paper, Stack, Typography} from '@mui/material'
import {FormContainer, useForm} from 'react-hook-form-mui'
import {useState} from 'react'
import {ErrorState, LoadingState, PageHeader} from '@components/ui'
import {buildUserTrail} from '@utils/navigation/breadcrumbs.ts'
import {FormInputText} from '@components/form/input/FormInputText.tsx'
import {SubmitButton} from '@components/form/SubmitButton.tsx'
import {useUser} from '@contexts/user/UserContext.ts'
import {updateStaffGlobal, updateUserGlobal} from '@authorization/privileges.ts'
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

    const {
        data: userData,
        error: userError,
        reload: reloadUser,
    } = useFetch(signal => getUser({signal, path: {userId: userId}}), {
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
    })

    // Die Rollenauswahl hilft nur, wenn das Speichern auch durchgeht: PUT /user/{id} hängt an
    // UPDATE USER, die Rollenvergabe zusätzlich an UPDATE STAFF. Wer nur eines von beiden trägt
    // (z.B. der Job Wettkampfleitung), bekommt die Auswahl gar nicht erst zu sehen.
    const mayEditRoles =
        user.checkPrivilege(updateStaffGlobal) && user.checkPrivilege(updateUserGlobal)

    const handleSubmit = async (formData: Form) => {
        setSubmitting(true)
        const {error} = await updateUser({
            path: {userId: userId},
            body: mapFormToRequest(formData, mayEditRoles),
        })
        setSubmitting(false)

        if (error) {
            if (error.status.value === 403 && 'errorCode' in error) {
                if (error.errorCode === 'SELF_ASSIGNMENT') {
                    feedback.error(t('role.error.selfAssignment'))
                } else if (error.errorCode === 'PRIVILEGES_BEYOND_OWN') {
                    feedback.error(t('role.error.privilegesBeyondOwn'))
                } else {
                    feedback.error(t('user.update.error'))
                }
            } else if (
                error.status.value === 409 &&
                'errorCode' in error &&
                error.errorCode === 'CANNOT_ASSIGN_ROLES'
            ) {
                feedback.error(t('role.error.cannotAssign'))
            } else {
                feedback.error(t('user.update.error'))
            }
        } else {
            feedback.success(t('user.update.success'))
            setReloadUserData(!reloadUserData)
        }
    }

    const {data} = useFetch(signal => getRoles({signal}), {
        preCondition: () => mayEditRoles, // The backend checks for the privilege READRoleGlobal
    })

    const fullName = userData ? `${userData.firstname} ${userData.lastname}`.trim() : undefined

    return (
        <Box>
            <PageHeader
                title={fullName || t('user.user')}
                subtitle={userData?.email}
                breadcrumbs={buildUserTrail({
                    usersLabel: t('navigation.titles.users'),
                    userId,
                    userName: fullName,
                })}
            />
            <Stack spacing={2} sx={{maxWidth: 600}}>
                {user.loggedIn && user.id === userId && <PendingClubRepresentativeAlert />}
                {userData ? (
                    <Paper sx={{p: {xs: 2, sm: 3}}}>
                        <FormContainer formContext={formContext} onSuccess={handleSubmit}>
                            <Stack spacing={3}>
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
                                {mayEditRoles
                                    ? (data?.data.length ?? 0) > 0 && (
                                          <RolesSelect availableRoles={data?.data} />
                                      )
                                    : userData.roles.length > 0 && (
                                          <Box>
                                              <Typography variant={'subtitle2'}>
                                                  {t('role.roles')}
                                              </Typography>
                                              <Typography>
                                                  {userData.roles
                                                      .map(r => roleLabel(r, t))
                                                      .join(', ')}
                                              </Typography>
                                          </Box>
                                      )}
                                <Box>
                                    <SubmitButton
                                        submitting={submitting}
                                        disabled={!formContext.formState.isDirty}>
                                        {t('common.save')}
                                    </SubmitButton>
                                </Box>
                            </Stack>
                        </FormContainer>
                    </Paper>
                ) : userError ? (
                    <ErrorState message={t('user.page.error.load')} onRetry={reloadUser} />
                ) : (
                    <LoadingState />
                )}
            </Stack>
        </Box>
    )
}

export default UserPage

function mapFormToRequest(formData: Form, editRoles: boolean): UpdateAppUserRequest {
    return {
        firstname: formData.firstname,
        lastname: formData.lastname,
        roles: editRoles ? formData.roles : undefined,
    }
}
