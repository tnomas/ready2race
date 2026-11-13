import {Box, Card, CardActionArea, Chip, Stack, Typography} from '@mui/material'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import {ReactElement} from 'react'

type Props = {
    icon: ReactElement
    title: string
    /** Zweite Zeile, etwa der Posten-Typ. */
    description?: string
    /** Kleine Marke rechts, etwa „Zuletzt hier". */
    badge?: string
    /** Hebt den Eintrag mit einem kräftigen Rahmen hervor (zuletzt genutzter Posten). */
    highlighted?: boolean
    onClick: () => void
}

/**
 * Ein Eintrag der Helfer-App, der zu einem Arbeitsplatz führt (Posten, Leitstand, Dashboard):
 * eine ganze Zeile als Trefferfläche, mindestens 72 px hoch, damit sie mit nassen Fingern und
 * Handschuhen sicher getroffen wird. Symbol links, Name groß, Typ darunter, Pfeil rechts – so
 * sehen alle Einträge gleich aus, egal von welcher Seite sie kommen.
 */
const AppEntryCard = ({icon, title, description, badge, highlighted, onClick}: Props) => (
    <Card
        variant="outlined"
        sx={{
            width: 1,
            borderWidth: highlighted ? 2 : 1,
            borderColor: highlighted ? 'primary.main' : 'divider',
        }}>
        <CardActionArea
            onClick={onClick}
            className="cursor-pointer"
            sx={{
                minHeight: 72,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: 2,
                px: 2,
                py: 1.5,
            }}>
            <Box
                sx={{
                    display: 'flex',
                    color: 'primary.main',
                    '& svg': {fontSize: 32},
                    flexShrink: 0,
                }}>
                {icon}
            </Box>
            <Stack sx={{flex: 1, minWidth: 0}}>
                <Typography
                    variant="h6"
                    component="span"
                    sx={{fontWeight: 600, lineHeight: 1.3, overflowWrap: 'anywhere'}}>
                    {title}
                </Typography>
                {description && (
                    <Typography variant="body2" color="text.secondary" component="span">
                        {description}
                    </Typography>
                )}
            </Stack>
            {badge && <Chip size="small" color="primary" label={badge} sx={{flexShrink: 0}} />}
            <ChevronRightIcon sx={{color: 'text.secondary', flexShrink: 0}} />
        </CardActionArea>
    </Card>
)

export default AppEntryCard
