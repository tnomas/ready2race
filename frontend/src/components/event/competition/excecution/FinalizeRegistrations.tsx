import {
    Alert,
    AlertTitle,
    Box,
    Button,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {
    finalizeRegistrations,
    getEventMatches,
    getEventMaterialProviders,
    getRegistrationResult,
    getRegistrationsWithoutTeamNumber,
} from '@api/sdk.gen.ts'
import {useState} from 'react'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import {eventRoute} from '@routes'
import * as React from 'react'
import Checkbox from '@mui/material/Checkbox'
import FormInputLabel from '@components/form/input/FormInputLabel.tsx'
import Throbber from '@components/Throbber.tsx'
import ReplayIcon from '@mui/icons-material/Replay'
import DownloadIcon from '@mui/icons-material/Download'
import {HtmlTooltip} from '@components/HtmlTooltip.tsx'
import {Info} from '@mui/icons-material'
import BaseDialog from '@components/BaseDialog.tsx'
import {runDownload} from '@utils/download.ts'
import {isRequestNetworkError, runRequest} from '@utils/request.ts'
import {
    finalizeSwitchState,
    numbersExplanationKey,
    ProviderListState,
    showExistingMatchesHint,
} from './finalizeRegistrationsLogic.ts'

type Props = {
    registrationsFinalized: boolean
    /** Stand der letzten Fixierung: übernimmt die Rundenanlage die Meldungsnummer als Startnummer? */
    teamNumbersAsStartNumbers: boolean
    /**
     * Nach erfolgreicher Fixierung: Die Veranstaltung neu laden, damit ihr gespeicherter Schalter
     * auch nach einem Bereichswechsel stimmt (sonst belegte ein neu eingehängter Block den Haken mit
     * dem Stand von vor der Fixierung vor).
     */
    onFinalized?: () => void
}
const FinalizeRegistrations = ({
    registrationsFinalized,
    teamNumbersAsStartNumbers,
    onFinalized,
}: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const {eventId} = eventRoute.useParams()

    const [finalized, setFinalized] = useState<false | number>(
        registrationsFinalized ? Date.now() : false,
    )

    const [finalizing, setFinalizing] = useState(false)
    // Nach einer Fixierung in dieser Sitzung: sagen, was vergeben wurde und wo es steht.
    const [justFinalized, setJustFinalized] = useState(false)
    // Der Schalter steht nach jeder Fixierung an der Veranstaltung (ADR-0111). Die Seite lädt die
    // Veranstaltung danach nicht neu, deshalb hier mitgeführt.
    const [startNumbersFromTeamNumbers, setStartNumbersFromTeamNumbers] =
        useState(teamNumbersAsStartNumbers)
    const handleFinalizeRegistrations = async (
        keepNumbers: boolean,
        alignMaterialNumbers: boolean,
    ) => {
        if (finalizing) return
        const {error} = await runRequest(setFinalizing, () =>
            finalizeRegistrations({
                path: {eventId},
                query: {
                    keepNumbers: keepNumbers,
                    alignMaterialNumbers: alignMaterialNumbers,
                },
            }),
        )
        if (isRequestNetworkError(error)) {
            feedback.error(t('common.error.network'))
        } else if (error) {
            feedback.error(t('common.error.unexpected'))
        } else {
            feedback.success(t('event.action.finalizeRegistrations.success'))
            setStartNumbersFromTeamNumbers(alignMaterialNumbers)
            setFinalized(Date.now())
            setJustFinalized(true)
            closeDialog()
            onFinalized?.()
        }
    }

    const handleReportDownload = async () => {
        const {downloaded, error} = await runDownload(
            undefined,
            () =>
                getRegistrationResult({
                    path: {eventId},
                    query: {
                        remake: true,
                    },
                }),
            'registration-result.pdf',
        )

        if (isRequestNetworkError(error)) {
            feedback.error(t('common.error.network'))
        } else if (error || !downloaded) {
            feedback.error(t('event.document.download.error'))
        }
    }

    const {data: registrationsWithoutTeamNumber, pending: pendingRegistrationsWithoutTeamNumber} =
        useFetch(signal => getRegistrationsWithoutTeamNumber({signal, path: {eventId}}), {
            onResponse: ({error}) => {
                if (error) {
                    feedback.error(t('common.error.unexpected'))
                }
            },
            deps: [eventId, finalized],
        })

    // Die Startnummern-Angleichung an Bootsnummern ergibt nur Sinn, wenn die Veranstaltung
    // überhaupt Materialanbieter hat. Bis die Liste da ist, wird nicht fixiert: Jede Fixierung
    // schreibt den Schalter, und ein unsichtbarer Haken hätte ihn still abgeschaltet (RS-02).
    const {
        data: materialProviders,
        error: materialProvidersError,
        reload: reloadMaterialProviders,
    } = useFetch(signal => getEventMaterialProviders({signal, path: {eventId}}), {
        deps: [eventId],
    })
    const providerListState: ProviderListState =
        materialProviders !== null
            ? {kind: 'loaded', count: materialProviders.length}
            : materialProvidersError !== null
              ? {kind: 'error'}
              : {kind: 'pending'}
    const openMaterialRequests =
        materialProviders?.reduce((sum, provider) => sum + provider.openRequests, 0) ?? 0

    // Schon angelegte Läufe: Ihre Teams behalten beim Refinalisieren die Meldungsnummer, und die
    // Läufe ihre Regel - der Dialog sagt das nur, wenn es welche gibt.
    const {data: eventMatches} = useFetch(signal => getEventMatches({signal, path: {eventId}}), {
        deps: [eventId, finalized],
    })
    const existingMatchesHint = showExistingMatchesHint(eventMatches?.length ?? null)

    const [dialogIsOpen, setDialogIsOpen] = useState(false)
    const openDialog = () => {
        setDialogIsOpen(true)
    }
    const closeDialog = () => {
        setDialogIsOpen(false)
    }

    const [keepTeamNumbersSelected, setKeepTeamNumbersSelected] = useState(true)
    const handleKeepNumbersChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setKeepTeamNumbersSelected(event.target.checked)
    }

    // Zustand außerhalb des Dialogs, weil die erste Fixierung (ohne Dialog) den Schalter ebenfalls
    // braucht - siehe Button unten. Vorbelegt mit dem gespeicherten Stand: Refinalisieren schreibt
    // ihn neu, ein versehentlich leerer Haken schaltete die Startnummer aus Meldungsnummer ab.
    const [alignMaterialNumbersSelected, setAlignMaterialNumbersSelected] =
        useState(teamNumbersAsStartNumbers)
    const handleAlignMaterialNumbersChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setAlignMaterialNumbersSelected(event.target.checked)
    }

    const switchState = finalizeSwitchState(
        startNumbersFromTeamNumbers,
        alignMaterialNumbersSelected,
        providerListState,
    )
    const finalizeBlocked = switchState.blockedBy !== null

    const alignMaterialNumbersFields = (
        <>
            {switchState.blockedBy === 'error' && (
                <Alert
                    severity={'error'}
                    action={
                        <Button color={'inherit'} size={'small'} onClick={reloadMaterialProviders}>
                            {t('common.reload')}
                        </Button>
                    }>
                    {t('event.action.finalizeRegistrations.material.providersError')}
                </Alert>
            )}
            {switchState.visible && (
                <>
                    <FormInputLabel
                        label={t('event.action.finalizeRegistrations.alignMaterialNumbers')}
                        required={true}
                        horizontal
                        reverse>
                        <Checkbox
                            checked={alignMaterialNumbersSelected}
                            onChange={handleAlignMaterialNumbersChange}
                        />
                    </FormInputLabel>
                    <Alert severity={'info'}>
                        {t(
                            `event.action.finalizeRegistrations.material.${numbersExplanationKey(alignMaterialNumbersSelected)}`,
                        )}
                    </Alert>
                </>
            )}
            {openMaterialRequests > 0 && (
                <Alert severity={'warning'}>
                    {t('event.action.finalizeRegistrations.material.openRequestsHint', {
                        count: openMaterialRequests,
                    })}
                </Alert>
            )}
        </>
    )

    const existingMatchesAlert = existingMatchesHint && (
        <Alert severity={'warning'}>
            {t('event.action.finalizeRegistrations.material.existingMatches')}
        </Alert>
    )

    return (
        <Box>
            <Stack spacing={4}>
                {registrationsWithoutTeamNumber !== null ? (
                    finalized === false ? (
                        <Stack spacing={2} sx={{alignItems: 'start'}}>
                            {alignMaterialNumbersFields}
                            {existingMatchesAlert}
                            <Button
                                variant={'contained'}
                                disabled={finalizeBlocked}
                                onClick={() =>
                                    handleFinalizeRegistrations(false, switchState.send)
                                }>
                                {t('event.action.finalizeRegistrations.finalize')}
                            </Button>
                        </Stack>
                    ) : (
                        <>
                            {registrationsWithoutTeamNumber.length > 0 && (
                                <Alert severity={'warning'}>
                                    <Box sx={{display: 'flex', gap: 1}}>
                                        <AlertTitle>
                                            {t(
                                                'event.action.finalizeRegistrations.newRegistrations.altertTitle',
                                            )}
                                        </AlertTitle>
                                        <HtmlTooltip
                                            placement={'bottom'}
                                            title={
                                                <TableContainer>
                                                    <Table>
                                                        <TableHead>
                                                            <TableRow>
                                                                <TableCell>
                                                                    {t(
                                                                        'event.competition.competition',
                                                                    )}
                                                                </TableCell>
                                                                <TableCell>
                                                                    {t(
                                                                        'event.registration.registration',
                                                                    )}
                                                                </TableCell>
                                                            </TableRow>
                                                        </TableHead>
                                                        <TableBody>
                                                            {registrationsWithoutTeamNumber
                                                                ?.sort((a, b) =>
                                                                    a.competitionIdentifier ===
                                                                    b.competitionIdentifier
                                                                        ? a.registrationClub >
                                                                          b.registrationClub
                                                                            ? -1
                                                                            : 1
                                                                        : a.competitionIdentifier >
                                                                            b.competitionIdentifier
                                                                          ? -1
                                                                          : 1,
                                                                )
                                                                .map(reg => (
                                                                    <TableRow
                                                                        key={reg.registrationId}>
                                                                        <TableCell>
                                                                            {
                                                                                reg.competitionIdentifier
                                                                            }
                                                                        </TableCell>
                                                                        <TableCell>
                                                                            {reg.registrationClub +
                                                                                (reg.registrationName ??
                                                                                    '')}
                                                                        </TableCell>
                                                                    </TableRow>
                                                                ))}
                                                        </TableBody>
                                                    </Table>
                                                </TableContainer>
                                            }>
                                            <Info color={'info'} fontSize={'small'} />
                                        </HtmlTooltip>
                                    </Box>
                                    {t('event.action.finalizeRegistrations.newRegistrations.hint')}
                                </Alert>
                            )}
                            {(switchState.visible || startNumbersFromTeamNumbers) && (
                                <Alert severity={startNumbersFromTeamNumbers ? 'success' : 'info'}>
                                    {startNumbersFromTeamNumbers
                                        ? t('event.action.finalizeRegistrations.material.stateOn')
                                        : t('event.action.finalizeRegistrations.material.stateOff')}
                                </Alert>
                            )}
                            {justFinalized && (
                                <Alert severity={'success'} onClose={() => setJustFinalized(false)}>
                                    {t('event.action.finalizeRegistrations.whereNumbers')}
                                </Alert>
                            )}
                            <Stack spacing={1} sx={{alignItems: 'start'}}>
                                <Button
                                    variant={'contained'}
                                    onClick={handleReportDownload}
                                    startIcon={<DownloadIcon />}
                                    sx={{flex: 1}}>
                                    {t('event.action.registrationsReport.download')}
                                </Button>
                                <Button
                                    variant={'outlined'}
                                    onClick={openDialog}
                                    startIcon={<ReplayIcon />}>
                                    {t(
                                        'event.action.finalizeRegistrations.refinalizeRegistrations',
                                    )}
                                </Button>
                            </Stack>
                            <BaseDialog open={dialogIsOpen} onClose={closeDialog} maxWidth={'xs'}>
                                <DialogTitle>
                                    {t(
                                        'event.action.finalizeRegistrations.refinalizeRegistrations',
                                    )}
                                </DialogTitle>
                                {registrationsWithoutTeamNumber.length > 0 ? (
                                    <>
                                        <DialogContent>
                                            <Stack spacing={2} sx={{m: 2}}>
                                                <FormInputLabel
                                                    label={t(
                                                        'event.action.finalizeRegistrations.keepTeamNumbers.keep',
                                                    )}
                                                    required={true}
                                                    horizontal
                                                    reverse>
                                                    <Checkbox
                                                        checked={keepTeamNumbersSelected}
                                                        onChange={handleKeepNumbersChange}
                                                    />
                                                </FormInputLabel>
                                                <Alert severity={'info'}>
                                                    {t(
                                                        'event.action.finalizeRegistrations.keepTeamNumbers.hint',
                                                    )}
                                                </Alert>
                                                {alignMaterialNumbersFields}
                                                {existingMatchesAlert}
                                            </Stack>
                                        </DialogContent>
                                        <DialogActions>
                                            <Button variant={'outlined'} onClick={closeDialog}>
                                                {t('common.cancel')}
                                            </Button>
                                            <Button
                                                variant={'contained'}
                                                disabled={finalizeBlocked}
                                                onClick={() => {
                                                    void handleFinalizeRegistrations(
                                                        keepTeamNumbersSelected,
                                                        switchState.send,
                                                    )
                                                    setDialogIsOpen(false)
                                                }}>
                                                {t('event.action.finalizeRegistrations.refinalize')}
                                            </Button>
                                        </DialogActions>
                                    </>
                                ) : (
                                    <>
                                        <DialogContent>
                                            <Stack spacing={2} sx={{m: 2}}>
                                                <Alert severity={'info'}>
                                                    {t(
                                                        'event.action.finalizeRegistrations.reshuffle',
                                                    )}
                                                </Alert>
                                                {alignMaterialNumbersFields}
                                                {existingMatchesAlert}
                                            </Stack>
                                        </DialogContent>
                                        <DialogActions>
                                            <Button variant={'outlined'} onClick={closeDialog}>
                                                {t('common.cancel')}
                                            </Button>
                                            <Button
                                                variant={'contained'}
                                                disabled={finalizeBlocked}
                                                onClick={() =>
                                                    void handleFinalizeRegistrations(
                                                        false,
                                                        switchState.send,
                                                    )
                                                }>
                                                {t('event.action.finalizeRegistrations.refinalize')}
                                            </Button>
                                        </DialogActions>
                                    </>
                                )}
                            </BaseDialog>
                        </>
                    )
                ) : (
                    pendingRegistrationsWithoutTeamNumber && <Throbber />
                )}
            </Stack>
        </Box>
    )
}
export default FinalizeRegistrations
