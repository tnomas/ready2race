import {useState} from 'react'
import {Box, Button, Collapse, Paper, Stack, Typography} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import {useTranslation} from 'react-i18next'
import {LiveDashboardMatchDto} from '@api/types.gen.ts'
import {LiveDashboardActions} from './LiveDashboardColumns.tsx'

/**
 * Läufe, gegen die ein Einspruch läuft — bewusst als Sammelzeile statt als Karten.
 *
 * In voller Kartenhöhe zwischen den laufenden Rennen wäre ein strittiger Lauf genau das, was
 * dieser Zustand abschaffen soll: etwas, das den Blick festhält, obwohl nichts mehr passiert.
 * Boote, Bedingungen und Crew stehen deshalb nicht hier — wer sie braucht, findet den Lauf in der
 * Gesamtliste rechts, wo er an seiner chronologischen Stelle mit dem Klärungs-Chip steht.
 */
const ClarificationSection = ({
    matches,
    actions,
}: {
    matches: LiveDashboardMatchDto[]
    actions: LiveDashboardActions
}) => {
    const {t} = useTranslation()
    const [open, setOpen] = useState(false)

    if (matches.length === 0) return null

    return (
        <Paper variant="outlined" sx={{p: 1}}>
            <Button
                fullWidth
                onClick={() => setOpen(o => !o)}
                endIcon={
                    <ExpandMoreIcon
                        sx={{transform: open ? 'rotate(180deg)' : 'none', transition: '0.2s'}}
                    />
                }
                sx={{justifyContent: 'space-between'}}>
                {t('event.liveDashboard.clarification.sectionTitle', {n: matches.length})}
            </Button>
            <Collapse in={open}>
                <Stack spacing={1} sx={{pt: 1}}>
                    {matches.map(match => (
                        <Box
                            key={match.matchId}
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                                flexWrap: 'wrap',
                            }}>
                            <Typography variant="body2" sx={{fontWeight: 600}}>
                                {[match.matchName, match.competitionShortName ?? match.competitionName]
                                    .filter(Boolean)
                                    .join(' · ')}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{flex: 1}}>
                                {match.clarificationReason}
                            </Typography>
                            {match.clarificationSince && (
                                <Typography variant="caption" color="text.secondary">
                                    {t('event.liveDashboard.clarification.since', {
                                        time: match.clarificationSince.slice(11, 16),
                                    })}
                                </Typography>
                            )}
                            {/*
                                "Lauf beenden" folgt dem bestehenden Beenden-Weg (onFinish nimmt
                                openResults), hier aber ohne den Bedenkzeit-Ablauf der Karte
                                (FinishMatchButton): die Zeile ist eine Sammelzeile, kein zweiter
                                voller Beenden-Fluss. Offene Ergebnisse bleiben dabei offen (null) -
                                wer das differenzierter braucht, findet den Lauf mit der vollen
                                Karte in der Gesamtliste.
                            */}
                            {actions.onFinish && (
                                <Button
                                    size="small"
                                    onClick={() => actions.onFinish?.(match.matchId, null)}>
                                    {t('event.liveDashboard.control.finish')}
                                </Button>
                            )}
                            {actions.onResolveClarification && (
                                <Button
                                    size="small"
                                    onClick={() =>
                                        actions.onResolveClarification?.(match.matchId)
                                    }>
                                    {t('event.liveDashboard.clarification.resolve')}
                                </Button>
                            )}
                        </Box>
                    ))}
                </Stack>
            </Collapse>
        </Paper>
    )
}

export default ClarificationSection
