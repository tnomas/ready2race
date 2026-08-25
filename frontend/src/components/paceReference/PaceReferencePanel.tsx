import {useEntityAdministration} from '@utils/hooks.ts'
import {PaceReferenceDto} from '@api/types.gen.ts'
import {useTranslation} from 'react-i18next'
import PaceReferenceTable from '@components/paceReference/PaceReferenceTable.tsx'
import PaceReferenceDialog from '@components/paceReference/PaceReferenceDialog.tsx'

const PaceReferencePanel = () => {
    const {t} = useTranslation()
    const administrationProps = useEntityAdministration<PaceReferenceDto>(
        t('configuration.paceReference.paceReference'),
    )

    return (
        <>
            <PaceReferenceTable
                {...administrationProps.table}
                title={t('configuration.paceReference.paceReferences')}
                hints={[t('configuration.paceReference.tableHint')]}
                id={'paceReferences'}
            />
            <PaceReferenceDialog {...administrationProps.dialog} />
        </>
    )
}

export default PaceReferencePanel
