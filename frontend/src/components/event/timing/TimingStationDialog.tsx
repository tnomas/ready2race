import {BaseEntityDialogProps} from '@utils/types.ts'
import {
    ApiError,
    TimingCaptureMode,
    TimingStationDto,
    TimingStationRequest,
    TimingStationType,
    uuid,
} from '@api/types.gen.ts'
import EntityDialog from '@components/EntityDialog.tsx'
import {createTimingStation, getTimingStations, updateTimingStation} from '@api/sdk.gen.ts'
import {FormInputText} from '@components/form/input/FormInputText.tsx'
import {FormInputSelect} from '@components/form/input/FormInputSelect.tsx'
import FormInputNumber from '@components/form/input/FormInputNumber.tsx'
import {useForm, useWatch} from 'react-hook-form-mui'
import {useCallback} from 'react'
import {Stack, Typography} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {eventRoute} from '@routes'
import {RequestResult} from '@hey-api/client-fetch'
import {useFetch} from '@utils/hooks.ts'
import {armedGateApplies} from '@utils/timing/armed.ts'

type Form = {
    name: string
    type: TimingStationType
    sorting: number
    /** Nur für ANZEIGE: der gespiegelte START-Posten; '' = jede Startsequenz der Veranstaltung. */
    linkedStation: string
    /** Betriebsart der Erfassung; nur bei SPLIT und FINISH von Bedeutung (siehe `armed.ts`). */
    captureMode: TimingCaptureMode
}

const defaultValues: Form = {
    name: '',
    type: 'START',
    sorting: 0,
    linkedStation: '',
    // ONETOUCH ist die Vorgabe, und das ist keine Geschmacksfrage: Ein neu angelegter Posten, der
    // ungefragt scharf geschaltet werden müsste, wäre am Renntag ein Ausfall.
    captureMode: 'ONETOUCH',
}

/**
 * Hat die Betriebsart an diesem Postentyp überhaupt eine Wirkung?
 *
 * Genau die Frage, die `armedGateApplies` beantwortet — hier hypothetisch gestellt: Stünde der
 * Posten auf ARMED, griffe die Sperre dann? Am Startposten nicht (die Startsequenz gehört
 * ausdrücklich nicht dazu), an einem ANZEIGE-Posten auch nicht (er erfasst nie) — dort wäre eine
 * Betriebsart, die nichts tut, nur irreführend, und die Maske bietet sie gar nicht erst an.
 *
 * Bewusst dieselbe Funktion und keine eigene Typliste: Wandert die Regel je, zieht die Maske mit,
 * statt als dritte Stelle derselben Regel zurückzubleiben.
 */
const captureModeApplies = (type: TimingStationType): boolean => armedGateApplies(type, 'ARMED')

const TimingStationDialog = (props: BaseEntityDialogProps<TimingStationDto>) => {
    const {t} = useTranslation()

    const {eventId} = eventRoute.useParams()

    const typeOptions = [
        {id: 'START', label: t('timing.station.types.START')},
        {id: 'SPLIT', label: t('timing.station.types.SPLIT')},
        {id: 'FINISH', label: t('timing.station.types.FINISH')},
        {id: 'ANZEIGE', label: t('timing.station.types.ANZEIGE')},
    ]

    // Die Verknüpfungs-Ziele eines ANZEIGE-Postens: nur START-Posten derselben Veranstaltung
    // (das erzwingt auch der Server). Bei jedem Öffnen neu geladen — der Dialog ist dauerhaft
    // gemountet, und ein gerade eben angelegter START-Posten muss sofort verknüpfbar sein.
    const {data: stations} = useFetch(signal => getTimingStations({signal, path: {eventId}}), {
        deps: [eventId, props.dialogIsOpen],
    })
    const startStationOptions = [
        {id: '', label: t('timing.station.linkedStation.all')},
        ...(stations ?? [])
            .filter(station => station.type === 'START')
            .map(station => ({id: station.id, label: station.name})),
    ]

    // Both generated error types deviate from the shared ApiError shape (an artifact of the
    // surgical tsp merge for the timing subtree, see Task 1) - the runtime envelope is still
    // the usual ApiError, so we cast to line up with EntityDialog's generic bound.
    const addAction = (formData: Form) =>
        createTimingStation({
            path: {eventId},
            body: mapFormToRequest(formData),
        }) as unknown as RequestResult<uuid, ApiError, false>

    const editAction = (formData: Form, entity: TimingStationDto) =>
        updateTimingStation({
            path: {eventId: entity.event, stationId: entity.id},
            body: mapFormToRequest(formData),
        }) as unknown as RequestResult<void, ApiError, false>

    const formContext = useForm<Form>()

    const type = useWatch({control: formContext.control, name: 'type'})
    const captureModeMatters = captureModeApplies(type)

    const captureModeOptions = [
        {id: 'ONETOUCH', label: t('timing.station.captureMode.ONETOUCH')},
        {id: 'ARMED', label: t('timing.station.captureMode.ARMED')},
    ]

    const onOpen = useCallback(() => {
        formContext.reset(props.entity ? mapDtoToForm(props.entity) : defaultValues)
    }, [props.entity])

    return (
        <EntityDialog
            {...props}
            title={t(props.entity ? 'timing.station.edit' : 'timing.station.add')}
            formContext={formContext}
            onOpen={onOpen}
            addAction={addAction}
            editAction={editAction}>
            <Stack spacing={4}>
                <FormInputText name={'name'} label={t('timing.station.name')} required />
                <FormInputSelect
                    name={'type'}
                    label={t('timing.station.type')}
                    options={typeOptions}
                    required
                    fullWidth
                />
                {/* Die Spiegelung eines ANZEIGE-Postens: welcher START-Posten auf diesem
                    Bildschirm läuft. Leer = jede Startsequenz der Veranstaltung. */}
                {type === 'ANZEIGE' && (
                    <Stack spacing={1}>
                        <FormInputSelect
                            name={'linkedStation'}
                            label={t('timing.station.linkedStation.label')}
                            options={startStationOptions}
                            fullWidth
                        />
                        <Typography variant={'caption'} color={'text.secondary'}>
                            {t('timing.station.linkedStation.hint')}
                        </Typography>
                    </Stack>
                )}
                {/* Die Betriebsart der Erfassung. Ausgeblendet statt gesperrt, wo sie nichts tut:
                    Der Typ steht direkt darüber, das Feld erscheint und verschwindet mit ihm — das
                    ist dieselbe Geste wie beim verknüpften Start-Posten eine Zeile höher, und ein
                    dauerhaft graues Feld mit Erklärung wäre in einer Maske mit vier Feldern mehr
                    Lärm als Auskunft. */}
                {captureModeMatters && (
                    <Stack spacing={1}>
                        <FormInputSelect
                            name={'captureMode'}
                            label={t('timing.station.captureMode.label')}
                            options={captureModeOptions}
                            required
                            fullWidth
                        />
                        <Typography variant={'caption'} color={'text.secondary'}>
                            {t('timing.station.captureMode.hint')}
                        </Typography>
                    </Stack>
                )}
                <FormInputNumber
                    name={'sorting'}
                    label={t('timing.station.sorting')}
                    integer
                    required
                />
            </Stack>
        </EntityDialog>
    )
}

const mapFormToRequest = (formData: Form): TimingStationRequest => ({
    name: formData.name,
    type: formData.type,
    sorting: formData.sorting,
    // Nur ANZEIGE darf eine Verknüpfung tragen (Server-Regel); ein anderer Typ schickt null,
    // damit ein Typwechsel eine alte Verknüpfung nicht unsichtbar stehen lässt.
    linkedStation:
        formData.type === 'ANZEIGE' && formData.linkedStation !== ''
            ? formData.linkedStation
            : null,
    // Immer mitschicken: Ein fehlendes Feld heißt serverseitig „unverändert", die Maske ließe eine
    // Änderung also stillschweigend fallen. Wo die Betriebsart nicht gilt (START, ANZEIGE), steht
    // ONETOUCH — sonst bliebe nach einem Typwechsel ein unsichtbares ARMED am Posten hängen.
    captureMode: captureModeApplies(formData.type) ? formData.captureMode : 'ONETOUCH',
})

const mapDtoToForm = (dto: TimingStationDto): Form => ({
    name: dto.name,
    type: dto.type,
    sorting: dto.sorting,
    linkedStation: dto.linkedStation ?? '',
    captureMode: dto.captureMode,
})

export default TimingStationDialog
