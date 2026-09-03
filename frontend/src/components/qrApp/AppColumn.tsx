import {Box} from '@mui/material'
import {PropsWithChildren} from 'react'

/**
 * Die eine Spalte der App: zentriert und begrenzt, damit sie auf dem Tablet nicht am linken Rand
 * klebt und auf dem Laptop nicht zur Tapete wird. Alle App-Seiten außer den Zeitnahme-Boards
 * (die sich per `position: fixed` aus dem Fluss nehmen) und dem Dashboard liegen darin.
 */
const AppColumn = ({children, maxWidth = 640}: PropsWithChildren<{maxWidth?: number}>) => (
    <Box
        sx={{
            width: 1,
            maxWidth,
            mx: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
        }}>
        {children}
    </Box>
)

export default AppColumn
