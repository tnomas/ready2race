import {Link, useTheme} from '@mui/material'
import {MouseEvent, ReactNode} from 'react'
import {stationBoardPath} from '@utils/timing/stationLink.ts'

export type StationBoardLinkProps = {
    eventId: string
    stationId: string
    /** Für Zellen mit eigenem Klick-Verhalten (DataGrid): Weitergabe des Klicks unterbinden. */
    stopPropagation?: boolean
    children: ReactNode
}

/**
 * Postenname als Link auf sein Board, in neuem Fenster (`rel="noopener"`).
 *
 * Das Styling steht als Inline-Style, nicht als sx: die globale Regel `#ready2race-root a`
 * (index.scss) entfärbt jeden Anker über einen ID-Selektor, gegen den keine Klassen-Regel von
 * MUI ankommt — ein normaler `<Link>` sieht deshalb aus wie blanker Text und ist als anklickbar
 * nicht zu erkennen (dasselbe Muster löst `InlineLink` mit `revert`).
 */
const StationBoardLink = ({eventId, stationId, stopPropagation, children}: StationBoardLinkProps) => {
    const theme = useTheme()
    return (
        <Link
            href={stationBoardPath(eventId, stationId)}
            target="_blank"
            rel="noopener"
            onClick={
                stopPropagation
                    ? (event: MouseEvent<HTMLAnchorElement>) => event.stopPropagation()
                    : undefined
            }
            style={{color: theme.palette.primary.main, textDecoration: 'underline'}}>
            {children}
        </Link>
    )
}

export default StationBoardLink
