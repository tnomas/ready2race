import {useFeedback, useFetch} from '@utils/hooks.ts'
import {
    getMaterialProviders,
    getRoles,
    getUser,
    setUserMaterialProvider,
    updateUser,
} from '@api/sdk.gen.ts'
import {userRoute} from '@routes'
import {useTranslation} from 'react-i18next'
import {
    Box,
    FormControl,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    Typography,
} from '@mui/material'
import {FormContainer, useForm} from 'react-hook-form-mui'
import {useState} from 'react'
import {ErrorState, LoadingState, PageHeader} from '@components/ui'
import {buildUserTrail} from '@utils/navigation/breadcrumbs.ts'
import {FormInputText} from '@components/form/input/FormInputText.tsx'
import {SubmitButton} from '@components/form/SubmitButton.tsx'
import {useUser} from '@contexts/user/UserContext.ts'
import {
    readMaterialGlobal,
    updateMaterialOwn,
    updateStaffGlobal,
    updateUserGlobal,
} from '@authorization/privileges.ts'
import RolesSelect from '@components/user/RolesSelect.tsx'
import {UpdateAppUserRequest} from '@api/types.gen.ts'
import PendingClubRepresentativeAlert from '@components/user/PendingClubRepresentativeAlert.tsx'
import {roleLabel} from '@authorization/roleLabels.ts'
import {isRequestNetworkError, runRequest} from '@utils/request.ts'

const NO_PROVIDER = ''

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

    // Der Anbieter lebt außerhalb des react-hook-form-Zustands, weil er nicht Teil des
    // UpdateAppUserRequest ist, sondern über einen eigenen Aufruf gespeichert wird.
    const [materialProviderId, setMaterialProviderId] = useState<string>(NO_PROVIDER)
    const [savedMaterialProviderId, setSavedMaterialProviderId] = useState<string>(NO_PROVIDER)

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
                setMaterialProviderId(data.materialProviderId ?? NO_PROVIDER)
                setSavedMaterialProviderId(data.materialProviderId ?? NO_PROVIDER)
            }
        },
        deps: [userId, reloadUserData],
    })

    // Die Rollenauswahl hilft nur, wenn das Speichern auch durchgeht: PUT /user/{id} hängt an
    // UPDATE USER, die Rollenvergabe zusätzlich an UPDATE STAFF. Wer nur eines von beiden trägt
    // (z.B. der Job Wettkampfleitung), bekommt die Auswahl gar nicht erst zu sehen.
    const mayEditRoles =
        user.checkPrivilege(updateStaffGlobal) && user.checkPrivilege(updateUserGlobal)

    // Die Anbieter-Zuordnung vergibt die systemverwaltete Rolle Materialanbieter und folgt deshalb
    // denselben Vergaberegeln: STAFF wie oben, dazu die Material-Rechte der Rolle selbst
    // (Teilmenge); die Anbieterliste verlangt READ MATERIAL GLOBAL.
    const mayAssignProvider =
        mayEditRoles &&
        user.checkPrivilege(readMaterialGlobal) &&
        user.checkPrivilege(updateMaterialOwn)

    const {data: materialProviders} = useFetch(
        signal => getMaterialProviders({signal, query: {limit: 200}}),
        {
            preCondition: () => mayAssignProvider,
        },
    )

    const handleSubmit = async (formData: Form) => {
        const {error} = await runRequest(setSubmitting, () =>
            updateUser({
                path: {userId: userId},
                body: mapFormToRequest(formData, mayEditRoles),
            }),
        )

        const providerChanged = mayAssignProvider && materialProviderId !== savedMaterialProviderId
        const providerResult =
            !error && providerChanged
                ? await runRequest(setSubmitting, () =>
                      setUserMaterialProvider({
                          path: {userId: userId},
                          body: {materialProviderId: materialProviderId || undefined},
                      }),
                  )
                : undefined

        if (isRequestNetworkError(error) || isRequestNetworkError(providerResult?.error)) {
            feedback.error(t('common.error.network'))
        } else if (error) {
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
        } else if (providerResult?.error) {
            // Name und Rollen sind gespeichert, nur die Anbieter-Zuordnung nicht.
            feedback.error(t('user.update.error'))
            setReloadUserData(!reloadUserData)
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
                                {mayAssignProvider && (
                                    <FormControl fullWidth>
                                        <InputLabel id={'material-provider-label'}>
                                            {t('user.materialProvider')}
                                        </InputLabel>
                                        <Select
                                            labelId={'material-provider-label'}
                                            label={t('user.materialProvider')}
                                            value={materialProviderId}
                                            onChange={event =>
                                                setMaterialProviderId(event.target.value as string)
                                            }>
                                            <MenuItem value={NO_PROVIDER}>
                                                {t('user.materialProviderNone')}
                                            </MenuItem>
                                            {materialProviders?.data.map(provider => (
                                                <MenuItem key={provider.id} value={provider.id}>
                                                    {provider.name}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                )}
                                <Box>
                                    <SubmitButton
                                        submitting={submitting}
                                        disabled={
                                            !formContext.formState.isDirty &&
                                            materialProviderId === savedMaterialProviderId
                                        }>
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
