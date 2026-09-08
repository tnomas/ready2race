import {RoleDto} from '@api/types.gen.ts'
import {useTranslation} from 'react-i18next'
import FormInputMultiselect from '@components/form/input/FormInputMultiselect.tsx'
import {roleLabel} from '@authorization/roleLabels.ts'

type Props = {
    availableRoles?: Array<RoleDto>
}

/** Bietet nur Rollen an, die der Angemeldete vergeben darf (Teilmengenregel, vom Backend berechnet). */
const RolesSelect = (props: Props) => {
    const {t} = useTranslation()
    const options = (props.availableRoles ?? [])
        .filter(r => r.assignable && r.job !== 'USER')
        .map(r => ({id: r.id, label: roleLabel(r, t)}))
        .sort((a, b) => a.label.localeCompare(b.label))
    return (
        <FormInputMultiselect name={'roles'} label={t('role.roles')} options={options} showCheckbox showChips fullWidth />
    )
}

export default RolesSelect
