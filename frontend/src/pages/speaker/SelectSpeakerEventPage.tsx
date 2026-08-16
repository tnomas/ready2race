import {Box, Button, Stack, Typography} from '@mui/material'
import {getEvents} from '@api/sdk.gen.ts'
import Throbber from '@components/Throbber.tsx'
import {speakerColors} from '@components/speaker/speakerData.ts'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import {Link} from '@tanstack/react-router'
import {useTranslation} from 'react-i18next'

const SelectSpeakerEventPage = () => {
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
        <Box
            sx={{
                minHeight: '100vh',
                bgcolor: speakerColors.background,
                color: speakerColors.text,
            }}>
            <Stack spacing={2} sx={{maxWidth: 600, mx: 'auto', p: 4}}>
                <Typography variant={'h4'} align={'center'} fontWeight={'bold'}>
                    🎙️ {t('speaker.title')}
                </Typography>
                <Typography align={'center'} sx={{color: speakerColors.textSecondary}}>
                    {t('speaker.selectEvent')}
                </Typography>
                {pending && !data ? (
                    <Throbber />
                ) : (data?.data.length ?? 0) > 0 ? (
                    data?.data
                        .sort((a, b) => (a.name > b.name ? 1 : -1))
                        .map(event => (
                            <Link
                                key={event.id}
                                to={'/speaker/event/$eventId'}
                                params={{eventId: event.id}}
                                style={{width: '100%'}}>
                                <Button
                                    variant={'outlined'}
                                    fullWidth
                                    sx={{
                                        color: speakerColors.text,
                                        borderColor: speakerColors.border,
                                        py: 1.5,
                                        '&:hover': {
                                            borderColor: speakerColors.upcoming,
                                            bgcolor: speakerColors.panel,
                                        },
                                    }}>
                                    {event.name}
                                </Button>
                            </Link>
                        ))
                ) : (
                    <Typography sx={{textAlign: 'center', color: speakerColors.textSecondary}}>
                        {t('results.noEvents')}
                    </Typography>
                )}
            </Stack>
        </Box>
    )
}

export default SelectSpeakerEventPage
