import {Chip} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {OfficialTimeReason} from './officialTimeReason.ts'

/**
 * Der kleine Erklär-Chip für eine fehlende offizielle Zeit („kein Start", „kein Ziel", …) — statt
 * eines leeren Werts, vor dem der Bediener rätselt, warum „nichts passiert".
 *
 * Fehlende Marken sind Normalzustand während des Rennens und bleiben dezent (outlined, neutral);
 * „Start nach Ziel" dagegen heißt, dass die Marken selbst falsch sind — der gefüllte warning-Chip
 * hebt das ab und bleibt dank dunkler Chip-Schrift auf dem Warnton lesbar.
 */
const OfficialTimeReasonChip = ({reason}: {reason: OfficialTimeReason}) => {
    const {t} = useTranslation()
    const broken = reason === 'NEGATIVE_DURATION'
    return (
        <Chip
            size="small"
            variant={broken ? 'filled' : 'outlined'}
            color={broken ? 'warning' : 'default'}
            label={t(`timing.officialTime.reason.${reason}`)}
        />
    )
}

export default OfficialTimeReasonChip
