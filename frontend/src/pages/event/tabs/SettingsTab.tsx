import {MouseEvent, ReactNode, useEffect} from 'react'
import {Box, Chip, Stack, Typography} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {useLocation, useNavigate} from '@tanstack/react-router'
import {EventDocumentDto, EventDto, ParticipantRequirementForEventDto} from '@api/types.gen.ts'
import {useEntityAdministration} from '@utils/hooks.ts'
import InlineLink from '@components/InlineLink.tsx'
import RatingCategoriesForEvent from '@components/ratingCategory/RatingCategoriesForEvent.tsx'
import EventExecutionSettings from '@components/event/EventExecutionSettings.tsx'
import EventTimingConfig from '@components/event/timing/EventTimingConfig.tsx'
import DocumentTable from '@components/event/document/DocumentTable.tsx'
import DocumentDialog from '@components/event/document/DocumentDialog.tsx'
import ExportBundleCard from '@components/event/document/ExportBundleCard.tsx'
import EventMaterialProvidersCard from '@components/event/material/EventMaterialProvidersCard.tsx'
import ParticipantRequirementForEventTable from '@components/event/participantRequirement/ParticipantRequirementForEventTable.tsx'
import {
    EVENT_SETTINGS_ANCHORS,
    EventSettingsAnchor,
    settingsAnchorFromHash,
    settingsAnchorId,
} from '../eventPageLogic.ts'

type Props = {
    event: EventDto
    reloadEvent: () => void
}

/** Abstand der Sprungziele zur oberen Kante (App-Leiste plus Luft). */
const ANCHOR_SCROLL_MARGIN = 88

// Bewusst ohne `behavior: 'smooth'`: Ein sanftes Scrollen bricht ab, wenn der Router oder ein
// nachladender Block währenddessen das Layout verschiebt, und landet dann irgendwo.
const scrollToAnchor = (anchor: EventSettingsAnchor) => {
    document.getElementById(settingsAnchorId(anchor))?.scrollIntoView({block: 'start'})
}

/**
 * Bereich „Einstellungen": die Blöcke der Veranstaltung untereinander auf einer langen Seite
 * (kein Reiter im Reiter), oben eine Sprungleiste. Ein Klick scrollt zum Block und schreibt den
 * Anker als `#…` in die Adresse, damit Neuladen und geteilte Links an derselben Stelle landen.
 * Die Blöcke bringen ihre `h2` selbst mit.
 */
const SettingsTab = ({event, reloadEvent}: Props) => {
    const {t} = useTranslation()
    const navigate = useNavigate()
    const location = useLocation()

    const documentAdministrationProps = useEntityAdministration<EventDocumentDto>(
        t('event.document.document'),
    )
    const participantRequirementAdministrationProps =
        useEntityAdministration<ParticipantRequirementForEventDto>(
            t('participantRequirement.participantRequirements'),
            {entityCreate: false, entityUpdate: false},
        )

    const labels: Record<EventSettingsAnchor, string> = {
        'rating-categories': t('event.ratingCategory.title'),
        execution: t('event.settings.execution.title'),
        timing: t('event.timing.title'),
        documents: t('event.document.documents'),
        requirements: t('participantRequirement.participantRequirements'),
        material: t('event.material.jumpLabel'),
    }

    // Beim Öffnen mit Anker (Neuladen, geteilter Link) hinspringen. Die Blöcke darüber laden ihre
    // Daten selbst nach und schieben den Anker dabei nach unten; deshalb wird nachkorrigiert,
    // solange die Person nicht selbst gescrollt hat.
    const initialAnchor = settingsAnchorFromHash(location.hash)
    useEffect(() => {
        if (!initialAnchor) return
        let lastY: number | null = null
        const timers = [300, 1000, 2000].map(delay =>
            window.setTimeout(() => {
                if (lastY !== null && Math.abs(window.scrollY - lastY) > 2) return
                scrollToAnchor(initialAnchor)
                lastY = window.scrollY
            }, delay),
        )
        return () => timers.forEach(timer => window.clearTimeout(timer))
        // nur beim ersten Rendern des Bereichs
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const jump = (anchor: EventSettingsAnchor) => {
        navigate({
            to: '.',
            search: prev => prev,
            hash: anchor,
            replace: true,
            resetScroll: false,
            hashScrollIntoView: false,
        }).then(() => scrollToAnchor(anchor))
    }

    const block = (anchor: EventSettingsAnchor, children: ReactNode) => (
        <Box
            component={'section'}
            id={settingsAnchorId(anchor)}
            aria-label={labels[anchor]}
            sx={{scrollMarginTop: ANCHOR_SCROLL_MARGIN}}>
            {children}
        </Box>
    )

    return (
        <Stack spacing={4}>
            <Box component={'nav'} aria-label={t('event.settings.jumpTo')}>
                <Stack direction={'row'} alignItems={'center'} flexWrap={'wrap'} gap={1}>
                    <Typography variant={'body2'} color={'text.secondary'} sx={{mr: 0.5}}>
                        {t('event.settings.jumpTo')}:
                    </Typography>
                    {EVENT_SETTINGS_ANCHORS.map(anchor => (
                        <Chip
                            key={anchor}
                            component={'a'}
                            href={`#${anchor}`}
                            clickable
                            variant={'outlined'}
                            label={labels[anchor]}
                            onClick={(e: MouseEvent) => {
                                e.preventDefault()
                                jump(anchor)
                            }}
                            sx={{cursor: 'pointer'}}
                        />
                    ))}
                </Stack>
            </Box>
            {block('rating-categories', <RatingCategoriesForEvent />)}
            {/* Wie Läufe am Renntag beendet und Folgerunden erzeugt werden - aus dem
                Zeitplan-Popover hierher gezogen (12.08.2026), weil es die Veranstaltung ändert
                und kein Geräte-Schalter ist. */}
            {block('execution', <EventExecutionSettings event={event} reloadEvent={reloadEvent} />)}
            {block('timing', <EventTimingConfig />)}
            {block(
                'documents',
                <Stack spacing={4}>
                    <DocumentTable
                        {...documentAdministrationProps.table}
                        title={t('event.document.documents')}
                        hints={[
                            <>{t('event.document.tableHint.description')}</>,
                            <>
                                {t('event.document.tableHint.part1')}
                                <InlineLink to={'/config'} search={{tab: 'event-elements'}}>
                                    {t('event.document.tableHint.part2Link')}
                                </InlineLink>
                                {t('event.document.tableHint.part3')}
                            </>,
                        ]}
                    />
                    <DocumentDialog {...documentAdministrationProps.dialog} />
                    {/* Die Export-Mappe direkt beim Dokumente-Bereich: sie sortiert genau diese
                        Dokumente. lastRequested nimmt Uploads und Löschungen der Tabelle mit - ein
                        gelöschtes Dokument fällt serverseitig auch aus der Mappe (on delete
                        cascade). */}
                    <ExportBundleCard
                        eventId={event.id}
                        lastRequested={documentAdministrationProps.table.lastRequested}
                    />
                </Stack>,
            )}
            {block(
                'requirements',
                <ParticipantRequirementForEventTable
                    {...participantRequirementAdministrationProps.table}
                    title={t('participantRequirement.participantRequirements')}
                    hints={[
                        <>
                            {t('event.participantRequirement.tableHint.part1')}
                            <InlineLink to={'/config'} search={{tab: 'event-elements'}}>
                                {t('event.participantRequirement.tableHint.part2Link')}
                            </InlineLink>
                            {t('event.participantRequirement.tableHint.part3')}
                        </>,
                    ]}
                />,
            )}
            {/* Materialvermietung: Anbieter ein- und ausladen, offene Anfragen und Schäden als
                Zahl. Bewusst ein Block der Einstellungen und kein eigener Bereich: Einladen ist
                Vorbereitung, am Renntag arbeitet der Anbieter in seinem Dashboard, und die
                Sichtbarkeit (READ EVENT GLOBAL) ist dieselbe wie die des Bereichs. Ein elfter
                Seitenleisten-Eintrag für zwei Zähler lohnt nicht; die Sprungleiste führt per
                `#material` direkt hierher. */}
            {block('material', <EventMaterialProvidersCard eventId={event.id} />)}
        </Stack>
    )
}

export default SettingsTab
