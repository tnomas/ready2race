import {Alert, Box, Chip, Divider, Paper, Stack, Typography} from '@mui/material'
import {Lock} from '@mui/icons-material'
import {useTranslation} from 'react-i18next'
import {RegistrationSummary, formatAmount} from './eventRegistrationLogic.ts'

/**
 * Prüfansicht vor dem Absenden: wer zu welchem Wettkampf gemeldet ist, was es kostet und welche
 * Personen neu angelegt oder geändert werden.
 */
export const EventRegistrationSummary = ({
    summary,
    showFees,
    showLateFees,
}: {
    summary: RegistrationSummary
    showFees: boolean
    showLateFees: boolean
}) => {
    const {t} = useTranslation()

    return (
        <Stack spacing={2}>
            {summary.competitions.length === 0 ? (
                <Alert severity={'warning'}>{t('event.registration.review.nothingSelected')}</Alert>
            ) : (
                <Paper variant={'outlined'} sx={{p: {xs: 1.5, sm: 2}}}>
                    <Stack spacing={1.5} divider={<Divider flexItem />}>
                        {summary.competitions.map(({competition, kind, entries}) => (
                            <Box key={competition.id}>
                                <Stack
                                    direction={'row'}
                                    spacing={1}
                                    alignItems={'baseline'}
                                    flexWrap={'wrap'}
                                    useFlexGap>
                                    <Typography
                                        variant={'subtitle1'}
                                        component={'h3'}
                                        fontWeight={600}>
                                        {competition.identifier} {competition.name}
                                    </Typography>
                                    <Typography variant={'body2'} color={'text.secondary'}>
                                        {kind === 'single'
                                            ? t('event.registration.review.entriesSingle', {
                                                  count: entries.length,
                                              })
                                            : t('event.registration.review.entriesTeam', {
                                                  count: entries.length,
                                              })}
                                    </Typography>
                                </Stack>
                                <Stack component={'ul'} spacing={0.5} sx={{m: 0, mt: 0.5, pl: 2.5}}>
                                    {entries.map(entry => (
                                        <Box component={'li'} key={entry.key}>
                                            <Stack
                                                direction={'row'}
                                                spacing={1}
                                                alignItems={'center'}
                                                flexWrap={'wrap'}
                                                useFlexGap>
                                                <Typography variant={'body2'}>
                                                    {entry.names.length > 0
                                                        ? entry.names.join(', ')
                                                        : t('event.registration.review.noMembers')}
                                                </Typography>
                                                {entry.optionalFeeLabels.length > 0 && (
                                                    <Typography
                                                        variant={'body2'}
                                                        color={'text.secondary'}>
                                                        + {entry.optionalFeeLabels.join(', ')}
                                                    </Typography>
                                                )}
                                                {entry.locked && (
                                                    <Chip
                                                        size={'small'}
                                                        icon={<Lock fontSize={'small'} />}
                                                        label={t(
                                                            'event.registration.review.locked',
                                                        )}
                                                    />
                                                )}
                                                {entry.late && !entry.locked && (
                                                    <Chip
                                                        size={'small'}
                                                        color={'warning'}
                                                        variant={'outlined'}
                                                        label={t('event.registration.review.late')}
                                                    />
                                                )}
                                                {showFees && !entry.locked && (
                                                    <Typography
                                                        variant={'body2'}
                                                        color={'text.secondary'}
                                                        sx={{ml: 'auto !important'}}>
                                                        {formatAmount(entry.amount)}
                                                    </Typography>
                                                )}
                                            </Stack>
                                        </Box>
                                    ))}
                                </Stack>
                            </Box>
                        ))}
                    </Stack>
                    {showFees && (
                        <>
                            <Divider sx={{my: 1.5}} />
                            <Stack spacing={0.5} alignItems={'flex-end'}>
                                <Typography variant={'body1'} fontWeight={600}>
                                    {t('event.registration.totalFees')}:{' '}
                                    {formatAmount(summary.fees.regular)}
                                </Typography>
                                {showLateFees && (
                                    <Typography variant={'body1'} fontWeight={600}>
                                        {t('event.registration.lateTotalFees')}:{' '}
                                        {formatAmount(summary.fees.late)}
                                    </Typography>
                                )}
                                {summary.lockedEntries > 0 && (
                                    <Typography variant={'caption'} color={'text.secondary'}>
                                        {t('event.registration.review.lockedNotCounted')}
                                    </Typography>
                                )}
                            </Stack>
                        </>
                    )}
                </Paper>
            )}
            {(summary.newParticipants.length > 0 || summary.changedParticipants.length > 0) && (
                <Alert severity={'info'}>
                    {summary.newParticipants.length > 0 && (
                        <Typography variant={'body2'}>
                            {t('event.registration.review.newParticipants', {
                                count: summary.newParticipants.length,
                            })}
                            : {summary.newParticipants.join(', ')}
                        </Typography>
                    )}
                    {summary.changedParticipants.length > 0 && (
                        <Typography variant={'body2'}>
                            {t('event.registration.review.changedParticipants', {
                                count: summary.changedParticipants.length,
                            })}
                            : {summary.changedParticipants.join(', ')}
                        </Typography>
                    )}
                </Alert>
            )}
        </Stack>
    )
}
