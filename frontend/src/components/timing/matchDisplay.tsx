import {Chip} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {TimingMatchDto, TimingModeDto} from '@api/types.gen.ts'
import {modeChipParts} from '@utils/timing/matchBoard.ts'

/**
 * Gemeinsame Anzeige-Bausteine der Partie-Boards (Startposten-Startliste und Zielposten-Ansicht):
 * der Zeitnahmetyp-Chip, der Fortschritts-Chip und die Partie-Beschriftung. Hier gebündelt,
 * damit Start und Ziel dieselbe Sprache sprechen.
 */

/** „10:30 · 12 JM4x · Vorlauf 1" — was davon fehlt, wird weggelassen. */
export function matchTitle(match: TimingMatchDto): string {
    const time =
        match.startTime != null
            ? new Date(match.startTime).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
              })
            : null
    const competition = [match.competitionIdentifier, match.competitionName]
        .filter(part => part != null && part !== '')
        .join(' ')
    const round = [match.roundName, match.matchName]
        .filter(part => part != null && part !== '')
        .join(' ')
    return [time, competition, round].filter(part => part != null && part !== '').join(' · ')
}

/** Der Zeitnahmetyp der Partie als Chip: „Timetrial · alle 30 s" bzw. Warn-Chip ohne Typ. */
export const ModeChip = ({mode}: {mode: TimingModeDto | null | undefined}) => {
    const {t} = useTranslation()
    if (mode == null) {
        // Gefüllt, nicht outlined: der outlined-Warn-Chip setzt Beschriftung und Rand in die
        // helle Palette-Warnfarbe und war auf hellem Grund kaum lesbar — gefüllt trägt er
        // dunkle Schrift auf dem Warnton.
        return <Chip size="small" color="warning" label={t('timing.matches.noMode')} />
    }
    const parts = modeChipParts(mode)
    const detail =
        parts.intervalSeconds !== null
            ? t('timing.matches.mode.interval', {seconds: parts.intervalSeconds})
            : t(`timing.matches.mode.${parts.startGrouping}`)
    return <Chip size="small" variant="outlined" label={`${parts.name} · ${detail}`} />
}

const PROGRESS_COLOR = {
    OPEN: 'default',
    STARTING: 'info',
    STARTED: 'primary',
    FINISHED: 'success',
} as const

/** Wo die Partie steht: offen / Startsequenz läuft / gestartet / im Ziel. */
export const ProgressChip = ({progress}: {progress: TimingMatchDto['progress']}) => {
    const {t} = useTranslation()
    return (
        <Chip
            size="small"
            color={PROGRESS_COLOR[progress]}
            label={t(`timing.matches.progress.${progress}`)}
        />
    )
}
