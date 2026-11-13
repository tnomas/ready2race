import {useTranslation} from 'react-i18next'
import {Stack, Tabs, Tab, Box} from '@mui/material'
import {FormContainer, useForm} from 'react-hook-form-mui'
import {FormInputText} from '@components/form/input/FormInputText.tsx'
import FormInputNumber from '@components/form/input/FormInputNumber.tsx'
import FormInputPassword from '@components/form/input/FormInputPassword.tsx'
import {SmtpConfigOverrideDto, smtpStrategy} from '@api/types.gen.ts'
import FormInputEmail from '@components/form/input/FormInputEmail.tsx'
import {SubmitButton} from '@components/form/SubmitButton.tsx'
import {useState} from 'react'
import {setSmtpOverride, getSmtpConfig, deleteSmtpOverride} from '@api/sdk.gen.ts'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import {useConfirmation} from '@contexts/confirmation/ConfirmationContext.ts'
import LoadingButton from '@components/form/LoadingButton.tsx'
import {takeIfNotEmpty} from '@utils/ApiUtils.ts'
import {useUser} from '@contexts/user/UserContext.ts'
import {updateAdministrationConfigGlobal} from '@authorization/privileges.ts'
import {FormInputRadioButtonGroup} from '@components/form/input/FormInputRadioButtonGroup.tsx'
import {ThemeConfigForm} from '@components/administration/ThemeConfigForm.tsx'
import {EmailTemplates} from '@components/administration/emailTemplates/EmailTemplates.tsx'
import {PageHeader} from '@components/ui/PageHeader.tsx'
import {useNavigate} from '@tanstack/react-router'
import {administrationIndexRoute} from '@routes'
import {
    ADMINISTRATION_TABS,
    AdministrationTab,
    DEFAULT_ADMINISTRATION_TAB,
} from '@utils/navigation/searchParams.ts'

type Form = SmtpConfigOverrideDto

const AdministrationPage = () => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const user = useUser()

    const allowedToUpdate = user.checkPrivilege(updateAdministrationConfigGlobal)
    const formContext = useForm<Form>()
    const smtpStrategyArray: smtpStrategy[] = ['SMTP', 'SMTP_TLS', 'SMTPS']
    const smtpStrategyOptions = smtpStrategyArray.map(strategy => ({
        id: strategy,
        label: strategy,
    }))
    const [submitting, setSubmitting] = useState(true)
    const [resetting, setResetting] = useState(true)
    const {confirmAction} = useConfirmation()
    // Der Reiter steht in der Adresse (`?tab=smtp|theme|email-templates`): Neuladen, Zurück und
    // geteilte Links behalten ihn. Unbekannte Werte verwirft schon die Route.
    const {tab} = administrationIndexRoute.useSearch()
    const tabValue: AdministrationTab = tab ?? DEFAULT_ADMINISTRATION_TAB
    const navigate = useNavigate()
    const switchTab = (next: AdministrationTab) =>
        navigate({to: '/administration', search: {tab: next}})
    const tabLabels: Record<AdministrationTab, string> = {
        smtp: t('administration.tabs.smtp'),
        theme: t('administration.tabs.theme'),
        'email-templates': t('administration.tabs.emailTemplates'),
    }

    const currentConfig = useFetch(signal => getSmtpConfig({signal}), {
        onResponse: response => {
            if (response.data) {
                setSubmitting(false)
                setResetting(false)
                formContext.reset({
                    host: response.data.host,
                    port: response.data.port,
                    username: response.data.username,
                    smtpStrategy: response.data.smtpStrategy,
                    fromAddress: response.data.fromAddress,
                    fromName: response.data.fromName ?? '',
                    localhost: response.data.localhost ?? '',
                    replyTo: response.data.replyTo ?? '',
                })
            }
            if (response.error) {
                feedback.error(t('administration.smtp.errors.loading'))
            }
        },
        deps: [],
    })

    const handleSubmit = async (formData: Form) => {
        setSubmitting(true)
        confirmAction(
            async () => {
                const {data, error, response} = await setSmtpOverride({
                    body: {
                        host: formData.host,
                        port: formData.port,
                        username: formData.username,
                        password: formData.password,
                        smtpStrategy: formData.smtpStrategy,
                        fromAddress: formData.fromAddress,
                        fromName: takeIfNotEmpty(formData.fromName),
                        localhost: takeIfNotEmpty(formData.localhost),
                        replyTo: takeIfNotEmpty(formData.replyTo),
                    },
                })
                setSubmitting(false)
                if (response.ok && data !== undefined) {
                    currentConfig.reload()
                } else if (error) {
                    if (error.status.value === 500) {
                        feedback.error(t('common.error.unexpected'))
                    } else {
                        feedback.error(t('administration.smtp.errors.submit'))
                    }
                }
            },
            {
                title: t('common.confirmation.title'),
                content: t('administration.smtp.confirmation.content'),
                okText: t('administration.smtp.submit'),
                cancelText: t('common.cancel'),
                cancelAction: () => setSubmitting(false),
            },
        )
    }

    const handleReset = async () => {
        setResetting(true)
        confirmAction(
            async () => {
                const {error, response} = await deleteSmtpOverride()
                setResetting(false)

                if (response.ok) {
                    currentConfig.reload()
                } else if (error) {
                    if (error.status.value === 500) {
                        feedback.error(t('common.error.unexpected'))
                    } else {
                        feedback.error(t('administration.smtp.errors.submit'))
                    }
                }
            },
            {
                title: t('common.confirmation.title'),
                content: t('administration.smtp.confirmation.content'),
                okText: t('administration.smtp.reset'),
                cancelText: t('common.cancel'),
                cancelAction: () => setResetting(false),
            },
        )
    }

    return (
        currentConfig.data && (
            <Stack spacing={4}>
                <PageHeader title={t('administration.title')} />
                <Tabs
                    value={tabValue}
                    onChange={(_, next: AdministrationTab) => switchTab(next)}
                    variant={'scrollable'}
                    allowScrollButtonsMobile>
                    {ADMINISTRATION_TABS.map(key => (
                        <Tab key={key} value={key} label={tabLabels[key]} />
                    ))}
                </Tabs>

                {tabValue === 'smtp' && (
                    <Box>
                        <FormContainer formContext={formContext} onSuccess={handleSubmit}>
                            <Stack spacing={4} maxWidth="70%">
                                <FormInputText
                                    name={'host'}
                                    label={t('administration.smtp.host')}
                                    required
                                    disabled={!allowedToUpdate}
                                />
                                <FormInputNumber
                                    name={'port'}
                                    label={t('administration.smtp.port')}
                                    required
                                    min={1}
                                    max={65535}
                                    disabled={!allowedToUpdate}
                                />
                                <FormInputText
                                    name={'username'}
                                    label={t('administration.smtp.username')}
                                    required
                                    disabled={!allowedToUpdate}
                                />
                                <FormInputPassword
                                    name={'password'}
                                    label={t('administration.smtp.password')}
                                    required
                                    disabled={!allowedToUpdate}
                                />
                                <FormInputRadioButtonGroup
                                    options={smtpStrategyOptions}
                                    name={'smtpStrategy'}
                                    label={t('administration.smtp.smtpStrategy')}
                                    required
                                    disabled={!allowedToUpdate}
                                />
                                <FormInputEmail
                                    name={'fromAddress'}
                                    label={t('administration.smtp.fromAddress')}
                                    required
                                    disabled={!allowedToUpdate}
                                />
                                <FormInputText
                                    name={'fromName'}
                                    label={t('administration.smtp.fromName')}
                                    disabled={!allowedToUpdate}
                                />
                                <FormInputText
                                    name={'localhost'}
                                    label={t('administration.smtp.localhost')}
                                    disabled={!allowedToUpdate}
                                />
                                <FormInputEmail
                                    name={'replyTo'}
                                    label={t('administration.smtp.replyTo')}
                                    disabled={!allowedToUpdate}
                                />
                                {allowedToUpdate && (
                                    <>
                                        <SubmitButton submitting={submitting}>
                                            {t('administration.smtp.submit')}
                                        </SubmitButton>
                                        <LoadingButton
                                            variant={'outlined'}
                                            pending={resetting}
                                            onClick={handleReset}>
                                            {t('administration.smtp.reset')}
                                        </LoadingButton>
                                    </>
                                )}
                            </Stack>
                        </FormContainer>
                    </Box>
                )}

                {tabValue === 'theme' && (
                    <Box>
                        <ThemeConfigForm />
                    </Box>
                )}

                {tabValue === 'email-templates' && (
                    <Box>
                        <EmailTemplates />
                    </Box>
                )}
            </Stack>
        )
    )
}

export default AdministrationPage
