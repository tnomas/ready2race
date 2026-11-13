import {Fragment} from 'react'
import {useLocation, useRouter} from '@tanstack/react-router'
import {Divider, List, ListItem, ListSubheader, Typography} from '@mui/material'
import EventOutlined from '@mui/icons-material/EventOutlined'
import {useTranslation} from 'react-i18next'
import {getEvent} from '@api/sdk.gen.ts'
import {useFetch} from '@utils/hooks.ts'
import {useUser} from '@contexts/user/UserContext.ts'
import {eventSidebarModel} from '@utils/navigation/eventSidebar.ts'
import SidebarItem from './SidebarItem.tsx'
import {useSidebar} from './SidebarContext.ts'

/**
 * Veranstaltungsblock der Seitenleiste: erscheint auf jeder Adresse unter `/event/$eventId`
 * (Veranstaltungsseite und Unterseiten) und ersetzt die frühere Reiterleiste. Sichtbarkeit,
 * Gruppen und aktiver Bereich kommen aus dem Bereichsmodell (eventSections.ts).
 */
const EventSidebarSection = () => {
    const location = useLocation()
    const router = useRouter()
    const user = useUser()
    const model = eventSidebarModel(location.pathname, location.search, router.basepath, user)
    if (model === null) {
        return null
    }
    // Eigene Komponente mit `key`: beim Wechsel der Veranstaltung beginnt der Namensabruf neu.
    return <EventSidebarBlock key={model.eventId} model={model} />
}

type BlockProps = {
    model: NonNullable<ReturnType<typeof eventSidebarModel>>
}

const EventSidebarBlock = ({model}: BlockProps) => {
    const {t} = useTranslation()
    const {isOpen} = useSidebar()
    const {eventId, activeSection, blocks, showGroupHeadings} = model

    // Ein Fehler bleibt still: der Kopf zeigt dann „Veranstaltung", die Seite meldet ihre
    // eigenen Ladefehler.
    const {data: event} = useFetch(signal => getEvent({signal, path: {eventId}}), {
        deps: [eventId],
    })
    const eventName = event?.name ?? t('nav.event.fallbackName')

    return (
        <ListItem disablePadding sx={{display: 'block'}}>
            <Divider sx={{my: 1}} />
            <List disablePadding aria-label={`${t('nav.event.areasLabel')}: ${eventName}`}>
                {/* Kopf: Name der Veranstaltung. Bewusst kein Link — „Übersicht" direkt darunter
                    führt dorthin, und zwei Links auf dasselbe Ziel meldeten beide „aktuelle Seite". */}
                {isOpen && (
                    <ListItem sx={{px: 2.5, pt: 0.5, pb: 0.5, gap: 1.5}}>
                        <EventOutlined fontSize={'small'} sx={{color: 'text.secondary'}} />
                        <Typography
                            variant={'subtitle2'}
                            component={'span'}
                            noWrap
                            title={eventName}
                            sx={{fontWeight: 700, minWidth: 0}}>
                            {eventName}
                        </Typography>
                    </ListItem>
                )}
                {blocks.map(block => (
                    <Fragment key={block.group ?? 'top'}>
                        {showGroupHeadings &&
                            block.labelKey !== null &&
                            (isOpen ? (
                                <ListSubheader
                                    disableSticky
                                    sx={{
                                        lineHeight: '32px',
                                        mt: 0.5,
                                        bgcolor: 'transparent',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.04em',
                                    }}>
                                    {t(block.labelKey)}
                                </ListSubheader>
                            ) : (
                                <Divider component={'li'} sx={{my: 0.5, mx: 1}} />
                            ))}
                        {block.sections.map(section => {
                            const Icon = section.icon
                            return (
                                <SidebarItem
                                    key={section.key}
                                    text={t(section.labelKey)}
                                    icon={<Icon />}
                                    to={'/event/$eventId'}
                                    params={{eventId}}
                                    search={{tab: section.key}}
                                    active={section.key === activeSection}
                                />
                            )
                        })}
                    </Fragment>
                ))}
            </List>
        </ListItem>
    )
}

export default EventSidebarSection
