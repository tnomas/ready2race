import {Alert, Button, ButtonBase, Stack, Typography} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import TuneIcon from '@mui/icons-material/Tune'
import {useTranslation} from 'react-i18next'
import {TimingMatchDto} from '@api/types.gen.ts'
import Throbber from '@components/Throbber.tsx'
import {ModeChip, ProgressChip, matchTitle} from '@components/timing/matchDisplay.tsx'

export type MatchStartListProps = {
    matches: TimingMatchDto[]
    matchesLoading: boolean
    matchesError: boolean
    /** Die effektiv gewählte Partie (siehe `resolveStartSelection`), oder undefined ohne offene. */
    selectedId: string | undefined
    onSelect: (matchId: string) => void
    /** Der Ein-Griff-Start: Sequenz aus dem aufgelösten Typ erzeugen und Countdown starten. */
    onStart: (match: TimingMatchDto) => void
    /** Wechsel in das freie Sequenz-Formular (Partien ohne Typ, Sonderfälle). */
    onManualSetup: () => void
    busy: boolean
}

/**
 * Die Startliste des Startpostens: alle Partien der intern gezeiteten Wettkämpfe in
 * Startreihenfolge, die nächste offene vorausgewählt. Der große Knopf unten erzeugt aus dem
 * aufgelösten Zeitnahmetyp die Startsequenz und startet den Countdown — eine Partie nach der
 * anderen, ohne je ein Formular auszufüllen. Antippen wählt eine andere offene Partie
 * (Reihenfolge-Abweichungen am Wasser sind Alltag); gestartete und beendete Partien bleiben
 * sichtbar, damit der Posten seinen Fortschritt im Programm sieht.
 */
const MatchStartList = ({
    matches,
    matchesLoading,
    matchesError,
    selectedId,
    onSelect,
    onStart,
    onManualSetup,
    busy,
}: MatchStartListProps) => {
    const {t} = useTranslation()

    const selected = matches.find(match => match.competitionSetupMatch === selectedId)
    const selectedStartableTeams =
        selected?.teams.filter(team => !team.started).length ?? 0

    if (matchesLoading) {
        return <Throbber />
    }

    return (
        <Stack sx={{flexGrow: 1, width: 1, maxWidth: 640, mx: 'auto', minHeight: 0}} spacing={2}>
            <Typography variant="h5" textAlign="center">
                {t('timing.matches.title')}
            </Typography>
            {matchesError && (
                <Alert severity="error">{t('timing.matches.loadError')}</Alert>
            )}

            <Stack sx={{flexGrow: 1, minHeight: 0, overflowY: 'auto'}} spacing={1}>
                {matches.map(match => {
                    const isSelected = match.competitionSetupMatch === selectedId
                    const selectable = match.progress === 'OPEN'
                    return (
                        <ButtonBase
                            key={match.competitionSetupMatch}
                            onClick={() => {
                                if (selectable) onSelect(match.competitionSetupMatch)
                            }}
                            disabled={!selectable}
                            focusRipple
                            sx={{
                                display: 'block',
                                textAlign: 'left',
                                borderRadius: 2,
                                border: 2,
                                borderColor: isSelected ? 'primary.main' : 'divider',
                                bgcolor: isSelected ? 'action.selected' : 'background.paper',
                                opacity: match.progress === 'FINISHED' ? 0.55 : 1,
                                p: 1.5,
                            }}>
                            <Stack spacing={0.75}>
                                <Stack
                                    direction="row"
                                    spacing={1}
                                    alignItems="center"
                                    flexWrap="wrap"
                                    useFlexGap>
                                    <Typography
                                        variant="body1"
                                        sx={{fontWeight: isSelected ? 700 : 500, flexGrow: 1}}>
                                        {matchTitle(match)}
                                    </Typography>
                                    <ProgressChip progress={match.progress} />
                                </Stack>
                                <Stack
                                    direction="row"
                                    spacing={1}
                                    alignItems="center"
                                    flexWrap="wrap"
                                    useFlexGap>
                                    <ModeChip mode={match.timingMode} />
                                    <Typography variant="caption" color="text.secondary">
                                        {t('timing.matches.boats', {count: match.teams.length})}
                                    </Typography>
                                </Stack>
                                {/* Die Boote der gewählten Partie in Startreihenfolge — genau
                                    das, was der Griff gleich in die Sequenz stellt. */}
                                {isSelected && match.teams.length > 0 && (
                                    <Typography variant="caption" color="text.secondary">
                                        {[...match.teams]
                                            .sort((a, b) => a.startNumber - b.startNumber)
                                            .map(team =>
                                                `#${team.startNumber} ${
                                                    team.teamName ?? team.clubName ?? ''
                                                }`.trim(),
                                            )
                                            .join(' · ')}
                                    </Typography>
                                )}
                            </Stack>
                        </ButtonBase>
                    )
                })}
                {matches.length === 0 && (
                    <Typography variant="body2" color="text.secondary" textAlign="center">
                        {t('timing.matches.empty')}
                    </Typography>
                )}
            </Stack>

            {selected === undefined ? (
                matches.length > 0 && (
                    <Alert severity="success">{t('timing.matches.allStarted')}</Alert>
                )
            ) : selected.timingMode == null ? (
                <Alert severity="warning">{t('timing.matches.noModeHint')}</Alert>
            ) : (
                selectedStartableTeams === 0 && (
                    <Alert severity="warning">{t('timing.matches.noTeamsLeft')}</Alert>
                )
            )}

            <Button
                variant="contained"
                size="large"
                startIcon={<PlayArrowIcon />}
                disabled={
                    busy ||
                    selected === undefined ||
                    selected.timingMode == null ||
                    selectedStartableTeams === 0
                }
                onClick={() => {
                    if (selected !== undefined) onStart(selected)
                }}>
                {selected !== undefined
                    ? t('timing.matches.startSelected', {
                          match: matchTitle(selected),
                      })
                    : t('timing.matches.start')}
            </Button>
            <Button startIcon={<TuneIcon />} onClick={onManualSetup} disabled={busy}>
                {t('timing.matches.manualSetup')}
            </Button>
        </Stack>
    )
}

export default MatchStartList
