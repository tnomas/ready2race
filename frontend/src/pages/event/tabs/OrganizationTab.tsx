import {Stack} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {AppUserWithQrCodeDto, TaskDto} from '@api/types.gen.ts'
import {useEntityAdministration} from '@utils/hooks.ts'
import AppUserWithQrCodeTable from '@components/event/appUser/AppUserWithQrCodeTable.tsx'
import TaskTable from '@components/event/task/TaskTable.tsx'
import TaskDialog from '@components/event/task/TaskDialog.tsx'
import {Shiftplan} from '@components/event/shiftplan/Shiftplan.tsx'

type Props = {
    eventId: string
}

/**
 * Bereich „Team & Helfer": Helfer:innen mit QR-Code, Aufgaben, Schichtplan. Eigene Datei, damit
 * der Kalender des Schichtplans (samt Drag-and-drop) erst mit diesem Bereich geladen wird.
 */
const OrganizationTab = ({eventId}: Props) => {
    const {t} = useTranslation()
    const taskProps = useEntityAdministration<TaskDto>(t('task.task'))
    const appUserWithQrCodeProps = useEntityAdministration<AppUserWithQrCodeDto>(
        t('qrCode.appUsersWithQrCode'),
        {entityCreate: false, entityUpdate: false},
    )

    return (
        <Stack spacing={2}>
            <AppUserWithQrCodeTable
                {...appUserWithQrCodeProps.table}
                title={t('qrCode.appUsersWithQrCode')}
            />
            <TaskTable {...taskProps.table} title={t('task.tasks')} />
            <TaskDialog {...taskProps.dialog} eventId={eventId} />
            <Shiftplan />
        </Stack>
    )
}

export default OrganizationTab
