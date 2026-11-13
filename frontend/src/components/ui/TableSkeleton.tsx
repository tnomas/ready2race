import {Box, Skeleton, Stack} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {visuallyHiddenSx} from './visuallyHidden.ts'
import {CONTAINER_RADIUS} from '../../theme/adminTheme.ts'

export type TableSkeletonProps = {
    /** Anzahl Datenzeilen (Standard 5). */
    rows?: number
    /** Anzahl Spalten (Standard 4); die erste ist breiter. */
    columns?: number
    /** Kompakte Zeilenhöhe (36 statt 52 px) wie `density="compact"`. */
    dense?: boolean
}

/**
 * Platzhalter für eine Tabelle, die noch lädt: Kopfzeile plus Zeilen in Tabellenoptik, damit
 * die Seite beim Eintreffen der Daten nicht springt. Ohne Verzögerung – Tabellen-Skelette
 * stehen ohnehin dort, wo gleich die Tabelle steht.
 *
 * @example
 * {pending && !data ? <TableSkeleton rows={8} columns={5} /> : <DataGrid … />}
 */
export const TableSkeleton = ({rows = 5, columns = 4, dense}: TableSkeletonProps) => {
    const {t} = useTranslation()
    const rowHeight = dense ? 36 : 52
    const cols = Math.max(1, columns)
    const template = `2fr repeat(${cols - 1}, 1fr)`

    // Leicht unterschiedliche Breiten je Zeile und Spalte, damit das Skelett nach Daten aussieht.
    const line = (key: string, height: number, header: boolean, seed: number) => (
        <Box
            key={key}
            sx={{
                display: 'grid',
                gridTemplateColumns: template,
                alignItems: 'center',
                gap: 2,
                px: 2,
                height,
                borderBottom: 1,
                borderColor: 'divider',
                bgcolor: header ? 'action.hover' : undefined,
            }}>
            {Array.from({length: cols}, (_, c) => (
                <Skeleton
                    key={c}
                    variant={'text'}
                    width={header ? '50%' : `${55 + ((c * 17 + seed * 11) % 40)}%`}
                />
            ))}
        </Box>
    )

    return (
        <Box
            role={'status'}
            aria-busy
            sx={{
                border: 1,
                borderColor: 'divider',
                borderRadius: `${CONTAINER_RADIUS}px`,
                overflow: 'hidden',
                bgcolor: 'background.paper',
            }}>
            <Box component={'span'} sx={visuallyHiddenSx}>
                {t('ui.loading')}
            </Box>
            <Stack aria-hidden>
                {line('head', dense ? 40 : 56, true, 0)}
                {Array.from({length: Math.max(0, rows)}, (_, r) =>
                    line(`row-${r}`, rowHeight, false, r),
                )}
            </Stack>
        </Box>
    )
}

export default TableSkeleton
