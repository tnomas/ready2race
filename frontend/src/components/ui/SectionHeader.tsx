import {ReactNode} from 'react'
import {Box, Stack, Typography} from '@mui/material'

export type SectionHeaderProps = {
    title: ReactNode
    /** Erklärsatz unter dem Titel (`body2`, `text.secondary`). */
    description?: ReactNode
    /** Aktionen rechts (z. B. „Anlegen"); brechen auf schmalen Schirmen unter den Titel um. */
    actions?: ReactNode
    /**
     * Überschriftenebene: 2 für Abschnitte einer Seite oder eines Reiters (Standard),
     * 3 für Abschnitte innerhalb einer Karte.
     */
    level?: 2 | 3
}

/**
 * Kopf eines Abschnitts in Seiten, Reitern und Karten – ersetzt handgebaute
 * `Typography variant="h6"`/`"h2"`-Zwischenüberschriften mit danebengestellten Knöpfen.
 * Abstand nach unten: 2 (Raster-Regel „zwischen Feldern/Karteninhalt").
 *
 * @example
 * <SectionHeader
 *     title={t('event.boards.title')}
 *     description={t('event.boards.description')}
 *     actions={<Button startIcon={<Add />} onClick={create}>{t('common.create')}</Button>}
 * />
 */
export const SectionHeader = ({title, description, actions, level = 2}: SectionHeaderProps) => (
    <Stack
        direction={'row'}
        alignItems={'flex-start'}
        justifyContent={'space-between'}
        flexWrap={'wrap'}
        gap={1}
        sx={{mb: 2}}>
        <Box sx={{minWidth: 0, flex: '1 1 16rem'}}>
            <Typography
                variant={level === 2 ? 'h2' : 'h3'}
                component={level === 2 ? 'h2' : 'h3'}
                sx={{overflowWrap: 'anywhere'}}>
                {title}
            </Typography>
            {description && (
                <Typography
                    variant={'body2'}
                    color={'text.secondary'}
                    component={'div'}
                    sx={{mt: 0.5}}>
                    {description}
                </Typography>
            )}
        </Box>
        {actions && (
            <Stack direction={'row'} gap={1} flexWrap={'wrap'} flexShrink={0}>
                {actions}
            </Stack>
        )}
    </Stack>
)

export default SectionHeader
