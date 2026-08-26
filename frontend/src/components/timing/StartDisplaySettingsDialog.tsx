import {Button, DialogActions, DialogContent, DialogTitle, Stack, Typography} from '@mui/material'
import {FormContainer, useForm} from 'react-hook-form-mui'
import {useState} from 'react'
import {useTranslation} from 'react-i18next'
import {getEventTimingConfig, updateEventTimingConfig} from '@api/sdk.gen.ts'
import {
    EventTimingConfigDto,
    EventTimingConfigRequest,
    StartDisplaySettingsDto,
} from '@api/types.gen.ts'
import BaseDialog from '@components/BaseDialog.tsx'
import FormInputNumber from '@components/form/input/FormInputNumber.tsx'
import FormInputSwitch from '@components/form/input/FormInputSwitch.tsx'
import {SubmitButton} from '@components/form/SubmitButton.tsx'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import {
    DEFAULT_START_DISPLAY,
    START_DISPLAY_FOLLOWING_MAX,
    START_DISPLAY_FOLLOWING_MIN,
    START_DISPLAY_SCALE_MAX,
    START_DISPLAY_SCALE_MIN,
    isDefaultStartDisplay,
} from '@utils/timing/startDisplay.ts'

export type StartDisplaySettingsDialogProps = {
    open: boolean
    onClose: () => void
    eventId: string
}

/**
 * Die Einstellungen des Athleten-Startbildschirms — WAS zu jedem Boot angezeigt wird und WIE GROSS
 * —, geöffnet über das Zahnrad auf dem Bildschirm selbst.
 *
 * Bis zum 26.08.2026 standen dieselben Felder in den Zeitnahme-Einstellungen der Veranstaltung.
 * Gewandert ist nur der ORT DER BEDIENUNG, nicht die Zuständigkeit: Gespeichert wird weiterhin an
 * der Veranstaltung (`PUT /timing-config`), und der neue Stand gilt für JEDEN angeschlossenen
 * Bildschirm, nicht nur für den, an dem gerade jemand steht. Es ist eine Einstellung der Regatta,
 * kein Geräte-Vorzug. Der Gewinn ist die Sicht: Wer die Schalter hier umlegt, sieht dahinter
 * sofort, was er tut — der Server verteilt den neuen Stand über `settingsChanged`.
 *
 * Der Umweg über GET und anschließendes PUT ist Absicht und keine Bequemlichkeit: Der Endpunkt
 * schreibt die ganze Zeitnahme-Konfiguration in einem Stück (System, Dateiformate, Abruf-Takte,
 * Genauigkeit). Deshalb wird bei jedem Öffnen der aktuelle Stand geladen und beim Speichern
 * unverändert zurückgeschickt — ersetzt wird ausschließlich der Anzeige-Block. Ein eigener,
 * schmalerer Endpunkt wäre eine Backend-Änderung, und die gehört nicht in diesen Umzug.
 */
const StartDisplaySettingsDialog = ({open, onClose, eventId}: StartDisplaySettingsDialogProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [submitting, setSubmitting] = useState(false)

    const formContext = useForm<StartDisplaySettingsDto>({
        defaultValues: {...DEFAULT_START_DISPLAY},
    })

    // Bei jedem Öffnen frisch: Der Bildschirm hängt an der Wand und steht womöglich seit Stunden
    // offen, während jemand anders die Einstellungen am Rechner verändert hat. Ein alter Stand im
    // Formular würde beim Speichern die fremde Änderung überschreiben.
    const {data: config, pending} = useFetch(
        signal => getEventTimingConfig({signal, path: {eventId}}),
        {
            preCondition: () => open,
            deps: [eventId, open],
            onResponse: ({data, error}) => {
                if (error) {
                    feedback.error(t('common.error.unexpected'))
                } else if (data) {
                    // `null` heißt „nichts gespeichert" — das Formular zeigt dann die eingebauten
                    // Vorgaben, also genau das, was der Bildschirm dahinter gerade anzeigt.
                    formContext.reset(data.startDisplay ?? {...DEFAULT_START_DISPLAY})
                }
            },
        },
    )

    // Dieselben Regeln wie früher im Veranstaltungs-Formular: Die Grenzen erzwingt der Server,
    // hier stehen sie nur, damit der Fehler am Feld erscheint statt erst beim Speichern.
    const scaleRules = {
        required: t('common.form.required'),
        min: {value: START_DISPLAY_SCALE_MIN, message: t('event.timing.startDisplay.scaleInvalid')},
        max: {value: START_DISPLAY_SCALE_MAX, message: t('event.timing.startDisplay.scaleInvalid')},
    }
    // Deutsche Tastaturen tippen „1,5"; Number() macht daraus NaN, und NaN käme als null im
    // Request an — der Bediener sähe „Unerwarteter Fehler" statt eines Hinweises am Feld.
    const scaleTransform = {
        output: (value: {target: {value: string}}) => {
            const raw = value.target.value.replace(',', '.')
            return raw !== '' ? Number(raw) : null
        },
    }

    const onSubmit = async (values: StartDisplaySettingsDto, loaded: EventTimingConfigDto) => {
        const body: EventTimingConfigRequest = {
            // Alles andere geht unverändert zurück, wie es gelesen wurde: Dieser Dialog ist für
            // den Anzeige-Block zuständig und für nichts sonst.
            ...loaded,
            // Ein unangetasteter Block wird wieder zu `null` — so bleibt die Veranstaltung an den
            // eingebauten Vorgaben HÄNGEN statt sie einzufrieren; dieselbe Überlegung wie im
            // Veranstaltungs-Formular (siehe eventTimingConfigForm.ts).
            startDisplay: isDefaultStartDisplay(values) ? null : values,
        }

        setSubmitting(true)
        const {error} = await updateEventTimingConfig({path: {eventId}, body})
        setSubmitting(false)

        if (error) {
            feedback.error(
                error.status.value === 422
                    ? t('event.timing.invalid')
                    : t('common.error.unexpected'),
            )
        } else {
            // Kein Neuladen von Hand: Der Server schickt `settingsChanged`, und der Bildschirm
            // dahinter zeichnet sich neu, noch während der Dialog zufällt.
            feedback.success(t('event.timing.startDisplay.saved'))
            onClose()
        }
    }

    return (
        <BaseDialog open={open} onClose={onClose} maxWidth={'sm'}>
            <DialogTitle>{t('event.timing.startDisplay.title')}</DialogTitle>
            <FormContainer
                FormProps={{style: {display: 'contents'}}}
                formContext={formContext}
                onSuccess={values => {
                    // Ohne geladenen Stand gibt es nichts, worin der Block ersetzt werden könnte;
                    // der Speichern-Knopf ist dann ohnehin gesperrt.
                    if (config !== null) void onSubmit(values, config)
                }}>
                <DialogContent dividers={true}>
                    <Stack spacing={3}>
                        <Typography variant={'body2'} color={'text.secondary'}>
                            {t('event.timing.startDisplay.hint')}
                        </Typography>
                        <Stack spacing={1}>
                            <FormInputSwitch
                                name={'showPosition'}
                                label={t('event.timing.startDisplay.showPosition')}
                                horizontal
                            />
                            <FormInputSwitch
                                name={'showStartNumber'}
                                label={t('event.timing.startDisplay.showStartNumber')}
                                horizontal
                            />
                            <FormInputSwitch
                                name={'showTeamName'}
                                label={t('event.timing.startDisplay.showTeamName')}
                                horizontal
                            />
                            <FormInputSwitch
                                name={'showClubName'}
                                label={t('event.timing.startDisplay.showClubName')}
                                horizontal
                            />
                            <FormInputSwitch
                                name={'showAthleteNames'}
                                label={t('event.timing.startDisplay.showAthleteNames')}
                                horizontal
                            />
                        </Stack>
                        <Typography variant={'body2'} color={'text.secondary'}>
                            {t('event.timing.startDisplay.scaleHint')}
                        </Typography>
                        <Stack spacing={4}>
                            <FormInputNumber
                                name={'clockScale'}
                                label={t('event.timing.startDisplay.clockScale')}
                                rules={scaleRules}
                                transform={scaleTransform}
                            />
                            <FormInputNumber
                                name={'countdownScale'}
                                label={t('event.timing.startDisplay.countdownScale')}
                                rules={scaleRules}
                                transform={scaleTransform}
                            />
                            <FormInputNumber
                                name={'listScale'}
                                label={t('event.timing.startDisplay.listScale')}
                                rules={scaleRules}
                                transform={scaleTransform}
                            />
                            <FormInputNumber
                                name={'followingCount'}
                                label={t('event.timing.startDisplay.followingCount')}
                                integer
                                rules={{
                                    required: t('common.form.required'),
                                    min: {
                                        value: START_DISPLAY_FOLLOWING_MIN,
                                        message: t('event.timing.startDisplay.followingInvalid'),
                                    },
                                    max: {
                                        value: START_DISPLAY_FOLLOWING_MAX,
                                        message: t('event.timing.startDisplay.followingInvalid'),
                                    },
                                }}
                                transform={{
                                    output: value =>
                                        value.target.value !== ''
                                            ? Number(value.target.value)
                                            : null,
                                }}
                            />
                        </Stack>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose} disabled={submitting} className={'cursor-pointer'}>
                        {t('common.cancel')}
                    </Button>
                    <SubmitButton
                        submitting={submitting}
                        disabled={pending || config === null}
                        className={'cursor-pointer'}>
                        {t('common.save')}
                    </SubmitButton>
                </DialogActions>
            </FormContainer>
        </BaseDialog>
    )
}

export default StartDisplaySettingsDialog
