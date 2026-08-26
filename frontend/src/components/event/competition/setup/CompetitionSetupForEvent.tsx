import {competitionRoute, eventRoute} from '@routes'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import {useState} from 'react'
import {useForm} from 'react-hook-form-mui'
import {getCompetitionSetup, getTimingRaceTypes, updateCompetitionSetup} from '@api/sdk.gen.ts'
import {
    CompetitionSetupForm,
    mapCompetitionSetupDtoToForm,
    mapFormToCompetitionSetupDto,
} from '@components/event/competition/setup/common.ts'
import CompetitionSetup from '@components/event/competition/setup/CompetitionSetup.tsx'
import {useTranslation} from 'react-i18next'

const CompetitionSetupForEvent = () => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [submitting, setSubmitting] = useState(false)

    const {eventId} = eventRoute.useParams()
    const {competitionId} = competitionRoute.useParams()

    const [reloadData, setReloadData] = useState(false)

    const formContext = useForm<CompetitionSetupForm>()

    // The race types a round may be assigned to. The leading empty entry is what "no race type" looks
    // like in a select - without it a round could never be un-assigned again.
    const {data: raceTypes} = useFetch(signal => getTimingRaceTypes({signal, path: {eventId}}), {
        deps: [eventId],
    })
    const raceTypeOptions = [
        {id: '', label: t('event.competition.setup.round.timingRaceTypeNone')},
        ...(raceTypes?.map(raceType => ({id: raceType.id, label: raceType.name})) ?? []),
    ]

    useFetch(
        signal =>
            getCompetitionSetup({signal, path: {eventId: eventId, competitionId: competitionId}}),
        {
            onResponse: ({data}) => {
                if (data) {
                    formContext.reset(mapCompetitionSetupDtoToForm(data))
                } else {
                    feedback.error(
                        t('common.load.error.multiple.short', {
                            entity: t('event.competition.setup.setup'),
                        }),
                    )
                }
            },
            deps: [eventId, competitionId, reloadData],
        },
    )

    const handleSubmit = async (formData: CompetitionSetupForm) => {
        setSubmitting(true)
        const {error} = await updateCompetitionSetup({
            path: {eventId: eventId, competitionId: competitionId},
            body: mapFormToCompetitionSetupDto(formData),
        })
        setSubmitting(false)

        if (error) {
            feedback.error(t('event.competition.setup.save.error'))
        } else {
            feedback.success(t('event.competition.setup.save.success'))
        }
        setReloadData(!reloadData)
    }

    return (
        <CompetitionSetup
            formContext={formContext}
            handleFormSubmission={true}
            handleSubmit={handleSubmit}
            submitting={submitting}
            raceTypeOptions={raceTypeOptions}
        />
    )
}

export default CompetitionSetupForEvent
