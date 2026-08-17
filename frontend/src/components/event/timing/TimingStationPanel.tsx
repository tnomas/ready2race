import TimingStationTable from '@components/event/timing/TimingStationTable.tsx'
import {useEntityAdministration} from '@utils/hooks.ts'
import {TimingStationDto} from '@api/types.gen.ts'
import TimingStationDialog from '@components/event/timing/TimingStationDialog.tsx'
import {useTranslation} from 'react-i18next'

const TimingStationPanel = () => {
    const {t} = useTranslation()
    const administrationProps = useEntityAdministration<TimingStationDto>(
        t('timing.station.tabTitle'),
    )

    return (
        <>
            <TimingStationTable
                {...administrationProps.table}
                title={t('timing.station.tabTitle')}
            />
            <TimingStationDialog {...administrationProps.dialog} />
        </>
    )
}

export default TimingStationPanel
