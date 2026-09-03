import {useCallback, useEffect} from 'react'
import {useNavigate} from '@tanstack/react-router'
import {useTranslation} from 'react-i18next'
import {checkQrCode} from '@api/sdk.gen.ts'
import {useFetch} from '@utils/hooks.ts'
import Throbber from '@components/Throbber.tsx'
import AppHeader from '@components/qrApp/AppHeader.tsx'
import AppColumn from '@components/qrApp/AppColumn.tsx'
import {useAppSession} from '@contexts/app/AppSessionContext.tsx'
import {bandTypeOf, decideScan, StaffQrCodeResponse} from '@components/qrApp/scanDecision.ts'
import {AssignBand} from '@components/qrApp/result/AssignBand'
import {BandInfo} from '@components/qrApp/result/BandInfo'
import {ChooseMode} from '@components/qrApp/result/ChooseMode'
import {ParticipantActions} from '@components/qrApp/result/ParticipantActions'
import {ScanErrorCard} from '@components/qrApp/result/ScanErrorCard'
import {UserActions} from '@components/qrApp/result/UserActions'
import {appScanResultRoute} from '@routes'

/**
 * Was das gescannte Band bedeutet. Die Band-ID kommt aus der Adresse, damit Neuladen und die
 * Zurück-Taste ohne Sonderfälle funktionieren; Rechte und Modus kommen aus der Sitzung.
 */
const ScanResultPage = () => {
    const {t} = useTranslation()
    const {qrCodeId} = appScanResultRoute.useParams()
    const {eventId, events, scanRights, scanMode, setScanMode} = useAppSession()
    const navigate = useNavigate()

    // Mit replace, damit Zurück vom Scanner nicht wieder auf einem verbrauchten Ergebnis landet.
    const backToScanner = useCallback(
        () => void navigate({to: '/app/scan', replace: true}),
        [navigate],
    )

    const {data, error, pending} = useFetch(signal => checkQrCode({signal, path: {qrCodeId}}), {
        deps: [qrCodeId],
    })

    // `requireAppEvent` im `beforeLoad` der Route sichert die gemerkte Veranstaltung normalerweise
    // schon zu; verschwindet sie danach (siehe `AppSessionProvider`, gegengeprüfte Veranstaltung),
    // bliebe ohne diesen Effekt ein leerer Bildschirm stehen statt zurück zur Weiche zu gehen.
    useEffect(() => {
        if (!eventId) {
            void navigate({to: '/app', replace: true})
        }
    }, [eventId, navigate])
    if (!eventId) return null
    if (pending || (data === null && error === null)) {
        return (
            <AppColumn>
                <AppHeader title={t('app.scan.title')} onBack={backToScanner} />
                <Throbber />
            </AppColumn>
        )
    }

    // Der Endpunkt beantwortet ein unbekanntes Band mit leerem Rumpf; der Client macht daraus ein
    // leeres Objekt. Die anonyme Antwortform (ohne `id`) kann hier nicht vorkommen, weil die App
    // immer angemeldet scannt — sie wird wie ein Ladefehler behandelt.
    // `void` im erzeugten Antworttyp steht für den leeren Rumpf; zur Laufzeit macht der Client
    // daraus ein leeres Objekt, deshalb die Behandlung als Objekt.
    const body = (data as object | null | undefined) ?? null
    const known = body !== null && Object.keys(body).length > 0
    if (error || (known && !('id' in body))) {
        return (
            <AppColumn>
                <AppHeader title={t('app.scan.title')} onBack={backToScanner} />
                <ScanErrorCard
                    title={t('app.result.loadErrorTitle')}
                    message={t('app.result.loadError')}
                    onRescan={backToScanner}
                />
            </AppColumn>
        )
    }

    const response: StaffQrCodeResponse | null = known ? (body as StaffQrCodeResponse) : null
    const band = bandTypeOf(response)

    if (response !== null && response.eventId !== eventId) {
        const other = events?.find(e => e.id === response.eventId)
        return (
            <AppColumn>
                <AppHeader title={t(`app.result.band.${band}`)} onBack={backToScanner} />
                <ScanErrorCard
                    title={t('app.result.otherEvent.title')}
                    message={t('app.result.otherEvent.message', {
                        name: other ? ` („${other.name}“)` : '',
                    })}
                    onRescan={backToScanner}
                />
            </AppColumn>
        )
    }

    const decision = decideScan({band, rights: scanRights, mode: scanMode})

    return (
        <AppColumn>
            <AppHeader title={t(`app.result.band.${band}`)} onBack={backToScanner} />
            {decision.kind === 'UNKNOWN_NOT_ALLOWED' && (
                <ScanErrorCard
                    title={t('app.result.unknown.title')}
                    message={t('app.result.unknown.message')}
                    onRescan={backToScanner}
                />
            )}
            {decision.kind === 'ASSIGN' && (
                <AssignBand eventId={eventId} qrCodeId={qrCodeId} onDone={backToScanner} />
            )}
            {/* Die Nachfrage braucht die Person darüber: Sonst wählt man den Modus, ohne zu
                sehen, für wen. */}
            {decision.kind === 'CHOOSE' && response !== null && (
                <BandInfo response={response} showCompetitions />
            )}
            {decision.kind === 'CHOOSE' && (
                <ChooseMode options={decision.options} onChoose={setScanMode} />
            )}
            {decision.kind === 'ACT' && response !== null && band === 'PARTICIPANT' && (
                <ParticipantActions
                    eventId={eventId}
                    qrCodeId={qrCodeId}
                    response={response}
                    mode={decision.mode}
                    canRemove={decision.canRemove}
                    onDone={backToScanner}
                />
            )}
            {decision.kind === 'ACT' && response !== null && band === 'USER' && (
                <UserActions
                    eventId={eventId}
                    qrCodeId={qrCodeId}
                    response={response}
                    mode={decision.mode}
                    canRemove={decision.canRemove}
                    onDone={backToScanner}
                />
            )}
        </AppColumn>
    )
}

export default ScanResultPage
