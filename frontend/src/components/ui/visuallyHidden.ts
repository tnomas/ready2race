import type {SxProps, Theme} from '@mui/material'

/** Für Screenreader lesbar, aber nicht sichtbar (z. B. Ladehinweis neben einem Skeleton). */
export const visuallyHiddenSx: SxProps<Theme> = {
    border: 0,
    clip: 'rect(0 0 0 0)',
    height: '1px',
    margin: '-1px',
    overflow: 'hidden',
    padding: 0,
    position: 'absolute',
    whiteSpace: 'nowrap',
    width: '1px',
}
