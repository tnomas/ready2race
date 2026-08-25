import {useMemo, useState} from 'react'
import {
    Alert,
    Box,
    Button,
    Checkbox,
    FormControlLabel,
    Stack,
    TextField,
    Typography,
} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {
    getCompetition,
    getCompetitionTimingStations,
    getTimingStations,
    setCompetitionTimingStations,
} from '@api/sdk.gen.ts'
import {TimingStationDto} from '@api/types.gen.ts'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import Throbber from '@components/Throbber.tsx'

type Props = {
    eventId: string
    competitionId: string
}

/** Angehakt heißt: Der Posten steht auf dieser Strecke. Der Wert ist der Meter als Rohtext. */
type Meters = Record<string, string>

const isValidMeters = (value: string) => /^\d+$/.test(value.trim())

/**
 * Wo die Posten der Veranstaltung auf der Strecke DIESES Wettkampfs stehen.
 *
 * Der Posten selbst gehört der Veranstaltung — er ist eine Person mit einem Tablet und wird in
 * deren Einstellungen gepflegt. Nur der Meter gehört dem Wettkampf, weil derselbe Posten für die
 * Langstrecke bei 3000 m und für den Sprint bei 250 m steht.
 *
 * Ein Speichern-Knopf für die ganze Liste und nicht je Zeile: Der Endpunkt ist ein PUT über die
 * ganze Liste (was fehlt, wird gelöscht), und die Oberfläche denkt genauso.
 */
const CompetitionTimingStations = ({eventId, competitionId}: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [meters, setMeters] = useState<Meters>({})
    const [submitting, setSubmitting] = useState(false)

    const {data: stationsData, pending: stationsPending} = useFetch(
        signal => getTimingStations({signal, path: {eventId}}),
        {
            onResponse: ({error}) => {
                if (error) feedback.error(t('common.error.unexpected'))
            },
            deps: [eventId],
        },
    )

    const {
        data: assignedData,
        pending: assignedPending,
        reload: reloadAssigned,
    } = useFetch(signal => getCompetitionTimingStations({signal, path: {eventId, competitionId}}), {
        onResponse: ({data, error}) => {
            if (error) {
                feedback.error(t('common.error.unexpected'))
            } else if (data) {
                setMeters(
                    Object.fromEntries(
                        data.map(station => [
                            station.timingStation,
                            String(station.distanceMeters),
                        ]),
                    ),
                )
            }
        },
        deps: [eventId, competitionId],
    })

    // Die Gesamtdistanz trägt der Wettkampf selbst; sie ist optional und dient hier nur der
    // Warnung „Meter über der Gesamtdistanz".
    const {data: competitionData} = useFetch(
        signal => getCompetition({signal, path: {eventId, competitionId}}),
        {
            onResponse: ({error}) => {
                if (error) feedback.error(t('common.error.unexpected'))
            },
            deps: [eventId, competitionId],
        },
    )
    const totalDistance = competitionData?.properties.distanceMeters ?? null

    /**
     * Die Anzeigereihenfolge: erst die gesetzten Posten nach Distanz (so liefert sie der Server),
     * dann die übrigen nach ihrer Leitstand-Sortierung. Bewusst am GELADENEN Stand festgemacht —
     * eine Zeile, die beim Tippen unter den Fingern wegspringt, wäre unbrauchbar; die neue
     * Reihenfolge kommt mit dem nächsten Laden.
     */
    const orderedStations: TimingStationDto[] = useMemo(() => {
        const stations = stationsData ?? []
        const assignedOrder = (assignedData ?? []).map(station => station.timingStation)
        const assigned = assignedOrder
            .map(id => stations.find(station => station.id === id))
            .filter((station): station is TimingStationDto => station !== undefined)
        const rest = stations
            .filter(station => !assignedOrder.includes(station.id))
            .sort((a, b) => a.sorting - b.sorting || a.name.localeCompare(b.name))
        return [...assigned, ...rest]
    }, [stationsData, assignedData])

    const toggle = (stationId: string, checked: boolean) => {
        setMeters(prev => {
            const next = {...prev}
            if (checked) {
                next[stationId] = ''
            } else {
                delete next[stationId]
            }
            return next
        })
    }

    const checkedEntries = Object.entries(meters)
    const validValues = checkedEntries
        .filter(([, value]) => isValidMeters(value))
        .map(([, value]) => Number(value))

    const missingDistance = checkedEntries.some(([, value]) => !isValidMeters(value))
    const overTotalDistance =
        totalDistance !== null && validValues.some(value => value > totalDistance)
    const duplicateDistance = new Set(validValues).size !== validValues.length

    const save = async () => {
        setSubmitting(true)
        const {error} = await setCompetitionTimingStations({
            path: {eventId, competitionId},
            body: {
                stations: checkedEntries.map(([timingStation, value]) => ({
                    timingStation,
                    distanceMeters: Number(value),
                })),
            },
        })
        setSubmitting(false)

        if (error) {
            feedback.error(t('common.error.unexpected'))
        } else {
            feedback.success(t('event.competition.timing.stations.saved'))
            reloadAssigned()
        }
    }

    if (stationsPending || assignedPending) {
        return <Throbber />
    }

    return (
        <Box>
            <Typography variant={'h3'} gutterBottom>
                {t('event.competition.timing.stations.title')}
            </Typography>
            <Typography variant={'body2'} color={'text.secondary'} sx={{mb: 2}}>
                {t('event.competition.timing.stations.hint')}
            </Typography>

            {orderedStations.length === 0 ? (
                <Typography variant={'body2'} color={'text.secondary'}>
                    {t('event.competition.timing.stations.noStations')}
                </Typography>
            ) : (
                <Stack spacing={2}>
                    <Stack spacing={1}>
                        {orderedStations.map(station => {
                            const value = meters[station.id]
                            const checked = value !== undefined
                            return (
                                <Stack
                                    key={station.id}
                                    direction={'row'}
                                    spacing={2}
                                    alignItems={'center'}>
                                    <FormControlLabel
                                        className={'cursor-pointer'}
                                        sx={{minWidth: 260}}
                                        control={
                                            <Checkbox
                                                className={'cursor-pointer'}
                                                checked={checked}
                                                onChange={event =>
                                                    toggle(station.id, event.target.checked)
                                                }
                                            />
                                        }
                                        label={`${station.name} (${t(`timing.station.types.${station.type}`)})`}
                                    />
                                    <TextField
                                        size={'small'}
                                        type={'number'}
                                        sx={{width: 160}}
                                        disabled={!checked}
                                        value={value ?? ''}
                                        onChange={event =>
                                            setMeters(prev => ({
                                                ...prev,
                                                [station.id]: event.target.value,
                                            }))
                                        }
                                        label={t('event.competition.timing.stations.distance')}
                                        slotProps={{htmlInput: {min: 0, step: 1}}}
                                    />
                                </Stack>
                            )
                        })}
                    </Stack>

                    {missingDistance && (
                        <Alert severity={'warning'}>
                            {t('event.competition.timing.stations.warning.missingDistance')}
                        </Alert>
                    )}
                    {/* Keine Sperre: Die Gesamtdistanz ist optional, und ein Posten genau am Ziel
                        ist legitim - gewarnt wird nur, was darüber hinausgeht. */}
                    {overTotalDistance && (
                        <Alert severity={'warning'}>
                            {t('event.competition.timing.stations.warning.overDistance', {
                                distance: totalDistance,
                            })}
                        </Alert>
                    )}
                    {duplicateDistance && (
                        <Alert severity={'warning'}>
                            {t('event.competition.timing.stations.warning.duplicateDistance')}
                        </Alert>
                    )}

                    <Box>
                        <Button
                            className={'cursor-pointer'}
                            variant={'contained'}
                            disabled={submitting || missingDistance}
                            onClick={() => void save()}>
                            {t('common.save')}
                        </Button>
                    </Box>
                </Stack>
            )}
        </Box>
    )
}

export default CompetitionTimingStations
