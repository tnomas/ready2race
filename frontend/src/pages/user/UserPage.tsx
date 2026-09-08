import {useFeedback, useFetch} from '@utils/hooks.ts'
import {getMaterialProviders, getRoles, getUser, setUserMaterialProvider, updateUser} from '@api/sdk.gen.ts'
import {userRoute} from '@routes'
import {useTranslation} from 'react-i18next'
import {Box, FormControl, InputLabel, MenuItem, Paper, Select, Stack, Typography} from '@mui/material'
import {FormContainer, useForm} from 'react-hook-form-mui'
import {useState} from 'react'
import Throbber from '@components/Throbber.tsx'
import {FormInputText} from '@components/form/input/FormInputText.tsx'
import {SubmitButton} from '@components/form/SubmitButton.tsx'
import {useUser} from '@contexts/user/UserContext.ts'
import {updateUserGlobal} from '@authorization/privileges.ts'
import RolesSelect from '@components/user/RolesSelect.tsx'
import {UpdateAppUserRequest} from '@api/types.gen.ts'
import PendingClubRepresentativeAlert from '@components/user/PendingClubRepresentativeAlert.tsx'

type Form = {
    firstname: string
    lastname: string
    roles: string[]
}

const NO_PROVIDER = ''

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
                    setMaterialProviderId(data.materialProviderId ?? NO_PROVIDER)
                    setSavedMaterialProviderId(data.materialProviderId ?? NO_PROVIDER)
                }
            },
            deps: [userId, reloadUserData],
        },
    )

    const {data: materialProviders} = useFetch(
        signal => getMaterialProviders({signal, query: {limit: 200}}),
        {
            preCondition: () => user.checkPrivilege(updateUserGlobal),
        },
    )

    const handleSubmit = async (formData: Form) => {
        setSubmitting(true)
        const {error} = await updateUser({
            path: {userId: userId},
            body: mapFormToRequest(formData, user.checkPrivilege(updateUserGlobal)),
        })

        let providerError = false
        if (
            !error &&
            user.checkPrivilege(updateUserGlobal) &&
            materialProviderId !== savedMaterialProviderId
        ) {
            const {error: providerErrorResult} = await setUserMaterialProvider({
                path: {userId: userId},
                body: {materialProviderId: materialProviderId || undefined},
            })
            providerError = !!providerErrorResult
        }
        setSubmitting(false)

        if (error || providerError) {
            feedback.error(t('user.update.error'))
        } else {
            feedback.success(t('user.update.success'))
            setReloadUserData(!reloadUserData)
        }
    }

    const {data} = useFetch(signal => getRoles({signal}), {
        preCondition: () => user.checkPrivilege(updateUserGlobal), // The backend checks for the privilege READUserGlobal
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
                                {user.checkPrivilege(updateUserGlobal)
                                    ? (data?.data.length ?? 0) > 0 && (
                                          <RolesSelect availableRoles={data?.data} />
                                      )
                                    : userData.roles.length > 0 && (
                                          <Box>
                                              <Typography>{t('role.roles')}</Typography>
                                              <Typography>
                                                  {userData.roles.map(r => r.name).join(', ')}
                                              </Typography>
                                          </Box>
                                      )}
                                {user.checkPrivilege(updateUserGlobal) && (
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
                                <SubmitButton
                                    submitting={submitting}
                                    disabled={
                                        !formContext.formState.isDirty &&
                                        materialProviderId === savedMaterialProviderId
                                    }>
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
