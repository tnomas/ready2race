import {useState} from 'react'
import {Box, Button, Collapse, Paper, Stack, Typography} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import {useTranslation} from 'react-i18next'
import {format} from 'date-fns'
import {LiveDashboardMatchDto} from '@api/types.gen.ts'
import {LiveDashboardActions} from './LiveDashboardColumns.tsx'
import {openResultTeams} from './common.ts'
import FinishMatchButton from './FinishMatchButton.tsx'

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
    // Lokale Bindung statt Property-Zugriff im JSX unten: nur so bleibt onFinish innerhalb der
    // Closures des Klick-Handlers als "gesetzt" erkennbar (dasselbe Muster wie in
    // LiveDashboardMatchCard, das seine Props ebenfalls destrukturiert entgegennimmt).
    const {onFinish, onResolveClarification} = actions

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
                                        time: format(
                                            new Date(match.clarificationSince),
                                            t('format.time'),
                                        ),
                                    })}
                                </Typography>
                            )}
                            {/*
                                "Lauf beenden" ist hier genau der Knopf der Karte
                                (FinishMatchButton), nicht ein zweiter, einfacherer Beenden-Fluss:
                                bei einem strittigen Lauf darf beenden NICHT weniger Rückfrage
                                kosten als sonst - die Bedenkzeit und die Abfrage offener
                                Ergebnisse (DNS/DNF/DSQ/offen lassen) bleiben deshalb erhalten.
                            */}
                            {onFinish && (
                                <FinishMatchButton
                                    openTeamCount={openResultTeams(match).length}
                                    onFinish={openResults =>
                                        onFinish(match.matchId, openResults)
                                    }
                                />
                            )}
                            {onResolveClarification && (
                                <Button
                                    size="small"
                                    onClick={() => onResolveClarification(match.matchId)}>
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
