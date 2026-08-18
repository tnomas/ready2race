import TimingRaceTypeTable from '@components/event/timing/TimingRaceTypeTable.tsx'
import TimingRaceTypeDialog from '@components/event/timing/TimingRaceTypeDialog.tsx'
import {useEntityAdministration} from '@utils/hooks.ts'
import {TimingRaceTypeDto} from '@api/types.gen.ts'
import {useTranslation} from 'react-i18next'

const TimingRaceTypePanel = () => {
    const {t} = useTranslation()
    const administrationProps = useEntityAdministration<TimingRaceTypeDto>(
        t('timing.raceType.entityName'),
    )

    return (
        <>
            <TimingRaceTypeTable
                {...administrationProps.table}
                title={t('timing.raceType.title')}
            />
            <TimingRaceTypeDialog {...administrationProps.dialog} />
        </>
    )
}

export default TimingRaceTypePanel
