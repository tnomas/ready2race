import {ReactNode} from 'react'
import {Box, Breadcrumbs, Stack, Typography, useMediaQuery, useTheme} from '@mui/material'
import {ArrowBack} from '@mui/icons-material'
import {useTranslation} from 'react-i18next'
import {Crumb, CrumbLink, finalizeTrail} from '@utils/navigation/breadcrumbs.ts'
import {IconButtonLink, TextLink} from './links.tsx'

export type PageHeaderBack = CrumbLink & {
    /** Zugänglicher Name des Zurück-Knopfs; Standard „Zurück" (`common.back`). */
    label?: string
}

export type PageHeaderProps = {
    /** Seitentitel – wird als einziges `<h1>` der Seite gerendert. */
    title: ReactNode
    /** Zeile unter dem Titel in `body2`/`text.secondary`, z. B. Datum und Ort oder Kennung. */
    subtitle?: ReactNode
    /** Kleine Zustandsanzeigen neben dem Titel, z. B. Chips „Veröffentlicht" oder Status. */
    meta?: ReactNode
    /** Seitenaktionen rechts; unter `sm` unter dem Titel in voller Breite. */
    actions?: ReactNode
    /**
     * Pfad über dem Titel, gebaut mit `utils/navigation/breadcrumbs.ts`
     * (`buildEventTrail`, `buildClubTrail`, …). Das letzte Glied ist die aktuelle Seite.
     */
    breadcrumbs?: Crumb[]
    /**
     * Zurück-Pfeil links vom Titel – nur für Vollbild-Arbeitsplätze; Verwaltungsunterseiten
     * nutzen die Breadcrumbs. Ziel ist der fachliche Elternteil, nie `history.back()`.
     */
    back?: PageHeaderBack
}

/**
 * Einheitlicher Seitenkopf jeder Verwaltungsseite: Breadcrumbs, `h1`-Titel, Untertitel, Meta,
 * Aktionen und optional ein Zurück-Pfeil. Ersetzt handgebaute `Typography variant="h1"`-Köpfe.
 *
 * @example
 * <PageHeader
 *     title={event.name}
 *     subtitle={formatDateRange(event)}
 *     meta={event.published && <Chip size="small" label={t('event.published.published')} />}
 *     breadcrumbs={buildEventTrail({eventsLabel: t('navigation.titles.events'), eventId, eventName: event.name})}
 *     actions={<Button variant="contained" onClick={openEdit}>{t('common.edit')}</Button>}
 * />
 */
export const PageHeader = ({
    title,
    subtitle,
    meta,
    actions,
    breadcrumbs,
    back,
}: PageHeaderProps) => {
    const {t} = useTranslation()
    const theme = useTheme()
    const narrow = useMediaQuery(theme.breakpoints.down('sm'))
    const crumbs = breadcrumbs ? finalizeTrail(breadcrumbs) : []

    return (
        <Box component={'header'} sx={{mb: 3}}>
            {crumbs.length > 1 && (
                <Breadcrumbs
                    aria-label={t('pageHeader.breadcrumbs')}
                    expandText={t('pageHeader.showPath')}
                    maxItems={narrow ? 2 : 8}
                    itemsBeforeCollapse={1}
                    itemsAfterCollapse={1}
                    sx={{mb: 1, color: 'text.secondary'}}>
                    {crumbs.map((crumb, index) =>
                        crumb.current || !crumb.link ? (
                            <Typography
                                key={index}
                                variant={'body2'}
                                color={crumb.current ? 'text.primary' : 'text.secondary'}
                                aria-current={crumb.current ? 'page' : undefined}
                                sx={{overflowWrap: 'anywhere'}}>
                                {crumb.label}
                            </Typography>
                        ) : (
                            <TextLink
                                key={index}
                                {...crumb.link}
                                variant={'body2'}
                                sx={{overflowWrap: 'anywhere'}}>
                                {crumb.label}
                            </TextLink>
                        ),
                    )}
                </Breadcrumbs>
            )}
            <Stack
                direction={{xs: 'column', sm: 'row'}}
                alignItems={{xs: 'stretch', sm: 'flex-start'}}
                justifyContent={'space-between'}
                gap={2}>
                <Stack direction={'row'} alignItems={'flex-start'} gap={1} sx={{minWidth: 0}}>
                    {back && (
                        <IconButtonLink
                            to={back.to}
                            params={back.params}
                            search={back.search}
                            hash={back.hash}
                            aria-label={back.label ?? t('common.back')}
                            sx={{ml: -1, mt: {xs: -0.25, sm: 0}}}>
                            <ArrowBack />
                        </IconButtonLink>
                    )}
                    <Box sx={{minWidth: 0}}>
                        <Stack direction={'row'} alignItems={'center'} flexWrap={'wrap'} gap={1}>
                            <Typography variant={'h1'} sx={{overflowWrap: 'anywhere'}}>
                                {title}
                            </Typography>
                            {meta && (
                                <Stack direction={'row'} gap={1} flexWrap={'wrap'}>
                                    {meta}
                                </Stack>
                            )}
                        </Stack>
                        {subtitle && (
                            <Typography
                                variant={'body2'}
                                color={'text.secondary'}
                                component={'div'}
                                sx={{mt: 0.5}}>
                                {subtitle}
                            </Typography>
                        )}
                    </Box>
                </Stack>
                {actions && (
                    <Stack
                        direction={{xs: 'column', sm: 'row'}}
                        gap={1}
                        flexShrink={0}
                        sx={{'& > .MuiButton-root': {width: {xs: '100%', sm: 'auto'}}}}>
                        {actions}
                    </Stack>
                )}
            </Stack>
        </Box>
    )
}

export default PageHeader
