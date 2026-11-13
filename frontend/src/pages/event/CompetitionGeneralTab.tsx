import {Fragment} from 'react'
import {Box, Card, List, ListItem, Stack, Typography, useMediaQuery, useTheme} from '@mui/material'
import {Info} from '@mui/icons-material'
import {Trans, useTranslation} from 'react-i18next'
import {format} from 'date-fns'
import {CompetitionDto, EventDto} from '@api/types.gen.ts'
import {AutocompleteOption} from '@utils/types.ts'
import Throbber from '@components/Throbber.tsx'
import {HtmlTooltip} from '@components/HtmlTooltip.tsx'
import CompetitionAndDayAssignment from '@components/event/CompetitionAndDayAssignment.tsx'
import CompetitionTeamCompositionEntry from '@components/event/competition/CompetitionTeamCompositionEntry.tsx'

type Props = {
    event: EventDto
    competition: CompetitionDto
    /** Auswahl aller Tage der Veranstaltung; `undefined`, solange sie lädt oder fehlt. */
    dayOptions: AutocompleteOption[] | undefined
    /** IDs der zugeordneten Tage; `undefined`, solange sie laden oder fehlen. */
    assignedDayIds: string[] | undefined
    daysPending: boolean
    reloadDays: () => void
}

/**
 * Reiter „Allgemein" der Wettkampfseite: Kategorie, Beschreibung, Teamzusammensetzung, Gebühren
 * und Tag-Zuordnung bzw. Challenge-Zeitraum. Inhalt bis zum 13.11.2026 unverändert aus
 * `CompetitionPage.tsx` übernommen.
 */
const CompetitionGeneralTab = ({
    event,
    competition,
    dayOptions,
    assignedDayIds,
    daysPending,
    reloadDays,
}: Props) => {
    const {t} = useTranslation()
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
    const properties = competition.properties

    const withLateRegistration =
        event.lateRegistrationAvailableTo && properties.lateRegistrationAllowed

    const challengeTimespan = properties.challengeConfig
        ? {
              from: properties.challengeConfig.startAt,
              to: properties.challengeConfig.endAt,
          }
        : undefined

    return (
        <>
            {(properties.description || properties.competitionCategory) && (
                <Card
                    sx={{
                        p: 2,
                        mb: 2,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                    }}>
                    {properties.competitionCategory && (
                        <Stack spacing={1} direction={'row'} sx={{alignItems: 'center'}}>
                            <Typography>
                                {t('event.competition.category.category')}:{' '}
                                {properties.competitionCategory.name}
                            </Typography>
                            {properties.competitionCategory.description && !isMobile && (
                                <HtmlTooltip
                                    title={
                                        <Typography>
                                            {properties.competitionCategory.description}
                                        </Typography>
                                    }>
                                    <Info color={'info'} fontSize={'small'} />
                                </HtmlTooltip>
                            )}
                        </Stack>
                    )}
                    {properties.description && <Typography>{properties.description}</Typography>}
                </Card>
            )}
            <Box
                sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 2,
                    [theme.breakpoints.down('md')]: {flexDirection: 'column'},
                }}>
                <Card sx={{p: 2, flex: 1}}>
                    <Typography sx={{mb: 1}} variant="h6" component={'h2'}>
                        {t('event.competition.teamComposition')}
                    </Typography>
                    <List>
                        {properties.namedParticipants.map(np => (
                            <Fragment key={np.id}>
                                <CompetitionTeamCompositionEntry np={np} gender={'male'} />
                                <CompetitionTeamCompositionEntry np={np} gender={'female'} />
                                <CompetitionTeamCompositionEntry np={np} gender={'nonBinary'} />
                                <CompetitionTeamCompositionEntry np={np} gender={'mixed'} />
                            </Fragment>
                        ))}
                    </List>
                </Card>
                {properties.fees.length > 0 && (
                    <Card sx={{p: 2, flex: 1}}>
                        <Typography sx={{mb: 1}} variant="h6" component={'h2'}>
                            {t('event.competition.fee.fees')}
                        </Typography>
                        <List>
                            {properties.fees.map((f, idx) => (
                                <ListItem key={f.id + idx}>
                                    <Box>
                                        <Stack
                                            direction={'row'}
                                            spacing={1}
                                            sx={{alignItems: 'center', mb: 1}}>
                                            <Typography fontWeight={'bold'}>{f.name}</Typography>
                                            {f.description && !isMobile && (
                                                <HtmlTooltip
                                                    title={
                                                        <Typography>{f.description}</Typography>
                                                    }>
                                                    <Info color={'info'} fontSize={'small'} />
                                                </HtmlTooltip>
                                            )}
                                            {!f.required && (
                                                <Typography>
                                                    {t('event.registration.optionalFee')}
                                                </Typography>
                                            )}
                                        </Stack>
                                        {withLateRegistration ? (
                                            <>
                                                <Typography>
                                                    <Trans
                                                        i18nKey={'event.competition.fee.asRegular'}
                                                        values={{amount: f.amount}}
                                                    />
                                                </Typography>
                                                <Typography>
                                                    <Trans
                                                        i18nKey={'event.competition.fee.asLate'}
                                                        values={{amount: f.lateAmount ?? f.amount}}
                                                    />
                                                </Typography>
                                            </>
                                        ) : (
                                            <Typography>{f.amount}€</Typography>
                                        )}
                                    </Box>
                                </ListItem>
                            ))}
                        </List>
                    </Card>
                )}
                {!event.challengeEvent && (
                    <Card sx={{p: 2, flex: 1}}>
                        {(dayOptions && assignedDayIds && (
                            <CompetitionAndDayAssignment
                                entityPathId={competition.id}
                                options={dayOptions}
                                assignedEntities={assignedDayIds}
                                assignEntityLabel={t('event.eventDay.eventDay')}
                                competitionsToDay={false}
                                reloadData={reloadDays}
                            />
                        )) ||
                            (daysPending && <Throbber />)}
                    </Card>
                )}
                {event.challengeEvent && (
                    <Card sx={{p: 2, flex: 1}}>
                        {properties.challengeConfig?.resultConfirmationImageRequired && (
                            <Typography variant={'overline'} gutterBottom>
                                {t('event.competition.challenge.resultConfirmationImageRequired')}
                            </Typography>
                        )}
                        {challengeTimespan && (
                            <Typography>
                                {format(new Date(challengeTimespan.from), t('format.datetime'))} -{' '}
                                {format(new Date(challengeTimespan.to), t('format.datetime'))}
                            </Typography>
                        )}
                    </Card>
                )}
            </Box>
        </>
    )
}

export default CompetitionGeneralTab
