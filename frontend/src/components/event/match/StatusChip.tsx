import {Chip} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {MatchChip} from '@components/event/match/matchStatusChip.ts'
import {HtmlTooltip} from '@components/HtmlTooltip.tsx'

/**
 * Ein [MatchChip] als MUI-Chip. Welcher Chip es ist, entscheidet ausschließlich
 * `matchStatusChip.ts` — hier wird nur noch übersetzt und gemalt.
 *
 * Bewusst geteilt zwischen Durchführungsseite und öffentlicher Ergebnisanzeige: derselbe Zustand
 * soll nicht nur dasselbe Wort, sondern auch dieselbe Farbe und dieselbe Form haben.
 *
 * Trägt der Chip einen [MatchChip.tooltip] (heute nur die Klärung mit ihrem Grund), umschließt ihn
 * ein [HtmlTooltip] — dieselbe Tooltip-Form wie überall sonst in der Anwendung. Der Chip bekommt
 * dafür eine eigene Umhüllung: MUIs Tooltip braucht ein Element, das ref und Maus-Ereignisse
 * annimmt, und die Umhüllung ist zugleich die Stelle, an der der Zeiger zum Fragezeichen wird.
 */
const StatusChip = ({chip}: {chip: MatchChip | null}) => {
    const {t} = useTranslation()
    // Der Schlüssel steht erst zur Laufzeit fest, deshalb die gelockerte Signatur - dasselbe
    // Muster wie `stateChipProps` in EventSchedule.tsx.
    const translate = t as (key: string, values?: Record<string, string | number>) => string
    // null heißt "dieser Chip sagt hier nichts aus" (z.B. der Arena-Chip ohne erhobene
    // Check-in-Daten) - dann gar nichts zeigen, statt eine leere Hülle.
    if (!chip) return null
    const element = (
        <Chip
            size={'small'}
            label={translate(chip.labelKey, chip.values)}
            color={chip.color}
            sx={chip.strikeThrough ? {textDecoration: 'line-through'} : undefined}
        />
    )
    // Leerer Grund zählt wie keiner: ein Tooltip, der ein leeres Kästchen aufzieht, ist schlechter
    // als gar keiner.
    if (!chip.tooltip) return element
    return (
        <HtmlTooltip title={chip.tooltip} placement={'bottom'}>
            <span style={{display: 'inline-flex', cursor: 'help'}}>{element}</span>
        </HtmlTooltip>
    )
}

export default StatusChip
