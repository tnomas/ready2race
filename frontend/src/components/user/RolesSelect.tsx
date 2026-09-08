import {RoleDto} from '@api/types.gen.ts'
import {useTranslation} from 'react-i18next'
import FormInputMultiselect from '@components/form/input/FormInputMultiselect.tsx'
import {roleLabel} from '@authorization/roleLabels.ts'

type Props = {
    availableRoles?: Array<RoleDto>
}

/**
 * Bietet nur Rollen an, die der Angemeldete vergeben darf (Teilmengenregel, vom Backend berechnet).
 * USER und Vereinsvertreter fallen raus: beide hängen am Konto selbst und nicht an einer Vergabe -
 * der Server ignoriert sie stillschweigend, die Auswahl würde also nur ins Leere laufen.
 */
const RolesSelect = (props: Props) => {
    const {t} = useTranslation()
    const selectable = (props.availableRoles ?? []).filter(
        r => r.job !== 'USER' && r.job !== 'CLUB_REPRESENTATIVE',
    )
    const options = selectable
        .filter(r => r.assignable)
        .map(r => ({id: r.id, label: roleLabel(r, t)}))
        .sort((a, b) => a.label.localeCompare(b.label))
    // Der Hinweis erklärt die Lücke - aber nur, wenn es wirklich eine gibt.
    const hidden = selectable.length > options.length
    return (
        <FormInputMultiselect
            name={'roles'}
            label={t('role.roles')}
            options={options}
            helperText={hidden ? t('role.notAssignable') : undefined}
            showCheckbox
            showChips
            fullWidth
        />
    )
}

export default RolesSelect
