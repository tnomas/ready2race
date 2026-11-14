import {ReactNode} from 'react'
import {Box, Stack, Typography} from '@mui/material'
import LanguageWidget from '@components/appbar/LanguageWidget.tsx'
import {primaryTextColor} from '../../theme/themeColors.ts'

type Props = {
    /** Zurück-Knopf links oben (`IconButtonLink` bzw. `IconButton` mit `aria-label`). */
    back?: ReactNode
    /** Kleine Zeile über dem Titel, z. B. „Ergebnisse & Live". */
    overline?: string
    /** Das einzige `<h1>` der Seite. */
    title: string
    /** Datum, Ort u. ä. unter dem Titel; bricht auf schmalen Bildschirmen um. */
    meta?: ReactNode
}

/**
 * Kopf der öffentlichen Seiten (Auswahl und Ergebnisseite): Zurück und Sprache in einer Leiste,
 * darunter ein großer, immer sichtbarer Titel. Früher stand der Veranstaltungsname nur ab `sm`
 * mittig in der Leiste – auf dem Telefon, mit dem die meisten Zuschauer per QR-Code kommen,
 * fehlte er ganz.
 */
const PublicPageHeader = ({back, overline, title, meta}: Props) => (
    <Box component={'header'} sx={{mb: {xs: 2, sm: 3}}}>
        <Box
            sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                minHeight: 48,
                mx: -1,
            }}>
            <Box>{back}</Box>
            <LanguageWidget />
        </Box>
        <Stack spacing={0.5} sx={{mt: {xs: 0.5, sm: 1}}}>
            {overline && (
                <Typography
                    variant={'overline'}
                    component={'p'}
                    sx={{color: theme => primaryTextColor(theme), lineHeight: 1.6}}>
                    {overline}
                </Typography>
            )}
            <Typography
                variant={'h1'}
                sx={{
                    fontSize: {xs: '1.625rem', sm: '2.125rem'},
                    fontWeight: 700,
                    letterSpacing: '-0.01em',
                    overflowWrap: 'anywhere',
                }}>
                {title}
            </Typography>
            {meta && (
                <Box
                    sx={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        columnGap: 2,
                        rowGap: 0.5,
                        pt: 0.5,
                        color: 'text.secondary',
                    }}>
                    {meta}
                </Box>
            )}
        </Stack>
    </Box>
)

/** Eine Angabe in der Meta-Zeile: kleines Icon plus Text. */
export const PublicMetaItem = ({icon, children}: {icon: ReactNode; children: ReactNode}) => (
    <Stack
        direction={'row'}
        spacing={0.75}
        sx={{alignItems: 'center', minWidth: 0, '& .MuiSvgIcon-root': {fontSize: 18}}}>
        <Box aria-hidden sx={{display: 'flex', color: 'text.secondary'}}>
            {icon}
        </Box>
        <Typography variant={'body2'} color={'text.secondary'} sx={{overflowWrap: 'anywhere'}}>
            {children}
        </Typography>
    </Stack>
)

export default PublicPageHeader
