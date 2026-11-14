import {Chip, Stack, Typography} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {MaterialForTeamDto} from '@api/types.gen.ts'
import {materialLabel} from '@components/material/materialLabel.ts'
import {statusTextColor} from '../../../../theme/themeColors.ts'

/**
 * Das zugeteilte Leihboot eines Teams in diesem Lauf, dezent unter dem Verein. Die Durchführung
 * ist Arbeitsfläche: das Boot steht immer da (Modus „always“), eine Abweichung von der
 * Startnummer wird wie auf den übrigen Oberflächen markiert (`materialLabel`, Spec Abschnitt 11).
 * Ohne bestätigte Boots-Anfrage – also mit eigenem Boot – bleibt die Zeile leer statt „eigenes
 * Boot“ an jedes Team zu schreiben.
 */
const ExecutionMaterialNote = ({material}: {material: MaterialForTeamDto | null | undefined}) => {
    const {t} = useTranslation()
    const info = materialLabel(material, 'always')
    if (info === null || info === 'own') return null
    return (
        <Stack direction={'row'} spacing={0.5} alignItems={'center'} flexWrap={'wrap'} useFlexGap>
            <Typography
                variant={'caption'}
                sx={{
                    color: theme =>
                        info.deviates
                            ? statusTextColor(theme, 'warning')
                            : theme.palette.text.secondary,
                    overflowWrap: 'anywhere',
                }}>
                {info.text}
            </Typography>
            {info.deviates && (
                <Chip
                    size={'small'}
                    color={'warning'}
                    label={t('event.competition.execution.match.materialDeviates')}
                    sx={{height: 18, fontSize: '0.65rem'}}
                />
            )}
        </Stack>
    )
}

export default ExecutionMaterialNote
