import EntityDialog from '@components/EntityDialog.tsx'
import {BaseEntityDialogProps} from '@utils/types.ts'
import {useForm} from 'react-hook-form-mui'
import {useCallback, useEffect, useMemo} from 'react'
import {Box, Checkbox, Chip, FormControlLabel, Stack, Typography} from '@mui/material'
import {FormInputText} from '@components/form/input/FormInputText.tsx'
import {takeIfNotEmpty} from '@utils/ApiUtils.ts'
import {addRole, getJobs, getPrivileges, updateRole} from '@api/sdk.gen.ts'
import {JobDto, RoleDto, RoleRequest} from '@api/types.gen.ts'
import {useTranslation} from 'react-i18next'
import {useFetch} from '@utils/hooks.ts'
import {FormInputSelect} from '@components/form/input/FormInputSelect.tsx'
import {deviationOf, groupPrivileges} from './privilegeGroups.ts'
import {useUser} from '@contexts/user/UserContext.ts'
import {jobName} from '@authorization/roleLabels.ts'

type RoleForm = {
    name: string
    description: string
    job: string
    privileges: string[]
}

const defaultValues: RoleForm = {name: '', description: '', job: '', privileges: []}

const mapDtoToForm = (dto: RoleDto): RoleForm => ({
    name: dto.name,
    description: dto.description ?? '',
    job: dto.job ?? '',
    privileges: dto.privileges.map(p => p.id),
})

const mapFormToRequest = (formData: RoleForm): RoleRequest => ({
    name: formData.name,
    description: takeIfNotEmpty(formData.description),
    privileges: formData.privileges,
    job: formData.job,
})

const addAction = (formData: RoleForm) => addRole({body: mapFormToRequest(formData)})
const editAction = (formData: RoleForm, entity: RoleDto) =>
    updateRole({path: {roleId: entity.id}, body: mapFormToRequest(formData)})

const RoleDialog = (props: BaseEntityDialogProps<RoleDto>) => {
    const {t} = useTranslation()
    const user = useUser()
    const formContext = useForm<RoleForm>()

    const onOpen = useCallback(() => {
        formContext.reset(props.entity ? mapDtoToForm(props.entity) : defaultValues)
    }, [props.entity])

    const {data: privileges} = useFetch(signal => getPrivileges({signal}))
    const {data: jobs} = useFetch(signal => getJobs({signal}))

    const jobKey = formContext.watch('job')
    const selected = formContext.watch('privileges') ?? []
    const job: JobDto | undefined = useMemo(() => jobs?.find(j => j.key === jobKey), [jobs, jobKey])

    // Beim Anlegen: Jobwechsel setzt die Privilegien auf den Job zurück.
    useEffect(() => {
        if (!props.entity && job) {
            formContext.setValue(
                'privileges',
                job.privileges.map(p => p.id),
                {shouldDirty: true},
            )
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [job?.key, props.entity])

    const groups = useMemo(() => groupPrivileges(privileges ?? []), [privileges])
    const deviation = useMemo(() => deviationOf(selected, job), [selected, job])

    const toggle = (id: string) => {
        const next = selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]
        formContext.setValue('privileges', next, {shouldDirty: true})
    }

    // Was der Angemeldete selbst nicht deckt, kann er auch nicht vergeben (Backend prüft ebenfalls).
    const coveredByMe = (p: {action: string; resource: string; scope: string}) => user.checkPrivilege(p as never)

    return (
        <EntityDialog {...props} formContext={formContext} onOpen={onOpen} addAction={addAction} editAction={editAction}>
            <Stack spacing={4}>
                {!props.entity ? (
                    <FormInputSelect
                        name={'job'}
                        label={t('role.copyOf')}
                        required
                        options={(jobs ?? []).map(j => ({id: j.key, label: jobName(j.key, t)}))}
                    />
                ) : (
                    <Typography variant={'body2'}>
                        {t('role.copyOf')}: {props.entity.job ? jobName(props.entity.job, t) : t('role.noTemplate')}
                    </Typography>
                )}
                <FormInputText name={'name'} label={t('role.name')} required />
                <FormInputText name={'description'} label={t('role.description')} />
                <Box>
                    <Typography variant={'subtitle1'}>{t('role.rights')}</Typography>
                    {groups.map(group => (
                        <Box key={group.resource} sx={{mt: 2}}>
                            <Typography variant={'subtitle2'}>{t(`privilege.resource.${group.resource}`)}</Typography>
                            <Stack direction={'row'} flexWrap={'wrap'}>
                                {group.privileges.map(p => {
                                    const checked = selected.includes(p.id)
                                    const added = deviation.added.includes(p.id)
                                    const missing = deviation.missing.includes(p.id)
                                    return (
                                        <Stack key={p.id} direction={'row'} alignItems={'center'} sx={{mr: 2}}>
                                            <FormControlLabel
                                                control={
                                                    <Checkbox
                                                        checked={checked}
                                                        disabled={!coveredByMe(p)}
                                                        onChange={() => toggle(p.id)}
                                                    />
                                                }
                                                label={`${t(`privilege.action.${p.action}`)} · ${t(`privilege.scope.${p.scope}`)}`}
                                            />
                                            {added && <Chip size={'small'} color={'info'} label={t('role.deviation.added')} />}
                                            {missing && <Chip size={'small'} color={'warning'} label={t('role.deviation.missing')} />}
                                        </Stack>
                                    )
                                })}
                            </Stack>
                        </Box>
                    ))}
                </Box>
            </Stack>
        </EntityDialog>
    )
}

export default RoleDialog
