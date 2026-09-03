import {useState} from 'react'
import {useTranslation} from 'react-i18next'
import {
    approveParticipantRequirementForParticipant,
    getParticipantRequirementsForParticipant,
    getParticipantScanScope,
    getParticipantsForEventInApp,
} from '@api/sdk.gen.ts'
import {CheckedParticipantRequirement, ParticipantScanCompetitionDto} from '@api/types.gen.ts'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import {RequirementsChecklist} from '@components/qrApp/RequirementsChecklist'
import {competitionLabel, preselectCompetition} from '@components/qrApp/requirementScope.ts'
import {REQUIREMENT_COMPETITION_KEY} from '@components/qrApp/appMemory.ts'

/**
 * Der zuletzt an dieser Station gewählte Wettkampf. Er überlebt den einzelnen Scan bewusst:
 * an der Waage kommt ein Block derselben Mannschaften nacheinander, und wer für jede Person
 * neu auswählen müsste, wählt irgendwann falsch. Übernommen wird er nur, wenn die neue Person
 * dort auch gemeldet ist - siehe `preselectCompetition`.
 */
const COMPETITION_STORAGE_KEY = REQUIREMENT_COMPETITION_KEY

type Props = {
    eventId: string
    participantId: string
}

export const ParticipantRequirements = ({eventId, participantId}: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const [checkedRequirements, setCheckedRequirements] = useState<CheckedParticipantRequirement[]>([])
    const [participantRoles, setParticipantRoles] = useState<string[]>([])
    const [pending, setPending] = useState(false)
    const [competitions, setCompetitions] = useState<ParticipantScanCompetitionDto[]>([])
    const [todayEventDayId, setTodayEventDayId] = useState<string | null>(null)
    const [competitionId, setCompetitionId] = useState<string | null>(null)

    const selectCompetition = (id: string | null) => {
        setCompetitionId(id)
        if (id !== null) {
            localStorage.setItem(COMPETITION_STORAGE_KEY, id)
        }
    }

    const loadChecked = async () => {
        const {data} = await getParticipantsForEventInApp({path: {eventId}})
        if (!data) {
            feedback.error(t('common.load.error.multiple.short', {entity: t('event.participants')}))
            return
        }
        const participant = data.data.find(p => p.id === participantId)
        setCheckedRequirements(
            Array.isArray(participant?.participantRequirementsChecked)
                ? participant.participantRequirementsChecked
                : [],
        )
        setParticipantRoles(participant?.namedParticipantIds ?? [])
    }

    const {data: requirements} = useFetch(
        signal => {
            setPending(true)
            return getParticipantRequirementsForParticipant({
                signal,
                path: {eventId, participantId},
                query: {onlyForApp: true},
            })
        },
        {
            onResponse: async ({error}) => {
                if (error) {
                    feedback.error(
                        t('common.load.error.multiple.short', {
                            entity: t('participantRequirement.participantRequirements'),
                        }),
                    )
                } else {
                    await loadChecked()
                }
                setPending(false)
            },
            deps: [eventId, participantId],
        },
    )

    // Getrennt vom Bedingungs-Aufruf: dieser hier liefert den Rahmen (heutiger Wettkampftag,
    // Wettkämpfe dieser Person), der nur für wettkampf- und tagesbezogene Bedingungen zählt.
    useFetch(signal => getParticipantScanScope({signal, path: {eventId, participantId}}), {
        onResponse: ({data, error}) => {
            if (error || !data) {
                feedback.error(
                    t('common.load.error.multiple.short', {
                        entity: t('event.competition.competitions'),
                    }),
                )
                setCompetitions([])
                setTodayEventDayId(null)
                setCompetitionId(null)
                return
            }
            setTodayEventDayId(data.todayEventDayId ?? null)
            setCompetitions(data.competitions)
            // Bewusst nicht über selectCompetition: eine Vorbelegung ist keine Wahl und
            // darf den gemerkten Wettkampf der Station nicht überschreiben.
            setCompetitionId(
                preselectCompetition(localStorage.getItem(COMPETITION_STORAGE_KEY), data.competitions),
            )
        },
        deps: [eventId, participantId],
    })

    const handleRequirementChange = async (
        requirementId: string,
        checked: boolean | string,
        namedParticipantId?: string,
    ) => {
        setPending(true)
        // Der Wettkampf gehört nur an eine Bedingung, die je Wettkampf gilt. Bei allen anderen
        // bliebe er sonst als Einschränkung in der Zeile stehen, die niemand gewollt hat.
        const requirement = (requirements ?? []).find(r => r.id === requirementId)
        const {error} = await approveParticipantRequirementForParticipant({
            path: {eventId},
            // Bewusst der additive Einzel-Endpunkt: der Ersetzen-Endpunkt (approve) erwartet den
            // kompletten Zustand und würde alle nicht mitgeschickten Bestätigungen löschen.
            body: {
                requirementId,
                participantId,
                approved: checked !== false,
                note: typeof checked === 'string' ? checked : undefined,
                namedParticipantId,
                competitionId: requirement?.perCompetition ? (competitionId ?? undefined) : undefined,
            },
        })
        // Die Antwort wurde bis hierher gar nicht ausgewertet: Ein abgelehnter Aufruf sah an der
        // Waage genauso aus wie ein angenommener - der Knopf blieb einfach stehen. Die
        // Rückmeldung nennt deshalb auch den Rahmen, für den gerade abgehakt wurde; an einer
        // Bedingung je Wettkampf ist "gespeichert" allein zu wenig.
        if (error) {
            feedback.error(t('qrParticipant.status.error'))
            setPending(false)
            return
        }
        const chosenCompetition = competitions.find(c => c.id === competitionId)
        const scopeSuffix =
            requirement?.perCompetition && chosenCompetition
                ? competitionLabel(chosenCompetition)
                : undefined
        feedback.success(
            checked === false
                ? t('qrParticipant.status.revoked', {name: requirement?.name ?? ''})
                : t('qrParticipant.status.approved', {
                      name: requirement?.name ?? '',
                      scope: scopeSuffix ? ` — ${scopeSuffix}` : '',
                  }),
        )
        await loadChecked()
        setPending(false)
    }

    return (
        <RequirementsChecklist
            requirements={requirements ?? []}
            checkedRequirements={checkedRequirements}
            pending={pending}
            onRequirementChange={handleRequirementChange}
            namedParticipantIds={participantRoles}
            competitions={competitions}
            competitionId={competitionId}
            onCompetitionChange={selectCompetition}
            todayEventDayId={todayEventDayId}
        />
    )
}
