import {Box, Stack, Typography} from '@mui/material'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import {getEvents} from '@api/sdk.gen.ts'
import {useTranslation} from 'react-i18next'
import Throbber from '@components/Throbber.tsx'
import ResultsConfigurationTopBar from '@components/results/ResultsConfigurationTopBar.tsx'
import {ButtonLink} from '@components/ui'

const SelectResultsEventPage = () => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const {data, pending} = useFetch(signal => getEvents({signal}), {
        onResponse: response => {
            if (response.error) {
                feedback.error(t('common.load.error.multiple.short', {entity: t('event.event')}))
            }
        },
        deps: [],
    })

    return (
        <Box>
            <ResultsConfigurationTopBar navigateToHome={true} />
            <Stack spacing={2} sx={{m: 4}}>
                <Typography variant={'h4'} align={'center'}>
                    {t('event.events')}
                </Typography>
                {pending ? (
                    <Throbber />
                ) : (data?.data.length ?? 0) > 0 ? (
                    data?.data
                        .sort((a, b) => (a.name > b.name ? 1 : -1))
                        .map(event => (
                            <ButtonLink
                                key={event.id}
                                to={'/results/event/$eventId'}
                                params={{eventId: event.id}}
                                style={{width: '100%'}}
                                variant={'outlined'}
                                fullWidth>
                                {event.name}
                            </ButtonLink>
                        ))
                ) : (
                    <Typography sx={{textAlign: 'center'}}>{t('results.noEvents')}</Typography>
                )}
            </Stack>
        </Box>
    )
}
export default SelectResultsEventPage
